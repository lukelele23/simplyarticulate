import {billingError,checked,subscriptionSnapshot} from './billingCore.js';

/** @typedef {'subscription.created'|'subscription.updated'|'subscription.canceled'|'customer.created'|'customer.updated'|'transaction.completed'} BillingEventType */
/** @typedef {{event_type:BillingEventType,object_id:string}} DurableBillingEvent */
export const billingEventTypes=Object.freeze({
 'subscription.created':'sub','subscription.updated':'sub','subscription.canceled':'sub',
 'customer.created':'ctm','customer.updated':'ctm','transaction.completed':'txn',
});
export function routedEvent(event,config){
 const prefix=billingEventTypes[event.eventType];if(!prefix)return null;
 if(!new RegExp('^'+prefix+'_[a-z0-9]{26}$').test(event.data?.id||''))throw billingError('Invalid billing event.',400);
 // Simulator event IDs are distinct from platform event IDs; permit them only in explicit sandbox mode.
 const validId=/^evt_[a-z0-9]{26}$/.test(event.eventId||'')||(config?.environment==='sandbox'&&/^ntfsimevt_[a-z0-9]{26}$/.test(event.eventId||''));
 if(!validId||!Number.isFinite(Date.parse(event.occurredAt)))throw billingError('Invalid billing event.',400);
 return {event_id:event.eventId,event_type:event.eventType,object_id:event.data.id,occurred_at:event.occurredAt};
}
export async function sdkCall(promise){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(billingError('Billing request timed out.')),12000);})]);}
 finally{clearTimeout(timer);}
}
function date(value){if(!Number.isFinite(Date.parse(value)))throw billingError('Invalid Paddle timestamp.');return value;}
/** @param {import('@paddle/paddle-node-sdk').Customer} customer */
export function customerSnapshot(customer){
 if(!/^ctm_[a-z0-9]{26}$/.test(customer.id||'')||typeof customer.email!=='string'||!customer.email||customer.email.length>320)throw billingError('Invalid Paddle customer.');
 return {id:customer.id,email:customer.email,created_at:date(customer.createdAt),updated_at:date(customer.updatedAt),
  checkout_intent_id:customer.customData?.checkout_intent_id||null};
}
export async function syncCustomer(db,sdk,id){
 const snapshot=customerSnapshot(await sdkCall(sdk.customers.get(id)));
 if(snapshot.id!==id)throw billingError('Customer identity mismatch.');
 await checked(db.rpc('billing_apply_customer',{p_snapshot:snapshot}));return snapshot;
}
/** Canonical API objects, rather than delivery order, drive access and state. */
export async function syncPaddleSubscription(db,sdk,id,config){
 const sub=await sdkCall(sdk.subscriptions.get(id));if(sub.id!==id)throw billingError('Subscription identity mismatch.');
 await syncCustomer(db,sdk,sub.customerId);
 const snapshot=subscriptionSnapshot({id:sub.id,customer_id:sub.customerId,status:sub.status,updated_at:date(sub.updatedAt),
  created_at:date(sub.createdAt),next_billed_at:sub.nextBilledAt,
  items:sub.items.map(item=>({quantity:item.quantity,price:{id:item.price.id,product_id:item.price.productId}})),
  current_billing_period:sub.currentBillingPeriod?{starts_at:sub.currentBillingPeriod.startsAt,ends_at:sub.currentBillingPeriod.endsAt}:null,
  scheduled_change:sub.scheduledChange?{action:sub.scheduledChange.action,effective_at:sub.scheduledChange.effectiveAt}:null},Object.keys(config.catalog));
 await checked(db.rpc('billing_apply_subscription',{p_snapshot:snapshot}));return snapshot;
}
export async function syncCompletedTransaction(db,sdk,id,config){
 const transaction=await sdkCall(sdk.transactions.get(id));if(transaction.id!==id||!transaction.customerId)throw billingError('Transaction identity mismatch.');
 await syncCustomer(db,sdk,transaction.customerId);
 if(transaction.subscriptionId)await syncPaddleSubscription(db,sdk,transaction.subscriptionId,config);
 await checked(db.rpc('billing_apply_transaction',{p_snapshot:{id:transaction.id,customer_id:transaction.customerId,
  subscription_id:transaction.subscriptionId||null,status:transaction.status,created_at:date(transaction.createdAt),updated_at:date(transaction.updatedAt)}}));
}
/** @param {DurableBillingEvent} event */
export async function handleBillingEvent(db,sdk,event,config){
 switch(event.event_type){
  case 'subscription.created':case 'subscription.updated':case 'subscription.canceled':
   return syncPaddleSubscription(db,sdk,event.object_id,config);
  case 'customer.created':case 'customer.updated':return syncCustomer(db,sdk,event.object_id);
  case 'transaction.completed':return syncCompletedTransaction(db,sdk,event.object_id,config);
  default:return; // Previously queued, unsupported events are safely marked processed without mutation.
 }
}
export async function processFulfillmentEvent(db,config,sdk){
 const rows=await checked(db.rpc('billing_claim_event'));const event=rows?.[0];if(!event)return false;
 try{
  await handleBillingEvent(db,sdk,event,config);
  await checked(db.from('billing_events').update({state:'processed',lease_id:null,leased_until:null,error_code:null})
   .eq('event_id',event.event_id).eq('lease_id',event.lease_id));
 }catch{
  await checked(db.from('billing_events').update({state:'failed',leased_until:null,lease_id:null,error_code:'reconciliation_required',
   next_attempt_at:new Date(Date.now()+Math.min(3600,30*2**event.attempts)*1000).toISOString()})
   .eq('event_id',event.event_id).eq('lease_id',event.lease_id));
 }
 return true;
}

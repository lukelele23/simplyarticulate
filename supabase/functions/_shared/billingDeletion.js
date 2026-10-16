import {billingError,checked} from './billingCore.js';

/** Close checkout links and cancel recurring billing BEFORE deleting the Auth identity. */
export async function closeBillingAccount(db,userId,paddle){
 const lookup=await db.from('billing_customers').select('*').eq('user_id',userId).maybeSingle();
 if(lookup.error){if(['42P01','PGRST205'].includes(lookup.error.code))return;throw billingError('Billing cleanup could not be verified.');}
 if(!lookup.data)return;
 await checked(db.from('billing_customers').update({deleting:true}).eq('user_id',userId));
 const operation=await checked(db.from('billing_operations').insert({user_id:userId,kind:'deletion',state:'pending'}).select().single());
 try{
  const intents=await checked(db.from('billing_checkout_intents').select('*').eq('user_id',userId));
  if(intents.some(i=>['creating','uncertain'].includes(i.status)))throw billingError('A pending checkout must be reconciled by support before deleting this account.',409);
  for(const intent of intents.filter(i=>i.transaction_id)){
   const transaction=await paddle('/transactions/'+intent.transaction_id);
   if(['draft','ready'].includes(transaction.status)){
    const canceled=await paddle('/transactions/'+transaction.id,'PATCH',{status:'canceled'});
    if(canceled.status!=='canceled')throw billingError('Checkout cancellation has not finished.');
   }else if(!['completed','canceled'].includes(transaction.status))throw billingError('A payment is still processing. Retry deletion after it settles.',409);
   if(transaction.status==='completed'){
    if(!/^sub_[a-z0-9]{26}$/.test(transaction.subscription_id||''))throw billingError('Your subscription is still being finalized. Retry deletion after it settles.',409);
    const subscription=await paddle('/subscriptions/'+transaction.subscription_id);
    if(subscription.customer_id!==lookup.data.paddle_customer_id)throw billingError('Billing ownership could not be verified.');
    if(subscription.status!=='canceled')await paddle('/subscriptions/'+subscription.id+'/cancel','POST',{effective_from:'immediately'});
    if((await paddle('/subscriptions/'+subscription.id)).status!=='canceled')throw billingError('Subscription cancellation has not finished.');
   }
  }
  const customer=lookup.data.paddle_customer_id;
  if(customer){
   // Paginate using provider IDs, never an externally supplied next URL.
   let after='';for(let page=0;page<20;page++){
    const subscriptions=await paddle('/subscriptions?customer_id='+customer+'&per_page=100'+(after?'&after='+after:''));
    for(const s of subscriptions){if(s.customer_id!==customer)throw billingError('Billing ownership could not be verified.');
     if(s.status!=='canceled')await paddle('/subscriptions/'+s.id+'/cancel','POST',{effective_from:'immediately'});
     if((await paddle('/subscriptions/'+s.id)).status!=='canceled')throw billingError('Subscription cancellation has not finished.');
    }
    if(subscriptions.length<100)break;
    after=subscriptions.at(-1).id;if(page===19)throw billingError('Billing cleanup requires support.');
   }
  }
  await checked(db.from('billing_operations').update({state:'completed',completed_at:new Date().toISOString()}).eq('id',operation.id));
  // Retain the customer, subscription and transaction mirrors permanently.
  // Auth deletion only clears their user_id via ON DELETE SET NULL (fulfillment migration).
  await checked(db.from('billing_customers').update({deleting:true}).eq('user_id',userId));
 }catch(error){await checked(db.from('billing_operations').update({state:'attention'}).eq('id',operation.id));throw error;}
}

import {billingError,checked,entitlement,ready,missingBillingSettings} from './billingCore.js';

export async function billingStatus(db,user,config){
 const subscriptions=await checked(db.from('billing_subscriptions').select('*').eq('user_id',user.id));
 const subscription=subscriptions.find(s=>entitlement(s,Date.now(),config.catalog,config.environment).plan!=='free')||subscriptions.find(s=>s.status!=='canceled')||subscriptions[0];
 const customer=await checked(db.from('billing_customers').select('paddle_customer_id,deleting,environment').eq('user_id',user.id).maybeSingle());
 if(customer&&customer.environment!==config.environment)throw billingError('Billing customer belongs to another environment.',409);
 const intents=await checked(db.from('billing_checkout_intents').select('status').eq('user_id',user.id).in('status',['creating','ready','uncertain']));
 return {...entitlement(subscription,Date.now(),config.catalog,config.environment),status:subscription?.status||'free',periodEnd:subscription?.current_period_end||null,
  scheduledChange:subscription?.scheduled_change||null,paddleCustomerId:customer?.paddle_customer_id||null,canManage:Boolean(customer?.paddle_customer_id)&&!customer.deleting,
  canCheckout:ready(config)&&!customer?.deleting&&!subscriptions.some(s=>s.status!=='canceled'),
  pending:intents.some(i=>i.status==='creating'||i.status==='uncertain'),
  notice:config.environment==='sandbox'?'Sandbox only. No real payments or changes to your current practice access.':'Subscription status is verified by Paddle.'};
}

export async function createCheckout(db,user,config,paddle,requestedPrice=config.priceId){
 if(!ready(config))throw billingError('Configure Supabase Edge Function Secrets: '+missingBillingSettings(config).join('; ')+'.');
 if(!config.catalog?.[requestedPrice])throw billingError('Choose a configured subscription price.',400);
 const selected=config.catalog[requestedPrice];
 const price=await paddle('/prices/'+requestedPrice);
 if(price.status!=='active'||!price.billing_cycle)throw billingError('An active recurring Paddle price is required.');
 if(price.billing_cycle.interval!==selected.interval||price.billing_cycle.frequency!==1)throw billingError('The Paddle billing interval does not match the selected plan.');
 const trial=price.trial_period;
 if(!trial||trial.interval!=='day'||trial.frequency!==3||(trial.unit_price&&trial.unit_price.amount!=='0')||(trial.unit_price_overrides||[]).some(o=>o.unit_price?.amount!=='0'))throw billingError('Configure a three-day free trial on the selected Paddle price.');

 const reservation=await checked(db.rpc('billing_reserve_checkout',{p_user:user.id,p_price:requestedPrice}));
 const {intent,customer,created}=reservation;
 if(customer.environment!==config.environment)throw billingError('Billing database must be migrated to the selected environment before checkout.',409);
 if(intent.price_id!==requestedPrice){
  if(intent.status!=='ready'||!intent.transaction_id)throw billingError('The previous checkout must finish verification before switching plans.',409);
  const previous=await paddle('/transactions/'+intent.transaction_id);
  if(previous.customer_id!==customer.paddle_customer_id||previous.custom_data?.checkout_intent_id!==intent.id)throw billingError('Checkout ownership needs support review.',409);
  if(['draft','ready'].includes(previous.status)){
   const canceled=await paddle('/transactions/'+previous.id,'PATCH',{status:'canceled'});
   if(canceled.status!=='canceled')throw billingError('The previous checkout has not closed yet.',409);
  }else if(previous.status!=='canceled')throw billingError('A payment is processing. Refresh your plan before switching.',409);
  await checked(db.from('billing_checkout_intents').update({status:'canceled'}).eq('id',intent.id));
  return createCheckout(db,user,config,paddle,requestedPrice);
 }

 if(!created){
  if(intent.status!=='ready'||!intent.transaction_id)throw billingError('A checkout is being verified. Contact support if it remains pending.',409);
  const transaction=await paddle('/transactions/'+intent.transaction_id);
  if(transaction.customer_id!==customer.paddle_customer_id||transaction.custom_data?.checkout_intent_id!==intent.id)
   throw billingError('This checkout needs support review.',409);
  if(!['draft','ready'].includes(transaction.status))throw billingError('Your previous checkout is being reconciled. Refresh your subscription status.',409);
  return {transactionId:transaction.id,priceId:requestedPrice,paddleCustomerId:customer.paddle_customer_id,clientToken:config.clientToken,environment:config.environment};
 }
 try{
  let customerId=customer.paddle_customer_id;
  if(!customerId){
   if(!user.email)throw billingError('A verified sign-in email is required.',400);
   const createdCustomer=await paddle('/customers','POST',{email:user.email,custom_data:{checkout_intent_id:intent.id}});
   if(!/^ctm_[a-z0-9]{26}$/.test(createdCustomer.id))throw billingError('Invalid billing customer.');
   customerId=createdCustomer.id;
   await checked(db.from('billing_customers').update({paddle_customer_id:customerId}).eq('user_id',user.id).eq('deleting',false).select().single());
  }
  const transaction=await paddle('/transactions','POST',{customer_id:customerId,collection_mode:'automatic',
   items:[{price_id:intent.price_id,quantity:1}],custom_data:{checkout_intent_id:intent.id}});
  if(!/^txn_[a-z0-9]{26}$/.test(transaction.id))throw billingError('Invalid billing transaction.');
  await checked(db.from('billing_checkout_intents').update({transaction_id:transaction.id,status:'ready'}).eq('id',intent.id).select().single());
  return {transactionId:transaction.id,priceId:requestedPrice,paddleCustomerId:customerId,clientToken:config.clientToken,environment:config.environment};
 }catch(error){
  // POST timeouts are ambiguous: never automatically create a second customer/transaction.
  await checked(db.from('billing_checkout_intents').update({status:'uncertain'}).eq('id',intent.id));
  throw error;
 }
}


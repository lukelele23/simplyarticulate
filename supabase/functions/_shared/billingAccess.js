import {billingError,checked} from './billingCore.js';
/** Scheduled changes and date boundaries are not terminal status changes. Past due/paused deny access. */
export function grantsPaidAccess(subscription){return Boolean(subscription?.eligible&&subscription.adjustments_checked!==false&&!subscription.access_blocked&&['active','trialing'].includes(subscription.status));}
export async function accountAccess(db,userId,config){
 const customer=await checked(db.from('billing_customers').select('paddle_customer_id,deleting').eq('user_id',userId).maybeSingle());
 if(!customer?.paddle_customer_id||customer.deleting)return {hasPaidAccess:false,plan:'free'};
 const subscriptions=await checked(db.from('billing_subscriptions').select('*').eq('user_id',userId));
 const paid=subscriptions.find(s=>s.paddle_customer_id===customer.paddle_customer_id&&grantsPaidAccess(s)&&config.catalog[s.paddle_price_id]);
 return {hasPaidAccess:Boolean(paid),plan:paid?config.catalog[paid.paddle_price_id].tier:'free'};
}
export async function requirePaidAccess(db,userId,config){const access=await accountAccess(db,userId,config);
 if(!access.hasPaidAccess)throw billingError('An active Pro subscription or trial is required.',403);return access;}

export async function customerPortal(db,user,sdk,config){
 const customer=await checked(db.from('billing_customers').select('paddle_customer_id,deleting').eq('user_id',user.id).maybeSingle());
 if(!customer?.paddle_customer_id||customer.deleting)throw billingError('No billing account is available.',409);
 const subscriptions=await checked(db.from('billing_subscriptions').select('paddle_subscription_id,paddle_customer_id').eq('user_id',user.id).limit(100));
 if(subscriptions.some(s=>s.paddle_customer_id!==customer.paddle_customer_id))throw billingError('Billing ownership could not be verified.',409);
 const portal=await sdk.customerPortalSessions.create(customer.paddle_customer_id,subscriptions.map(s=>s.paddle_subscription_id));
 const url=new URL(portal.urls?.general?.overview||'');
 if(url.protocol!=='https:'||url.hostname!==(config?.environment==='production'?'customer-portal.paddle.com':'sandbox-customer-portal.paddle.com'))throw billingError('Invalid billing portal link.');
 return {url:url.href}; // Never persist or log the temporary portal URL.
}

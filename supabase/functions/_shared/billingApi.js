import {enforcePaddleSource} from './paddleSource.js';
import {authRate,billingRate,securityEvent,securityFailure} from './security.js';
import {billingError,checked,limitedBody,verifiedEvent} from './billingCore.js';
import {billingStatus,createCheckout} from './billingService.js';
import {accountAccess,customerPortal} from './billingAccess.js';
import {routedEvent,processFulfillmentEvent,syncPaddleSubscription,sdkCall} from './billingFulfillment.js';

export function createBillingApi(db,config,paddle,sdkProvider){
 return async request=>{
  const origin=request.headers.get('origin');const allowed=origin&&config.origins.has(origin);
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
   ...(allowed?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!allowed)return reply({error:'This website origin is not allowed.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  try{
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(!token)throw billingError('Sign in to manage your subscription.',401);
   if(token.length>8192)throw billingError('Invalid session.',401);
   await authRate(db,token);
   const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw billingError('Sign in again to continue.',401);
   let body;try{body=JSON.parse(await limitedBody(request,1024));}catch{throw billingError('Invalid billing request.',400);}
   // Account, price and environment always come from the authenticated server context.
   if(!body||typeof body!=='object'||!['status','access','checkout','portal'].includes(body.action)
    ||Object.keys(body).some(key=>!['action',...(body.action==='checkout'?['priceId']:[])].includes(key))
    ||(body.action==='checkout'&&!config.catalog?.[body.priceId]))throw billingError('Invalid billing request.',400);
   await billingRate(db,'account:'+data.user.id+':'+body.action,{access:60,status:30,checkout:5,portal:5}[body.action]);
   if(body.action==='access')return reply(await accountAccess(db,data.user.id,config));
   if(body.action==='status')return reply({...await billingStatus(db,data.user,config),...await accountAccess(db,data.user.id,config)});
   if(body.action==='checkout')return reply(await createCheckout(db,data.user,config,paddle,body.priceId));
   return reply(await sdkCall(customerPortal(db,data.user,sdkProvider(),config)));
  }catch(error){const status=error.status||503;securityEvent('billing_request_rejected',status);if(status===429)headers['Retry-After']='60';return reply({error:error.status?error.message:'Billing is temporarily unavailable.'},status);}
 };
}

export function createBillingWebhook(db,config,sdkProvider,background){
 return async request=>{
  if(request.method!=='POST')return new Response(null,{status:405});
  try{
   if(config.environment==='production')await enforcePaddleSource(request,config);
   const raw=await limitedBody(request);
   const sdk=sdkProvider?.();
   const event=await verifiedEvent(raw,request.headers.get('paddle-signature'),config.webhookSecret,sdk);
   const delivery=routedEvent(event,config);
   if(delivery){
    await checked(db.from('billing_events').upsert(delivery,{onConflict:'event_id',ignoreDuplicates:true}));
    if(background){try{background(processFulfillmentEvent(db,config,sdk));}catch{/* The permanent queue remains available to the worker. */}}
   }
   return new Response('ok',{headers:{'Cache-Control':'no-store'}});
  }catch(error){securityEvent('billing_webhook_rejected',error.status||503);return new Response('Webhook not accepted',{status:error.status||503});}
 };
}

export function createBillingWorker(db,config,_paddle,sdkProvider){
 return async request=>{
  if(request.method!=='POST')return new Response(null,{status:405});
  const token=request.headers.get('x-sa-billing-token')||'';
  if(config.workerToken.length<32||token!==config.workerToken)return new Response(null,{status:401});
  try{
   const sdk=sdkProvider();
   for(let i=0;i<2;i++)if(!await processFulfillmentEvent(db,config,sdk))break;
   // Rotate through snapshots, including canceled subscriptions, to repair missed notifications.
   const subscriptions=await checked(db.from('billing_subscriptions').select('paddle_subscription_id').order('reconciled_at').limit(2));
   for(const s of subscriptions)await syncPaddleSubscription(db,sdk,s.paddle_subscription_id,config);
   return new Response('ok',{headers:{'Cache-Control':'no-store'}});
  }catch(error){securityFailure('billing_reconciliation_failed',error);return new Response('Billing reconciliation needs attention',{status:503});}
 };
}

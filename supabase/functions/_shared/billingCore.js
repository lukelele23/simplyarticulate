/** Explicit environments; live billing stays disabled until release approval. */
export function billingConfig(env) {
 const environment=env.BILLING_ENVIRONMENT;
 if(!environment)throw new Error('Set BILLING_ENVIRONMENT explicitly before using billing.');
 const prices={pro:{month:env.PADDLE_PRO_MONTH_PRICE_ID||env.PADDLE_PRO_PRICE_ID,year:env.PADDLE_PRO_YEAR_PRICE_ID}};
 const entries=Object.entries(prices).flatMap(([tier,periods])=>Object.entries(periods).filter(([,id])=>/^pri_[a-z0-9]{26}$/.test(id||'')).map(([interval,id])=>[id,{tier,interval}]));
 if(new Set(entries.map(([id])=>id)).size!==entries.length)throw new Error('Each tier and interval must use a distinct Paddle price ID.');
 const catalog=Object.fromEntries(entries);
 if(!['sandbox','production'].includes(environment))throw new Error('Use sandbox or production for BILLING_ENVIRONMENT.');
 return {environment,catalog,enabled:env.BILLING_ENABLED==='true'&&(environment==='sandbox'||env.BILLING_LIVE_RELEASE_APPROVED==='true'),key:env.PADDLE_API_KEY||'',
  priceId:prices.pro.month||'',clientToken:env.PADDLE_CLIENT_TOKEN||'',
  webhookSecret:env.PADDLE_WEBHOOK_SECRET||'',workerToken:env.BILLING_WORKER_TOKEN||'',
  webhookIngressToken:env.PADDLE_WEBHOOK_INGRESS_TOKEN||'',
  origins:new Set((env.BILLING_ALLOWED_ORIGINS||'https://simplyarticulate.com,https://www.simplyarticulate.com,http://localhost:5173,http://127.0.0.1:5173').split(',').map(s=>s.trim()))};
}
export function missingBillingSettings(config){
 return [!config.enabled&&'BILLING_ENABLED=true (live also needs BILLING_LIVE_RELEASE_APPROVED=true)',!config.key&&'PADDLE_API_KEY',
  config.environment==='production'&&!config.key.startsWith('pdl_live_apikey_')&&'PADDLE_API_KEY (live server key)',
  config.environment==='production'&&config.webhookIngressToken.length<32&&'PADDLE_WEBHOOK_INGRESS_TOKEN (trusted ingress required)',
  !Object.keys(config.catalog||{}).length&&'PADDLE_PRO_MONTH_PRICE_ID / PADDLE_PRO_YEAR_PRICE_ID (valid pri_ IDs)',
  !config.clientToken.startsWith(config.environment==='sandbox'?'test_':'live_')&&'PADDLE_CLIENT_TOKEN (matching environment)',
  !config.webhookSecret&&'PADDLE_WEBHOOK_SECRET',config.workerToken.length<32&&'BILLING_WORKER_TOKEN (at least 32 characters)'].filter(Boolean);
}
export function ready(config){return missingBillingSettings(config).length===0;}
export function billingError(message,status=503){return Object.assign(new Error(message),{status});}
export function subscriptionSnapshot(subscription,priceId){
 if(!/^sub_[a-z0-9]{26}$/.test(subscription.id)||!/^ctm_[a-z0-9]{26}$/.test(subscription.customer_id)
  ||!['active','trialing','past_due','canceled','paused'].includes(subscription.status)
  ||!Number.isFinite(Date.parse(subscription.updated_at)))throw billingError('Invalid billing snapshot.');
 const items=subscription.items||[];
 return {id:subscription.id,customer_id:subscription.customer_id,status:subscription.status,
  created_at:subscription.created_at,product_id:items[0]?.price?.product_id||null,price_id:items[0]?.price?.id||'unknown',eligible:items.length===1&&(Array.isArray(priceId)?priceId.includes(items[0].price?.id):items[0].price?.id===priceId)&&items[0].quantity===1,
  period_start:subscription.current_billing_period?.starts_at||null,period_end:subscription.current_billing_period?.ends_at||subscription.next_billed_at||null,
  scheduled_change:subscription.scheduled_change?{action:subscription.scheduled_change.action,effective_at:subscription.scheduled_change.effective_at}:null,
  updated_at:subscription.updated_at};
}
export function entitlement(subscription,now=Date.now(),catalog={},environment='sandbox'){
 const active=subscription?.eligible&&['active','trialing'].includes(subscription.status);
 return {plan:active?(catalog[subscription.paddle_price_id]?.tier||'pro'):'free',environment,paidAnalysis:false};
}
export function paddleClient(config,fetchImpl=fetch){
 return async(path,method='GET',body)=>{
  if(!config.key||!/^\/[a-z0-9_/?=&.,%-]+$/i.test(path))throw billingError('Billing is not configured.');
  let response;
  try{response=await fetchImpl((config.environment==='sandbox'?'https://sandbox-api.paddle.com':'https://api.paddle.com')+path,{method,
   headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json','Paddle-Version':'1'},
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});}
  catch{throw billingError('Billing could not be reached. Refresh your billing status before trying again.');}
  if(!response.ok)throw billingError('Billing could not complete this request. Contact support if it persists.');
  const json=await response.json();if(!json.data)throw billingError('Billing returned an incomplete response.');
  return json.data;
 };
}
export async function verifiedEvent(raw,signature,secret,sdk){
 if(!secret||!signature)throw billingError('Invalid webhook.',401);
 if(!sdk?.webhooks?.unmarshal)throw billingError('Paddle server SDK is not configured.');
 let event;try{event=await sdk.webhooks.unmarshal(raw,secret,signature);}catch{throw billingError('Invalid webhook.',401);}
 // Additional future-timestamp/duplicate-header checks complement the SDK's replay window.
 const ts=signature.split(';').map(p=>p.trim().split('=')).filter(([k])=>k==='ts');
 if(ts.length!==1||!/^\d+$/.test(ts[0][1])||Math.abs(Date.now()/1000-Number(ts[0][1]))>60)throw billingError('Invalid webhook.',401);
 return event;
}
export async function limitedBody(request,limit=131072){
 const reader=request.body?.getReader();if(!reader)return '';
 let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
  if(size>limit){await reader.cancel();throw billingError('Request too large.',413);}chunks.push(value);}
 const combined=new Uint8Array(size);let offset=0;for(const c of chunks){combined.set(c,offset);offset+=c.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(combined);
}
export async function checked(query){const result=await query;if(result.error)throw billingError('Billing records could not be updated.');return result.data;}

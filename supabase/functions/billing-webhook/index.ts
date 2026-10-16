import {getPaddleSdk} from '../_shared/paddleSdk.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {billingConfig} from '../_shared/billingCore.js';
import {createBillingWebhook} from '../_shared/billingApi.js';
declare const EdgeRuntime:{waitUntil(job:Promise<unknown>):void};
Deno.serve(async request=>{
 try{
  const env=Deno.env.toObject();
  const config=billingConfig(env);
  const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  return await createBillingWebhook(db,config,()=>getPaddleSdk(config),job=>EdgeRuntime.waitUntil(job))(request);
 }catch{
  return new Response(JSON.stringify({error:'Billing server configuration is incomplete. Set the explicit environment and server secrets.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
});
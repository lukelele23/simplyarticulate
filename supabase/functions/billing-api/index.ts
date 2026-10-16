import {getPaddleSdk} from '../_shared/paddleSdk.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {billingConfig,paddleClient} from '../_shared/billingCore.js';
import {createBillingApi} from '../_shared/billingApi.js';
Deno.serve(async request=>{
 if(request.method!=='OPTIONS'&&!request.headers.get('authorization')?.match(/^Bearer .+/i))return new Response(JSON.stringify({error:'Sign in to manage billing.'}),{status:401,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 try{
  const env=Deno.env.toObject();
  const config=billingConfig(env);
  const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  return await createBillingApi(db,config,paddleClient(config),()=>getPaddleSdk(config))(request);
 }catch{
  return new Response(JSON.stringify({error:'Billing server configuration is incomplete. Set the explicit environment and server secrets.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
});
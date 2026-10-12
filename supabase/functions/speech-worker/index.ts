import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {runStage,runCleanupQueue} from '../_shared/processor.js';
import {rpc} from '../_shared/database.js';
declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
Deno.serve(async request=>{
 const expected=Deno.env.get('JOB_WORKER_TOKEN');
 if(request.method!=='POST'||!expected||request.headers.get('x-sa-worker-token')!==expected)return Response.json({error:'Unauthorized.'},{status:401});
 EdgeRuntime.waitUntil((async()=>{
  await rpc(db,'sa_expire_jobs');
  if(Math.floor(Date.now()/60000)%2===0){if(!await runCleanupQueue(db,Deno.env))await runStage(db,Deno.env);}
  else if(!await runStage(db,Deno.env))await runCleanupQueue(db,Deno.env);
 })().catch(()=>console.error('Scheduled speech processing could not run.')));
 return Response.json({accepted:true},{status:202,headers:{'Cache-Control':'no-store'}});
});

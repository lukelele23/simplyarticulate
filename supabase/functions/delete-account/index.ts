import {closeBillingAccount} from '../_shared/billingDeletion.js';
import {billingConfig,paddleClient} from '../_shared/billingCore.js';
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {deletionBody,authRate,securityEvent} from '../_shared/security.js';
import {isAllowedOrigin} from '../_shared/origins.js';
import {verifyDeletion,runDeletion,removeAccountFiles} from '../_shared/accountDeletion.js';

Deno.serve(async request=>{
 const allowed=new Set((Deno.env.get('ACCOUNT_ALLOWED_ORIGINS')||'https://simplyarticulate.com,https://www.simplyarticulate.com').split(',').map(s=>s.trim()));
 const origin=request.headers.get('origin');
 const permitted=isAllowedOrigin(origin,allowed,Deno.env.get('ACCOUNT_ENABLE_LOCAL_DEV')==='true');
 const cors={'Vary':'Origin','Cache-Control':'no-store','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS',...(origin&&permitted?{'Access-Control-Allow-Origin':origin}:{})};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json',...(status===429?{'Retry-After':'60'}:{})}});
 if(!permitted)return reply({error:'This website origin is not allowed.'},403);
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return reply({error:'Sign in required.'},401);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply({error:'Account deletion is not configured.'},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let operation: string | undefined;
 try{
 if(token.length>8192)return reply({error:'Invalid session.'},401);
 await authRate(db,token);
 const body=await deletionBody(request);
 const receipt=await db.from('account_deletions').select('user_id').eq('id',body.operationId).maybeSingle();
 if(!receipt.error&&receipt.data&&receipt.data.user_id===null)return reply({message:'Account deleted. Billing records are retained.',completed:true,operation:body.operationId});
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return reply({error:'Sign in again to continue.'},401);
  verifyDeletion(user,body.confirmation);
  const journal=await db.from('account_deletions').upsert({id:body.operationId,user_id:user.id},{onConflict:'user_id',ignoreDuplicates:true}).select().maybeSingle();
  if(journal.error)throw journal.error;
  const loaded=journal.data||await db.from('account_deletions').select('*').eq('user_id',user.id).single().then(r=>{if(r.error)throw r.error;return r.data;});
  operation=loaded.id;
  if(operation!==body.operationId){const changed=await db.from('account_deletions').update({id:body.operationId}).eq('user_id',user.id);if(changed.error)throw changed.error;operation=body.operationId;}
  const result=await runDeletion({load:async()=>({completed:loaded.completed||[]}),save:async(state:any)=>{const r=await db.from('account_deletions').update({completed:state.completed,updated_at:new Date().toISOString()}).eq('id',operation);if(r.error)throw r.error;},stages:[
   {name:'billing',run:async()=>closeBillingAccount(db,user.id,(path:string,method?:string,body?:unknown)=>paddleClient(billingConfig(Deno.env.toObject()))(path,method,body))},
   {name:'public_entries',run:async()=>{const r=await db.from('sa_entries').delete().eq('user_id',user.id);if(r.error)throw r.error;}},
   {name:'recordings',run:async()=>removeAccountFiles(db.storage.from('speech-recordings'),user.id)},
   {name:'account',run:async()=>{const r=await db.auth.admin.deleteUser(user.id);if(r.error)throw r.error;}}
  ]});
  // No identity or speech content is retained in the completed operation record.
  // The opaque receipt survives briefly so a lost final response can be acknowledged after Auth deletion.
  await db.from('account_deletions').update({updated_at:new Date().toISOString()}).eq('id',operation);
  return reply({...result,message:'Account deleted. Billing records are retained.',operation});
 }catch(cause:any){securityEvent('account_deletion_failed',cause.status||503);if(operation){const receipt=await db.from('account_deletions').select('user_id').eq('id',operation).maybeSingle();if(receipt.data&&receipt.data.user_id===null)return reply({message:'Account deleted. Billing records are retained.',completed:true,operation});}return reply({error:cause.status?cause.message:'Deletion is incomplete. Some data may already be removed. Retry to resume the remaining cleanup.',operation},cause.status||503);}
});

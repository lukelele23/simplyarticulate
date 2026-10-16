import {challengeDay} from '../../../src/lib/challengeDay.js';
import {isAllowedOrigin} from './origins.js';
import {rpc,row,publicJob,safeError} from './database.js';
import {validateMetadata} from './metrics.js';
import {runStage,providerConfig} from './processor.js';

export function createSpeechApi(db,env,background,fetchImpl=fetch){
 const allowed=new Set((env.get('SPEECH_ALLOWED_ORIGINS')||'https://simplyarticulate.com,https://www.simplyarticulate.com,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map(value=>value.trim()));
 const enabled=()=>Boolean(providerConfig(env).assemblyKey&&providerConfig(env).geminiKey&&env.get('JOB_WORKER_TOKEN'));
 const kick=job=>{if(job.stage!=='done'&&Date.parse(job.next_run)<=Date.now()&&(!job.leased_until||Date.parse(job.leased_until)<=Date.now()))background(runStage(db,env,job.id,fetchImpl).catch(()=>console.error('Speech stage could not be advanced.')));};
 async function owned(id,owner){const {data,error}=await db.from('sa_jobs').select('*').eq('id',id).eq('user_id',owner).maybeSingle();if(error)throw error;if(!data)throw Error('SA404:Analysis not found or expired. Your recording stays in your browser.');return data;}
 function day(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw Error('SA400:Invalid challenge day.');return value;}
 async function json(request,max=2048){const text=await limited(request,max);try{return JSON.parse(new TextDecoder().decode(text));}catch{throw Error('SA400:Invalid request.');}}
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin&&isAllowedOrigin(origin,allowed,env.get('SPEECH_ENABLE_LOCAL_DEV')==='true')?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,idempotency-key','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}:{})};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   if(origin&&!allowed.has(origin))return reply({error:'This website origin is not allowed.'},403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   const url=new URL(request.url),path=url.pathname.replace(/^.*\/speech-api/,'');
   const today=challengeDay(),method=request.method;
   if(method==='GET'&&path==='/api/analysis/config')return reply({enabled:enabled(),demo:false,requiresSignIn:true,maxSeconds:300,maxUploadBytes:12582912,jobTimeoutMs:1800000});
   if(method==='GET'&&path==='/api/analysis/health'){
    const state=await rpc(db,'sa_health');const ready=enabled()&&['scheduler','progress','focusedRetry','survey','deletion','recordings'].every(key=>state?.[key]===true);return reply({ready,features:state},ready?200:503);
   }
   if(method==='GET'&&path==='/api/analysis/challenge')return reply(await rpc(db,'sa_challenge'));
   if(method==='GET'&&path==='/api/analysis/topic-vote/results')return reply(await rpc(db,'sa_poll'));
   if(method==='GET'&&path==='/api/analysis/community')return reply(await rpc(db,'sa_public_entries',{p_day:day(url.searchParams.get('day')||today)}));
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(!token)return reply({error:'Sign in to use this feature.'},401);
   const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)return reply({error:'Your sign-in expired. Sign in again.'},401);const owner=user.id;
   if(method==='POST')await rpc(db,'sa_rate',{p_user:owner});
   if(path==='/api/analysis/topic-vote'){
    if(method==='GET')return reply(await rpc(db,'sa_poll',{p_user:owner}));
    if(method==='POST'){const body=await json(request);if(typeof body?.choiceId!=='string')throw Error('SA400:Choose a listed topic.');return reply(await rpc(db,'sa_vote',{p_user:owner,p_day:day(body?.targetDay||''),p_choice:body.choiceId}));}
   }
   if(method==='GET'&&path==='/api/analysis/focused-retry'){const parent=url.searchParams.get('parent');if(!/^[a-f0-9-]{36}$/.test(parent||''))return reply({eligible:false,maxSeconds:60});return reply(await rpc(db,'sa_focused_retry_status',{p_user:owner,p_parent:parent}));}
   if(path==='/api/analysis/subscription-survey'){
    if(method==='GET')return reply(await rpc(db,'sa_survey',{p_user:owner}));
    if(method==='POST'){const body=await json(request);if(body?.goal)return reply(await rpc(db,'sa_complete_survey',{p_user:owner,p_goal:body.goal}));if(!['yes','maybe','no'].includes(body?.answer))throw Error('SA400:Choose a survey answer.');return reply(await rpc(db,'sa_survey',{p_user:owner,p_answer:body.answer}));}
   }
   if(method==='GET'&&path==='/api/analysis/community/attempt'){
    const d=day(url.searchParams.get('day')||today),{data,error}=await db.from('sa_daily_attempts').select('state').eq('user_id',owner).eq('day',d).maybeSingle();if(error)throw error;return reply({day:d,used:Boolean(data),recoverable:data?.state==='failed',state:data?.state||'available'});
   }
   if(method==='DELETE'&&path==='/api/analysis/community'){
    const {error}=await db.from('sa_entries').update({withdrawn:true,transcript:null}).eq('user_id',owner).eq('day',today);if(error)throw error;return reply({withdrawn:true});
   }
   if(method==='POST'&&path==='/api/analysis/community'){
    const body=await json(request);if(body?.consent!==true||typeof body.shareTranscript!=='boolean'||typeof body.jobId!=='string')throw Error('SA400:Confirm public entry and choose whether to share your transcript.');return reply({entry:await rpc(db,'sa_publish',{p_user:owner,p_job:body.jobId,p_share:body.shareTranscript})},201);
   }
   if(!enabled())return reply({error:'AI analysis is not configured yet. Your local recording remains available.'},503);
   if(method==='GET'&&path==='/api/analysis/usage')return reply({day:new Date().toISOString().slice(0,10),...await rpc(db,'sa_usage_snapshot',{p_user:owner,p_format:url.searchParams.get('format')||'speech'})});
   if(method==='POST'&&path==='/api/analysis'){
    if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw Error('SA400:Send an audio recording and practice details.');
    const bytes=await limited(request,12582912+8192),form=await new Request(request.url,{method:'POST',headers:request.headers,body:bytes}).formData();
    const raw=form.get('metadata');if(typeof raw!=='string'||raw.length>4096)throw Error('SA400:Invalid practice details.');
    let metadata;try{metadata=validateMetadata(JSON.parse(raw),300);}catch{throw Error('SA400:Check the practice details, recording duration, and analysis consent.');}
    const file=form.get('audio'),types=new Set(['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav','video/webm']);
    if(!file||typeof file.arrayBuffer!=='function'||file.size<64||file.size>12582912||!types.has(file.type.split(';')[0]))throw Error('SA400:Use a nonempty WebM, MP4, Ogg, or WAV recording within the upload limit.');
    if(metadata.parentJobId&&!request.headers.get('idempotency-key'))throw Error('SA400:A stable request key is required for a focused retry.');
    const key=request.headers.get('idempotency-key')||crypto.randomUUID();if(!/^[A-Za-z0-9-]{10,100}$/.test(key))throw Error('SA400:Invalid request key.');
    const audio=new Uint8Array(await file.arrayBuffer()),details=new TextEncoder().encode(JSON.stringify(metadata)),joined=new Uint8Array(audio.length+details.length);joined.set(audio);joined.set(details,audio.length);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',joined)),byte=>byte.toString(16).padStart(2,'0')).join('');
    const id=crypto.randomUUID(),input=`${owner}/${id}`;
    let job=row(await rpc(db,'sa_reserve_job',{p_user:owner,p_id:id,p_key:key,p_digest:digest,p_metadata:metadata,p_input:input}));
    if(job.stage==='awaiting-upload'){
     const {error}=await db.storage.from('sa-analysis-inputs').upload(job.input_path,audio,{contentType:file.type,upsert:true});
     if(error){await rpc(db,'sa_upload_failed',{p_user:owner,p_id:job.id});throw error;}
     const path=job.input_path;job=row(await rpc(db,'sa_ready_upload',{p_user:owner,p_id:job.id}));
     if(job.input_path!==path)await db.storage.from('sa-analysis-inputs').remove([path]);
    }
    kick(job);return reply(publicJob(job),job.status==='completed'?200:202);
   }
   const match=path.match(/^\/api\/analysis\/([a-f0-9-]{36})(\/coaching|\/review)?$/);
   if(match){
    const job=await owned(match[1],owner);
    if(method==='GET'&&!match[2]){kick(job);return reply(publicJob(job));}
    if(method==='DELETE'&&!match[2]){await rpc(db,'sa_fail_job',{p_id:job.id,p_lease:null,p_error:'Analysis stopped. Your recording remains available.'});const {error}=await db.from('sa_jobs').update({result:null}).eq('id',job.id).eq('user_id',owner);if(error)throw error;kick({...job,stage:'cleanup',next_run:new Date().toISOString(),leased_until:null});return reply({deleted:true});}
    if(method==='POST'&&match[2]){
     const body=match[2]==='/coaching'?await json(request,32000):{};
     const retried=row(await rpc(db,'sa_retry',{p_user:owner,p_id:job.id,p_kind:match[2].slice(1),p_transcript:body?.transcript||null}));kick(retried);return reply(publicJob(retried),retried.status==='completed'?200:202);
    }
   }
   return reply({error:'Route not found.'},404);
  }catch(error){const safe=safeError(error);return reply({error:safe.message},safe.status);}
 };
}
async function limited(request,max){
 if(Number(request.headers.get('content-length'))>max)throw Error('SA400:Recording or request is too large.');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('SA400:Recording or request is too large.');}chunks.push(value);}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}return body;
}

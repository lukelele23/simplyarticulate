import {rpc,row} from './database.js';
import {measureSpeech} from './metrics.js';
import {verifyClaims} from './framework.js';
import {generateCoaching,logCoachingFailure} from './coaching.js';
import {reviewChallenge} from './review.js';
import {reliableRequest} from './reliableRequest.js';

export function providerConfig(env){
 const assemblyBase=env.get('ASSEMBLYAI_BASE_URL')||'https://api.assemblyai.com';
 if(!['https://api.assemblyai.com','https://api.eu.assemblyai.com'].includes(assemblyBase))throw Error('Invalid provider endpoint.');
 return {assemblyKey:env.get('ASSEMBLYAI_API_KEY')||'',geminiKey:env.get('GEMINI_API_KEY')||'',assemblyBase,assemblyModel:env.get('ASSEMBLYAI_MODEL')||'universal-3-5-pro',geminiModel:env.get('GEMINI_MODEL')||'gemini-3.5-flash-lite'};
}
async function provider(url,options,signal,fetchImpl){
 const response=await reliableRequest(url,{...options,signal},{fetchImpl,timeoutMs:25000});
 if(!response.ok){await response.body?.cancel();throw Object.assign(Error('Provider unavailable.'),{providerStatus:response.status});}
 return response.json();
}
async function cleanup(db,config,job,signal,fetchImpl){
 if(job.input_path){const {error}=await db.storage.from('sa-analysis-inputs').remove([job.input_path]);if(error)throw error;}
 if(job.provider_id){const response=await reliableRequest(`${config.assemblyBase}/v2/transcript/${encodeURIComponent(job.provider_id)}`,{method:'DELETE',headers:{authorization:config.assemblyKey},signal},{fetchImpl,timeoutMs:15000});if(!response.ok&&response.status!==404){await response.body?.cancel();throw Error('Provider cleanup unavailable.');}await response.body?.cancel();}
}
// One persisted stage per invocation. Each stage stays below the free 150s wall-clock limit.
export async function runStage(db,env,id=null,fetchImpl=fetch){
 const job=row(await rpc(db,'sa_claim_job',{p_id:id}));if(!job?.id)return false;
 const config=providerConfig(env),signal=AbortSignal.timeout(105000),result=job.result||{};
 async function save(stage,status,changes={},delay=0,error=null){return rpc(db,'sa_save_stage',{p_id:job.id,p_lease:job.lease_token,p_stage:stage,p_status:status,p_result:{...result,...changes},p_provider:job.provider_id,p_upload:job.upload_url,p_delay:delay,p_error:error});}
 try{
  if(job.stage!=='cleanup'&&Date.parse(job.deadline)<Date.now())throw Error('Job deadline exceeded.');
  if((['upload','submit'].includes(job.stage)&&job.stage_attempts>1)||job.stage_attempts>3)throw Error('Processing could not safely resume this stage.');
  if(job.stage==='awaiting-upload'){
   const {data}=await db.storage.from('sa-analysis-inputs').download(job.input_path);
   await save(data?'upload':'awaiting-upload','queued',{},data?0:15);
  }else if(job.stage==='upload'){
   const {data,error}=await db.storage.from('sa-analysis-inputs').download(job.input_path);if(error||!data)throw Error('Recording unavailable.');
   const upload=await provider(`${config.assemblyBase}/v2/upload`,{method:'POST',headers:{authorization:config.assemblyKey,'Content-Type':'application/octet-stream'},body:await data.arrayBuffer()},signal,fetchImpl);
   if(typeof upload.upload_url!=='string'||!upload.upload_url.startsWith('https://'))throw Error('Invalid upload response.');job.upload_url=upload.upload_url;await save('submit','transcribing');
  }else if(job.stage==='submit'){
   const submitted=await provider(`${config.assemblyBase}/v2/transcript`,{method:'POST',headers:{authorization:config.assemblyKey,'Content-Type':'application/json'},body:JSON.stringify({audio_url:job.upload_url,speech_models:[config.assemblyModel],language_code:'en',disfluencies:true,punctuate:true,format_text:false,audio_end_at:job.metadata.parentJobId?60000:300000})},signal,fetchImpl);
   if(typeof submitted.id!=='string'||!/^[A-Za-z0-9-]+$/.test(submitted.id))throw Error('Invalid transcript response.');job.provider_id=submitted.id;await save('transcribe','transcribing',{},3);
  }else if(job.stage==='transcribe'){
   const transcript=await provider(`${config.assemblyBase}/v2/transcript/${encodeURIComponent(job.provider_id)}`,{method:'GET',headers:{authorization:config.assemblyKey}},signal,fetchImpl);
   if(transcript.status==='error')throw Error('This recording could not be transcribed. Check the audio and try again.');
   if(transcript.status!=='completed'){await save('transcribe','transcribing',{},5);return true;}
   const text=transcript.text?.trim(),duration=Number(transcript.audio_duration);
   if(!text||!Array.isArray(transcript.words)||!transcript.words.length)throw Error('No speech was detected. Try recording again in a quieter place.');
   if(text.length>30000||!Number.isFinite(duration)||duration<=0||duration>(job.metadata.parentJobId?62:302)||(job.metadata.format==='daily-challenge'&&duration>62))throw Error('Invalid recording duration.');
   await rpc(db,'sa_store_transcript',{p_id:job.id,p_lease:job.lease_token,p_seconds:Math.ceil(duration),p_result:{transcript:text,words:transcript.words.map(({text,start,end})=>({text,start,end})),metrics:measureSpeech(transcript.words,duration),coaching:null,coachingError:null,demo:false}});
  }else if(job.stage==='verify'){
   const verification=await verifyClaims(result.transcript,config,signal,fetchImpl);await save('coach','coaching',{verification});
  }else if(job.stage==='coach'){
   let coaching=null,coachingError=null,coachingErrorCode=null;
   try{coaching=await generateCoaching(result.transcript,job.metadata,result.metrics,config,signal,fetchImpl,result.verification);}
   catch(error){coachingErrorCode=logCoachingFailure(error,config.geminiModel);coachingError='Your transcript is ready. Written coaching is temporarily unavailable; retry it without uploading again.';}
   const reviewNeeded=job.metadata.format==='daily-challenge'&&!result.communityReview;
   await save(reviewNeeded?'review':'cleanup',reviewNeeded?'moderating':'completed',{coaching,coachingError,coachingErrorCode});
  }else if(job.stage==='review'){
   let communityReview;try{communityReview=await reviewChallenge(result,job.metadata,config,signal,fetchImpl);}
   catch{communityReview={moderation:'review',eligible:false,retryable:true,reason:'Community review is temporarily unavailable. Your transcript remains private; retry review later.'};}
   await save('cleanup','completed',{communityReview});
  }else if(job.stage==='cleanup'){
   await cleanup(db,config,job,signal,fetchImpl);job.input_path=null;job.provider_id=null;job.upload_url=null;
   const saved=await save('done',job.status,{},0,job.error);
   if(saved){const {error}=await db.from('sa_jobs').update({input_path:null}).eq('id',job.id).eq('stage','done');if(error)throw error;}
  }else throw Error('Unknown processing stage.');
 }catch(error){
  if(job.stage==='cleanup'){await save('cleanup',job.status,{},60,job.error);}
  else if(result.transcript){
   const changes={coachingError:result.coaching?'': 'Your transcript is ready, but written coaching could not finish. Retry coaching without uploading again.'};
   if(job.metadata.format==='daily-challenge'&&!result.communityReview)changes.communityReview={moderation:'review',eligible:false,retryable:true,reason:'Review is temporarily unavailable. Retry review later.'};
   await save('cleanup','completed',changes);
  }else {
   const safe=['No speech was detected. Try recording again in a quieter place.','This recording could not be transcribed. Check the audio and try again.'].includes(error.message)?error.message:'Analysis could not finish. Your recording is preserved. Retry the original take shortly.';
   await rpc(db,'sa_fail_job',{p_id:job.id,p_lease:job.lease_token,p_error:safe});
  }
 }
 return true;
}
export async function runCleanupQueue(db,env,fetchImpl=fetch){
 const task=row(await rpc(db,'sa_claim_cleanup'));if(!task?.id)return false;
 try{await cleanup(db,providerConfig(env),task,AbortSignal.timeout(45000),fetchImpl);await db.from('sa_cleanup').delete().eq('id',task.id).eq('lease_token',task.lease_token);}
 catch{await db.from('sa_cleanup').update({leased_until:null,lease_token:null,next_run:new Date(Date.now()+60000).toISOString()}).eq('id',task.id).eq('lease_token',task.lease_token);}
 return true;
}

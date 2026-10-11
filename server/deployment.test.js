import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAnalysisServer,readConfig} from './index.js';
test('hosting platform ports and production binding are supported',()=>{
 const config=readConfig({NODE_ENV:'production',PORT:'8080'});
 assert.equal(config.port,8080);assert.equal(config.host,'0.0.0.0');
 assert.equal(readConfig({PORT:'8080',AI_PORT:'8787'}).port,8787);
 assert.equal(readConfig({}).host,'127.0.0.1');
});
test('health checks report readiness without exposing configuration or credentials',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'sa-health-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const server=createAnalysisServer({...readConfig({}),dataDir:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/analysis/health`);
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{ready:false});
});
test('slow coaching and review retries return accepted jobs before provider completion',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'sa-async-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let releaseCoach,releaseReview,reviewCalls=0;
 const coachGate=new Promise(resolve=>releaseCoach=resolve),reviewGate=new Promise(resolve=>releaseReview=resolve);
 const day=new Date().toISOString().slice(0,10),topic='Practice topic',transcript='Practice helps people improve.';
 const config={...readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}),dataDir:dir};
 const server=createAnalysisServer(config,{fetchImpl:async()=>Response.json({id:'test-user'}),getChallenge:async()=>({id:day,topic}),analyze:async()=>({transcript,metrics:{durationSeconds:60},coaching:null,demo:false}),coach:async()=>{await coachGate;return {summary:'Useful feedback'};},review:async()=>{if(++reviewCalls>1)await reviewGate;return {eligible:false,moderation:'review',retryable:true};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{releaseCoach();releaseReview();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}/api/analysis`,headers={Authorization:'Bearer test'};
 async function completed(id){for(let i=0;i<100;i++){const job=await(await fetch(`${base}/${id}`,{headers})).json();if(job.status==='completed')return job;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Job did not complete.');}
 async function submit(format){const form=new FormData();form.append('audio',new Blob([new Uint8Array(64)],{type:'audio/wav'}),'speech.wav');form.append('metadata',JSON.stringify({topic,format,difficulty:'easy',durationSeconds:60,consent:true,...(format==='daily-challenge'?{challengeId:day,publicUsername:'Speaker'}:{})}));const response=await fetch(base,{method:'POST',headers,body:form});assert.equal(response.status,202);const {id}=await response.json();await completed(id);return id;}
 const practice=await submit('speech');
 const coaching=await fetch(`${base}/${practice}/coaching`,{method:'POST',headers,body:JSON.stringify({transcript}),signal:AbortSignal.timeout(2000)});
 assert.equal(coaching.status,202);assert.equal((await coaching.json()).status,'coaching');
 assert.equal((await(await fetch(`${base}/${practice}`,{headers})).json()).status,'coaching');
 releaseCoach();assert.equal((await completed(practice)).result.coaching.summary,'Useful feedback');
 const challenge=await submit('daily-challenge');
 const review=await fetch(`${base}/${challenge}/review`,{method:'POST',headers,signal:AbortSignal.timeout(2000)});
 assert.equal(review.status,202);assert.equal((await review.json()).status,'moderating');
 releaseReview();await completed(challenge);
 assert.equal((await(await fetch(`${base}/usage`,{headers})).json()).practiceUsed,1);
});

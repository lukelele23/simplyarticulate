import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { communityStore } from './community.js';
import { createAnalysisServer, readConfig } from './index.js';
test('AudioWorklet preserves chunk samples, excludes pauses and flushes its tail',()=>{
  let Processor;const messages=[];
  class Base {constructor(){this.port={postMessage:message=>messages.push(message)};}}
  vm.runInNewContext(readFileSync(new URL('../src/lib/capture-worklet.js',import.meta.url),'utf8'),{AudioWorkletProcessor:Base,Float32Array,registerProcessor:(_,p)=>{Processor=p;}});
  const p=new Processor();p.process([[new Float32Array(128).fill(.9)]]);assert.equal(messages.length,0);
  p.port.onmessage({data:{type:'recording',enabled:true}});
  for(let i=0;i<33;i++)p.process([[new Float32Array(128).fill(.25)]]);
  p.port.onmessage({data:{type:'recording',enabled:false}});p.process([[new Float32Array(128).fill(.9)]]);
  p.port.onmessage({data:{type:'flush'}});
  const samples=messages.filter(m=>m.type==='samples').flatMap(m=>Array.from(m.samples));
  assert.equal(samples.length,4224);assert.ok(samples.every(x=>x===.25));assert.equal(messages.at(-1).type,'flushed');
});
test('competitive failed attempts survive restart and accept only their original bytes and key',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'sa-recovery-store-'));
  try{const a=communityStore(dir);assert.equal(a.reserveAttempt('u','2026-10-11','digest','original-key'),true);a.failAttempt('u','2026-10-11');const b=communityStore(dir);assert.equal(b.reserveAttempt('u','2026-10-11','other','original-key'),false);assert.equal(b.reserveAttempt('u','2026-10-11','digest','other-key'),false);assert.equal(b.reserveAttempt('u','2026-10-11','digest','original-key'),true);assert.equal(b.reserveAttempt('u','2026-10-11','digest','original-key'),false);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('API retries original failed take, blocks replacements and recovers completed score after restart without another charge',async()=>{
  const dataDir=mkdtempSync(path.join(tmpdir(),'sa-recovery-api-'));
  const day=new Date().toISOString().slice(0,10), metadata={format:'daily-challenge',topic:'Practice',difficulty:'medium',durationSeconds:60,challengeId:day,publicUsername:'TestSpeaker',consent:true};
  const config={...readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.example',SUPABASE_PUBLISHABLE_KEY:'test'}),dataDir};
  let calls=0;
  const dependencies={fetchImpl:async()=>Response.json({id:'account-a'}),getChallenge:async()=>({id:day,topic:'Practice'}),analyze:async()=>{calls++;if(calls===1)throw new Error('Service unavailable');return {transcript:'Practice helps me organize my thoughts.',metrics:{durationSeconds:60},coaching:{summary:'Clear point'},demo:false};},review:async()=>({moderation:'allow',eligible:true,score:80,dimensions:[],reason:'Clear.'})};
  const headers={Authorization:'Bearer test','Idempotency-Key':'original-take-request'};
  const upload=(byte=0)=>{const form=new FormData();form.append('metadata',JSON.stringify(metadata));form.append('audio',new Blob([new Uint8Array(100).fill(byte)],{type:'audio/wav'}),'take.wav');return form;};
  let server,base;
  async function start(){server=createAnalysisServer(config,dependencies);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/api/analysis`;}
  async function close(){server.closeAllConnections();await new Promise(r=>server.close(r));}
  async function poll(id){for(let i=0;i<30;i++){const job=await(await fetch(`${base}/${id}`,{headers})).json();if(['completed','error'].includes(job.status))return job;await new Promise(r=>setTimeout(r,5));}throw new Error('Job did not finish');}
  try{
    await start();let response=await fetch(base,{method:'POST',headers,body:upload()});assert.equal(response.status,202);let job=await poll((await response.json()).id);assert.equal(job.status,'error');
    assert.equal((await(await fetch(`${base}/usage?format=daily-challenge`,{headers})).json()).analysesUsed,0);
    response=await fetch(base,{method:'POST',headers,body:upload(1)});assert.equal(response.status,409);
    response=await fetch(base,{method:'POST',headers,body:upload()});assert.equal(response.status,202);job=await poll((await response.json()).id);assert.equal(job.status,'completed');assert.equal(job.result.communityReview.score,80);
    await close();await start();response=await fetch(base,{method:'POST',headers,body:upload()});assert.equal(response.status,200);const recovered=await response.json();assert.equal(recovered.id,job.id);assert.equal(recovered.result.communityReview.score,80);assert.equal(calls,2);assert.equal((await(await fetch(`${base}/usage?format=daily-challenge`,{headers})).json()).analysesUsed,1);
  }finally{if(server?.listening)await close();rmSync(dataDir,{recursive:true,force:true});}
});

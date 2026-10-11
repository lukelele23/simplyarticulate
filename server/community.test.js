import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pcmWave } from '../src/lib/audio.js';
import { validateMetadata } from './metrics.js';
import { communityStore, validateReview, reviewChallenge } from './community.js';
import { createAnalysisServer, readConfig } from './index.js';
const transcript='Practice helps me organize my ideas because I can repeat a small task and reflect on what worked before I try again tomorrow.';
const raw={moderation:'allow',eligible:true,reason:'Appropriate practice content.',dimensions:['relevance','organization','support','clarity'].map(name=>({name,score:20,reason:'Clear evidence in this take.'}))};
const day=new Date().toISOString().slice(0,10);
const metadata={format:'daily-challenge',topic:'Practice',difficulty:'medium',durationSeconds:60,challengeId:day,publicUsername:'TestSpeaker',consent:true};
test('daily metadata preserves identity fields and rejects invalid public usernames',()=>{assert.equal(validateMetadata(metadata).challengeId,day);assert.throws(()=>validateMetadata({...metadata,publicUsername:'email@example.com'}));});
test('WAV is mono 16kHz PCM with correct duration, clipping and cross-chunk samples',async()=>{const blob=pcmWave([new Float32Array(24000).fill(2),new Float32Array(24000).fill(-2)],48000);const view=new DataView(await blob.arrayBuffer());assert.equal(blob.type,'audio/wav');assert.equal(blob.size,32044);assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);assert.equal(view.getInt16(44,true),32767);assert.equal(view.getInt16(44+16000,true),-32768);});
test('review rejects malformed scores and fails closed for blocked, uncertain and short speech',()=>{assert.equal(validateReview(raw,transcript).score,80);assert.equal(validateReview({...raw,moderation:'block'},transcript).eligible,false);assert.equal(validateReview({...raw,moderation:'review'},transcript).eligible,false);assert.equal(validateReview(raw,'too short').eligible,false);assert.throws(()=>validateReview({...raw,dimensions:raw.dimensions.map(d=>({...d,score:100}))},transcript));});
test('community stores only opted-in original transcripts, persists entries and hides account ids',()=>{const dir=mkdtempSync(path.join(tmpdir(),'speech-community-'));try{const store=communityStore(dir);const job={id:'job',metadata,result:{transcript,demo:false,communityReview:validateReview(raw,transcript)}};const entry=store.publish('private-owner',job,false);assert.equal(entry.transcript,null);assert.equal(entry.owner,undefined);assert.equal(entry.sourceJob,undefined);assert.equal(communityStore(dir).list(day).length,1);assert.throws(()=>store.publish('private-owner',{...job,id:'retry'},true));store.withdraw('private-owner',day);assert.equal(store.list(day).length,0);assert.throws(()=>store.publish('private-owner',job,true));assert.throws(()=>store.publish('other-owner',{...job,result:{...job.result,communityReview:{...job.result.communityReview,moderation:'block',eligible:false}}},true));}finally{rmSync(dir,{recursive:true,force:true});}});
test('daily attempt claims are unique per account and persist across store instances',()=>{const dir=mkdtempSync(path.join(tmpdir(),'speech-attempts-'));try{const store=communityStore(dir);assert.equal(store.hasAttempt('account-a',day),false);assert.equal(store.claimAttempt('account-a',day),true);assert.equal(store.claimAttempt('account-a',day),false);assert.equal(communityStore(dir).hasAttempt('account-a',day),true);assert.equal(store.claimAttempt('account-b',day),true);}finally{rmSync(dir,{recursive:true,force:true});}});
test('AI review sends structured data and validates provider result',async()=>{let sent;const review=await reviewChallenge({transcript,metrics:{}},metadata,{geminiModel:'test',geminiKey:'test'},new AbortController().signal,async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(raw)}]}}]}));});assert.equal(review.score,80);assert.match(sent.systemInstruction.parts[0].text,/untrusted/);assert.equal(JSON.parse(sent.contents[0].parts[0].text).username,'TestSpeaker');});
test('API verifies canonical topic, ownership, moderated result and explicit sharing',async()=>{const dir=mkdtempSync(path.join(tmpdir(),'speech-community-api-'));const config=readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',VITE_SUPABASE_URL:'https://test.example',VITE_SUPABASE_PUBLISHABLE_KEY:'test',AI_DATA_DIR:dir});const result={transcript,metrics:{durationSeconds:60},demo:false};const server=createAnalysisServer(config,{fetchImpl:async(url,options)=>new Response(JSON.stringify({id:options.headers.authorization==='Bearer other'?'other-user':'test-user'})),getChallenge:async()=>({id:day,topic:'Practice'}),analyze:async()=>({...result}),review:async()=>validateReview(raw,transcript)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api/analysis`;const headers={Authorization:'Bearer test'};const upload=details=>{const form=new FormData();form.append('metadata',JSON.stringify(details));form.append('audio',new Blob([new Uint8Array(100)],{type:'audio/wav'}),'test.wav');return form;};try{assert.equal((await fetch(base,{method:'POST',headers,body:upload({...metadata,topic:'Fake topic'})})).status,400);const response=await fetch(base,{method:'POST',headers,body:upload(metadata)});assert.equal(response.status,202);const {id}=await response.json();let job;for(let i=0;i<20;i++){job=await(await fetch(`${base}/${id}`,{headers})).json();if(job.status==='completed')break;await new Promise(r=>setTimeout(r,10));}assert.equal(job.result.communityReview.score,80);assert.equal((await fetch(`${base}/community`,{method:'POST',headers:{Authorization:'Bearer other','Content-Type':'application/json'},body:JSON.stringify({jobId:id,consent:true,shareTranscript:true})})).status,404);assert.equal((await fetch(`${base}/community`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({jobId:id,consent:false,shareTranscript:true})})).status,400);const entry=await fetch(`${base}/community`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({jobId:id,consent:true,shareTranscript:true})});assert.equal(entry.status,201);const publicData=await(await fetch(`${base}/community`)).json();assert.equal(publicData.entries[0].transcript,transcript);assert.equal(publicData.entries[0].score,80);assert.equal(publicData.entries[0].owner,undefined);}finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}});

test('leaderboard ranks by AI total, shares tied ranks and keeps feedback private',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'speech-ranks-'));
 try {
  const store=communityStore(dir);
  for(const [index,score] of [15,24,20,20].entries()) {
   const review=validateReview({...raw,dimensions:raw.dimensions.map(d=>({...d,score}))},transcript);
   store.publish(`owner-${index}`,{id:`job-${index}`,metadata:{...metadata,publicUsername:`Speaker${index}`},result:{transcript,demo:false,communityReview:review}},false);
  }
  const entries=communityStore(dir).list(day);
  assert.deepEqual(entries.map(e=>e.score),[96,80,80,60]);
  assert.deepEqual(entries.map(e=>e.rank),[1,2,2,4]);
  assert.equal(entries[0].name,'Speaker1');
  assert.equal(entries[0].dimensions.reduce((sum,d)=>sum+d.score,0),entries[0].score);
  assert.equal(entries[0].dimensions[0].reason,undefined);
  assert.equal(entries[0].transcript,null);
  assert.equal(entries[0].owner,undefined);
  store.withdraw('owner-1',day);
  assert.deepEqual(store.list(day).map(e=>e.rank),[1,1,3]);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

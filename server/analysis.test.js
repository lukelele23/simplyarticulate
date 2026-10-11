import { frameworkFixture } from './framework-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAnalysisServer, readConfig } from './index.js';
import { measureSpeech, validateMetadata } from './metrics.js';
import { analyzeAudio, demoAnalysis, validateCoaching } from './providers.js';

const metadata = { topic: 'Daily practice', format: 'speech', difficulty: 'easy', durationSeconds: 60, consent: true };
const transcript = 'Daily practice helps.';
const fixtureCoach = {
  summary: 'A clear opening.', strength: { observation: 'You state your point.', quote: 'Daily practice' },
  organization: 'Add an example.', relevance: 'Relevant to daily practice.',
  improvements: ['Give a specific example.', 'Close with your point.'], nextExercise: 'Try point, example, conclusion.',
};
const fixtureResult = { transcript, metrics: measureSpeech([
  { text: 'Daily', start: 0, end: 300 }, { text: 'practice', start: 400, end: 700 }, { text: 'helps.', start: 800, end: 1100 },
], 60), coaching: fixtureCoach, coachingError: null, demo: false };

test('failed transcription refunds seconds and analysis slots so a subsequent retry can run',async()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-failure-refund-'));
 const config={...readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}),dataDir,userDailySeconds:300};
 let calls=0;
 try{await withServer(config,{fetchImpl:async()=>Response.json({id:'retry-user'}),analyze:async()=>{if(++calls===1)throw Error('provider unavailable');return fixtureResult;}},async base=>{
  const headers={Authorization:'Bearer test','Idempotency-Key':'recovery-key-123'};
  const endpoint=`${base}/api/analysis`;
  const first=await fetch(endpoint,{method:'POST',headers,body:upload()});assert.equal(first.status,202);
  const {id}=await first.json();
  for(let i=0;i<50;i++){const job=await(await fetch(`${endpoint}/${id}`,{headers})).json();if(job.status==='error')break;await new Promise(resolve=>setTimeout(resolve,5));}
  const usage=await(await fetch(`${endpoint}/usage`,{headers})).json();assert.equal(usage.analysesUsed,0);assert.equal(usage.usedSeconds,0);
  const retry=await fetch(endpoint,{method:'POST',headers,body:upload()});assert.equal(retry.status,202);const retried=await retry.json();
  for(let i=0;i<50;i++){const job=await(await fetch(`${endpoint}/${retried.id}`,{headers})).json();if(job.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,5));}
  const final=await(await fetch(`${endpoint}/usage`,{headers})).json();assert.equal(final.analysesUsed,1);assert.equal(final.usedSeconds,60);assert.equal(calls,2);
 });}finally{rmSync(dataDir,{recursive:true,force:true});}
});

test('coaching can recover after the original job timeout with a fresh cancellation signal',async()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-coaching-timeout-'));
 const config={...readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}),dataDir,timeoutMs:5};
 try{await withServer(config,{fetchImpl:async()=>Response.json({id:'retry-user'}),analyze:async()=>{await new Promise(resolve=>setTimeout(resolve,10));return {...fixtureResult,coaching:null};},coach:async(_transcript,_metadata,_metrics,_config,signal)=>{signal.throwIfAborted();return fixtureCoach;}},async base=>{
  const headers={Authorization:'Bearer test'},endpoint=`${base}/api/analysis`;
  const {id}=await(await fetch(endpoint,{method:'POST',headers,body:upload()})).json();
  for(let i=0;i<50;i++){const job=await(await fetch(`${endpoint}/${id}`,{headers})).json();if(job.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,5));}
  const response=await fetch(`${endpoint}/${id}/coaching`,{method:'POST',headers,body:JSON.stringify({transcript})});assert.equal(response.status,202);await response.json();assert.deepEqual((await waitForJob(`${endpoint}/${id}`,headers)).result.coaching,fixtureCoach);
  assert.equal((await(await fetch(`${endpoint}/usage`,{headers})).json()).analysesUsed,1);
 });}finally{rmSync(dataDir,{recursive:true,force:true});}
});

test('metrics use recording duration and count fillers and timestamp gaps', () => {
  const result = measureSpeech([
    { text: 'Um,', start: 0, end: 500 }, { text: 'hello', start: 2200, end: 2500 },
    { text: 'world', start: 2600, end: 2800 }, { text: 'impossible', start: 70000, end: 71000 },
  ], 60);
  assert.equal(result.wordCount, 3); assert.equal(result.wordsPerMinute, 3);
  assert.equal(result.fillerCount, 1); assert.equal(result.estimatedPauses[0].durationSeconds, 1.7);
});

test('overlapping word timestamps do not create false pauses', () => {
  const result = measureSpeech([{ text: 'first', start: 0, end: 3000 },
    { text: 'second', start: 1000, end: 1500 }, { text: 'third', start: 4000, end: 4300 }], 60);
  assert.equal(result.estimatedPauses.length, 0);
});

test('reject missing consent, excessive duration, invalid topics, and invalid formats', () => {
  assert.throws(() => validateMetadata({ ...metadata, consent: false }));
  assert.throws(() => validateMetadata({ ...metadata, durationSeconds: 301 }, 300));
  assert.throws(() => validateMetadata({ ...metadata, topic: '' }));
  assert.throws(() => validateMetadata({ ...metadata, format: 'invalid' }));
  assert.equal(validateMetadata(metadata).topic, metadata.topic);
});

test('coaching evidence must be a real transcript substring', () => {
  assert.deepEqual(validateCoaching(fixtureCoach, transcript), fixtureCoach);
  assert.throws(() => validateCoaching({ ...fixtureCoach, strength: { ...fixtureCoach.strength, quote: 'Invented words' } }, transcript));
});

test('production rejects demo mode and demo rejects public binding', () => {
  assert.throws(() => readConfig({ AI_DEMO_MODE: 'true', NODE_ENV: 'production' }));
  assert.throws(() => readConfig({ AI_DEMO_MODE: 'true', AI_HOST: '0.0.0.0' }));
});

async function withServer(config, dependencies, callback) {
  const server = createAnalysisServer(config, dependencies);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
async function waitForJob(url,headers){
 for(let attempt=0;attempt<100;attempt++){const job=await(await fetch(url,{headers})).json();if(['completed','error'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,5));}
 throw Error('Test job did not finish.');
}

function upload(details = metadata, type = 'audio/webm') {
  const form = new FormData(); form.append('audio', new Blob([new Uint8Array(128)], { type }), 'speech.webm');
  form.append('metadata', JSON.stringify(details)); return form;
}

test('disabled service reports unavailable without accepting paid jobs', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sa-test-'));
  try {
    await withServer({ ...readConfig({}), dataDir }, {}, async (base) => {
      assert.equal((await (await fetch(`${base}/api/analysis/config`)).json()).enabled, false);
      assert.equal((await fetch(`${base}/api/analysis`, { method: 'POST', body: upload() })).status, 503);
    });
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test('demo requires authenticated access, avoids AI providers and supports deletion', async () => {
  await withServer(readConfig({ AI_DEMO_MODE: 'true' }), { fetchImpl: async () => Response.json({id:'demo-user'}) }, async (base) => {
    const response = await fetch(`${base}/api/analysis`, { method: 'POST', headers:{Authorization:'Bearer test'}, body: upload() });
    assert.equal(response.status, 202);
    const { id } = await response.json();
    const job = await (await fetch(`${base}/api/analysis/${id}`,{headers:{Authorization:'Bearer test'}})).json();
    assert.equal(job.status, 'completed'); assert.equal(job.result.demo, true);
    assert.match(job.result.coaching.summary, /sample report/);
    assert.equal((await fetch(`${base}/api/analysis/${id}`, { method: 'DELETE', headers:{Authorization:'Bearer test'} })).status, 200);
    assert.equal((await fetch(`${base}/api/analysis/${id}`,{headers:{Authorization:'Bearer test'}})).status, 404);
  });
});

test('reject unapproved origins, invalid consent, and wrong media types', async () => {
  await withServer(readConfig({ AI_DEMO_MODE: 'true' }), {fetchImpl:async()=>Response.json({id:'demo-user'})}, async (base) => {
    assert.equal((await fetch(`${base}/api/analysis/config`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/analysis`, { method: 'POST', headers:{Authorization:'Bearer test'}, body: upload({ ...metadata, consent: false }) })).status, 400);
    assert.equal((await fetch(`${base}/api/analysis`, { method: 'POST', headers:{Authorization:'Bearer test'}, body: upload(metadata, 'text/plain') })).status, 400);
  });
});

test('live jobs validate sign-in, enforce ownership and persist actual usage', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sa-test-'));
  const config = { ...readConfig({ AI_ENABLED: 'true', ASSEMBLYAI_API_KEY: 'test', GEMINI_API_KEY: 'test',
    SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test' }), dataDir };
  const dependencies = {
    fetchImpl: async (_url, options) => Response.json({ id: options.headers.authorization === 'Bearer account-b' ? 'account-b' : 'account-a' }),
    analyze: async () => fixtureResult,
  };
  const headers = { Authorization: 'Bearer account-a' };
  try {
    await withServer(config, dependencies, async (base) => {
      assert.equal((await fetch(`${base}/api/analysis`, { method: 'POST', body: upload() })).status, 401);
      const { id } = await (await fetch(`${base}/api/analysis`, { method: 'POST', body: upload(), headers })).json();
      assert.equal((await fetch(`${base}/api/analysis/${id}`, { headers: { Authorization: 'Bearer account-b' } })).status, 404);
      const usage = await (await fetch(`${base}/api/analysis/usage`, { headers })).json();
      assert.equal(usage.usedSeconds, 60);
      assert.equal(usage.canAnalyze, false);
      assert.equal((await fetch(`${base}/api/analysis`, { method: 'POST', body: upload(), headers })).status, 429);
    });
    await withServer(config, dependencies, async (base) => {
      const usage = await (await fetch(`${base}/api/analysis/usage`, { headers })).json(); assert.equal(usage.usedSeconds, 60);
    });
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test('idempotent submission returns the same report without a second analysis', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sa-idempotent-'));
  const config = { ...readConfig({ AI_ENABLED:'true', ASSEMBLYAI_API_KEY:'test', GEMINI_API_KEY:'test',
    SUPABASE_URL:'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY:'test' }), dataDir };
  let calls = 0;
  try {
    await withServer(config, { fetchImpl:async()=>Response.json({id:'account-a'}), analyze:async()=>{calls++;return fixtureResult;} }, async base => {
      const headers={Authorization:'Bearer test','Idempotency-Key':'recording-request-123'};
      const a=await (await fetch(`${base}/api/analysis`,{method:'POST',body:upload(),headers})).json();
      const b=await (await fetch(`${base}/api/analysis`,{method:'POST',body:upload(),headers})).json();
      assert.equal(a.id,b.id); assert.equal(calls,1);
      assert.equal((await fetch(`${base}/api/analysis`,{method:'POST',body:upload({...metadata,topic:'Different'}),headers})).status,409);
    });
  } finally { rmSync(dataDir,{recursive:true,force:true}); }
});

test('quota refuses jobs before contacting the transcription provider', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sa-test-'));
  try {
    const config = { ...readConfig({ AI_ENABLED: 'true', ASSEMBLYAI_API_KEY: 'test', GEMINI_API_KEY: 'test',
      SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test', AI_USER_DAILY_MINUTES: '1' }), dataDir };
    await withServer(config, { fetchImpl: async () => Response.json({ id: 'account-a' }), analyze: async () => { throw new Error('Must not be called'); } }, async (base) => {
      assert.equal((await fetch(`${base}/api/analysis`, { method: 'POST', body: upload(), headers: { Authorization: 'Bearer test' } })).status, 429);
    });
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test('provider pipeline preserves fillers, caps audio and requests transcript deletion', async () => {
  const requests = [];
  const config = { ...readConfig({}), assemblyKey: 'test', geminiKey: 'test', pollMs: 1 };
  const mockFetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/upload')) return Response.json({ upload_url: 'https://cdn.assemblyai.com/test' });
    if (url.endsWith('/transcript')) return Response.json({ id: 'test-transcript', status: 'queued' });
    if (options.method === 'DELETE') return Response.json({ id: 'test-transcript', is_deleted: true });
    if (url.includes('generateContent')) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(frameworkFixture) }] } }] });
    return Response.json({ status: 'completed', text: transcript, audio_duration: 60,
      words: [{ text: 'Daily', start: 0, end: 300 }, { text: 'practice', start: 400, end: 700 }, { text: 'helps.', start: 800, end: 1100 }] });
  };
  const result = await analyzeAudio(Buffer.alloc(128), 'audio/webm', metadata, config, () => {}, new AbortController().signal, mockFetch);
  assert.equal(result.coaching.argumentLogic.applicability, 'applicable');
  const submitted = JSON.parse(requests.find((request) => request.url.endsWith('/transcript')).options.body);
  assert.equal(submitted.disfluencies, true); assert.equal(submitted.audio_end_at, 300000);
  assert.deepEqual(submitted.speech_models, ['universal-3-5-pro']);
  assert.equal(requests.at(-1).options.method, 'DELETE');
});

test('coaching provider failure preserves transcript and measured metrics', async () => {
  const config = { ...readConfig({}), assemblyKey: 'test', geminiKey: 'test', pollMs: 1 };
  const mockFetch = async (url, options) => {
    if (url.endsWith('/upload')) return Response.json({ upload_url: 'https://cdn.assemblyai.com/test' });
    if (url.endsWith('/transcript')) return Response.json({ id: 'test-transcript', status: 'completed',
      text: transcript, audio_duration: 60, words: [{ text: 'Daily', start: 0, end: 1000 }] });
    if (options.method === 'DELETE') return Response.json({});
    return new Response('', { status: 503 });
  };
  const result = await analyzeAudio(Buffer.alloc(128), 'audio/webm', metadata, config, () => {}, new AbortController().signal, mockFetch);
  assert.equal(result.transcript, transcript); assert.equal(result.coaching, null); assert.match(result.coachingError, /retry coaching/);
});

test('API denies guests, grants separate free daily slots and enforces paid total from trusted entitlement',async()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-access-'));
 const config={...readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test',AI_PAID_DAILY_ANALYSES:'2'}),dataDir};
 let calls=0;
 const day=new Date().toISOString().slice(0,10);
 const dependencies={fetchImpl:async(_url,options)=>{const paid=options.headers.authorization==='Bearer paid';return Response.json({id:paid?'paid-user':'free-user',app_metadata:paid?{simplyarticulate_subscription:{status:'active',validUntil:'2099-01-01'}}:{},user_metadata:{simplyarticulate_subscription:{status:'active',validUntil:'2099-01-01'}}});},analyze:async()=>{calls++;return {...fixtureResult,coaching:null};},getChallenge:async()=>({id:day,topic:metadata.topic}),review:async()=>({eligible:false,moderation:'review',score:0})};
 try {await withServer(config,dependencies,async base=>{
  const endpoint=`${base}/api/analysis`;
  assert.equal((await fetch(endpoint,{method:'POST',body:upload()})).status,401);
  assert.equal(calls,0);
  const submit=async(details,token)=>{const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:upload(details)});if(response.status===202){const {id}=await response.clone().json();for(let i=0;i<30;i++){const job=await(await fetch(`${endpoint}/${id}`,{headers:{Authorization:`Bearer ${token}`}})).json();if(job.status==='completed')break;await new Promise(r=>setTimeout(r,5));}}return response.status;};
  assert.equal(await submit(metadata,'free'),202);
  assert.equal(await submit({...metadata,format:'research'},'free'),429);
  assert.equal(await submit({...metadata,format:'daily-challenge',challengeId:day,publicUsername:'FreeSpeaker'},'free'),202);
  assert.equal(await submit({...metadata,format:'daily-challenge',challengeId:day,publicUsername:'FreeSpeaker'},'free'),429);
  assert.equal(await submit(metadata,'paid'),202);
  assert.equal(await submit({...metadata,format:'debate'},'paid'),202);
  assert.equal(await submit(metadata,'paid'),429);
  assert.equal(calls,4);
 });}finally{rmSync(dataDir,{recursive:true,force:true});}
});

test('guests cannot access sample analysis either',async()=>{
 await withServer(readConfig({AI_DEMO_MODE:'true'}),{fetchImpl:()=>{throw Error('Guest must never authenticate or call providers');}},async base=>{
  assert.equal((await(await fetch(`${base}/api/analysis/config`)).json()).requiresSignIn,true);
  for(const endpoint of ['', '/usage','/00000000-0000-0000-0000-000000000000'])assert.equal((await fetch(`${base}/api/analysis${endpoint}`,endpoint?{}:{method:'POST',body:upload()})).status,401);
 });
});

test('failed coaching can retry the original transcript without consuming another daily slot',async()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-coach-access-'));
 const config={...readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}),dataDir};
 try{await withServer(config,{fetchImpl:async()=>Response.json({id:'free-user'}),analyze:async()=>({...fixtureResult,coaching:null}),coach:async()=>fixtureCoach},async base=>{
  const headers={Authorization:'Bearer test'};
  const {id}=await(await fetch(`${base}/api/analysis`,{method:'POST',headers,body:upload()})).json();
  for(let i=0;i<30;i++){const job=await(await fetch(`${base}/api/analysis/${id}`,{headers})).json();if(job.status==='completed')break;await new Promise(r=>setTimeout(r,5));}
  const retry=await fetch(`${base}/api/analysis/${id}/coaching`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({transcript})});
  assert.equal(retry.status,202);await retry.json();
  assert.ok((await waitForJob(`${base}/api/analysis/${id}`,headers)).result.coaching);
  assert.equal((await(await fetch(`${base}/api/analysis/usage`,{headers})).json()).analysesUsed,1);
  assert.equal((await fetch(`${base}/api/analysis/${id}/coaching`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({transcript:'An edited transcript has different words.'})})).status,429);
 });}finally{rmSync(dataDir,{recursive:true,force:true});}
});

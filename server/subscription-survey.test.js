import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {analysisAllowance} from './analysis-allowance.js';
import {createAnalysisServer,readConfig} from './index.js';

function fixture(t){const dataDir=mkdtempSync(path.join(tmpdir(),'sa-survey-'));t.after(()=>rmSync(dataDir,{recursive:true,force:true}));return {dataDir,demo:false,paidDailyAnalyses:25};}

test('any survey answer earns one persistent practice credit, with no duplicate rewards',t=>{
 const config=fixture(t),allowance=analysisAllowance(config);
 for(const answer of ['yes','maybe','no']){
  const owner=`user-${answer}`;
  assert.deepEqual(allowance.surveyStatus(owner),{completed:false,bonusRemaining:0});
  assert.throws(()=>allowance.completeSurvey(owner,'invalid'),{status:400});
  assert.deepEqual(allowance.completeSurvey(owner,answer),{completed:true,bonusRemaining:1});
  allowance.completeSurvey(owner,'yes');
  assert.equal(allowance.usage(owner,false).analysesRemaining,2);
  allowance.finish(allowance.reserve(owner,false),true);
  assert.equal(allowance.surveyStatus(owner).bonusRemaining,1);
  const token=allowance.reserve(owner,false);assert.equal(allowance.surveyStatus(owner).bonusRemaining,0);
  allowance.finish(token,false);assert.equal(allowance.surveyStatus(owner).bonusRemaining,1);
  allowance.finish(allowance.reserve(owner,false),true);
  assert.throws(()=>allowance.reserve(owner,false),{status:429});
  allowance.completeSurvey(owner,answer);assert.equal(allowance.surveyStatus(owner).bonusRemaining,0);
  assert.equal(allowance.usage(owner,false,'daily-challenge').analysesRemaining,1);
 }
 const restarted=analysisAllowance(config);
 assert.equal(restarted.surveyStatus('user-no').bonusRemaining,0);
 assert.equal(restarted.usage('user-yes',false).canAnalyze,false);
});

test('survey credit cannot be spent twice by concurrent reservations or a restart',t=>{
 const config=fixture(t),allowance=analysisAllowance(config);
 allowance.completeSurvey('user','no');allowance.finish(allowance.reserve('user',false),true);
 const token=allowance.reserve('user',false);
 assert.throws(()=>allowance.reserve('user',false),{status:429});
 assert.throws(()=>analysisAllowance(config).reserve('user',false),{status:429});
 allowance.finish(token,true);
});

test('subscribers also receive exactly one earned extra practice analysis',t=>{
 const allowance=analysisAllowance(fixture(t));allowance.completeSurvey('paid-user','maybe');
 for(let i=0;i<25;i++)allowance.finish(allowance.reserve('paid-user',true),true);
 assert.equal(allowance.usage('paid-user',true,'daily-challenge').canAnalyze,false);
 assert.equal(allowance.usage('paid-user',true).canAnalyze,true);
 allowance.finish(allowance.reserve('paid-user',true),true);
 assert.equal(allowance.usage('paid-user',true).canAnalyze,false);
});

test('survey API requires valid sign-in, validates answers, and ignores client reward or owner claims',async t=>{
 const config={...readConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}),...fixture(t)};
 const server=createAnalysisServer(config,{fetchImpl:async(url,options)=>options.headers.authorization==='Bearer valid'?Response.json({id:'survey-user'}):new Response('{}',{status:401})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const url=`http://127.0.0.1:${server.address().port}/api/analysis/subscription-survey`;
 const request=(token,method='GET',body)=>fetch(url,{method,headers:token?{Authorization:`Bearer ${token}`}:{},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal((await request()).status,401);assert.equal((await request(undefined,'POST',{answer:'yes'})).status,401);
 assert.equal((await request('forged','POST',{answer:'yes'})).status,401);
 assert.deepEqual(await (await request('valid')).json(),{completed:false,bonusRemaining:0});
 assert.equal((await request('valid','POST',{answer:'unexpected'})).status,400);
 const accepted=await request('valid','POST',{answer:'no',owner:'another-user',bonusRemaining:100});
 assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{completed:true,bonusRemaining:1});
 assert.deepEqual(await (await request('valid','POST',{answer:'yes'})).json(),{completed:true,bonusRemaining:1});
 assert.equal(analysisAllowance(config).surveyStatus('another-user').completed,false);
 assert.equal((await request('valid','POST',null)).status,400);
});

import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createSpeechApi} from '../supabase/functions/_shared/api.js';
import {runStage} from '../supabase/functions/_shared/processor.js';
import {frameworkFixture} from '../server/framework-fixture.js';
let pg;
const q=(sql,args=[])=>pg.query(sql,args);
async function call(name,args={}){const names=Object.keys(args),params=Object.values(args);return (await q(`select to_jsonb(public.${name}(${names.map((name,i)=>`${name}=>$${i+1}`).join(',')})) as data`,params)).rows[0].data;}
async function user(paid=false){const id=crypto.randomUUID();await q('insert into auth.users(id,raw_app_meta_data) values($1,$2)',[id,paid?{simplyarticulate_subscription:{status:'active',validUntil:'2099-01-01'}}:{}]);return id;}
async function reserve(owner,{key=crypto.randomUUID(),digest='same-digest',format='speech',topic='Practice',name='Speaker'}={}){
 const id=crypto.randomUUID(),challenge=await call('sa_challenge');return call('sa_reserve_job',{p_user:owner,p_id:id,p_key:key,p_digest:digest,p_metadata:{format,topic:format==='daily-challenge'?challenge.topic:topic,difficulty:'easy',durationSeconds:60,...(format==='daily-challenge'?{challengeId:challenge.id,publicUsername:name}:{})},p_input:`${owner}/${id}`});
}
before(async()=>{pg=new PGlite();await pg.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(bucket_id text,name text,created_at timestamptz default now());`);await pg.exec(fs.readFileSync(new URL('../supabase/migrations/20261011190000_sa_edge_backend.sql',import.meta.url),'utf8'));});
after(async()=>pg?.close());
test('private tables and privileged RPCs reject ordinary signed-in database access',async()=>{
 await pg.exec('set role authenticated');try{await assert.rejects(()=>q('select * from public.sa_jobs'),/permission denied/);await assert.rejects(()=>q("select public.sa_survey('00000000-0000-0000-0000-000000000001','yes')"),/permission denied/);}finally{await pg.exec('reset role');}
});
test('three-choice voting accepts all accounts and exposes only aggregate public results',async()=>{
 const owner=await user(),other=await user(),poll=await call('sa_poll',{p_user:owner});assert.equal(poll.choices.length,3);assert.equal(new Set(poll.choices.map(c=>c.topic)).size,3);
 await call('sa_vote',{p_user:owner,p_day:poll.targetDay,p_choice:poll.choices[0].id});await call('sa_vote',{p_user:owner,p_day:poll.targetDay,p_choice:poll.choices[1].id});await call('sa_vote',{p_user:other,p_day:poll.targetDay,p_choice:poll.choices[1].id});
 const results=await call('sa_poll');assert.equal(results.totalVotes,2);assert.equal(results.choices[1].percentage,100);assert.equal(results.myVote,undefined);assert.ok(!JSON.stringify(results).includes(owner));
 await assert.rejects(()=>call('sa_vote',{p_user:owner,p_day:'2000-01-01',p_choice:poll.choices[0].id}),/SA409/);
});
test('reservations are idempotent, free sections are separate, and failed jobs refund once',async()=>{
 const owner=await user(),key=crypto.randomUUID(),job=await reserve(owner,{key});assert.equal((await reserve(owner,{key})).id,job.id);
 await assert.rejects(()=>reserve(owner,{key,digest:'replacement'}),/SA409/);await assert.rejects(()=>reserve(owner),/SA429/);
 const challenge=await reserve(owner,{format:'daily-challenge'});assert.equal((await call('sa_usage_snapshot',{p_user:owner})).practiceUsed,1);
 await call('sa_fail_job',{p_id:job.id,p_lease:null,p_error:'Failed'});await call('sa_fail_job',{p_id:job.id,p_lease:null,p_error:'Failed again'});
 const usage=await call('sa_usage_snapshot',{p_user:owner});assert.equal(usage.practiceUsed,0);assert.equal(usage.challengeUsed,1);
 await call('sa_fail_job',{p_id:challenge.id,p_lease:null,p_error:'Failed'});
 await assert.rejects(()=>reserve(owner,{format:'daily-challenge',digest:'new-take'}),/competitive take is locked/);
});
test('a survey grants one durable credit and failures restore its reservation',async()=>{
 const owner=await user();await call('sa_survey',{p_user:owner,p_answer:'no'});await call('sa_survey',{p_user:owner,p_answer:'yes'});
 const base=await reserve(owner),bonus=await reserve(owner);assert.equal(bonus.bonus_spent,true);assert.equal((await call('sa_survey',{p_user:owner})).bonusRemaining,0);
 await call('sa_fail_job',{p_id:bonus.id,p_lease:null,p_error:'Failed'});assert.equal((await call('sa_survey',{p_user:owner})).bonusRemaining,1);
 await call('sa_fail_job',{p_id:base.id,p_lease:null,p_error:'Failed'});
});
test('expired leases cannot overwrite newer work, and successful transcription is charged once',async()=>{
 const owner=await user(),job=await reserve(owner);await call('sa_ready_upload',{p_user:owner,p_id:job.id});const first=await call('sa_claim_job',{p_id:job.id});assert.equal((await call('sa_claim_job',{p_id:job.id}))?.id||null,null);
 await q("update public.sa_jobs set leased_until=now()-interval '1 second' where id=$1",[job.id]);const second=await call('sa_claim_job',{p_id:job.id});
 const args={p_id:job.id,p_lease:first.lease_token,p_stage:'done',p_status:'completed',p_result:{transcript:'Old'},p_provider:null,p_upload:null};assert.equal(await call('sa_save_stage',args),false);
 assert.equal(await call('sa_store_transcript',{p_id:job.id,p_lease:second.lease_token,p_result:{transcript:'Good',metrics:{durationSeconds:60}},p_seconds:60}),true);
 assert.equal(await call('sa_store_transcript',{p_id:job.id,p_lease:second.lease_token,p_result:{transcript:'Duplicate'},p_seconds:60}),false);
 assert.equal((await q('select seconds from public.sa_usage where user_id=$1',[owner])).rows[0].seconds,60);
});
test('account deletion queues provider cleanup and cannot reset the global spending budget',async()=>{
 const owner=await user(),job=await reserve(owner);await q('update public.sa_jobs set provider_id=$2 where id=$1',[job.id,'provider-id']);const budget=(await q('select sum(seconds) as seconds from public.sa_budget')).rows[0].seconds;
 await q('delete from auth.users where id=$1',[owner]);assert.equal((await q('select sum(seconds) as seconds from public.sa_budget')).rows[0].seconds,budget);assert.equal((await q('select count(*)::int as count from public.sa_cleanup where provider_id=$1',['provider-id'])).rows[0].count,1);
});
test('trusted paid entitlement is enforced atomically and earned credits cannot repeat',async()=>{
 const owner=await user(true);await call('sa_survey',{p_user:owner,p_answer:'maybe'});
 for(let i=0;i<25;i++){const job=await reserve(owner);await q("update public.sa_jobs set stage='done',status='completed',charged=true where id=$1",[job.id]);}await assert.rejects(()=>reserve(owner,{format:'daily-challenge'}),/SA429/);await reserve(owner);await assert.rejects(()=>reserve(owner),/SA429/);
});
function adapter(){
 const storage=new Map(),backgrounds=[];
 const db={rpc:async(name,args)=>{try{return {data:await call(name,args),error:null};}catch(error){return {data:null,error};}},auth:{getUser:async token=>({data:{user:token.startsWith('user:')?{id:token.slice(5),user_metadata:{simplyarticulate_subscription:{status:'active',validUntil:'2099-01-01'}}}:null},error:null})},storage:{from:()=>({upload:async(path,bytes)=>{storage.set(path,new Uint8Array(bytes));return {error:null};},download:async path=>({data:storage.has(path)?new Blob([storage.get(path)]):null,error:null}),remove:async paths=>{paths.forEach(path=>storage.delete(path));return {error:null};}})},from:table=>{
  let values,kind='select',filters=[];const builder={select:()=>builder,eq:(key,value)=>{filters.push([key,value]);return builder;},update:value=>{kind='update';values=value;return builder;},delete:()=>{kind='delete';return builder;},maybeSingle:async()=>{const result=await run();return {...result,data:result.data?.[0]||null};},then:(resolve,reject)=>run().then(resolve,reject)};
  async function run(){try{const params=[],where=filters.map(([key,value])=>{params.push(value);return `${key}=$${params.length}`;}).join(' and ');let sql;if(kind==='select')sql=`select * from public.${table}${where?' where '+where:''}`;else if(kind==='delete')sql=`delete from public.${table} where ${where}`;else{const sets=Object.entries(values).map(([key,value])=>{params.push(value);return `${key}=$${params.length}`;}).join(',');sql=`update public.${table} set ${sets} where ${where}`;}return {data:(await q(sql,params)).rows,error:null};}catch(error){return {data:null,error};}}
  return builder;
 }};return {db,storage,backgrounds};
}
test('Edge API and durable stages complete analysis, protect ownership, and delete temporary audio',async()=>{
 const owner=await user(),other=await user(),{db,storage,backgrounds}=adapter();
 const env={get:key=>({ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',JOB_WORKER_TOKEN:'test'})[key]};
 const transcript='Daily practice helps.';
 const provider=async(url,options)=>{
  if(options.method==='DELETE')return Response.json({});
  if(url.endsWith('/upload'))return Response.json({upload_url:'https://cdn.assemblyai.com/test'});
  if(url.endsWith('/v2/transcript'))return Response.json({id:'test-transcript'});
  if(url.includes('/v2/transcript/'))return Response.json({status:'completed',text:transcript,audio_duration:60,words:[{text:'Daily',start:0,end:300},{text:'practice',start:400,end:700},{text:'helps.',start:800,end:1100}]});
  const body=JSON.parse(options.body);return Response.json({candidates:[{content:{parts:[{text:body.tools?'No external factual claims.':JSON.stringify(frameworkFixture)}]}}]});
 };
 const handler=createSpeechApi(db,env,promise=>backgrounds.push(promise),provider),base='https://project.supabase.co/functions/v1/speech-api/api/analysis';
 assert.equal((await handler(new Request(base,{method:'POST'}))).status,401);
 assert.equal((await handler(new Request(`${base}/config`,{headers:{Origin:'https://attacker.test'}}))).status,403);
 const form=new FormData();form.append('audio',new Blob([new Uint8Array(64)],{type:'audio/wav'}),'speech.wav');form.append('metadata',JSON.stringify({topic:'Practice',format:'speech',difficulty:'easy',durationSeconds:60,consent:true}));
 const response=await handler(new Request(base,{method:'POST',headers:{Authorization:`Bearer user:${owner}`,'Idempotency-Key':crypto.randomUUID()},body:form}));assert.equal(response.status,202);const {id}=await response.json();await Promise.all(backgrounds.splice(0));
 assert.equal((await handler(new Request(`${base}/${id}`,{headers:{Authorization:`Bearer user:${other}`}}))).status,404);
 for(let i=0;i<8;i++){await q('update public.sa_jobs set next_run=now() where id=$1',[id]);await runStage(db,env,id,provider);}
 const final=await handler(new Request(`${base}/${id}`,{headers:{Authorization:`Bearer user:${owner}`}})),job=await final.json();assert.equal(job.status,'completed');assert.equal(job.result.transcript,transcript);assert.equal(job.result.coaching.summary,frameworkFixture.summary);assert.equal(job.result.verification,undefined);assert.equal(storage.size,0);
 assert.equal((await call('sa_usage_snapshot',{p_user:owner})).analysesUsed,1);assert.equal((await call('sa_usage_snapshot',{p_user:other})).analysesUsed,0);
});
test('legacy import preserves survey credits, usage and votes without re-granting rewards',async()=>{
 const owner=await user(),day=(await call('sa_challenge')).id,tomorrow=(await call('sa_poll')).targetDay;
 await call('sa_import_local_state',{p_state:{counts:{days:{[day]:{[owner]:{practice:1,challenge:0,total:1}}},surveys:{[owner]:{answer:'no',bonusRemaining:0}}},seconds:{day,total:60,users:{[owner]:60}},voting:{polls:{[tomorrow]:{choices:(await call('sa_poll')).choices.map(({id,topic})=>({id,topic})),votes:[{owner,choiceId:'choice-1'}]}},challenges:{[day]:'Ignored existing topic'}}}});
 assert.equal((await call('sa_survey',{p_user:owner,p_answer:'yes'})).bonusRemaining,0);assert.equal((await call('sa_usage_snapshot',{p_user:owner})).practiceUsed,1);assert.equal((await call('sa_poll',{p_user:owner})).myVote,'choice-1');
});
test('leaderboard publishing requires ownership, preserves tied AI ranks, and shares text only by consent',async()=>{
 const owners=[];let last;
 for(const [index,score]of [80,80,90].entries()){
  const owner=await user(),job=await reserve(owner,{format:'daily-challenge',name:`Speaker${index}`});owners.push(owner);last=job;
  const dimensions=['relevance','organization','support','clarity'].map((name,i)=>({name,score:i===3?score-3*Math.floor(score/4):Math.floor(score/4),reason:'Private feedback'}));
  await q("update public.sa_jobs set stage='done',status='completed',charged=true,result=$2 where id=$1",[job.id,{transcript:'A shared original speech.',communityReview:{moderation:'allow',eligible:true,score,dimensions}}]);
  await call('sa_publish',{p_user:owner,p_job:job.id,p_share:index===2});
 }
 await assert.rejects(()=>call('sa_publish',{p_user:owners[0],p_job:last.id,p_share:true}),/SA404/);
 const board=await call('sa_public_entries',{p_day:(await call('sa_challenge')).id});assert.deepEqual(board.entries.map(e=>e.rank),[1,2,2]);assert.deepEqual(board.entries.map(e=>e.score),[90,80,80]);
 assert.equal(board.entries[0].transcript,'A shared original speech.');assert.equal(board.entries[1].transcript,null);assert.ok(!JSON.stringify(board).includes('Private feedback'));assert.ok(!JSON.stringify(board).includes(owners[0]));
 await q('update public.sa_entries set withdrawn=true,transcript=null where user_id=$1',[owners[2]]);await assert.rejects(()=>call('sa_publish',{p_user:owners[2],p_job:last.id,p_share:true}),/SA409/);
});
test('orphaned temporary objects are queued for cleanup without touching permanent recordings',async()=>{
 await q("insert into storage.objects(bucket_id,name,created_at) values('sa-analysis-inputs','orphan',now()-interval '1 hour'),('speech-recordings','permanent',now()-interval '1 hour')");
 await call('sa_expire_jobs');await call('sa_expire_jobs');assert.equal((await q("select count(*)::int as count from public.sa_cleanup where input_path='orphan'")).rows[0].count,1);assert.equal((await q("select count(*)::int as count from public.sa_cleanup where input_path='permanent'")).rows[0].count,0);
});

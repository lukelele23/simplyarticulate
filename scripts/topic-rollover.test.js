import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
test('cloud poll promotes the majority winner only at EST rollover, preserves votes, and isolates the next poll',async()=>{
 const db=new PGlite();
 const call=async(name,args=[])=>{const slots=args.map((_,i)=>'$'+(i+1)).join(',');return (await db.query(`select to_jsonb(public.${name}(${slots})) result`,args)).rows[0].result;};
 const setTime=time=>db.query("select set_config('sa.test_now',$1,false)",[time]);
 try{
  await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;
   create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
   create table storage.objects(bucket_id text,name text,created_at timestamptz default now());`);
  for(const name of ['20261011190000_sa_edge_backend.sql','20261013000200_focused_retry.sql','20261016162727_topic_vote_est_rollover.sql'])await db.exec(read(name));
  assert.equal(await call('sa_challenge_day',['2026-01-02T04:59:59Z']),'2026-01-01');
  assert.equal(await call('sa_challenge_day',['2026-07-02T04:59:59Z']),'2026-07-01');
  assert.equal(await call('sa_challenge_day',['2026-07-02T05:00:00Z']),'2026-07-02');
  await db.exec(`create or replace function public.sa_challenge_day(p_time timestamptz default now()) returns date language sql stable set search_path='' as $$select (coalesce(nullif(current_setting('sa.test_now',true),'')::timestamptz,p_time) at time zone 'Etc/GMT+5')::date$$;`);
  await setTime('2026-07-01T16:00:00Z');
  const owners=Array.from({length:6},()=>crypto.randomUUID());
  for(const id of owners)await db.query('insert into auth.users(id) values($1)',[id]);
  const today=await call('sa_challenge'),poll=await call('sa_poll');
  assert.equal(poll.targetDay,'2026-07-02');assert.equal(Date.parse(poll.closesAt),Date.parse('2026-07-02T05:00:00Z'));
  const selections=[0,1,1,1,2];
  for(let i=0;i<selections.length;i++)await call('sa_vote',[owners[i],poll.targetDay,poll.choices[selections[i]].id]);
  await setTime('2026-07-02T00:00:00Z');
  assert.deepEqual(await call('sa_challenge'),today);
  assert.equal((await call('sa_poll')).totalVotes,5);
  await setTime('2026-07-02T04:59:59.999Z');await call('sa_vote',[owners[5],poll.targetDay,poll.choices[2].id]);
  await setTime('2026-07-02T05:00:00Z');
  const winner=await call('sa_challenge');assert.equal(winner.id,poll.targetDay);assert.equal(winner.topic,poll.choices[1].topic);
  await assert.rejects(()=>call('sa_vote',[owners[0],poll.targetDay,poll.choices[0].id]),/SA409/);
  const next=await call('sa_poll');assert.equal(next.totalVotes,0);assert.equal(next.choices.length,3);
  assert.ok(next.choices.every(c=>!poll.choices.some(old=>old.topic.toLowerCase()===c.topic.toLowerCase())));
  assert.deepEqual(await call('sa_challenge'),winner);
  assert.equal((await db.query('select count(*)::int n from public.sa_votes where day=$1',[poll.targetDay])).rows[0].n,6);
  // Prior UTC-day usage must not block participation in the new EST challenge.
  await db.query('insert into public.sa_usage(day,user_id,challenge,total) values(public.sa_day(),$1,1,1)',[owners[0]]);
  const usage=await call('sa_usage_snapshot',[owners[0],'daily-challenge']);assert.equal(usage.canAnalyze,true);
  const job=await call('sa_reserve_job',[owners[0],crypto.randomUUID(),crypto.randomUUID(),'digest',{format:'daily-challenge',challengeId:winner.id,topic:winner.topic,durationSeconds:60,publicUsername:'AuditSpeaker'},owners[0]+'/take']);
  assert.equal(job.metadata.challengeId,winner.id);
  const attempt=(await db.query('select day::text as challenge_date from public.sa_daily_attempts where job_id=$1',[job.id])).rows[0];assert.equal(attempt.challenge_date,winner.id);
  await db.exec('set role authenticated');try{await assert.rejects(()=>call('sa_vote',[owners[0],next.targetDay,next.choices[0].id]),/permission denied/);}finally{await db.exec('reset role');}
  // The migration can be reapplied without destroying the closed poll or current winner.
  await db.exec(read('20261016162727_topic_vote_est_rollover.sql'));
  await setTime('');
 }finally{await db.close();}
});
test('daily challenge and voting UI contain no reset-time announcements',()=>{
 for(const file of ['src/components/DailyTopicVote.jsx','src/components/SpeechAnalysis.jsx','src/screens/DailyChallengeScreen.jsx']){
  const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.doesNotMatch(text,/midnight|per UTC day|resets at|voting closes at/i);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {topicVoting} from './topic-voting.js';
import {createAnalysisServer,readConfig} from './index.js';
import {selectDailyTopic} from '../src/lib/practice.js';

const rows=Array.from({length:6},(_,index)=>({id:index+1,topic:`Explain useful habit ${index+1} with an example.`}));
function fixture(t){
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-topic-votes-'));
 t.after(()=>rmSync(dataDir,{recursive:true,force:true}));
 let time=Date.parse('2026-10-11T12:00:00Z'),topics=rows;
 const config={dataDir,supabaseUrl:'https://test.supabase.co',supabaseKey:'test'};
 const fetchImpl=async()=>Response.json(topics);
 const now=()=>time;
 return {config,fetchImpl,now,service:topicVoting(config,fetchImpl,now),advance:()=>{time+=86400000;},setTime:value=>{time=Date.parse(value);},topics:value=>{topics=value;}};
}
test('ballot is persisted, uses unique existing topics, and excludes the current challenge',async t=>{
 const f=fixture(t),today=await f.service.challenge(),ballot=await f.service.ballot('user-a');
 assert.equal(ballot.targetDay,'2026-10-12');assert.equal(ballot.closesAt,'2026-10-12T00:00:00.000Z');
 assert.equal(ballot.choices.length,3);assert.equal(new Set(ballot.choices.map(choice=>choice.topic)).size,3);
 assert.ok(ballot.choices.every(choice=>rows.some(row=>row.topic===choice.topic)&&choice.topic!==today.topic));
 f.topics([{id:99,topic:'A newly added topic.'}]);
 assert.deepEqual(await topicVoting(f.config,f.fetchImpl,f.now).ballot('user-a'),ballot);
});
test('small and duplicate topic pools always produce three distinct choices excluding today',async t=>{
 for(const topics of [[rows[0]],[rows[0],rows[1]],[rows[0],{id:99,topic:rows[0].topic.toUpperCase()}]]){
  const f=fixture(t);f.topics(topics);
  const today=await f.service.challenge(),poll=await f.service.ballot('user-a');
  assert.equal(poll.choices.length,3);
  assert.equal(new Set(poll.choices.map(choice=>choice.topic.toLowerCase())).size,3);
  assert.ok(poll.choices.every(choice=>choice.topic.toLowerCase()!==today.topic.toLowerCase()));
  const saved=await f.service.vote('user-a',poll.targetDay,poll.choices[2].id);
  assert.equal(saved.myVote,poll.choices[2].id);
  assert.deepEqual(await topicVoting(f.config,f.fetchImpl,f.now).ballot('user-a'),saved);
  f.advance();assert.equal((await f.service.challenge()).topic,poll.choices[2].topic);
 }
});

test('empty, unavailable, and unconfigured topic services still provide three persisted choices',async t=>{
 for(const fetchImpl of [async()=>Response.json([]),async()=>new Response('{}',{status:503}),async()=>{throw Error('offline');}]){
  const f=fixture(t),service=topicVoting(f.config,fetchImpl,f.now);
  const today=await service.challenge(),poll=await service.results();
  assert.equal(poll.choices.length,3);assert.equal(new Set(poll.choices.map(choice=>choice.topic)).size,3);
  assert.ok(poll.choices.every(choice=>choice.topic!==today.topic));
  assert.deepEqual(await topicVoting(f.config,fetchImpl,f.now).results(),poll);
 }
 const f=fixture(t),service=topicVoting({...f.config,supabaseUrl:''},async()=>{throw Error('must not fetch');},f.now);
 assert.equal((await service.results()).choices.length,3);
});

test('existing short ballots gain choices without changing existing ids, topics, or votes',async t=>{
 const f=fixture(t),targetDay='2026-10-12';
 const existing={targetDay,closesAt:`${targetDay}T00:00:00.000Z`,choices:[{id:'choice-7',topic:'Describe a lesson people can learn from making mistakes.'}],votes:[{owner:'user-a',choiceId:'choice-7'}]};
 const today='What makes someone a good leader? Support your answer with an example.';
 writeFileSync(path.join(f.config.dataDir,'topic-voting.json'),JSON.stringify({polls:{[targetDay]:existing},challenges:{'2026-10-11':today}}));
 const service=topicVoting(f.config,async()=>{throw Error('offline');},f.now),poll=await service.ballot('user-a');
 assert.equal(poll.choices.length,3);assert.equal(new Set(poll.choices.map(choice=>choice.topic)).size,3);
 assert.equal(new Set(poll.choices.map(choice=>choice.id)).size,3);assert.equal(poll.myVote,'choice-7');assert.equal(poll.totalVotes,1);
 assert.deepEqual(poll.choices[0],{...existing.choices[0],votes:1,percentage:100});
 assert.ok(poll.choices.every(choice=>choice.topic!==today));
 assert.deepEqual(await topicVoting(f.config,f.fetchImpl,f.now).ballot('user-a'),poll);
});

test('each account has one private vote; changing or repeating a vote never adds votes',async t=>{
 const f=fixture(t),poll=await f.service.ballot('user-a');
 let result=await f.service.vote('user-a',poll.targetDay,poll.choices[0].id);
 assert.equal(result.totalVotes,1);assert.equal(result.myVote,poll.choices[0].id);
 result=await f.service.vote('user-a',poll.targetDay,poll.choices[1].id);
 result=await f.service.vote('user-a',poll.targetDay,poll.choices[1].id);
 assert.equal(result.totalVotes,1);assert.deepEqual(result.choices.map(choice=>choice.votes),[0,1,0]);
 await f.service.vote('user-b',poll.targetDay,poll.choices[1].id);
 result=await topicVoting(f.config,f.fetchImpl,f.now).ballot('user-c');
 assert.equal(result.totalVotes,2);assert.equal(result.myVote,null);assert.ok(!JSON.stringify(result).includes('user-a'));
});
test('winner becomes the official next-day challenge after restart, even if the topic pool is unavailable',async t=>{
 const f=fixture(t),today=await f.service.challenge(),poll=await f.service.ballot('user-a');
 await f.service.vote('user-a',poll.targetDay,poll.choices[2].id);
 assert.deepEqual(await f.service.challenge(),today);
 f.advance();
 const restarted=topicVoting(f.config,async()=>{throw Error('offline');},f.now);
 assert.deepEqual(await restarted.challenge(),{id:poll.targetDay,topic:poll.choices[2].topic});
 await assert.rejects(()=>restarted.vote('late-user',poll.targetDay,poll.choices[0].id),{status:409});
});
test('ties follow the persisted candidate order; no-vote days use the existing rotation',async t=>{
 const f=fixture(t),poll=await f.service.ballot('user-a');
 await f.service.vote('user-a',poll.targetDay,poll.choices[1].id);
 await f.service.vote('user-b',poll.targetDay,poll.choices[0].id);
 f.advance();assert.equal((await f.service.challenge()).topic,poll.choices[0].topic);
 const nextPoll=await f.service.ballot('user-a');f.advance();
 assert.equal((await f.service.challenge()).topic,selectDailyTopic(rows,new Date(`${nextPoll.targetDay}T12:00:00Z`)).topic);
});
test('invalid choices and stale ballots cannot create votes; simultaneous requests preserve the ballot',async t=>{
 const f=fixture(t),ballots=await Promise.all([f.service.ballot('user-a'),f.service.ballot('user-b')]);
 assert.deepEqual(ballots[0].choices,ballots[1].choices);
 const poll=ballots[0];
 await assert.rejects(()=>f.service.vote('user-a',poll.targetDay,'an-arbitrary-topic'),{status:400});
 await assert.rejects(()=>f.service.vote('user-a','2026-10-13',poll.choices[0].id),{status:409});
 assert.equal((await f.service.ballot('user-a')).totalVotes,0);
 await Promise.all(['user-a','user-b','user-c'].map(owner=>f.service.vote(owner,poll.targetDay,poll.choices[0].id)));
 assert.equal((await f.service.ballot('user-d')).totalVotes,3);
});
test('voting closes exactly at midnight UTC and the next ballot targets the following day',async t=>{
 const f=fixture(t),poll=await f.service.ballot('user-a');
 f.setTime('2026-10-11T23:59:59Z');await f.service.vote('user-a',poll.targetDay,poll.choices[0].id);
 f.setTime('2026-10-12T00:00:00Z');
 await assert.rejects(()=>f.service.vote('user-b',poll.targetDay,poll.choices[1].id),{status:409});
 assert.equal((await f.service.challenge()).topic,poll.choices[0].topic);
 assert.equal((await f.service.ballot('user-a')).targetDay,'2026-10-13');
});
test('duplicate source topics keep the original fallback rotation but never create duplicate ballot choices',async t=>{
 const f=fixture(t),duplicates=[rows[0],{id:7,topic:rows[0].topic},rows[1],rows[2]];
 f.topics(duplicates);
 assert.equal((await f.service.challenge()).topic,selectDailyTopic(duplicates,new Date('2026-10-11T12:00:00Z')).topic);
 const poll=await f.service.ballot('user-a');
 assert.equal(new Set(poll.choices.map(choice=>choice.topic)).size,poll.choices.length);
});
test('public results show zero-safe percentages and aggregate votes without private voter details',async t=>{
 const f=fixture(t),empty=await f.service.results();
 assert.deepEqual(empty.choices.map(choice=>choice.percentage),[0,0,0]);
 assert.equal(empty.totalVotes,0);assert.equal(empty.myVote,undefined);assert.equal(empty.eligible,undefined);
 await f.service.vote('private-user-a',empty.targetDay,empty.choices[0].id);
 await f.service.vote('private-user-b',empty.targetDay,empty.choices[0].id);
 await f.service.vote('private-user-c',empty.targetDay,empty.choices[1].id);
 let result=await f.service.results();
 assert.deepEqual(result.choices.map(choice=>choice.percentage),[66.7,33.3,0]);
 assert.ok(!JSON.stringify(result).includes('private-user'));assert.equal(result.myVote,undefined);
 await f.service.vote('private-user-a',empty.targetDay,empty.choices[1].id);
 result=await f.service.results();assert.deepEqual(result.choices.map(choice=>choice.percentage),[33.3,66.7,0]);
 assert.equal(result.totalVotes,3);
});
test('API permits all authenticated accounts to vote and keeps public daily topics aligned with votes',async t=>{
 const f=fixture(t);
 const active={status:'active',validUntil:'2099-01-01T00:00:00Z'};
 const users={paid:{id:'paid-user',app_metadata:{simplyarticulate_subscription:active}},
  free:{id:'free-user',user_metadata:{simplyarticulate_subscription:active}},
  expired:{id:'expired-user',app_metadata:{simplyarticulate_subscription:{status:'active',validUntil:'2000-01-01T00:00:00Z'}}}};
 const config={...readConfig({SUPABASE_URL:f.config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:'test'}),dataDir:f.config.dataDir};
 const server=createAnalysisServer(config,{now:f.now,fetchImpl:async(url,options)=>{
  if(url.includes('/rest/v1/daily_topics'))return Response.json(rows);
  const token=options.headers.authorization.slice(7);
  return users[token]?Response.json(users[token]):new Response('{}',{status:401});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}/api/analysis`;
 const get=token=>fetch(`${base}/topic-vote`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
 const post=(token,body)=>fetch(`${base}/topic-vote`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await get()).status,401);assert.equal((await get('forged')).status,401);
 const publicResponse=await fetch(`${base}/topic-vote/results`);
 assert.equal(publicResponse.status,200);
 const initialResults=await publicResponse.json();assert.equal(initialResults.totalVotes,0);
 assert.equal(initialResults.myVote,undefined);assert.equal(initialResults.eligible,undefined);
 assert.equal((await fetch(`${base}/topic-vote`,{method:'POST',body:'{}'})).status,401);
 assert.equal((await post('forged',{targetDay:initialResults.targetDay,choiceId:initialResults.choices[2].id})).status,401);
 for(const token of ['free','expired']){
  const accountBallot=await (await get(token)).json();
  assert.equal(accountBallot.eligible,true);assert.equal(accountBallot.myVote,null);
  const saved=await post(token,{targetDay:accountBallot.targetDay,choiceId:accountBallot.choices[2].id});
  assert.equal(saved.status,200);assert.equal((await saved.json()).myVote,accountBallot.choices[2].id);
 }
 const ballot=await (await get('paid')).json();assert.equal(ballot.eligible,true);
 assert.equal(ballot.myVote,null);
 assert.equal((await post('paid',{targetDay:ballot.targetDay,choiceId:'invented'})).status,400);
 let response=await post('paid',{targetDay:ballot.targetDay,choiceId:ballot.choices[2].id,owner:'another-user'});
 assert.equal(response.status,200);assert.equal((await response.json()).myVote,ballot.choices[2].id);
 const publicResults=await (await fetch(`${base}/topic-vote/results`,{headers:{Authorization:'Bearer free'}})).json();
 assert.equal(publicResults.totalVotes,3);assert.deepEqual(publicResults.choices.map(choice=>choice.percentage),[0,0,100]);
 const updatedFreeVote=await post('free',{targetDay:ballot.targetDay,choiceId:ballot.choices[0].id,owner:'paid-user'});
 assert.equal(updatedFreeVote.status,200);assert.equal((await updatedFreeVote.json()).totalVotes,3);
 assert.equal((await (await get('paid')).json()).myVote,ballot.choices[2].id);
 assert.ok(!JSON.stringify(publicResults).includes('paid-user'));assert.equal(publicResults.myVote,undefined);
 assert.equal((await post('paid',null)).status,400);
 response=await fetch(`${base}/topic-vote`,{method:'POST',headers:{Authorization:'Bearer paid'},body:'invalid json'});assert.equal(response.status,400);
 const unchanged=await (await fetch(`${base}/challenge`)).json();assert.equal(unchanged.id,'2026-10-11');
 f.advance();const next=await (await fetch(`${base}/challenge`)).json();
 assert.deepEqual(next,{id:ballot.targetDay,topic:ballot.choices[2].topic});
});

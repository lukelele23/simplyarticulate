import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {selectDailyTopic} from '../src/lib/practice.js';

import {challengeDay as dayAt,nextChallengeDay as tomorrowAt,challengeDayStart} from '../src/lib/challengeDay.js';
const failure = (message,status) => Object.assign(new Error(message),{status});
const fallbackTopics=[
 'Describe a small habit that can make a big difference in everyday life.',
 'Should schools teach more practical life skills? Explain your position.',
 'What makes someone a good leader? Support your answer with an example.',
 'Is it better to work alone or as part of a team? Explain why.',
 'Describe a lesson people can learn from making mistakes.',
 'How can technology help people build stronger communities?',
 'What is one change that would improve your local community?',
 'Should people spend more time outdoors? Explain the benefits and tradeoffs.'
].map((topic,index)=>({id:`fallback-${index+1}`,topic}));

// Like the existing quota and community ledgers, this requires one backend process.
// Multiple production replicas must use a shared transactional database.
export function topicVoting(config,fetchImpl=fetch,now=Date.now) {
 mkdirSync(config.dataDir,{recursive:true});
 const filename=path.join(config.dataDir,'topic-voting.json');
 let data=existsSync(filename)?JSON.parse(readFileSync(filename,'utf8')):{polls:{},challenges:{}};
 if(!data?.polls||!data?.challenges||Array.isArray(data.polls)||Array.isArray(data.challenges))throw Error('Invalid topic voting ledger.');
 function commit(next){
  writeFileSync(`${filename}.tmp`,JSON.stringify(next),{mode:0o600});
  renameSync(`${filename}.tmp`,filename);data=next;
 }
 async function pool(){
  if(!config.supabaseUrl||!config.supabaseKey)return fallbackTopics;
  try{
  const response=await fetchImpl(`${config.supabaseUrl.replace(/\/$/,'')}/rest/v1/daily_topics?select=id,topic&order=id.asc`,{
   headers:{apikey:config.supabaseKey,Authorization:`Bearer ${config.supabaseKey}`},signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw failure('The daily topic service is unavailable. Please try later.',503);
  const rows=await response.json();
  if(!Array.isArray(rows))throw failure('The daily topic service is unavailable. Please try later.',503);
  const topics=rows.filter(row=>row?.id!=null&&typeof row.topic==='string'&&row.topic.trim()&&row.topic.trim().length<=500)
   .map(row=>({id:row.id,topic:row.topic.trim()}));
  return topics.length?topics:fallbackTopics;
  }catch{return fallbackTopics;}
 }
 function completeChoices(choices,targetDay,today,excluded=[]){
  const completed=[...choices];
  const seen=new Set(completed.map(choice=>choice.topic.toLowerCase()));
  if(today)seen.add(today.toLowerCase());
  for(const topic of excluded)seen.add(topic.toLowerCase());
  const available=fallbackTopics.filter(row=>!seen.has(row.topic.toLowerCase()));
  const first=selectDailyTopic(available,new Date(`${targetDay}T12:00:00Z`));
  const offset=available.indexOf(first);
  for(let index=0;completed.length<3;index++){
   let id=1;while(completed.some(choice=>choice.id===`choice-${id}`))id++;
   completed.push({id:`choice-${id}`,topic:available[(offset+index)%available.length].topic});
  }
  return completed;
 }
 function storedPoll(targetDay){
  const poll=data.polls[targetDay];
  if(!poll)return poll;
  if(poll.choices.length>=3&&poll.closesAt===challengeDayStart(targetDay))return poll;
  const updated={...poll,closesAt:challengeDayStart(targetDay),choices:completeChoices(poll.choices,targetDay,data.challenges[dayAt(now())])};
  commit({...data,polls:{...data.polls,[targetDay]:updated}});
  return updated;
 }
 function winner(poll){
  const counts=new Map(poll.choices.map(choice=>[choice.id,0]));
  for(const vote of poll.votes)if(counts.has(vote.choiceId))counts.set(vote.choiceId,counts.get(vote.choiceId)+1);
  if(!poll.votes.length)return null;
  // Equal totals retain the persisted candidate order.
  return poll.choices.reduce((best,choice)=>counts.get(choice.id)>counts.get(best.id)?choice:best);
 }
 async function challenge(){
  const day=dayAt(now());
  if(data.challenges[day])return {id:day,topic:data.challenges[day]};
  let topic=winner(data.polls[day]||{choices:[],votes:[]})?.topic;
  if(!topic)topic=selectDailyTopic(await pool(),new Date(`${day}T12:00:00Z`)).topic;
  if(day!==dayAt(now()))return challenge();
  if(!data.challenges[day])commit({...data,challenges:{...data.challenges,[day]:topic}});
  return {id:day,topic:data.challenges[day]};
 }
 async function ensurePoll(){
  const targetDay=tomorrowAt(now());
  if(data.polls[targetDay])return storedPoll(targetDay);
  const today=await challenge();
  const rows=await pool();
  if(targetDay!==tomorrowAt(now()))return ensurePoll();
  // Check again after asynchronous fetching to preserve concurrent votes.
  if(data.polls[targetDay])return storedPoll(targetDay);
  const seen=new Set();
  const unique=rows.filter(row=>{const key=row.topic.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
  const previousTopics=(data.polls[today.id]?.choices||[]).map(choice=>choice.topic);
  const excluded=new Set([today.topic,...previousTopics].map(topic=>topic.toLowerCase()));
  const different=unique.filter(row=>!excluded.has(row.topic.toLowerCase()));
  const available=different.length?different:fallbackTopics.filter(row=>!excluded.has(row.topic.toLowerCase()));
  const first=selectDailyTopic(available,new Date(`${targetDay}T12:00:00Z`));
  const offset=available.indexOf(first);
  const choices=completeChoices(Array.from({length:Math.min(3,available.length)},(_,index)=>({id:`choice-${index+1}`,topic:available[(offset+index)%available.length].topic})),targetDay,today.topic,previousTopics);
  const poll={targetDay,closesAt:challengeDayStart(targetDay),choices,votes:[]};
  commit({...data,polls:{...data.polls,[targetDay]:poll}});
  return poll;
 }
 function snapshot(poll,owner){
  return {eligible:true,targetDay:poll.targetDay,closesAt:poll.closesAt,totalVotes:poll.votes.length,
   myVote:poll.votes.find(vote=>vote.owner===owner)?.choiceId||null,
   choices:poll.choices.map(choice=>{
    const votes=poll.votes.filter(vote=>vote.choiceId===choice.id).length;
    return {...choice,votes,percentage:poll.votes.length?Math.round(votes/poll.votes.length*1000)/10:0};
   })};
 }
 return {purge(owner){const polls=Object.fromEntries(Object.entries(data.polls).map(([day,poll])=>[day,{...poll,votes:poll.votes.filter(v=>v.owner!==owner)}]));commit({...data,polls});},challenge,async results(){
  const {eligible,myVote,...results}=snapshot(await ensurePoll(),null);
  return results;
 },async ballot(owner){return snapshot(await ensurePoll(),owner);},async vote(owner,targetDay,choiceId){
  if(targetDay!==tomorrowAt(now()))throw failure('Voting for that day has closed. Refresh to vote on the next challenge.',409);
  await ensurePoll();
  if(targetDay!==tomorrowAt(now()))throw failure('Voting for that day has closed. Refresh to vote on the next challenge.',409);
  const poll=data.polls[targetDay];
  if(!poll.choices.some(choice=>choice.id===choiceId))throw failure('Choose one of the listed topics.',400);
  const votes=poll.votes.filter(vote=>vote.owner!==owner).concat({owner,choiceId});
  const updated={...poll,votes};
  commit({...data,polls:{...data.polls,[targetDay]:updated}});
  return snapshot(updated,owner);
 }};
}

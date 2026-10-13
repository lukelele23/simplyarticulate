import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Persist reservations before calling providers so a restart cannot reset the cap.
// This ledger requires a single backend process; multiple instances need a shared transaction store.
export function analysisAllowance(config) {
 mkdirSync(config.dataDir,{recursive:true});
 const filename=path.join(config.dataDir,'analysis-counts.json');
 const data=existsSync(filename)?JSON.parse(readFileSync(filename,'utf8')):{days:{}};
 if(!data?.days||typeof data.days!=='object')throw Error('Invalid analysis allowance ledger.');
 data.surveys||={};
 const pending=new Map();
 const day=()=>new Date().toISOString().slice(0,10);
 const save=()=>{if(!config.demo){writeFileSync(`${filename}.tmp`,JSON.stringify(data),{mode:0o600});renameSync(`${filename}.tmp`,filename);}};
 const category=format=>format==='daily-challenge'?'challenge':'practice';
 function counts(owner,today){const users=data.days[today]||={};const old=users[owner];
  // Old undifferentiated use is conservatively migrated to the practice allowance.
  if(typeof old==='number')users[owner]={practice:old,challenge:0,total:old};
  return users[owner]||={practice:0,challenge:0,total:0};
 }
 function usage(owner,paid,format='speech'){
  const today=day(),used=counts(owner,today),kind=category(format),limit=paid?(config.paidDailyAnalyses||25):1;
  const taken=paid?used.total:used[kind];
  const bonus=kind==='practice'?(data.surveys[owner]?.bonusRemaining||0):0;
  return {paid,canAnalyze:taken<limit||bonus>0,analysesUsed:taken,analysisLimit:limit,analysesRemaining:Math.max(0,limit-taken)+bonus,category:kind,
   practiceUsed:used.practice,challengeUsed:used.challenge,resetAt:Date.parse(`${today}T00:00:00Z`)+86400000};
 }
 function surveyStatus(owner){return {completed:Boolean(data.surveys[owner]),bonusRemaining:data.surveys[owner]?.bonusRemaining||0};}
 return {purge(owner){delete data.surveys[owner];for(const users of Object.values(data.days))delete users[owner];for(const [token,row] of pending)if(row.owner===owner)pending.delete(token);save();},usage,surveyStatus,completeSurvey(owner,answer,outcome){
  if(outcome&&!['clarity','presentations','confidence','interviews','debate'].includes(outcome))throw Object.assign(Error('Choose a speaking goal.'),{status:400});
  if(!['yes','maybe','no'].includes(answer))throw Object.assign(Error('Choose an answer to the subscription question.'),{status:400});
  if(data.surveys[owner])return surveyStatus(owner);
  data.surveys[owner]={answer,outcome:outcome||null,completedAt:new Date().toISOString(),bonusRemaining:1};
  try{save();}catch(error){delete data.surveys[owner];throw error;}
  return surveyStatus(owner);
 },reserve(owner,paid,format='speech'){
  if(!usage(owner,paid,format).canAnalyze)throw Object.assign(Error(paid?"Analysis is temporarily unavailable for your account. Your recording is still available. Please try again tomorrow.":`You've used today's ${category(format)} analysis. Your other daily allowance is separate. Try again after midnight UTC.`),{status:429});
  const reservedDay=day(),kind=category(format),used=counts(owner,reservedDay);
  const bonus=kind==='practice'&&(paid?used.total:used[kind])>=(paid?(config.paidDailyAnalyses||25):1);
  if(bonus)data.surveys[owner].bonusRemaining--;
  used[kind]++;used.total++;
  try{save();}catch(error){used[kind]--;used.total--;if(bonus)data.surveys[owner].bonusRemaining++;throw error;}
  const token=Symbol();pending.set(token,{owner,day:reservedDay,kind,bonus});return token;
 },finish(token,success){const reservation=pending.get(token);if(!reservation)return;
  if(!success){const used=counts(reservation.owner,reservation.day);used[reservation.kind]--;used.total--;if(reservation.bonus)data.surveys[reservation.owner].bonusRemaining++;try{save();}catch(error){used[reservation.kind]++;used.total++;if(reservation.bonus)data.surveys[reservation.owner].bonusRemaining--;throw error;}}
  pending.delete(token);
 }};
}
export function hasPaidEntitlement(user,now=Date.now()){
 const subscription=user.app_metadata?.simplyarticulate_subscription;
 return subscription?.status==='active'&&Number.isFinite(Date.parse(subscription.validUntil))&&Date.parse(subscription.validUntil)>now;
}

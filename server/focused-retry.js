import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
export function focusedRetries(config){
 const file=path.join(config.dataDir,'focused-retries.json');
 const rows=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
 const save=()=>{if(!config.demo){writeFileSync(file+'.tmp',JSON.stringify(rows),{mode:0o600});renameSync(file+'.tmp',file);}};
 const eligible=(row,owner)=>row&&row.owner===owner&&row.expiresAt>Date.now()&&!row.used;
 return {
  record(job){if(job.metadata.parentJobId||job.metadata.format==='daily-challenge'||!job.result?.coaching||config.demo)return;const c=job.result.coaching,quote=c.argumentLogic?.issues?.[0]?.quote||c.structureLanguage?.sentenceStructure?.[0]?.quote||c.structureLanguage?.wordChoice?.[0]?.quote||'';const start=Math.max(0,job.result.transcript.indexOf(quote)-150);rows[job.id]={owner:job.owner,topic:job.metadata.topic,format:job.metadata.format,difficulty:job.metadata.difficulty,goal:job.metadata.goal,focus:job.result.coaching.nextStep||job.result.coaching.nextExercise,excerpt:job.result.transcript.slice(start,start+1200),expiresAt:Date.now()+86400000};save();},
  status(owner,id){return {eligible:Boolean(eligible(rows[id],owner)),maxSeconds:60};},
  claim(owner,id,key,digest,metadata){const row=rows[id];if(!eligible(row,owner)&&!(row?.owner===owner&&row.used&&row.key===key&&row.digest===digest&&row.state!=='completed'&&row.expiresAt>Date.now()))throw Object.assign(Error('This focused retry is unavailable. Compare by listening or use your daily allowance.'),{status:429});if(metadata.durationSeconds>60||metadata.format!==row.format||metadata.topic!==row.topic||metadata.difficulty!==row.difficulty)throw Object.assign(Error('A focused retry must use the same topic, format and difficulty and last at most 60 seconds.'),{status:400});rows[id]={...row,used:true,key,digest,failed:false,state:'pending'};save();return {focus:row.focus,previousExcerpt:row.excerpt,goal:row.goal};},
  finish(id,success){if(rows[id]){rows[id].failed=!success;rows[id].state=success?'completed':'failed';save();}},
  purge(owner){for(const [id,row] of Object.entries(rows))if(row.owner===owner)delete rows[id];save();}
 };
}

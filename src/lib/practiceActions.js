/** @typedef {{id:string,label:string,quote:string,startSeconds:number|null}} PracticeAction */
const wordsOf=text=>String(text||'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
/** Seek only when a quote matches exactly one sequence of actual provider words. */
export function evidenceTime(report,quote){
 if(report?.demo||!quote||!report?.transcript?.includes(quote))return null;
 const target=wordsOf(quote);if(!target.length)return null;
 const tokens=(report.words||[]).flatMap(word=>wordsOf(word.text).map(text=>({text,start:word.start,end:word.end})));
 const matches=[];
 for(let i=0;i<=tokens.length-target.length;i++){
  if(target.every((text,j)=>tokens[i+j].text===text)&&Number.isFinite(tokens[i].start)&&tokens[i].start>=0&&Number.isFinite(tokens[i].end)&&tokens[i].end>=tokens[i].start)matches.push(tokens[i].start/1000);
 }
 return matches.length===1?matches[0]:null;
}
// Stable UI identity, not a security hash. Avoid index-based checks moving to another issue.
function actionId(text){let hash=14695981039346656037n;for(const char of text){hash^=BigInt(char.codePointAt(0));hash=BigInt.asUintN(64,hash*1099511628211n);}return 'v1-'+hash.toString(16).padStart(16,'0');}
/** Derive actions from validated coaching without another LLM call. @returns {PracticeAction[]} */
export function practiceActions(report){
 if(!report?.coaching||report.demo)return [];
 const c=report.coaching;
 const candidates=[{label:c.nextStep||c.nextExercise,quote:''},...[...(c.argumentLogic?.issues||[]),...(c.structureLanguage?.sentenceStructure||[]),...(c.structureLanguage?.wordChoice||[])].map(issue=>({label:issue.suggestion,quote:issue.quote}))];
 const seen=new Set();return candidates.filter(item=>typeof item.label==='string'&&item.label.trim()&&item.label.length<=1800&&(!item.quote||report.transcript?.includes(item.quote))).map(item=>({...item,label:item.label.trim()})).filter(item=>{const key=item.label.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,3).map(item=>({...item,id:actionId(item.label+'\n'+item.quote),startSeconds:evidenceTime(report,item.quote)}));
}
/** Only user-entered notes and opaque completion IDs are retained, never extra transcript copies. */
export function cleanPracticeActions(value){
 const checks={};for(const [key,checked] of Object.entries(value?.checks||{}).slice(-8))if(/^v1-[a-f0-9]{16}$/.test(key)&&typeof checked==='boolean')checks[key]=checked;
 return {version:1,checks,note:typeof value?.note==='string'?value.note.slice(0,600):''};
}
export function updatePracticeActions(sessions,takeId,patch){
 return sessions.map(session=>{if(session.id!==takeId)return session;const previous=cleanPracticeActions(session.practiceActions);const next=cleanPracticeActions({...previous,...patch,checks:{...previous.checks,...patch.checks}});return {...session,practiceActions:next};});
}
export function practicePlanText(actions,state,topic=''){
 const current=cleanPracticeActions(state);return [topic,'My practice plan',...actions.map(action=>`${current.checks[action.id]?'[x]':'[ ]'} ${action.label}${action.quote?`\nEvidence: “${action.quote}”`:''}`),current.note?`My note: ${current.note}`:''].filter(Boolean).join('\n\n');
}

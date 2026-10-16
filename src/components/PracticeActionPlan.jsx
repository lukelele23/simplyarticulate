import {useEffect,useState} from 'react';
import {practiceActions,cleanPracticeActions,practicePlanText} from '../lib/practiceActions.js';
import './practiceActionPlan.css';
export default function PracticeActionPlan({report,state,onChange,onSeek,onRetry,busy=false,topic=''}){
 const actions=practiceActions(report),saved=cleanPracticeActions(state);
 const [note,setNote]=useState(saved.note),[message,setMessage]=useState('');
 useEffect(()=>{setNote(saved.note);},[saved.note]);
 if(!actions.length)return null;
 const rehearsed=actions.filter(action=>saved.checks[action.id]).length;
 async function copy(){try{await navigator.clipboard.writeText(practicePlanText(actions,{...saved,note},topic));setMessage('Practice plan copied.');}catch{setMessage('Copy is unavailable. Use Download plan instead.');}}
 function download(){const url=URL.createObjectURL(new Blob([practicePlanText(actions,{...saved,note},topic)],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='simplyarticulate-practice-plan.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="practice-action-plan" aria-label="Your practice plan"><header><h3>Put your feedback into practice</h3><span>{rehearsed}/{actions.length} rehearsed</span></header><p>Check an action after trying it. This tracks practice, not a new skill rating.</p><ul>{actions.map(action=><li key={action.id}><label><input type="checkbox" checked={Boolean(saved.checks[action.id])} disabled={!onChange||busy} onChange={event=>onChange({checks:{[action.id]:event.target.checked}})}/><span>{action.label}</span></label>{action.quote&&<blockquote>{action.quote}</blockquote>}{onSeek&&action.startSeconds!==null&&<button type="button" className="text-button" onClick={()=>onSeek(action.startSeconds)}>Hear this moment · {Math.floor(action.startSeconds/60)}:{String(Math.floor(action.startSeconds%60)).padStart(2,'0')}</button>}</li>)}</ul>
  {onChange&&<details><summary>Add your practice note</summary><label className="practice-note-label">What will you try next?<textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={600} rows={3} disabled={busy}/></label><button type="button" className="secondary-button" disabled={busy||note===saved.note} onClick={()=>{onChange({note});setMessage('Note added to progress. Account sync runs in the background.');}}>Save note</button></details>}
  <div className="analysis-actions">{onRetry&&<button type="button" className="primary-button" disabled={busy} onClick={()=>onRetry(report.coaching.nextStep||report.coaching.nextExercise)}>Practice this focus</button>}<button type="button" className="secondary-button" onClick={copy}>Copy plan</button><button type="button" className="text-button" onClick={download}>Download plan</button></div>{message&&<p role="status">{message}</p>}
 </section>;
}

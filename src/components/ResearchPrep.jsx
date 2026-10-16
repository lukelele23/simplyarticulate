import {useId} from 'react';
import useResearchNotes from '../hooks/useResearchNotes.js';
import './researchPrep.css';
export default function ResearchPrep({topic,userId,seconds=0,onPrepare,compact=false}){
 const id=useId();const [notes,setNotes,error]=useResearchNotes(topic,userId);
 if(!topic)return null;
 return <details className="research-prep" open={compact?true:undefined}><summary>Research notes &amp; talking points</summary><div className="research-prep-content"><p>Use these questions to plan your answer; they are prompts, not verified research.</p><ul><li>What is the main mechanism or idea you need to explain?</li><li>Which example or source would support it?</li><li>What is uncertain, and what would change your conclusion?</li></ul><label htmlFor={id}>Your notes</label><textarea id={id} value={notes} maxLength={2000} rows={3} onChange={event=>setNotes(event.target.value)} placeholder="Main point, supporting example, uncertainty…" aria-describedby={`${id}-help`}/><small id={`${id}-help`}>Private notes stay in this browser tab. They are not sent for AI analysis.</small>{error&&<p role="alert">{error}</p>}{onPrepare&&<button type="button" className="secondary-button" onClick={onPrepare}>{seconds>0?`Prepare · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Use a 2-minute prep timer'} <span aria-hidden="true">→</span></button>}</div></details>;
}

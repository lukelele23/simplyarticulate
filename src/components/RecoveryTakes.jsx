import {useEffect,useState} from 'react';
import {listDrafts,removeDraft} from '../lib/drafts.js';
import './recoveryTakes.css';
function duration(seconds){const value=Math.max(0,Math.round(seconds));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
function dateLabel(take){const date=new Date(take.recordedAt||take.updatedAt);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date):'Saved on this device';}
function TakeRow({take,onRecover,onRemove,busy}){
 const [url,setUrl]=useState('');
 const [preview,setPreview]=useState(false);
 const [playbackError,setPlaybackError]=useState('');
 useEffect(()=>{const source=URL.createObjectURL(take.blob);setUrl(source);return()=>URL.revokeObjectURL(source);},[take.blob]);
 return <article className="recovery-take">
  <div className="recovery-take-heading"><div><h3>{take.topic||'Untitled practice'}</h3><p>{duration(take.durationSeconds)} <span aria-hidden="true">·</span> {dateLabel(take)} <span aria-hidden="true">·</span> {take.format==='daily-challenge'?'Daily challenge':'Practice'}</p></div><span className="recovery-take-status">{take.report?.coaching?'Feedback ready':'Ready to review'}</span></div>
  <div className="recovery-take-actions"><button type="button" className="primary-button" disabled={busy} onClick={()=>onRecover(take)}>Continue review <span aria-hidden="true">→</span></button><button type="button" className="secondary-button" aria-expanded={preview} aria-controls={`take-audio-${take.id}`} onClick={()=>setPreview(value=>!value)}>{preview?'Hide player':'Listen'}</button>{url&&<a className="text-button" href={url} download={`SimplyArticulate-${take.id}.${take.blob.type?.includes('mp4')?'m4a':take.blob.type?.includes('webm')?'webm':take.blob.type?.includes('ogg')?'ogg':'wav'}`}>Download</a>}<button type="button" className="text-button recovery-remove" disabled={busy} onClick={()=>onRemove(take.id)}>Remove</button></div>
  {preview&&<div id={`take-audio-${take.id}`} className="recovery-audio"><audio controls preload="metadata" src={url||undefined} aria-label={`Listen to ${take.topic||'your practice'}`} onError={()=>setPlaybackError('Playback is unavailable. Download this take to keep a copy.')}/>{playbackError&&<p role="alert">{playbackError}</p>}</div>}
 </article>;
}
function RecoveryList({owner,onRecover}){
 const [takes,setTakes]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[expanded,setExpanded]=useState(false),[removing,setRemoving]=useState('');
 useEffect(()=>{let active=true;async function load(){try{const rows=await listDrafts(owner);if(active){setTakes(rows.filter(row=>row.blob&&Number.isFinite(row.durationSeconds)&&row.durationSeconds>0&&!row.progressSaved));setError('');}}catch{if(active)setError('Saved takes could not be loaded. Your recordings have not been removed.');}finally{if(active)setLoading(false);}}void load();const refresh=()=>void load();window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('focus',refresh);};},[owner,revision]);
 async function remove(id){setRemoving(id);setError('');try{await removeDraft(id);setTakes(rows=>rows.filter(row=>row.id!==id));}catch{setError('This take could not be removed. Please try again.');}finally{setRemoving('');}}
 if(loading||(!takes.length&&!error))return null;
 return <section className="recovery-takes" aria-label="Saved takes on this device"><header className="recovery-heading"><div><h2>Pick up where you left off</h2><p>Unfinished takes saved privately on this device.</p></div><span className="recovery-count">{takes.length} {takes.length===1?'take':'takes'}</span></header>{error&&<div role="alert" className="recovery-error"><p>{error}</p><button type="button" className="secondary-button" onClick={()=>setRevision(value=>value+1)}>Try again</button></div>}<div className="recovery-list">{(expanded?takes:takes.slice(0,3)).map(take=><TakeRow key={take.id} take={take} onRecover={onRecover} onRemove={remove} busy={Boolean(removing)}/>)}</div>{takes.length>3&&<button type="button" className="text-button recovery-show-more" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Show fewer takes':`Show all ${takes.length} takes`}</button>}</section>;
}
export default function RecoveryTakes({user,onRecover}){return <RecoveryList key={user?.id||'signed-out'} owner={user?.id} onRecover={onRecover}/>;}

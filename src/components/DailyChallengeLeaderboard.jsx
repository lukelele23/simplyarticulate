import { useEffect, useState } from 'react';
import { analysisRequest } from '../lib/speechAnalysis.js';
export default function DailyChallengeLeaderboard({day=new Date().toISOString().slice(0,10),compact=false}) {
 const [entries,setEntries]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true;let controller;setEntries([]);setLoading(true);setError('');
  async function load(){controller?.abort();const request=new AbortController();controller=request;try{const data=await analysisRequest(`/community?day=${encodeURIComponent(day)}`,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(8000)])});if(active&&!request.signal.aborted){setEntries(data.entries);setError('');}}catch(cause){if(active&&!request.signal.aborted)setError('Community entries are unavailable. Please try again.');}finally{if(active&&!request.signal.aborted)setLoading(false);}}
  load();const timer=setInterval(load,30000);window.addEventListener('community-updated',load);return()=>{active=false;controller?.abort();clearInterval(timer);window.removeEventListener('community-updated',load);};
 },[day,refresh]);
 return <section className="daily-leaderboard" aria-labelledby="daily-leaderboard-title">
 <header className="daily-leaderboard-header" hidden={compact}><h3 id="daily-leaderboard-title">{day===new Date().toISOString().slice(0,10)?'Today’s leaderboard':'Challenge leaderboard'}</h3></header>
 {loading&&<p role="status">Loading community entries…</p>}
 {error&&<div><p role="alert">{error}</p><button className="secondary-button" type="button" onClick={()=>setRefresh(value=>value+1)}>Try again</button></div>}
 {!loading&&!error&&entries.length===0&&<p className="leaderboard-empty">No entries yet today. Your next practice could be the first. Sharing is optional.</p>}
 <ol className="leaderboard-list" aria-label="AI speech rankings">{entries.map(entry=><li key={entry.id}><span className="leaderboard-rank" aria-label={`Rank ${entry.rank}`}>{entry.rank}</span><span className="leaderboard-name">{entry.name}</span><strong className="leaderboard-score">{entry.score}/100</strong>{entry.dimensions?.length>0&&<div className="leaderboard-breakdown" aria-label="AI score breakdown">{entry.dimensions.map(d=><span key={d.name}>{d.name}: {d.score}/25</span>)}</div>}</li>)}</ol>
 <section className="shared-transcripts"><h3>Read other voices</h3><p>Original transcripts shared by their speakers after community review.</p>{entries.filter(e=>e.transcript).map(entry=><details key={entry.id}><summary>{entry.name} · {entry.score}/100</summary><p>{entry.transcript}</p></details>)}{!entries.some(e=>e.transcript)&&<p>No shared transcripts yet. Sharing is always optional.</p>}</section>
 </section>;
}

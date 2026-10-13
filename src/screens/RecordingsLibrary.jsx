import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../utils/supabase.js';
const PAGE_SIZE=12;
function RecordingPlayer({recording}) {
  const [url,setUrl]=useState(''),[error,setError]=useState('');
  const audio=useRef(null),resume=useRef(null),refreshRef=useRef(null),lastRefresh=useRef(0);
  useEffect(()=>{
    let active=true;
    async function refresh(){
      lastRefresh.current=Date.now();
      const {data,error}=await supabase.storage.from('speech-recordings').createSignedUrl(recording.audio_path,3600);
      if(!active)return;
      if(error){setError('Playback could not be refreshed. Retry when connected.');return;}
      if(audio.current)resume.current={time:audio.current.currentTime,playing:!audio.current.paused};
      setUrl(data.signedUrl);setError('');
    }
    refreshRef.current=refresh;void refresh();const timer=setInterval(refresh,50*60*1000);
    const focus=()=>{if(Date.now()-lastRefresh.current>50*60*1000)void refresh();};window.addEventListener('focus',focus);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};
  },[recording.audio_path]);
  return <div>{url&&<audio ref={audio} className="recording-player" controls preload="metadata" src={url} onLoadedMetadata={()=>{if(resume.current&&audio.current){audio.current.currentTime=resume.current.time;if(resume.current.playing)void audio.current.play().catch(()=>{});resume.current=null;}}} onError={()=>{setError('Audio is unavailable. Refresh its private playback link.');if(Date.now()-lastRefresh.current>60000)void refreshRef.current?.();}}/>}{error&&<p role="alert">{error}</p>}{error&&<button className="text-button" onClick={()=>refreshRef.current?.()}>Refresh playback</button>}</div>;
}
export default function RecordingsLibrary({user,onBack}) {
  const [recordings,setRecordings]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0),[total,setTotal]=useState(0),[revision,setRevision]=useState(0),[deleting,setDeleting]=useState(null);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(0);},300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setLoading(true);setError('');
    async function load(){
      let request=supabase.from('speech_recordings').select('id,audio_path,mime_type,duration_seconds,topic,difficulty,created_at',{count:'exact'}).eq('user_id',user.id).order('created_at',{ascending:false}).order('id').range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
      if(query)request=request.ilike('topic',`%${query.replace(/[\\%_]/g,'\\$&')}%`);
      const result=await request.abortSignal(controller.signal);if(!active)return;
      if(result.error)setError('Saved recordings could not be loaded. Check your connection and retry.');else{setRecordings(result.data||[]);setTotal(result.count||0);}setLoading(false);
    }
    void load().catch(()=>{if(active){setLoading(false);setError('Saved recordings could not be loaded.');}});
    return()=>{active=false;controller.abort();};
  },[user.id,page,query,revision]);
  async function remove(recording){
    if(!window.confirm(`Permanently delete the account audio for “${recording.topic}”? Progress and local recovery copies are kept separately.`))return;
    setDeleting(recording.id);setError('');
    try{const storage=await supabase.storage.from('speech-recordings').remove([recording.audio_path]);if(storage.error)throw storage.error;const row=await supabase.from('speech_recordings').delete().eq('user_id',user.id).eq('id',recording.id);if(row.error)throw row.error;if(recordings.length===1&&page>0)setPage(page-1);else setRevision(n=>n+1);}
    catch{setError('Deletion did not finish. Audio may already be removed; retry to remove its saved entry.');}finally{setDeleting(null);}
  }
  return <main tabIndex={-1} id="main-content" className="screen"><section className="timer-card recordings-library"><header><h1>Saved recordings</h1><p>Private account audio. Progress and local recovery copies are managed separately.</p><button className="secondary-button" onClick={onBack}>{backLabel}</button></header><label>Search by topic<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a saved speech"/></label>{loading&&<p role="status">Loading recordings…</p>}{error&&<div role="alert"><p>{error}</p><button className="secondary-button" onClick={()=>setRevision(n=>n+1)}>Retry</button></div>}{!loading&&!error&&!recordings.length&&<p>{query?'No recordings match this topic.':'No saved recordings yet. After speaking, choose “Save audio to my account.”'}</p>}{!loading&&!error&&recordings.map(recording=><article key={recording.id}><h2>{recording.topic}</h2><p>{recording.difficulty} · {recording.duration_seconds}s · {new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(recording.created_at))}</p><RecordingPlayer recording={recording}/><button className="text-button" disabled={Boolean(deleting)} onClick={()=>remove(recording)}>{deleting===recording.id?'Deleting…':'Delete account audio'}</button></article>)}<nav className="analysis-actions" aria-label="Recordings pages"><button className="secondary-button" disabled={loading||page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} · {total} recordings</span><button className="secondary-button" disabled={loading||(page+1)*PAGE_SIZE>=total} onClick={()=>setPage(n=>n+1)}>Next</button></nav><p>Private playback links refresh automatically while this page is open.</p></section></main>;
}

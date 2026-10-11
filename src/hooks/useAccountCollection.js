import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../utils/supabase.js';

const idOf = (kind,item) => kind === 'favorite' ? item : item.id;
function cloudPayload(kind,item) {
  if(kind==='favorite')return {topic:item};
  // Older feedback was consented to for this device only. Migrate its progress,
  // retaining the private report locally until the user saves with sync consent.
  if(item.syncFeedback)return item;
  const {analysis,...progress}=item;return progress;
}
function read(kind,owner) {
  try {
    const cached = localStorage.getItem(`sa-sync:${kind}:${owner}`);
    if (cached) {const value=JSON.parse(cached);if(Array.isArray(value?.items)&&value.pending&&typeof value.pending==='object')return value;}
    const legacy = JSON.parse(localStorage.getItem(`simply-articulate-${kind === 'session' ? 'sessions' : 'favorites'}:${owner}`) || '[]');
    return { items: Array.isArray(legacy) ? legacy : [], pending: {}, imported: false };
  } catch { return {items:[],pending:{},imported:false}; }
}
export default function useAccountCollection(kind,userId) {
  const owner=userId || 'signed-out', key=`sa-sync:${kind}:${owner}`;
  const [state,setState]=useState(()=>({key,...read(kind,owner)}));
  const [status,setStatus]=useState('local'), [error,setError]=useState(''), [revision,setRevision]=useState(0);
  const active=useRef({key,...read(kind,owner)}), mounted=useRef(true);
  if(active.current.key!==key) active.current={key,...read(kind,owner)};
  const persist=useCallback(next=>{
    active.current=next;
    try { localStorage.setItem(key,JSON.stringify(next)); }
    catch { setError('This browser could not save your progress. Keep this page open and retry syncing or free local storage.'); }
    setState(next);
  },[key]);
  const setItems=useCallback(update=>{
    const current=active.current, items=typeof update==='function'?update(current.items):update;
    const before=new Map(current.items.map(item=>[idOf(kind,item),item])), after=new Map(items.map(item=>[idOf(kind,item),item]));
    const pending={...current.pending};
    for(const [id,item] of after) if(JSON.stringify(before.get(id))!==JSON.stringify(item)) pending[id]={user_id:owner,kind,item_id:id,payload:cloudPayload(kind,item),deleted:false,operation:crypto.randomUUID()};
    for(const [id,item] of before) if(!after.has(id)) pending[id]={user_id:owner,kind,item_id:id,payload:cloudPayload(kind,item),deleted:true,operation:crypto.randomUUID()};
    persist({...current,items,pending}); setRevision(n=>n+1);
  },[kind,owner,persist]);
  useEffect(()=>{mounted.current=true; return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    let cancelled=false, running=false;
    const controller=new AbortController();
    const valid=()=>!cancelled && mounted.current && active.current.key===key;
    async function sync() {
      if(running || !userId || !valid())return;
      running=true; setStatus('syncing');
      try {
        // Page through account records; Supabase otherwise truncates large histories.
        let rows=[], offset=0;
        while(true) {
          const result=await supabase.from('practice_items').select('item_id,payload,deleted').eq('user_id',owner).eq('kind',kind).order('item_id').range(offset,offset+499).abortSignal(controller.signal);
          if(result.error)throw result.error;
          rows.push(...result.data); if(result.data.length<500)break; offset+=500;
        }
        if(!valid())return;
        let current=active.current, pending={...current.pending};
        if(!current.imported) {
          const remoteIds=new Set(rows.map(row=>row.item_id));
          for(const item of current.items) { const id=idOf(kind,item); if(!remoteIds.has(id) && !pending[id])pending[id]={user_id:owner,kind,item_id:id,payload:cloudPayload(kind,item),deleted:false,operation:crypto.randomUUID()}; }
        }
        const merged=new Map(rows.filter(r=>!r.deleted).map(r=>[r.item_id,kind==='favorite'?r.payload.topic:r.payload]));
        for(const [id,row] of Object.entries(pending)) { if(row.deleted)merged.delete(id); else merged.set(id,kind==='favorite'?row.payload.topic:row.payload); }
        if(kind==='session')for(const local of current.items){if(local.analysis&&!local.syncFeedback&&merged.has(local.id)&&!merged.get(local.id).analysis)merged.set(local.id,{...merged.get(local.id),analysis:local.analysis});}
        const items=[...merged.values()].filter(item=>kind==='favorite'?typeof item==='string':item&&typeof item.topic==='string'&&typeof item.date==='string');
        if(kind==='session')items.sort((a,b)=>(b.createdAt || b.date).localeCompare(a.createdAt || a.date));
        persist({...current,items,pending,imported:true});
        for(const [id,row] of Object.entries(pending)) {
          const {operation,...record}=row;
          const result=await supabase.from('practice_items').upsert(record,{onConflict:'user_id,kind,item_id'}).abortSignal(controller.signal);
          if(result.error)throw result.error;
          if(!valid())return;
          current=active.current;
          if(current.pending[id]?.operation===operation) { const next={...current.pending}; delete next[id]; persist({...current,pending:next}); }
        }
        if(valid()){setStatus(Object.keys(active.current.pending).length?'pending':'synced');setError('');}
      } catch(cause) { if(valid()){setStatus('pending');setError(cause.code==='PGRST205'||cause.code==='42P01'?'Account sync is awaiting database setup. Progress stays on this device.':'Account sync is unavailable. Progress stays on this device and will retry automatically.');} }
      finally{running=false;}
    }
    void sync(); const timer=setInterval(sync,30000);
    window.addEventListener('online',sync); window.addEventListener('focus',sync);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);window.removeEventListener('online',sync);window.removeEventListener('focus',sync);};
  },[key,userId,kind,owner,persist,revision]);
  return [state.key===key?state.items:active.current.items,setItems,{status,error,retry:()=>setRevision(n=>n+1)}];
}

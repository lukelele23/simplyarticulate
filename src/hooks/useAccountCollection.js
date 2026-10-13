import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../utils/supabase.js';
import {cloudPayload,mergeAccountRows,settleAccountWrite} from '../lib/accountSync.js';
function read(owner){try{const cached=JSON.parse(localStorage.getItem('sa-sync:session:'+owner)||'null');if(cached&&Array.isArray(cached.items))return {...cached,versions:cached.versions||{},cursor:0,pending:cached.pending||{}};const items=JSON.parse(localStorage.getItem('simply-articulate-sessions:'+owner)||'[]');return {items:Array.isArray(items)?items:[],pending:{},versions:{},cursor:0,imported:false};}catch{return {items:[],pending:{},versions:{},cursor:0,imported:false};}}
export default function useAccountCollection(kind,userId){
 const owner=userId||'signed-out',key='sa-sync:session:'+owner;
 const [state,setState]=useState(()=>({key,...read(owner)}));
 const active=useRef(state),mounted=useRef(true),syncRef=useRef(()=>{});
 const [status,setStatus]=useState('local'),[error,setError]=useState('');
 if(active.current.key!==key)active.current={key,...read(owner)};
 const persist=useCallback(next=>{active.current=next;try{localStorage.setItem(key,JSON.stringify(next));}catch{setError('Progress could not be saved on this device. Keep this page open and retry.');}setState(next);},[key]);
 const setItems=useCallback(update=>{
  const current=active.current,items=typeof update==='function'?update(current.items):update;
  if(items===current.items)return;
  const before=new Map(current.items.map(item=>[item.id,item])),after=new Map(items.map(item=>[item.id,item])),pending={...current.pending};
  for(const [id,item] of after)if(JSON.stringify(before.get(id))!==JSON.stringify(item))pending[id]={payload:cloudPayload(item),deleted:false,baseVersion:current.pending[id]?.baseVersion??current.versions[id]??0,operation:crypto.randomUUID()};
  for(const [id,item] of before)if(!after.has(id))pending[id]={payload:cloudPayload(item),deleted:true,baseVersion:current.pending[id]?.baseVersion??current.versions[id]??0,operation:crypto.randomUUID()};
  persist({...current,items,pending});void syncRef.current();
 },[persist]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  let cancelled=false,running=false,rerun=false;
  const controller=new AbortController();
  const valid=()=>!cancelled&&mounted.current&&active.current.key===key;
  async function sync(force=false){
   if(!userId||!valid()||(!force&&document.hidden))return;
   if(running){rerun=true;return;}running=true;setStatus('syncing');
   try{
    let cursor=active.current.cursor||0,rows=[];
    while(true){const result=await supabase.from('practice_items').select('item_id,payload,deleted,version,change_seq').eq('user_id',owner).eq('kind','session').gt('change_seq',cursor).order('change_seq').limit(500).abortSignal(controller.signal);if(result.error)throw result.error;if(!valid())return;rows.push(...result.data);if(result.data.length)cursor=Math.max(cursor,...result.data.map(row=>Number(row.change_seq)));if(result.data.length<500)break;}
    let current=active.current,versions={...current.versions},pending={...current.pending};
    rows.forEach(row=>{versions[row.item_id]=row.version;});
    if(!current.imported){const ids=new Set(rows.map(row=>row.item_id));for(const item of current.items)if(!ids.has(item.id)&&!pending[item.id])pending[item.id]={payload:cloudPayload(item),deleted:false,baseVersion:0,operation:crypto.randomUUID()};}
    // Pending base versions intentionally stay unchanged: stale edits cannot overwrite newer server data.
    persist({...current,versions,pending,cursor,imported:true,items:mergeAccountRows(current.items,rows,pending)});
    let conflicts=0;
    for(const [id,change] of Object.entries(pending)){
     const result=await supabase.rpc('practice_apply',{p_id:id,p_version:change.baseVersion??0,p_payload:change.payload,p_deleted:change.deleted,p_operation:change.operation}).abortSignal(controller.signal);if(result.error)throw result.error;if(!valid())return;
     if(!result.data.applied)conflicts++;
     persist(settleAccountWrite(active.current,id,change.operation,result.data));
    }
    if(valid()){setStatus(Object.keys(active.current.pending).length?'pending':'synced');setError(conflicts?'A newer account version was kept instead of an older offline edit. Review your progress before changing it again.':'');}
   }catch(cause){if(valid()){setStatus('pending');setError(['PGRST202','PGRST205','42P01','42703'].includes(cause.code)?'Account sync needs the latest database migration. Your progress stays on this device.':'Account sync is unavailable. Your progress stays on this device and will retry.');}}
   finally{running=false;if(rerun&&valid()){rerun=false;void sync();}}
  }
  syncRef.current=()=>sync(true);void sync(true);
  const timer=setInterval(()=>sync(),60000),reconcile=setInterval(()=>{if(!document.hidden){active.current={...active.current,cursor:0};void sync();}},3600000);
  const focus=()=>sync(),online=()=>sync(true),visibility=()=>{if(!document.hidden)void sync();};
  addEventListener('focus',focus);addEventListener('online',online);document.addEventListener('visibilitychange',visibility);
  return()=>{cancelled=true;controller.abort();clearInterval(timer);clearInterval(reconcile);removeEventListener('focus',focus);removeEventListener('online',online);document.removeEventListener('visibilitychange',visibility);syncRef.current=()=>{};};
 },[key,userId,owner,persist]);
 return [state.key===key?state.items:active.current.items,setItems,{status,error,retry:()=>syncRef.current()}];
}

import {useEffect,useState} from 'react';import {listDrafts} from '../lib/drafts.js';
export default function RecoveryTakes({user,onRecover}){
 const [takes,setTakes]=useState([]);
 useEffect(()=>{let active=true;listDrafts(user?.id).then(rows=>{if(active)setTakes(rows.filter(row=>row.blob&&row.durationSeconds>0&&!row.progressSaved).slice(0,3));}).catch(()=>{});return()=>{active=false;};},[user?.id]);
 if(!takes.length)return null;
 return <section className="learning-progress"><h2>Resume a recorded take</h2><p>These private recovery copies are on this device.</p>{takes.map(take=><article key={take.id}><p>{take.topic} · {Math.round(take.durationSeconds)} seconds</p><button className="secondary-button" onClick={()=>onRecover(take)}>Review this take</button></article>)}</section>;
}

import {useEffect,useState} from 'react';
// Notes remain in this tab and account scope; they are never sent for analysis.
export default function useResearchNotes(topic,owner){
 const key='sa-research-notes:'+String(owner||'signed-out')+':'+String(topic||'');
 function read(){try{return {key,value:sessionStorage.getItem(key)||'',error:''};}catch{return {key,value:'',error:'Notes cannot be saved in this browser tab.'};}}
 const [state,setState]=useState(read);
 useEffect(()=>{setState(read());},[key]);
 function save(value){const note=value.slice(0,2000);let error='';try{if(note)sessionStorage.setItem(key,note);else sessionStorage.removeItem(key);}catch{error='Notes could not be saved. Copy them before leaving this page.';}setState({key,value:note,error});}
 return [state.key===key?state.value:'',save,state.key===key?state.error:''];
}

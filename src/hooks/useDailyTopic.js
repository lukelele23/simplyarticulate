import {useEffect,useState} from 'react';

// Use the same official topic as the analysis service, including subscriber votes.
export default function useDailyTopic(day=new Date().toISOString().slice(0,10)) {
 const [state,setState]=useState({day,topic:'',isLoading:true,error:''});
 useEffect(()=>{
  const controller=new AbortController();
  setState({day,topic:'',isLoading:true,error:''});
  async function load(){
   try{
    const response=await fetch('/api/analysis/challenge',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
    if(!response.ok)throw Error('Today’s challenge topic could not be loaded. Please try again later.');
    const result=await response.json();
    if(result.id!==day||typeof result.topic!=='string'||!result.topic.trim())throw Error('The daily challenge is changing. Please refresh.');
    if(!controller.signal.aborted)setState({day,topic:result.topic,isLoading:false,error:''});
   }catch(error){if(!controller.signal.aborted)setState({day,topic:'',isLoading:false,error:error.message||'Today’s topic is temporarily unavailable.'});}
  }
  void load();return()=>controller.abort();
 },[day]);
 return state.day===day?state:{day,topic:'',isLoading:true,error:''};
}

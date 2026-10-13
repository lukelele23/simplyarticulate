import {readSurveyCompletion, rememberSurveyCompletion, shouldShowSurvey} from '../lib/surveyCompletion.js';
import {useEffect,useRef,useState} from 'react';
import {analysisRequest} from '../lib/speechAnalysis.js';
import './subscriptionSurvey.css';

export default function SubscriptionSurvey({user,onSignUp}){
 const dialog=useRef(null),[open,setOpen]=useState(false),[status,setStatus]=useState(null),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const controller=useRef(null);
 const owner=user?.id;
 const visibleStatus=status?.owner===owner?status:readSurveyCompletion(owner)?{owner,completed:true,bonusRemaining:0}:null;
 useEffect(()=>{
  const request=new AbortController();controller.current=request;
  setStatus(readSurveyCompletion(owner)?{owner,completed:true,bonusRemaining:0}:null);setError('');setAnswer('');setBusy(false);
  dialog.current?.close();setOpen(false);
  if(!owner)return()=>request.abort();
  let checking=false;
  async function refresh(){
   if(checking||request.signal.aborted||request.completed)return;
   checking=true;
   try{
    const value=await analysisRequest('/subscription-survey',{signal:request.signal});
    if(!request.signal.aborted){
     rememberSurveyCompletion(owner,value);request.completed=value.completed===true;
     setStatus(previous=>previous?.owner===owner&&previous.completed?previous:{...value,owner});
     setError('');
    }
   }catch(cause){if(!request.signal.aborted)setError(cause.message);}
   finally{checking=false;}
  }
  void refresh();
  const timer=setInterval(refresh,30000);
  window.addEventListener('focus',refresh);
  window.addEventListener('online',refresh);
  return()=>{request.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};
 },[owner]); async function submit(event){
  event.preventDefault();if(!answer||busy||!visibleStatus||visibleStatus.completed)return;
  const request=controller.current;
  setBusy(true);setError('');
  try{
   const result=await analysisRequest('/subscription-survey',{method:'POST',body:{goal:answer},signal:request?.signal});
   if(request?.signal.aborted)return;
   rememberSurveyCompletion(owner,result);request.completed=result.completed===true;
   setStatus({...result,owner});window.dispatchEvent(new Event('analysis-allowance-changed'));
  }catch(cause){if(!request?.signal.aborted)setError(cause.message);}
  finally{if(!request?.signal.aborted)setBusy(false);}
 }
 function launch(){if(!user?.id){onSignUp?.();return;}if(!shouldShowSurvey(owner,visibleStatus))return;setOpen(true);dialog.current.showModal();}
 return <>
  {shouldShowSurvey(owner,visibleStatus) && <button className="secondary-button nav-survey" type="button" aria-label="Complete a quick survey" onClick={launch}><span className="survey-full-label">Complete a quick survey</span><span className="survey-short-label" aria-hidden="true">Quick survey</span></button>}
  <dialog ref={dialog} className="subscription-survey" aria-labelledby="subscription-survey-title" onClose={()=>setOpen(false)}>
   <div className="survey-heading"><h2 id="subscription-survey-title">Your speaking goal</h2><button type="button" className="survey-close" aria-label="Close survey" onClick={()=>dialog.current.close()}>×</button></div>
   {visibleStatus?.completed?<div role="status"><p>Thank you for sharing your feedback.</p><p>{visibleStatus.bonusRemaining?'You have one extra practice speech analysis ready to use.':'Your survey reward has already been used.'}</p><button className="primary-button" type="button" onClick={()=>dialog.current.close()}>Done</button></div>:<>
    <p>Answer one question to receive an extra practice speech analysis. Any answer earns the reward, once per account. Your answer is saved with your account.</p>
    {visibleStatus?<form onSubmit={submit}><fieldset disabled={busy}><legend>What would you most like speaking practice to help you achieve?</legend>{[['clarity','Explain ideas clearly'],['presentations','Prepare presentations'],['confidence','Build a speaking habit'],['interviews','Answer interview questions'],['debate','Develop debate arguments']].map(([value,label])=><label className="survey-answer" key={value}><input type="radio" name="speaking-goal" value={value} checked={answer===value} onChange={()=>setAnswer(value)}/>{label}</label>)}</fieldset><button className="primary-button" type="submit" disabled={!answer||busy}>{busy?'Saving…':'Submit and receive an extra analysis'}</button></form>:!error&&<p role="status">Loading survey…</p>}
   </>}
   {error && !visibleStatus?.completed && <p className="analysis-error" role="alert">We couldn’t sync the survey. Please try again shortly.</p>}
  </dialog>
 </>;
}

import {useEffect,useRef,useState} from 'react';
import {analysisRequest} from '../lib/speechAnalysis.js';
import './subscriptionSurvey.css';

export default function SubscriptionSurvey({user,onSignUp}){
 const dialog=useRef(null),[open,setOpen]=useState(false),[status,setStatus]=useState(null),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const controller=useRef(null);
 useEffect(()=>{
  if(!open||!user?.id)return;
  const request=new AbortController();controller.current=request;setStatus(null);setError('');setAnswer('');
  analysisRequest('/subscription-survey',{signal:request.signal}).then(value=>{if(!request.signal.aborted)setStatus(value);}).catch(cause=>{if(!request.signal.aborted)setError(cause.message);});
  return()=>request.abort();
 },[open,user?.id]);
 async function submit(event){
  event.preventDefault();if(!answer||busy||!status||status.completed)return;
  setBusy(true);setError('');
  try{
   const result=await analysisRequest('/subscription-survey',{method:'POST',body:{answer},signal:controller.current?.signal});
   if(controller.current?.signal.aborted)return;
   setStatus(result);window.dispatchEvent(new Event('analysis-allowance-changed'));
  }catch(cause){if(!controller.current?.signal.aborted)setError(cause.message);}
  finally{setBusy(false);}
 }
 function launch(){if(!user?.id){onSignUp?.();return;}setOpen(true);dialog.current.showModal();}
 return <>
  <button className="secondary-button nav-survey" type="button" onClick={launch}>Complete a quick survey</button>
  <dialog ref={dialog} className="subscription-survey" aria-labelledby="subscription-survey-title" onClose={()=>setOpen(false)}>
   <div className="survey-heading"><h2 id="subscription-survey-title">Help shape SimplyArticulate</h2><button type="button" className="survey-close" aria-label="Close survey" onClick={()=>dialog.current.close()}>×</button></div>
   {status?.completed?<div role="status"><p>Thank you for sharing your feedback.</p><p>{status.bonusRemaining?'You have one extra practice speech analysis ready to use.':'Your survey reward has already been used.'}</p><button className="primary-button" type="button" onClick={()=>dialog.current.close()}>Done</button></div>:<>
    <p>Answer one question to receive an extra practice speech analysis. Any answer earns the reward, once per account. Your answer is saved with your account.</p>
    {status?<form onSubmit={submit}><fieldset disabled={busy}><legend>Would you buy a subscription to SimplyArticulate for more AI speech analysis?</legend>{[['yes','Yes'],['maybe','Maybe'],['no','No']].map(([value,label])=><label className="survey-answer" key={value}><input type="radio" name="subscription-interest" value={value} checked={answer===value} onChange={()=>setAnswer(value)}/>{label}</label>)}</fieldset><button className="primary-button" type="submit" disabled={!answer||busy}>{busy?'Saving…':'Submit and receive an extra analysis'}</button></form>:!error&&<p role="status">Loading survey…</p>}
   </>}
   {error&&<p className="analysis-error" role="alert">{error}</p>}
  </dialog>
 </>;
}

import {useEffect,useRef,useState} from 'react';
import {analysisRequest} from '../lib/speechAnalysis.js';
import './dailyTopicVote.css';

function ChoiceResult({choice,total}) {
 const percentage=total?Math.round(choice.votes/total*1000)/10:0;
 return <div className="topic-vote-info">
  <div className="topic-vote-result-line"><span>{choice.topic}</span><strong>{percentage}%</strong></div>
  <div className="topic-vote-bar" role="meter" aria-label={`Vote share for ${choice.topic}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{width:`${percentage}%`}}/></div>
  <span className="topic-vote-count">{choice.votes} {choice.votes===1?'vote':'votes'}</span>
 </div>;
}

export default function DailyTopicVote({user,day,request=analysisRequest,publicView=false,onSignUp}) {
 const eligible=Boolean(user?.id);
 const [poll,setPoll]=useState(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[notice,setNotice]=useState('');
 const pollRef=useRef(null),revision=useRef(0),busyRef=useRef(false),controllerRef=useRef(null);
 useEffect(()=>{
  if(!eligible&&!publicView){setPoll(null);return;}
  const controller=new AbortController();controllerRef.current=controller;setError('');
  async function load(){
   if(busyRef.current)return;
   const requestVersion=++revision.current;
   try{
    let result;
    if(eligible){
     try{result=await request('/topic-vote',{signal:controller.signal});}
     catch(cause){
      if(!publicView||controller.signal.aborted)throw cause;
      result={...await request('/topic-vote/results',{signal:controller.signal}),eligible:false};
     }
     if(result.eligible===false&&publicView&&!result.choices)result={...await request('/topic-vote/results',{signal:controller.signal}),eligible:false};
    }else result={...await request('/topic-vote/results',{signal:controller.signal}),eligible:false};
    if(controller.signal.aborted||requestVersion!==revision.current)return;
    const previous=pollRef.current;
    setSelected(current=>!previous||previous.targetDay!==result.targetDay||current===(previous.myVote||'')?result.myVote||'':current);
    pollRef.current=result;setPoll(result);setError('');
   }catch(cause){if(!controller.signal.aborted&&requestVersion===revision.current)setError('Topic voting is temporarily unavailable. Please refresh to try again.');}
  }
  void load();
  const timer=setInterval(load,30000);
  return()=>{clearInterval(timer);controller.abort();revision.current++;};
 },[eligible,user?.id,day,retry,request,publicView]);
 if(!publicView&&(!eligible||poll?.eligible===false))return null;
 const canVote=eligible&&poll?.eligible===true;
 const closed=poll&&Date.now()>=Date.parse(poll.closesAt);
 async function saveVote(event){
  event.preventDefault();if(!canVote||closed||!selected||busyRef.current)return;
  const requestVersion=++revision.current;busyRef.current=true;setBusy(true);setError('');setNotice('');
  try{
   const result=await request('/topic-vote',{method:'POST',body:{targetDay:poll.targetDay,choiceId:selected},signal:controllerRef.current?.signal});
   if(requestVersion!==revision.current)return;
   pollRef.current=result;setPoll(result);setSelected(result.myVote||'');setNotice('Your vote is saved. You can change it until voting closes.');
  }catch(cause){if(requestVersion===revision.current)setError(cause.message||'Your vote could not be saved. Please try again.');}
  finally{busyRef.current=false;setBusy(false);}
 }
 const date=poll?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${poll.targetDay}T12:00:00Z`)):'';
 return <section className="daily-topic-vote" aria-label="Vote on tomorrow’s topic">
  <div className="topic-vote-topline"><strong>{publicView?'Tomorrow’s topic vote':'Choose tomorrow’s topic'}</strong><span>{canVote?'Community voting':'Results for everyone'}</span></div>
  <p>Follow the vote for the next Daily Challenge. The topic with the most votes wins.</p>
  {!poll&&!error&&<p role="status">Loading tomorrow’s choices…</p>}
  {poll&&<>
   {canVote?<form onSubmit={saveVote}>
    <fieldset disabled={busy||closed}><legend>Daily Challenge for {date}</legend>
     {poll.choices.map(choice=><label className={`topic-vote-choice${selected===choice.id?' is-selected':''}`} key={choice.id}>
      <input type="radio" name="tomorrows-topic" value={choice.id} checked={selected===choice.id} onChange={()=>{setSelected(choice.id);setNotice('');}}/>
      <ChoiceResult choice={choice} total={poll.totalVotes}/>
     </label>)}
    </fieldset>
    <div className="topic-vote-actions"><button className="primary-button" type="submit" disabled={busy||closed||!selected||selected===poll.myVote}>{busy?'Saving…':poll.myVote?'Update my vote':'Save my vote'}</button><span>{poll.totalVotes} {poll.totalVotes===1?'vote':'votes'} cast</span></div>
    {poll.myVote&&!notice&&<p role="status">Your vote is saved.</p>}
   </form>:<>
    <p className="topic-vote-date">Daily Challenge for {date}</p>
    <div className="topic-vote-results" aria-label="Current vote percentages">
     {poll.choices.map(choice=><div className="topic-vote-choice topic-vote-readonly" key={choice.id}><ChoiceResult choice={choice} total={poll.totalVotes}/></div>)}
    </div>
    <p>{poll.totalVotes?`${poll.totalVotes} ${poll.totalVotes===1?'vote':'votes'} cast`:'No votes yet.'}</p>
    <div className="topic-vote-access"><p>Everyone can view the results. All signed-in users can vote.</p>{!user&&onSignUp&&<button className="secondary-button" type="button" onClick={onSignUp}>Sign in</button>}</div>
   </>}
   <p className="topic-vote-small">One vote per account. Ties use the order shown above. With no votes, the usual topic rotation applies.</p>
   <p className="topic-vote-small">Percentages are rounded to one decimal place.</p>
   {closed&&<p role="status">This vote has closed. Refresh the choices to see the next challenge.</p>}
  </>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p className="analysis-error" role="alert">{error}</p>}
  <button className="text-button" type="button" disabled={busy} onClick={()=>setRetry(value=>value+1)}>Refresh results</button>
 </section>;
}

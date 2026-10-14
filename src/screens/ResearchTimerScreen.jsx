import PracticeStages from '../components/PracticeStages.jsx';
import {useEffect,useRef,useState} from 'react';
import '../components/preparationTimer.css';

export default function ResearchTimerScreen({embedded=false,difficulty,topic,debateSide,secondsLeft,onSecondsLeftChange,onBack,onStartSpeaking}) {
 const [running,setRunning]=useState(false);
 const deadline=useRef(0);
 const initialDuration=useRef(Math.max(1,secondsLeft));
 useEffect(()=>{
  if(!running)return;
  const update=()=>{const remaining=Math.max(0,Math.ceil((deadline.current-Date.now())/1000));onSecondsLeftChange(remaining);if(!remaining)setRunning(false);};
  const timer=setInterval(update,250);
  update();
  return()=>clearInterval(timer);
 },[running,onSecondsLeftChange]);
 function toggleTimer(){if(running){onSecondsLeftChange(Math.max(0,Math.ceil((deadline.current-Date.now())/1000)));setRunning(false);}else{deadline.current=Date.now()+secondsLeft*1000;setRunning(true);}}
 const minutes=String(Math.floor(secondsLeft/60)).padStart(2,'0');
 const seconds=String(secondsLeft%60).padStart(2,'0');
 const Container=embedded?'div':'main';
 return <Container tabIndex={embedded?undefined:-1} id={embedded?undefined:'main-content'} className={embedded?'practice-session-screen':'screen timer-screen'}>
  <section className="timer-card speech-layout preparation-timer-page">
   {!embedded&&<PracticeStages current="prepare" includePreparation/>}
   <header className="speech-heading"><p className="eyebrow">PREPARATION · {difficulty}{debateSide?` · ${debateSide} side`:''}</p><p className="timer-topic">{topic}</p></header>
   <div className="speech-controls speaking-timer-hero">
    <div className={`countdown speech-ring preparation-ring${secondsLeft===0?' complete':''}`} style={{'--progress':`${Math.min(100,secondsLeft/initialDuration.current*100)}%`}} role="timer" aria-label={`${secondsLeft} seconds of preparation remaining`}><span>{minutes}:{seconds}</span><small>{secondsLeft===0?'READY TO SPEAK':running?'GATHER YOUR THOUGHTS':'TAKE A MOMENT'}</small></div>
    <p className="preparation-mic-note">Microphone off · preparation is optional</p>
    <ol className="preparation-cues" aria-label="Plan your answer"><li>Main point</li><li>One example</li><li>Takeaway</li></ol>
    {secondsLeft>0&&<button type="button" className="secondary-button" onClick={toggleTimer}>{running?'Pause preparation':'Start preparation'}</button>}
    <button type="button" className="primary-button" onClick={onStartSpeaking}>Continue to microphone</button>
    <button type="button" className="text-button" onClick={onBack}>Back to topic</button>
   </div>
  </section>
 </Container>;
}


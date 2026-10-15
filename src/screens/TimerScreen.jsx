import {recordingShortcut} from '../lib/recordingShortcut.js';
import './recordingScreen.css';
import PracticeStages from '../components/PracticeStages.jsx';
import {analysisRequest} from '../lib/speechAnalysis.js';
import { useEffect, useRef, useState } from "react";
import SpeechRecorder from "../components/SpeechRecorder.jsx";

export default function TimerScreen({
  embedded = false,
  includePreparation = false,
  fixedDuration = false,
  format = 'speech',
  focus = "",
  parentJobId,
  difficulty,
  user,
  topic,
  debateSide,
  durationSeconds = 60,
  onBack,
  onFinish,
  onClipChange,
  backLabel = "Back to research",
}) {
  const [retryEligibility,setRetryEligibility]=useState(null);
  useEffect(()=>{if(!parentJobId)return;const request=new AbortController();analysisRequest('/focused-retry?parent='+encodeURIComponent(parentJobId),{signal:request.signal}).then(setRetryEligibility).catch(()=>setRetryEligibility({eligible:false}));return()=>request.abort();},[parentJobId]);
  const [showCountdown, setShowCountdown] = useState(true);
  const finishRef = useRef(false);
  const recorderRef = useRef(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.min(durationSeconds, 300));
  const [hasStarted, setHasStarted] = useState(false);
  const [hasEverStarted, setHasEverStarted] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const clearRef = useRef(false);
  const [clearMessage, setClearMessage] = useState('');
  const deadlineRef = useRef(0);

  useEffect(() => {
    if (!hasStarted) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (!remaining) setHasStarted(false);
    };
    const timer = window.setInterval(update, 250);
    update();
    const Container = embedded ? 'div' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  return () => window.clearInterval(timer);
  }, [hasStarted]);

  useEffect(() => {
    if (secondsLeft === 0) recorderRef.current?.stop();
  }, [secondsLeft]);

  async function startSpeaking() {
    if (isStarting || recordingBusy || clearRef.current) return;
    setIsStarting(true);
    try {
      const recordingStarted = await recorderRef.current?.start();
      if (!recordingStarted) return;
      deadlineRef.current = Date.now() + secondsLeft * 1000;
      setHasStarted(true);
      setHasEverStarted(true);
    } finally {
      setIsStarting(false);
    }
  }

  function pauseSpeaking() {
    setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    recorderRef.current?.pause();
    setHasStarted(false);
  }

  function resumeSpeaking() {
    recorderRef.current?.resume();
    deadlineRef.current = Date.now() + secondsLeft * 1000;
    setHasStarted(true);
  }

  async function finishSpeaking() {
    if (finishRef.current || clearRef.current) return;
    finishRef.current = true;
    setHasStarted(false);
    setRecordingBusy(true);
    const recording = await recorderRef.current?.stop();
    onFinish(recording || null);
  }

  async function clearAttempt() {
    if (isStarting || clearRef.current || finishRef.current) return;
    clearRef.current = true;
    setIsClearing(true);
    setHasStarted(false);
    setClearMessage('');
    try {
      const cleared = await recorderRef.current?.clear();
      if (!cleared) return;
      deadlineRef.current = 0;
      finishRef.current = false;
      setSecondsLeft(Math.min(durationSeconds, 300));
      setHasEverStarted(false);
      setRecordingBusy(false);
      onClipChange?.(null);
      setClearMessage('Attempt cleared. Ready for a fresh take.');
    } finally {
      clearRef.current = false;
      setIsClearing(false);
    }
  }
  useEffect(() => {
    function onKeyDown(event) {
      const action=recordingShortcut(event,{secondsLeft,running:hasStarted,started:hasEverStarted,fixedDuration,blocked:isStarting||isClearing||finishRef.current||(!hasEverStarted&&recordingBusy)});
      if(!action)return;
      event.preventDefault();
      if(action==='start')void startSpeaking();
      else if(action==='pause')pauseSpeaking();
      else resumeSpeaking();
    }
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  });
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  const Container = embedded ? 'div' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  return (
    <Container tabIndex={embedded ? undefined : -1} id={embedded ? undefined : "main-content"} className={embedded ? "practice-session-screen" : "screen timer-screen"}>
      {parentJobId && <p className="analysis-notice" role="status">{retryEligibility===null?'Checking focused retry eligibility…':retryEligibility.eligible?'One focused coach assessment is available for this 60-second retry.':'Focused assessment is unavailable. Record and compare by listening, or use an available daily analysis.'}</p>}
      <section className="timer-card speech-layout speaking-timer-page">{!embedded && <PracticeStages current="speak" includePreparation={includePreparation}/>}
        <header className="speech-heading"><Heading tabIndex={-1} className="destination-heading">{parentJobId?'Focused retry':'Your recording'}</Heading>
          <p className="eyebrow">{parentJobId ? "FOCUSED RETRY" : fixedDuration && format==='daily-challenge' ? "DAILY CHALLENGE" : "YOUR SPEAKING PRACTICE"}</p>
          {debateSide && (
            <p className="m-0 text-sm font-semibold uppercase tracking-wider text-[#d0d2d4]">
              {debateSide} side
            </p>
          )}
          <p className="timer-topic">{topic}</p>
          {focus && <p className="retry-focus">This take: {focus}</p>}
          {durationSeconds > 300 && <p className="screen-message">Recording supports up to five minutes. This speaking timer is capped at five minutes.</p>}
        </header>

        <div className="speech-controls speaking-timer-hero">
          <div className={`countdown speech-ring ${secondsLeft === 0 ? "complete" : ""}`} style={{"--progress": `${(secondsLeft / Math.min(durationSeconds,300))*100}%`}} role="timer" aria-label={`${secondsLeft} seconds remaining`}>
            <span>{showCountdown ? `${minutes}:${seconds}` : secondsLeft === 0 ? "Done" : "Speak"}</span>
            <small>{secondsLeft === 0 ? "TIME IS UP" : hasStarted ? secondsLeft <= 10 ? "WRAP UP YOUR POINT" : "SPEAK AT YOUR OWN PACE" : "READY"}</small>
          </div>
          <label className="countdown-choice"><input type="checkbox" checked={showCountdown} onChange={e=>setShowCountdown(e.target.checked)} /> Show countdown</label>
          {secondsLeft === 0 ? (
            <button className="primary-button" onClick={finishSpeaking} disabled={recordingBusy || isClearing}>Review speech and feedback</button>
          ) : (
            <>
              {!hasStarted && <button className="start-button" aria-keyshortcuts="Space" onClick={hasEverStarted ? resumeSpeaking : startSpeaking} disabled={isStarting || isClearing}>{isStarting ? "Starting microphone…" : hasEverStarted ? "Resume speaking and recording" : "Start speaking and recording"}{!isStarting && <kbd className="recording-key-hint" aria-hidden="true">Space</kbd>}</button>}
              {hasStarted && !fixedDuration && <button className="secondary-button" aria-keyshortcuts="Space" onClick={pauseSpeaking} disabled={isClearing}>Pause speaking and recording <kbd className="recording-key-hint" aria-hidden="true">Space</kbd></button>}
              {hasEverStarted && <button className="secondary-button" onClick={finishSpeaking} disabled={isStarting || isClearing || finishRef.current}>Finish and review speech</button>}
              {!recordingBusy && !isClearing && <button className="secondary-button" onClick={onBack}>{backLabel}</button>}
            </>
          )}
          <button type="button" className="text-button clear-attempt-button" onClick={clearAttempt} disabled={!hasEverStarted || isStarting || isClearing || finishRef.current}>{isClearing ? "Clearing…" : "Clear attempt"}</button>
          {clearMessage && <p className="analysis-muted" role="status">{clearMessage}</p>}
        </div>

        <SpeechRecorder
          format={format}
          ref={recorderRef}
          user={user}
          topic={topic}
          difficulty={difficulty}
          onBusyChange={setRecordingBusy}
          onClipChange={onClipChange}
        />

      </section>
    </Container>
  );
}




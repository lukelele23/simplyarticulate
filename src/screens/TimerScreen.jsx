import { useEffect, useRef, useState } from "react";
import SpeechRecorder from "../components/SpeechRecorder.jsx";

export default function TimerScreen({
  fixedDuration = false,
  format = 'speech',
  focus = "",
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
  const [showCountdown, setShowCountdown] = useState(true);
  const finishRef = useRef(false);
  const recorderRef = useRef(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.min(durationSeconds, 300));
  const [hasStarted, setHasStarted] = useState(false);
  const [hasEverStarted, setHasEverStarted] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
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
    return () => window.clearInterval(timer);
  }, [hasStarted]);

  useEffect(() => {
    if (secondsLeft === 0) recorderRef.current?.stop();
  }, [secondsLeft]);

  async function startSpeaking() {
    if (isStarting || recordingBusy) return;
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
    if (finishRef.current) return;
    finishRef.current = true;
    setHasStarted(false);
    setRecordingBusy(true);
    const recording = await recorderRef.current?.stop();
    onFinish(recording || null);
  }

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <main className="screen timer-screen">
      <section className="timer-card speech-layout speaking-timer-page">
        <header className="speech-heading">
          <p className="eyebrow">{fixedDuration ? "DAILY CHALLENGE" : "YOUR SPEAKING PRACTICE"}</p>
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
            <button className="primary-button" onClick={finishSpeaking} disabled={recordingBusy}>Review speech and feedback</button>
          ) : (
            <>
              {!hasStarted && <button className="start-button" onClick={hasEverStarted ? resumeSpeaking : startSpeaking} disabled={isStarting}>{isStarting ? "Starting microphone…" : hasEverStarted ? "Resume speaking and recording" : "Start speaking and recording"}</button>}
              {hasStarted && !fixedDuration && <button className="secondary-button" onClick={pauseSpeaking}>Pause speaking and recording</button>}
              {hasEverStarted && <button className="secondary-button" onClick={finishSpeaking} disabled={isStarting || finishRef.current}>Finish and review speech</button>}
              <button className="secondary-button" onClick={onBack} disabled={recordingBusy}>{backLabel}</button>
            </>
          )}
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
    </main>
  );
}

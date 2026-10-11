import { useEffect, useRef, useState } from "react";


export default function ResearchTimerScreen({
  difficulty,
  topic,
  debateSide,
  secondsLeft,
  onSecondsLeftChange,
  onBack,
  onStartSpeaking,
}) {
  const [researchTimer, setResearchTimer] = useState(false);
  const deadline = useRef(0);
  useEffect(() => {
    if (secondsLeft === 0 || researchTimer === false) return;

    const timer = window.setTimeout(
      () => onSecondsLeftChange((current) => current - 1),
      1000
    );
    return () => window.clearInterval(timer);
  }, [secondsLeft, researchTimer, onSecondsLeftChange]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <main className="screen timer-screen">
      <section className="timer-card research-layout">
        <header className="research-heading">
          <p className="eyebrow">{difficulty} DIFFICULTY</p>
          {debateSide && (
            <p className="m-0 text-sm font-semibold uppercase tracking-wider text-[#d0d2d4]">
              {debateSide} side
            </p>
          )}
          <p className="timer-topic">{topic}</p>
        </header>

        <p className="screen-message">Preparation is optional. Think of your main point and one example; start when you feel ready.</p>
        <div className="research-controls">
          <div className={`countdown ${secondsLeft === 0 ? "complete" : ""}`}>
            <span>{minutes}:{seconds}</span>
            <small>{secondsLeft === 0 ? "READY TO SPEAK" : "PREPARATION"}</small>
          </div>

          {secondsLeft > 0 && (
            <label className="research-timer">
              <button onClick={() => {
                deadline.current = Date.now() + secondsLeft * 1000;
                setResearchTimer(!researchTimer);
              }}>
                {researchTimer ? "Pause" : "Start"} Preparation
              </button>
            </label>
          )}
          <button
            className={secondsLeft === 0
              ? "primary-button research-start-speech"
              : "secondary-button"}
            onClick={onStartSpeaking}
          >
            Continue to microphone
          </button>

          <div className="screen-actions">
            <button className="secondary-button" onClick={onBack}>Back</button>
          </div>
        </div>
      </section>
    </main>
  );
}

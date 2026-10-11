import { useEffect, useState } from "react";
import { DEBATE_FORMATS, formatClock } from "../lib/debateFormats.js";

function createPrepBanks(seconds) {
  return { a: seconds, b: seconds };
}

export default function SpeechDebateSection() {
  const [formatId, setFormatId] = useState("ld");
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [speechSecondsLeft, setSpeechSecondsLeft] = useState(
    DEBATE_FORMATS.ld.segments[0].seconds
  );
  const [prepBanks, setPrepBanks] = useState(() =>
    createPrepBanks(DEBATE_FORMATS.ld.prepSeconds)
  );
  const [prepSide, setPrepSide] = useState("a");
  const [activeClock, setActiveClock] = useState(null);

  const format = DEBATE_FORMATS[formatId];
  const segment = format.segments[segmentIndex];
  const isComplete = segmentIndex >= format.segments.length;
  const prepSecondsLeft = prepBanks[prepSide];

  useEffect(() => {
    if (!activeClock) return undefined;
    const timeout = window.setTimeout(() => {
      if (activeClock === "speech") {
        if (speechSecondsLeft <= 1) {
          setSpeechSecondsLeft(0);
          setActiveClock(null);
        } else {
          setSpeechSecondsLeft(speechSecondsLeft - 1);
        }
      } else if (prepSecondsLeft <= 1) {
        setPrepBanks((banks) => ({ ...banks, [prepSide]: 0 }));
        setActiveClock(null);
      } else {
        setPrepBanks((banks) => ({ ...banks, [prepSide]: prepSecondsLeft - 1 }));
      }
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [activeClock, prepSecondsLeft, prepSide, speechSecondsLeft]);

  function chooseFormat(nextFormatId) {
    const nextFormat = DEBATE_FORMATS[nextFormatId];
    setActiveClock(null);
    setFormatId(nextFormatId);
    setSegmentIndex(0);
    setSpeechSecondsLeft(nextFormat.segments[0].seconds);
    setPrepBanks(createPrepBanks(nextFormat.prepSeconds));
    setPrepSide("a");
  }

  function advanceSegment() {
    if (isComplete) return;
    const nextIndex = segmentIndex + 1;
    setActiveClock(null);
    setSegmentIndex(nextIndex);
    if (nextIndex < format.segments.length) {
      setSpeechSecondsLeft(format.segments[nextIndex].seconds);
    }
  }

  function resetRound() {
    setActiveClock(null);
    setSegmentIndex(0);
    setSpeechSecondsLeft(format.segments[0].seconds);
    setPrepBanks(createPrepBanks(format.prepSeconds));
    setPrepSide("a");
  }

  function toggleSpeechClock() {
    if (isComplete || speechSecondsLeft === 0) return;
    setActiveClock((clock) => clock === "speech" ? null : "speech");
  }

  function togglePrepClock() {
    if (prepSecondsLeft === 0) return;
    setActiveClock((clock) => clock === "prep" ? null : "prep");
  }

  return (
    <section className="speech-debate-section" aria-label="Speech and Debate">

      <div className="debate-format-switch" role="group" aria-label="Debate format">
        {Object.values(DEBATE_FORMATS).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={formatId === option.id}
            onClick={() => chooseFormat(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>

      <div className="debate-timer-layout">
        <section className="debate-clock-card" aria-live="polite">
          {isComplete ? (
            <>
              <p className="eyebrow">ROUND COMPLETE</p>
              <h2>{format.name}</h2>
              <p>All speech and cross-examination times are complete.</p>
              <button className="primary-button" type="button" onClick={resetRound}>
                Restart round
              </button>
            </>
          ) : (
            <>
              <div className="debate-step-meta">
                <span>{segmentIndex + 1} / {format.segments.length}</span>
                <span>{segment.shortLabel}</span>
              </div>
              <p className="eyebrow">{segment.side}</p>
              <h2>{segment.label}</h2>
              <div className={`debate-clock${speechSecondsLeft === 0 ? " is-finished" : ""}`} role="timer">
                {formatClock(speechSecondsLeft)}
              </div>
              <p className="debate-clock-caption">
                {speechSecondsLeft === 0 ? "Time" : "Speech clock"}
              </p>
              <div className="debate-clock-actions">
                <button className="primary-button" type="button" onClick={toggleSpeechClock} disabled={speechSecondsLeft === 0}>
                  {activeClock === "speech" ? "Pause" : "Start speech"}
                </button>
                <button className="secondary-button" type="button" onClick={advanceSegment}>
                  {segmentIndex + 1 === format.segments.length ? "Finish round" : "Next"}
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="debate-prep-card" aria-label="Preparation time">
          <h2>Prep time</h2>
          <p>{formatClock(format.prepSeconds)} {format.prepLabel}</p>
          <div className="debate-prep-sides" role="group" aria-label="Choose who is using prep time">
            <button type="button" aria-pressed={prepSide === "a"} onClick={() => { setActiveClock(null); setPrepSide("a"); }}>
              {formatId === "ld" ? "Affirmative" : "Team A"}
              <strong>{formatClock(prepBanks.a)}</strong>
            </button>
            <button type="button" aria-pressed={prepSide === "b"} onClick={() => { setActiveClock(null); setPrepSide("b"); }}>
              {formatId === "ld" ? "Negative" : "Team B"}
              <strong>{formatClock(prepBanks.b)}</strong>
            </button>
          </div>
          <button className="secondary-button" type="button" onClick={togglePrepClock} disabled={prepSecondsLeft === 0}>
            {activeClock === "prep" ? "Pause prep" : "Start prep"}
          </button>
          <p className="debate-timing-note">
            Prep clocks are separate from speeches. Tournaments may set different rules.
          </p>
        </aside>
      </div>

      <section className="debate-round-order" aria-labelledby="debate-order-title">
        <h2 id="debate-order-title">Round order</h2>
        <ol>
          {format.segments.map((item, index) => (
            <li key={`${item.shortLabel}-${index}`} className={index === segmentIndex && !isComplete ? "is-current" : ""}>
              <span>{item.label}</span>
              <span>{formatClock(item.seconds)}</span>
            </li>
          ))}
        </ol>
      </section>

      <button className="text-button debate-reset" type="button" onClick={resetRound}>
        Reset round
      </button>
    </section>
  );
}

import {challengeDay} from '../lib/challengeDay.js';
import TopicVotingScreen from './TopicVotingScreen.jsx';
import './dailyChallengeFocus.css';
import SaveAudio from '../components/SaveAudio.jsx';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import SpeechRecorder from "../components/SpeechRecorder.jsx";
import DailyChallengeLeaderboard from "../components/DailyChallengeLeaderboard.jsx";
import useDailyTopic from "../hooks/useDailyTopic.js";
import { analysisRequest } from "../lib/speechAnalysis.js";
import { supabase } from "../../utils/supabase.js";

const SpeechAnalysis = lazy(() => import("../components/SpeechAnalysis.jsx"));
const PREP_SECONDS = 2 * 60;
const SPEECH_SECONDS = 60;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

function formatClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function getStoredUsername(user) {
  const username = user?.user_metadata?.username;
  return USERNAME_PATTERN.test(username || "") ? username : "";
}

export default function DailyChallengeScreen({
  headingRef,
  onUpdatePracticeActions,
  onRemoveSavedFeedback,
  onScore,
  goal,
  onSave,
  sessions = [],
  recoveredTake,
  user,
  onSignUp,
}) {
  const [publicUsername, setPublicUsername] = useState(() => getStoredUsername(user));



  const [now, setNow] = useState(() => new Date());
  const [dailyView,setDailyView]=useState('challenge');
  const leaderboardVisible=dailyView==='leaderboard';
  const challengeHidden=dailyView!=='challenge';
  const [challengeStarted, setChallengeStarted] = useState(false);
  const [attemptStatus, setAttemptStatus] = useState(null);
  const [attemptError, setAttemptError] = useState("");
  const [attemptCheck, setAttemptCheck] = useState(0);
  const [prepSeconds, setPrepSeconds] = useState(PREP_SECONDS);
  const [prepRunning, setPrepRunning] = useState(false);
  const [prepComplete, setPrepComplete] = useState(false);
  const [speechSeconds, setSpeechSeconds] = useState(SPEECH_SECONDS);
  const [speechRunning, setSpeechRunning] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [saved, setSaved] = useState(false);
  const recorderRef = useRef(null);
  const speechDeadline = useRef(0);
  const finishingRef = useRef(false);
  const currentDay=challengeDay(now);
  const dailyTopic = useDailyTopic(currentDay);
  const [activeChallenge,setActiveChallenge]=useState(null);
  const [isRecovered,setIsRecovered]=useState(false);
  const challenge = activeChallenge || {id:currentDay,topic:dailyTopic.topic};
  useEffect(()=>{if(recoveredTake){setIsRecovered(true);setActiveChallenge({id:recoveredTake.challengeId,topic:recoveredTake.topic});setChallengeStarted(true);setRecording({blob:recoveredTake.blob,storageBlob:recoveredTake.storageBlob,durationSeconds:recoveredTake.durationSeconds,draftId:recoveredTake.id,requestKey:recoveredTake.id,recovery:true});setSaved(false);}},[recoveredTake]);
  const completed = sessions.some((session) => session.challengeId === challenge.id);
  const sanitizedAttemptError = attemptError === "Not found." ? "" : attemptError;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPublicUsername(getStoredUsername(user));


  }, [user?.id, user?.user_metadata?.username]);

  useEffect(() => {
    if (!user) {
      setAttemptStatus(null);
      setAttemptError("");
      return undefined;
    }
    const controller = new AbortController();
    setAttemptStatus(null);
    setAttemptError("");
    analysisRequest(`/community/attempt?day=${encodeURIComponent(challenge.id)}`, { signal: controller.signal })
      .then((status) => { if (!controller.signal.aborted) setAttemptStatus(status); })
      .catch((error) => { if (!controller.signal.aborted) setAttemptError(error.message); });
    return () => controller.abort();
  }, [user?.id, challenge.id, attemptCheck]);

  useEffect(() => {
    if (!prepRunning) return undefined;
    const timer = window.setInterval(() => {
      setPrepSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [prepRunning]);

  useEffect(() => {
    if (challengeStarted && prepSeconds === 0 && !prepComplete) {
      setPrepRunning(false);
      setPrepComplete(true);
    }
  }, [challengeStarted, prepSeconds, prepComplete]);

  useEffect(() => {
    if (!speechRunning) return undefined;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((speechDeadline.current - Date.now()) / 1000));
      setSpeechSeconds(remaining);
      if (remaining === 0) {
        setSpeechRunning(false);
        setSpeechPaused(false);
        if (!finishingRef.current) {
          finishingRef.current = true;
          recorderRef.current?.stop().then((clip) => {
            setRecording(clip);
            finishingRef.current = false;
          });
        }
      }
    };
    const timer = window.setInterval(update, 200);
    update();
    return () => window.clearInterval(timer);
  }, [speechRunning]);

  async function startSpeech() {
    if (!prepComplete || recordingBusy || speechRunning || finishingRef.current) return;
    const started = await recorderRef.current?.start();
    if (!started) return;
    finishingRef.current = false;
    speechDeadline.current = Date.now() + speechSeconds * 1000;
    setSpeechPaused(false);
    setSpeechRunning(true);
  }

  function pauseSpeech() {
    const remaining = Math.max(0, Math.ceil((speechDeadline.current - Date.now()) / 1000));
    setSpeechSeconds(remaining);
    recorderRef.current?.pause();
    setSpeechPaused(remaining > 0);
    setSpeechRunning(false);
  }

  function resumeSpeech() {
    if (!recorderRef.current || !speechPaused || speechSeconds === 0) return;
    recorderRef.current.resume();
    speechDeadline.current = Date.now() + speechSeconds * 1000;
    setSpeechPaused(false);
    setSpeechRunning(true);
  }

  async function finishSpeech() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setSpeechPaused(false);
    setSpeechRunning(false);
    const clip = await recorderRef.current?.stop();
    setRecording(clip);
    finishingRef.current = false;
  }

  function startChallenge() {
    if (!publicUsername) return;
    setActiveChallenge({id:currentDay,topic:dailyTopic.topic});
    setChallengeStarted(true);
    setPrepSeconds(PREP_SECONDS);
    setPrepRunning(false);
    setPrepComplete(false);
    setSaved(false);
  }

  function skipPreparation() {
    setPrepRunning(false);
    setPrepComplete(true);
  }

  function resetChallenge() {
    setIsRecovered(false);
    setChallengeStarted(false);
    setActiveChallenge(null);
    setPrepRunning(false);
    setPrepSeconds(PREP_SECONDS);
    setPrepComplete(false);
    setSpeechRunning(false);
    setSpeechPaused(false);
    setSpeechSeconds(SPEECH_SECONDS);
    setRecording(null);
    setAnalysis(null);
    setSaved(false);
    finishingRef.current = false;
  }

  function saveChallenge() {
    if (!recording || !challenge.topic || saved) return;
    const didSave=onSave({
      challenge,
      recording,
      analysis,
    });
    if(didSave!==false)setSaved(true);
  }


  return (
    <>
      <header className="daily-page-heading daily-destination-topline">
        <h1 ref={headingRef} tabIndex={-1} className="destination-heading">Daily challenge</h1>
        <nav className="daily-section-nav" aria-label="Daily Challenge sections">
          {[['challenge','Challenge'],['leaderboard','Leaderboard'],['topic-vote','Topic Vote']].map(([view,label])=><button
            key={view} className="secondary-button daily-leaderboard-button" type="button"
            disabled={recordingBusy || speechRunning}
            aria-current={dailyView===view?'page':undefined}
            aria-controls="daily-challenge-content"
            onClick={()=>{setPrepRunning(false);setDailyView(view);}}>{label}</button>)}
        </nav>
      </header>
    <section className={`timer-card daily-card daily-single-page${challengeStarted && !recording ? " is-timing" : ""}`}>

      <section className="daily-prompt" aria-labelledby="daily-prompt-title" hidden={challengeHidden}>
        <div className="section-topline">
          <span className="eyebrow">TODAY’S CHALLENGE</span>
          <span>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${challenge.id}T12:00:00Z`))}</span>
        </div>
        <h2 id="daily-prompt-title">
          {activeChallenge ? challenge.topic : dailyTopic.isLoading ? "Loading today’s prompt…" : dailyTopic.error ? "Today’s prompt unavailable" : challenge.topic}
        </h2>
        {!activeChallenge && dailyTopic.error && <p role="alert">{dailyTopic.error}</p>}
        <div className="daily-prompt-actions" hidden={challengeHidden}>

        {user && publicUsername && <p className="daily-username-display">Your challenge username: <strong>{publicUsername}</strong></p>}
        {user && sanitizedAttemptError && (
          <div>
            <p role="alert" className="analysis-error">{sanitizedAttemptError}</p>
            <button className="secondary-button" type="button" onClick={() => setAttemptCheck((check) => check + 1)}>
              Check attempt again
            </button>
            <p className="completion-note">Your recording is retained locally while the service is unavailable.</p>
          </div>
        )}
        {user && !sanitizedAttemptError && !attemptStatus && <p className="analysis-muted" role="status">Checking today’s scored attempt…</p>}
        {user && attemptStatus?.used && <p className="completion-note" role="status">Your competitive take is reserved. After a service failure, recover that original take from Home; a replacement cannot be scored.</p>}
        {!challengeStarted && (
          <button
            className="primary-button"
            type="button"
            onClick={() => user && publicUsername ? startChallenge() : onSignUp()}
            disabled={dailyTopic.isLoading || Boolean(dailyTopic.error) || (Boolean(user) && (!publicUsername || !attemptStatus || attemptStatus.used || Boolean(attemptError)))}
          >
            {user ? "Take the challenge" : "Sign in to join"}
          </button>
        )}
        </div>
      </section>

      <div id="daily-challenge-content">
      {dailyView==='topic-vote' && <TopicVotingScreen user={user} onSignUp={onSignUp}/>}
      {leaderboardVisible && <DailyChallengeLeaderboard day={challenge.id} />}
      <div className="daily-challenge-panel" hidden={challengeHidden}>
      {challengeStarted && (
        <>
          {!recording && (
            <div className="daily-live-controls">
              {!prepComplete ? (
                <section className="daily-phase-card">
                  <h2>Prepare</h2>
                  <p className="daily-phase-clock" style={{"--daily-progress":`${Math.max(0,Math.min(100,prepSeconds/PREP_SECONDS*100))}%`}} role="timer">{formatClock(prepSeconds)}</p>
                  <p>Take up to two minutes to prepare, or skip ahead to speaking.</p>
                  <div className="daily-phase-actions">
                    <button className="secondary-button" type="button" onClick={() => setPrepRunning((running) => !running)} disabled={prepSeconds === 0}>
                      {prepRunning ? "Pause preparation" : "Start preparation"}
                    </button>
                    <button className="primary-button" type="button" onClick={skipPreparation}>
                      Skip preparation
                    </button>
                  </div>
                </section>
              ) : (
                <section className="daily-phase-card">
                  <h2>Speak</h2>
                  <p className={`daily-phase-clock${speechSeconds === 0 ? " is-finished" : ""}`} style={{"--daily-progress":`${Math.max(0,Math.min(100,speechSeconds/SPEECH_SECONDS*100))}%`}} role="timer">
                    {formatClock(speechSeconds)}
                  </p>
                  <p>{speechRunning ? "Your minute is underway." : speechPaused ? "Speech paused. Resume when you’re ready." : "The microphone starts with the speech timer."}</p>
                  <div className="daily-phase-actions">
                    {speechRunning ? (
                      <>
                        <button className="secondary-button" type="button" onClick={pauseSpeech}>Pause</button>
                        <button className="primary-button" type="button" onClick={finishSpeech}>Finish speech</button>
                      </>
                    ) : speechPaused ? (
                      <>
                        <button className="primary-button" type="button" onClick={resumeSpeech}>Resume speaking</button>
                        <button className="secondary-button" type="button" onClick={finishSpeech}>Finish speech</button>
                      </>
                    ) : recordingBusy ? (
                      <button className="secondary-button" type="button" disabled>Finishing recording…</button>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={startSpeech}
                        disabled={speechSeconds === 0 || recordingBusy}
                      >
                        Start speaking
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {!isRecovered && <SpeechRecorder
            format="daily-challenge"
            challengeId={challenge.id}
            publicUsername={publicUsername}
            ref={recorderRef}
            showPlayback={false}
            user={user}
            topic={challenge.topic}
            difficulty="medium"
            onBusyChange={setRecordingBusy}
            onClipChange={setRecording}
          />}

          {recording && (
            <section className="daily-review" aria-labelledby="daily-review-title">
              <h2 id="daily-review-title">{saved ? "Challenge complete" : "Review your take"}</h2>
              <Suspense fallback={<p className="analysis-muted" role="status">Loading speech analysis…</p>}>
                <SpeechAnalysis practiceSessions={sessions} onUpdatePracticeActions={onUpdatePracticeActions}
                  recording={recording}
                  key={recording.draftId}
                  initialReport={isRecovered ? recoveredTake?.report : null}
                  metadata={{ topic: challenge.topic, format: "daily-challenge", difficulty: "medium", goal, challengeId: challenge.id, publicUsername:isRecovered ? recoveredTake.publicUsername : publicUsername }}
                  user={user}
                  onSignUp={onSignUp}
                  onRetry={() => {
                    resetChallenge();
                    setChallengeStarted(true);
                  }}
                  onAttemptUsed={() => setAttemptCheck(check=>check+1)}
                  onRemoveSavedFeedback={onRemoveSavedFeedback}
                  onScore={onScore}
                  onReportChange={setAnalysis}
                />
              </Suspense>
              <SaveAudio recording={recording} user={user} topic={challenge.topic} difficulty="medium"/>
              <button className="primary-button" type="button" onClick={saveChallenge} disabled={saved || !recording}>
                {saved ? "Saved to your progress" : user ? "Save challenge progress" : "Finish challenge"}
              </button>
              {saved && <p className="completion-note" role="status">Your challenge is saved on this device.</p>}
            </section>
          )}
        </>
      )}

      {activeChallenge && challenge.id!==currentDay && <p role="status">This take belongs to a challenge that has ended. You can replay and save it; start a new challenge to compete today.</p>}
      {completed && !saved && <p className="completion-note">You’ve already saved today’s challenge to your progress.</p>}
      {challengeStarted && (
        <button className="text-button" type="button" onClick={resetChallenge} disabled={recordingBusy || speechRunning || (recording && !saved)}>
          Reset challenge
        </button>
      )}
      </div>
      </div>
    </section>
    </>
  );
}

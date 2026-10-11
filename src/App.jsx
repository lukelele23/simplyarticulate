import {sessionAccess} from './lib/authSecurity.js';
import {startGoogleSignIn} from './lib/googleSignIn.js';
import useAccountCollection from './hooks/useAccountCollection.js';
import './components/practiceImprovements.css';
import { updateDraft } from './lib/drafts.js';
import { lazy, Suspense, useEffect, useRef, useState, useCallback } from "react";
import { weeklyDays } from "./lib/practice.js";
import DifficultyScreen from "./screens/DifficultyScreen.jsx";
import ResearchTimerScreen from "./screens/ResearchTimerScreen.jsx";
import TimerScreen from "./screens/TimerScreen.jsx";
import SpeechReviewScreen from "./screens/SpeechReviewScreen.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import usePersistentState from "./hooks/usePersistentState.js";
import { supabase } from "../utils/supabase.js";

const SplashScreen = lazy(() => import("./screens/SplashScreen.jsx"));
const RecordingsScreen = lazy(() => import("./screens/RecordingsLibrary.jsx"));
const StatsScreen = lazy(() => import("./screens/StatsScreen.jsx"));

const DEFAULT_SETTINGS = {
  researchSeconds: 2 * 60,
  speechSeconds: 60,
};

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function App() {
  const [user, setUser] = useState(null);
  const activeUserIdRef = useRef(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [screen, setScreen] = useState("difficulty");
  const [screenBeforeSignUp, setScreenBeforeSignUp] = useState("difficulty");
  const [guestPractice, setGuestPractice] = useState(false);
  const [practiceSkill, setPracticeSkill] = useState("Clarity");
  const [challengeId, setChallengeId] = useState(null);
  const [retryFocus, setRetryFocus] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [difficulty, setDifficulty] = useState(null);
  const [topicType, setTopicType] = useState("speech");
  const [topic, setTopic] = useState(null);
  const [debateSide, setDebateSide] = useState(null);
  const [researchSecondsLeft, setResearchSecondsLeft] = useState(
    DEFAULT_SETTINGS.researchSeconds
  );
  const [speechRecording, setSpeechRecording] = useState(null);
  const [speechAnalysis, setSpeechAnalysis] = useState(null);
  const [savedSettings, setSavedSettings] = usePersistentState(
    "simply-articulate-settings",
    DEFAULT_SETTINGS,
    user?.id
  );
  const [storedSessions,setStoredSessions,sessionSync]=useAccountCollection('session',user?.id);
  const [storedFavorites,setStoredFavorites,favoriteSync]=useAccountCollection('favorite',user?.id);
  const [draftError,setDraftError]=useState(''), [storageError,setStorageError]=useState('');
  const [previousTake,setPreviousTake]=useState(null), [latestReport,setLatestReport]=useState(null);
  const [initialReport,setInitialReport]=useState(null), [recoveredChallenge,setRecoveredChallenge]=useState(null);
  useEffect(()=>{const listener=event=>setStorageError(event.detail);window.addEventListener('practice-storage-error',listener);return()=>window.removeEventListener('practice-storage-error',listener);},[]);
  const keepAnalysis=useCallback(report=>{setSpeechAnalysis(report);if(speechRecording?.draftId)void updateDraft(speechRecording.draftId,{report:report || null}).catch(()=>setDraftError('Feedback could not be kept in the local recovery copy. Download it before leaving.'));},[speechRecording?.draftId]);
  function practicePlan(plan){setPreviousTake(null);setLatestReport(null);setInitialReport(null);setTopic(plan.prompt);setTopicType('speech');setDifficulty('medium');setRetryFocus(plan.steps.join(' '));setAttempt(n=>n+1);setScreen('timer');}
  const loadedSettings =
    savedSettings && typeof savedSettings === "object" && !Array.isArray(savedSettings)
      ? savedSettings
      : {};
  const settings = {
    researchSeconds: Number.isFinite(Number(loadedSettings.researchSeconds))
      ? Math.min(300, Math.max(2 * 60, Number(loadedSettings.researchSeconds)))
      : DEFAULT_SETTINGS.researchSeconds,
    speechSeconds: Number.isFinite(Number(loadedSettings.speechSeconds))
      ? Math.min(300, Math.max(30, Number(loadedSettings.speechSeconds)))
      : DEFAULT_SETTINGS.speechSeconds,
  };
  const sessions = Array.isArray(storedSessions)
    ? storedSessions.filter(
        (session) =>
          session &&
          typeof session === "object" &&
          typeof session.date === "string" &&
          typeof session.topic === "string"
      )
    : [];
  const favorites = Array.isArray(storedFavorites)
    ? storedFavorites.filter((favorite) => typeof favorite === "string")
    : [];

  useEffect(() => {
    let isActive=true;
    function acceptSession(session){
      if(!isActive)return;
      const nextUser=sessionAccess(session);
      if(activeUserIdRef.current!==(nextUser?.id??null)){
        setScreen('difficulty');setTopic(null);setDebateSide(null);setSpeechRecording(null);setSpeechAnalysis(null);
        setPreviousTake(null);setLatestReport(null);setInitialReport(null);setRecoveredChallenge(null);
        activeUserIdRef.current=nextUser?.id??null;
      }
      setUser(nextUser);setAuthError('');setIsAuthLoading(false);
    }
    let receivedAuthEvent=false;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      receivedAuthEvent=true;acceptSession(session);
    });
    supabase.auth.getSession().then(({data,error})=>{
      if(error)throw error;
      if(!receivedAuthEvent)acceptSession(data.session);
    }).catch(()=>{if(isActive&&!receivedAuthEvent){setAuthError('Could not restore your sign-in. Please sign in again.');setIsAuthLoading(false);}});
    return()=>{isActive=false;subscription.unsubscribe();};
  },[]);

  useEffect(() => { window.scrollTo({top:0, behavior:"instant"}); }, [screen]);

  async function signInWithGoogle() {
    setAuthError('');
    await startGoogleSignIn(supabase.auth,window.location.origin,url=>window.location.assign(url));
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  function openSignUp() {
    setScreenBeforeSignUp(screen);
    setScreen("signup");
  }

  function closeSignUp() {
    setScreen(screenBeforeSignUp);
  }

  function chooseDifficulty(level) {
    setDifficulty(level);
    setTopic(null);
    setDebateSide(null);
  }

  function chooseTopicType(type) {
    setTopicType(type);
    setTopic(null);
    setDebateSide(null);
  }

  function handleTopicSelect(nextTopic) {
    setTopic(nextTopic);
    setDebateSide(null);
  }

  function resetPractice() {
    setPreviousTake(null);setLatestReport(null);setInitialReport(null);setRecoveredChallenge(null);
    setChallengeId(null);
    setRetryFocus("");
    setSpeechRecording(null);
    setSpeechAnalysis(null);
    setDifficulty(null);
    setTopic(null);
    setDebateSide(null);
    setResearchSecondsLeft(settings.researchSeconds);
    setScreen("difficulty");
  }

  function toggleFavorite() {
    if (!topic) return;
    setStoredFavorites((current) => {
      const existing = Array.isArray(current) ? current : [];
      return existing.includes(topic)
        ? existing.filter((favorite) => favorite !== topic)
        : [topic, ...existing];
    });
  }

  function practiceFavorite(favorite) {
    setPreviousTake(null);setLatestReport(null);setInitialReport(null);setRetryFocus('');setDifficulty(difficulty || 'medium');setTopicType('speech');
    setTopic(favorite);
    setDebateSide(null);
    setResearchSecondsLeft(settings.researchSeconds);
    setScreen(settings.researchSeconds === 0 ? "timer" : "research-timer");
  }

  function savePractice() {
    const session = {
      id: speechRecording?.draftId || crypto.randomUUID(),
      date: getLocalDateKey(new Date(speechRecording?.recordedAt || Date.now())),
      createdAt:new Date(speechRecording?.recordedAt || Date.now()).toISOString(),
      topic,
      difficulty,
      format: topicType,
      skill: practiceSkill,
      challengeId,
      durationSeconds: speechRecording?.durationSeconds,
      ...(speechAnalysis ? { analysis: speechAnalysis } : {}),
      syncFeedback:Boolean(speechAnalysis),
    };
    setStoredSessions((current) => [
      session,
      ...(Array.isArray(current) ? current.filter(item=>item.id!==session.id) : []),
    ]);
    if(speechRecording?.draftId)void updateDraft(speechRecording.draftId,{progressSaved:true,report:speechAnalysis || null}).catch(()=>setDraftError('Progress saved; the local audio recovery copy could not be updated.'));
    resetPractice();
  }

  function saveDailyChallenge({ challenge, recording, analysis }) {
    if(sessions.some(item=>item.challengeId===challenge.id)){setStorageError('This challenge is already in your progress. Your audio is still available separately.');return false;}
    const session = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: getLocalDateKey(),
      topic: challenge.topic,
      difficulty: "medium",
      format: "daily-challenge",
      skill: "Clarity",
      challengeId: challenge.id,
      durationSeconds: recording?.durationSeconds,
      ...(analysis ? { analysis } : {}),
      syncFeedback:Boolean(analysis),
    };
    setStoredSessions((current) => [
      session,
      ...(Array.isArray(current) ? current : []),
    ]);
    if(recording?.draftId)void updateDraft(recording.draftId,{progressSaved:true,report:analysis || null}).catch(()=>{});
    return true;
  }

  if (isAuthLoading) {
    return (
      <main className="welcome-loading" role="status">
        <p className="eyebrow">SIMPLYARTICULATE</p>
        <p>Getting your practice space ready…</p>
      </main>
    );
  }


  if (!user && !guestPractice && screen !== "signup") {
    return (
      <Suspense
        fallback={
          <main className="welcome-loading" role="status">
            <p className="eyebrow">SIMPLYARTICULATE</p>
            <p>Loading your welcome screen…</p>
          </main>
        }
      >
        <SplashScreen onEmailSignIn={openSignUp} onExplore={() => { setGuestPractice(true); setScreen("difficulty"); }} onGoogleSignIn={signInWithGoogle} error={authError} onTryDemo={(prompt) => { setGuestPractice(true); setDifficulty("easy"); setTopicType("speech"); setTopic(prompt); setResearchSecondsLeft(2 * 60); setScreen("research-timer"); }} />
      </Suspense>
    );
  }

  if (screen === "signup" && !user) {
    return (
      <LoginScreen
        onGoogleSignIn={signInWithGoogle}
        onBack={closeSignUp}
        error={authError}
      />
    );
  }

  let currentScreen;
  if (screen === "stats") {
    currentScreen = (
      <Suspense fallback={<main className="welcome-loading" role="status"><p>Loading your progress…</p></main>}>
        <StatsScreen
          sessions={sessions}
          favorites={favorites}
          onPracticeFavorite={practiceFavorite}
          onRemoveFavorite={(favorite) =>
            setStoredFavorites((current) =>
              (Array.isArray(current) ? current : []).filter(
                (saved) => saved !== favorite
              )
            )
          }
          user={user}
          isAuthenticated={Boolean(user)}
          onSignUp={openSignUp}
          onBack={() => setScreen("difficulty")}
          onPracticePlan={practicePlan}
        />
      </Suspense>
    );
  } else if (screen === "recordings") {
    currentScreen = (
      <Suspense
        fallback={
          <main className="welcome-loading" role="status">
            <p>Loading your recordings…</p>
          </main>
        }
      >
        <RecordingsScreen
          user={user}
          onBack={() => setScreen("difficulty")}
        />
      </Suspense>
    );
  } else if (screen === "settings") {
    currentScreen = (
      <SettingsScreen
        user={user}
        onBack={() => setScreen("difficulty")}
        onSignOut={signOut}
        onSignUp={openSignUp}
      />
    );
  } else if (screen === "timer") {
    currentScreen = (
      <TimerScreen
        key={attempt}
        format={topicType}
        fixedDuration={Boolean(challengeId)}
        focus={retryFocus}
        user={user}
        difficulty={difficulty}
        topic={topic}
        debateSide={debateSide}
        durationSeconds={challengeId || !user ? 60 : settings.speechSeconds}
        onBack={() =>
          setScreen(topicType === "debate" || settings.researchSeconds === 0 ? "difficulty" : "research-timer")
        }
        onClipChange={setSpeechRecording}
        onFinish={(recording) => {
          if(recording?.draftId && previousTake?.recording?.draftId)void updateDraft(recording.draftId,{previousDraftId:previousTake.recording.draftId,focus:retryFocus}).catch(()=>setDraftError('Both audio takes are retained, but their comparison link could not be saved.'));
          setSpeechRecording(recording);
          setSpeechAnalysis(null);setLatestReport(null);setInitialReport(null);
          setScreen("review");
        }}
        backLabel={topicType === "debate" || settings.researchSeconds === 0 ? "Back to topics" : "Back to research"}
      />
    );
  } else if (screen === "research-timer") {
    currentScreen = (
      <ResearchTimerScreen
        difficulty={difficulty}
        topic={topic}
        debateSide={debateSide}
        secondsLeft={researchSecondsLeft}
        onSecondsLeftChange={setResearchSecondsLeft}
        onBack={() => setScreen("difficulty")}
        onStartSpeaking={() => setScreen("timer")}
      />
    );
  } else if (screen === "review") {
    currentScreen = (
      <SpeechReviewScreen
        user={user}
        onSignUp={openSignUp}
        previousTake={previousTake}
        focus={retryFocus}
        initialReport={initialReport}
        onResult={setLatestReport}
        onRetry={(focus) => { setPreviousTake({recording:speechRecording,report:latestReport});setInitialReport(null);setLatestReport(null);setRetryFocus(focus); setSpeechAnalysis(null); setSpeechRecording(null); setAttempt(a=>a+1); setScreen("timer"); }}
        topic={topic}
        onSave={savePractice}
        recording={speechRecording}
        analysisMetadata={{ topic, format: topicType, difficulty, debateSide }}
        onAnalysisChange={keepAnalysis}
      />
    );
  } else {
    currentScreen = (
      <>
        <DifficultyScreen
          recoveredChallenge={recoveredChallenge}
          practiceSkill={practiceSkill}
          weeklyPracticeDays={weeklyDays(sessions)}
          difficulty={difficulty}
          topic={topic}
          topicType={topicType}
          onDifficultyChange={chooseDifficulty}
          onTopicTypeChange={chooseTopicType}
          onTopicSelect={handleTopicSelect}
          onReset={resetPractice}
          onContinueToResearch={(side) => {
            const isDebate = topicType === "debate";
            setDebateSide(isDebate ? side : null);
            if (isDebate || settings.researchSeconds === 0) {
              setScreen("timer");
            } else {
              setResearchSecondsLeft(settings.researchSeconds);
              setScreen("research-timer");
            }
          }}
          onSaveDailyChallenge={saveDailyChallenge}
          onOpenSettings={() => setScreen("settings")}
          onOpenStats={() => setScreen("stats")}
          onOpenRecordings={() => setScreen("recordings")}
          favorites={favorites}
          sessions={sessions}
          settings={settings}
          onSettingsChange={setSavedSettings}
          onToggleFavorite={toggleFavorite}
          user={user}
          isAuthenticated={Boolean(user)}
          onSignUp={openSignUp}
        />
      </>
    );
  }

  return <>
    {(sessionSync.error || favoriteSync.error || storageError || draftError) && <div className="storage-notice" role="alert">{storageError || draftError || sessionSync.error || favoriteSync.error}{user && <button className="text-button" onClick={()=>{sessionSync.retry();favoriteSync.retry();setStorageError('');}}>Retry saving and sync</button>}</div>}
    {currentScreen}
  </>;
}


import useAppNavigation from './hooks/useAppNavigation.js';
import { saveSpeechRating } from './lib/speechRating.js';
import {sessionAccess} from './lib/authSecurity.js';
import {startGoogleSignIn} from './lib/googleSignIn.js';
import useAccountCollection from './hooks/useAccountCollection.js';
import './components/practiceImprovements.css';
import { updateDraft } from './lib/drafts.js';
import { lazy, Suspense, useEffect, useRef, useState, useCallback } from "react";
import { weeklyDays } from "./lib/practice.js";
const DifficultyScreen = lazy(() => import("./screens/DifficultyScreen.jsx"));
const ResearchTimerScreen = lazy(() => import("./screens/ResearchTimerScreen.jsx"));
const TimerScreen = lazy(() => import("./screens/TimerScreen.jsx"));
const SpeechReviewScreen = lazy(() => import("./screens/SpeechReviewScreen.jsx"));
import LoginScreen from "./screens/LoginScreen.jsx";
const SettingsScreen = lazy(() => import("./screens/SettingsScreen.jsx"));
import usePersistentState from "./hooks/usePersistentState.js";
import { supabase } from "../utils/supabase.js";

const SplashScreen = lazy(() => import("./screens/SplashScreen.jsx"));
const RecordingsScreen = lazy(() => import("./screens/RecordingsLibrary.jsx"));


const DEFAULT_SETTINGS = {
  researchSeconds: 0,
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
  const activeUserIdRef = useRef(undefined);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const {screen,setScreen,view,navigate,backLabel}=useAppNavigation();
  const [screenBeforeSignUp, setScreenBeforeSignUp] = useState("difficulty");
  const [guestPractice, setGuestPractice] = useState(location.pathname !== '/');
  const [practiceSkill, setPracticeSkill] = useState("Clarity");
  const [challengeId, setChallengeId] = useState(null);
  const [retryFocus, setRetryFocus] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [difficulty, setDifficulty] = useState(()=>{try{return JSON.parse(sessionStorage.getItem('sa-practice-selection')||'null')?.difficulty||'easy';}catch{return 'easy';}});
  const [topicType, setTopicType] = useState(()=>{try{return JSON.parse(sessionStorage.getItem('sa-practice-selection')||'null')?.topicType||'speech';}catch{return 'speech';}});
  const [topic, setTopic] = useState(()=>{try{return JSON.parse(sessionStorage.getItem('sa-practice-selection')||'null')?.topic||null;}catch{return null;}});
  useEffect(()=>{try{sessionStorage.setItem('sa-practice-selection',JSON.stringify({topic,difficulty,topicType}));}catch{}},[topic,difficulty,topicType]);
  useEffect(()=>{if(['timer','research-timer'].includes(screen)&&!topic)navigate('/practice',true);if(screen==='review'&&!speechRecording)navigate('/practice',true);},[screen]);
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
  const [draftError,setDraftError]=useState(''), [storageError,setStorageError]=useState('');
  const [previousTake,setPreviousTake]=useState(null), [latestReport,setLatestReport]=useState(null);
  const [initialReport,setInitialReport]=useState(null), [recoveredChallenge,setRecoveredChallenge]=useState(null);
  useEffect(()=>{const listener=event=>setStorageError(event.detail);window.addEventListener('practice-storage-error',listener);return()=>window.removeEventListener('practice-storage-error',listener);},[]);
  const keepAnalysis=useCallback(report=>{setSpeechAnalysis(report);if(speechRecording?.draftId)setStoredSessions(current=>current.map(item=>item.id===speechRecording.draftId?{...item,analysis:report||undefined,syncFeedback:Boolean(report)}:item));if(speechRecording?.draftId)void updateDraft(speechRecording.draftId,{report:report || null}).catch(()=>setDraftError('Feedback could not be kept in the local recovery copy. Download it before leaving.'));},[speechRecording?.draftId,setStoredSessions]);
  const removeSavedFeedback=useCallback(id=>{setStoredSessions(current=>current.map(item=>item.id===id?{...item,analysis:undefined,syncFeedback:false}:item));if(id)void updateDraft(id,{report:null}).catch(()=>setDraftError('Saved feedback was removed, but the local recovery report could not be updated.'));},[setStoredSessions]);
  function practicePlan(plan){setPreviousTake(null);setLatestReport(null);setInitialReport(null);setTopic(plan.prompt);setTopicType('speech');setDifficulty('medium');setRetryFocus(plan.steps.join(' '));setAttempt(n=>n+1);setScreen('timer');}
  const loadedSettings =
    savedSettings && typeof savedSettings === "object" && !Array.isArray(savedSettings)
      ? savedSettings
      : {};
  const settings = {
    goal: ["explain","persuade","story","interview"].includes(loadedSettings.goal) ? loadedSettings.goal : "explain",
    researchSeconds: Number.isFinite(Number(loadedSettings.researchSeconds))
      ? Math.min(300, Math.max(0, Number(loadedSettings.researchSeconds)))
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

  useEffect(() => {
    let isActive=true;
    function acceptSession(session){
      if(!isActive)return;
      const nextUser=sessionAccess(session);
      if(activeUserIdRef.current!==undefined && activeUserIdRef.current!==(nextUser?.id??null)){
        setScreen('difficulty');setTopic(null);setDebateSide(null);setSpeechRecording(null);setSpeechAnalysis(null);
        setPreviousTake(null);setLatestReport(null);setInitialReport(null);setRecoveredChallenge(null);
      }
      activeUserIdRef.current=nextUser?.id??null;
      if(nextUser){try{const returnPath=sessionStorage.getItem('sa-sign-in-return');if(returnPath&&returnPath.startsWith('/')&&!returnPath.startsWith('//')){sessionStorage.removeItem('sa-sign-in-return');navigate(returnPath,true);}}catch{}}
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

  useEffect(() => { window.scrollTo({top:0, behavior:"instant"}); const focus=()=>{const heading=document.querySelector("main h1");if(!heading)return false;heading.setAttribute("tabindex","-1");heading.focus({preventScroll:true});return true;};if(!focus()){const observer=new MutationObserver(()=>{if(focus())observer.disconnect();});observer.observe(document.getElementById("root"),{childList:true,subtree:true});return()=>observer.disconnect();} }, [screen,isAuthLoading]);

  async function signInWithGoogle() {
    try{sessionStorage.setItem('sa-sign-in-return',history.state?.returnPath||'/home');}catch{}
    setAuthError('');
    await startGoogleSignIn(supabase.auth,window.location.origin,url=>window.location.assign(url));
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  function openSignUp() {
    try{sessionStorage.setItem('sa-sign-in-return',location.pathname==='/'?'/home':location.pathname);}catch{}
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
    setDifficulty("easy");
    setTopic(null);
    setDebateSide(null);
    setResearchSecondsLeft(settings.researchSeconds);
    setScreen("difficulty");
  }

  const saveScore = useCallback(({ report, rating, recording, metadata }) => {
    if (!user || !Number.isInteger(rating?.stars)) return;
    setStoredSessions(current => {
      const next=saveSpeechRating(current,{rating,recording,metadata},getLocalDateKey(new Date(recording.recordedAt||Date.now())));
      const id=recording.draftId||recording.requestKey;
      const updated=next.map(item=>item.id===id?{...item,analysis:report||undefined,syncFeedback:Boolean(report)}:item);return JSON.stringify(updated)===JSON.stringify(current)?current:updated;
    });
  }, [user?.id, setStoredSessions]);

  function savePractice() {
    const session = {
      id: speechRecording?.draftId || crypto.randomUUID(),
      date: getLocalDateKey(new Date(speechRecording?.recordedAt || Date.now())),
      createdAt:new Date(speechRecording?.recordedAt || Date.now()).toISOString(),
      topic,
      difficulty,
      format: topicType,
      skill: practiceSkill,
      goal: settings.goal,
      improvement: latestReport?.coaching?.focusReview ? {status:latestReport.coaching.focusReview.status,assessment:latestReport.coaching.focusReview.assessment} : sessions.find(item=>item.id===speechRecording?.draftId)?.improvement,
      challengeId,
      durationSeconds: speechRecording?.durationSeconds,
      ...(speechAnalysis ? { analysis: speechAnalysis } : {}),
      nextFocus:latestReport?.coaching?.nextStep||sessions.find(item=>item.id===speechRecording?.draftId)?.nextFocus,
      rating: latestReport?.coaching?.rating || sessions.find(item=>item.id===speechRecording?.draftId)?.rating,
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
    if(sessions.some(item=>item.challengeId===challenge.id && item.id!==recording?.draftId)){setStorageError('This challenge is already in your progress. Your audio is still available separately.');return false;}
    const session = {
      id: recording?.draftId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: getLocalDateKey(),
      topic: challenge.topic,
      difficulty: "medium",
      format: "daily-challenge",
      skill: "Clarity",
      challengeId: challenge.id,
      durationSeconds: recording?.durationSeconds,
      ...(analysis ? { analysis } : {}),
      nextFocus:analysis?.coaching?.nextStep||sessions.find(item=>item.id===recording?.draftId)?.nextFocus,
      rating: analysis?.coaching?.rating || sessions.find(item=>item.id===recording?.draftId)?.rating,
      syncFeedback:Boolean(analysis),
    };
    setStoredSessions((current) => [
      session,
      ...(Array.isArray(current) ? current.filter(item=>item.id!==session.id) : []),
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
        <SplashScreen onEmailSignIn={openSignUp} onExplore={() => { setGuestPractice(true); navigate("/home"); }} onGoogleSignIn={signInWithGoogle} error={authError||draftError} onTryDemo={(prompt) => { setGuestPractice(true); setDifficulty("easy"); setTopicType("speech"); setTopic(prompt); setResearchSecondsLeft(0); setScreen("timer"); }} />
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
  if (screen === "recordings") {
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
          backLabel={backLabel}
          onBack={() => setScreen("difficulty")}
        />
      </Suspense>
    );
  } else if (screen === "settings") {
    currentScreen = (
      <SettingsScreen
        user={user}
        backLabel={backLabel}
        onBack={() => setScreen("difficulty")}
        onSignOut={signOut}
        onAccountDeleted={(warning) => { if(warning)setDraftError(warning); setUser(null); setGuestPractice(false); navigate("/",true); }}
        onSignUp={openSignUp}
      />
    );
  } else if (screen === "timer") {
    currentScreen = (
      <TimerScreen
        key={attempt}
        format={topicType}
        fixedDuration={Boolean(challengeId || previousTake)}
        parentJobId={previousTake?.report?.jobId}
        focus={retryFocus}
        user={user}
        difficulty={difficulty}
        topic={topic}
        debateSide={debateSide}
        durationSeconds={challengeId || previousTake || !user ? 60 : settings.speechSeconds}
        onBack={() => navigate("/practice")}
        onClipChange={setSpeechRecording}
        onFinish={(recording) => {
          if(recording?.draftId && previousTake?.recording?.draftId)void updateDraft(recording.draftId,{previousDraftId:previousTake.recording.draftId,focus:retryFocus}).catch(()=>setDraftError('Both audio takes are retained, but their comparison link could not be saved.'));
          setSpeechRecording(recording);
          setSpeechAnalysis(null);setLatestReport(null);setInitialReport(null);
          setScreen("review");
        }}
        backLabel="Back to practice setup"
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
        onRemoveSavedFeedback={removeSavedFeedback}
        onScore={saveScore}
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
        analysisMetadata={{ topic, format: topicType, difficulty, debateSide, goal:settings.goal, ...(previousTake?.report?.jobId ? {parentJobId:previousTake.report.jobId,focus:retryFocus} : {}) }}
        onAnalysisChange={keepAnalysis}
      />
    );
  } else {
    currentScreen = (
      <>
        <DifficultyScreen
          onRemoveSavedFeedback={removeSavedFeedback}
          onRecover={take=>{if(take.owner!==(user?.id||'signed-out'))return;if(take.format==='daily-challenge'){setRecoveredChallenge(take);navigate('/daily-challenge');return;}setTopic(take.topic);setDifficulty(take.difficulty||'easy');setTopicType(take.format||'speech');setSpeechRecording({blob:take.blob,storageBlob:take.storageBlob,durationSeconds:take.durationSeconds,draftId:take.id,requestKey:take.id,recordedAt:take.recordedAt,recovery:true});setInitialReport(take.report||null);setSpeechAnalysis(take.report||null);setLatestReport(take.report||null);setRetryFocus(take.focus||'');setScreen('review');}}
          onScore={saveScore}
          view={view}
          onViewChange={next=>navigate("/"+next)}
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
          sessions={sessions}
          settings={settings}
          onSettingsChange={setSavedSettings}
          user={user}
          isAuthenticated={Boolean(user)}
          onSignUp={openSignUp}
        />
      </>
    );
  }

  return <>
    {(sessionSync.error || storageError || draftError) && <div className="storage-notice" role="alert">{storageError || draftError || sessionSync.error}{user && <button className="text-button" onClick={()=>{sessionSync.retry();setStorageError('');}}>Retry saving and sync</button>}</div>}
    <a className="skip-link" href="#main-content">Skip to content</a>
<Suspense fallback={<main className="welcome-loading" role="status">Loading your practice space…</main>}>{currentScreen}</Suspense>
  </>;
}


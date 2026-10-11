import DailyChallengeLeaderboard from '../components/DailyChallengeLeaderboard.jsx';
import { nextStep } from '../lib/reports.js';
import { lazy, Suspense, useEffect, useState } from "react";
import Tabs from "../components/Tabs.jsx";
import WheelSelector from "../components/WheelSelector.jsx";
import PracticeSettings from "../components/PracticeSettings.jsx";
import DailyChallengeScreen from "./DailyChallengeScreen.jsx";
import SubscriptionSurvey from '../components/SubscriptionSurvey.jsx';

const SpeechDebateSection = lazy(() => import("../components/SpeechDebateSection.jsx"));

export default function DifficultyScreen({ recoveredChallenge, practiceSkill, weeklyPracticeDays, difficulty, topic, topicType, onDifficultyChange, onTopicTypeChange, onTopicSelect, onReset, onContinueToResearch, onSaveDailyChallenge, onOpenSettings, onOpenStats, onOpenRecordings, favorites, sessions = [], settings, onSettingsChange, user, onToggleFavorite, isAuthenticated, onSignUp }) {
  const [view, setView] = useState('home');
  useEffect(()=>{if(recoveredChallenge)setView('daily-challenge');},[recoveredChallenge]);
  const [practiceSettingsExpanded, setPracticeSettingsExpanded] = useState(true);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (view === 'practice') setPracticeSettingsExpanded(true);
  }, [view]);
  const feedback = sessions.find(s => s.analysis?.coaching);
  return <main className="screen difficulty-screen">
    <section className="generator-card app-shell">
      <header className="app-nav"><span className="wordmark">SimplyArticulate</span><nav aria-label="Main navigation"><button aria-current={view==='home'?'page':undefined} onClick={()=>setView('home')}>Home</button><button aria-current={view==='daily-challenge'?'page':undefined} onClick={()=>setView('daily-challenge')}>Daily Challenge</button><button aria-current={view==='practice'?'page':undefined} onClick={()=>setView('practice')}>Practice</button><button onClick={onOpenStats}>Progress</button><button aria-current={view==='speech-debate'?'page':undefined} onClick={()=>setView('speech-debate')}>Speech &amp; Debate</button></nav><button className="secondary-button nav-account" onClick={isAuthenticated?onOpenSettings:onSignUp}>{isAuthenticated?<><span aria-hidden="true">⚙︎</span><span>Settings</span></>:'Sign in'}</button><SubscriptionSurvey user={user} onSignUp={onSignUp}/></header>
      <div key={view} className="view-enter">
      {view==='home' ? <>
        <div className="home-grid">
          <section className="home-panel"><h2>Progress</h2><div className="score-row"><div><strong>{sessions.length}</strong><span>Sessions</span></div><div><strong>{weeklyPracticeDays}/3</strong><span>Days in the last 7 days</span></div></div><p>{sessions.length?'Keep practicing to build your speaking habit.':'Finish a session to start seeing your progress.'}</p><button className="text-button" onClick={onOpenStats}>See your progress →</button></section>
          <section className="home-panel"><h2>Feedback</h2><p>{nextStep(feedback?.analysis) || 'Record a speech, then request feedback to discover what works and what to try next.'}</p><button className="text-button" onClick={()=>setView('practice')}>Start a practice session →</button>{isAuthenticated&&<button className="text-button" onClick={onOpenRecordings}>Your recordings →</button>}</section>
          <section className="home-panel"><h2>Daily leaderboard</h2><DailyChallengeLeaderboard/><button className="text-button" onClick={()=>setView('daily-challenge')}>Open daily challenge →</button></section>
        </div>
        <section className="membership-strip"><div><h2>Practice is free.</h2><p>Topics, timers, recording and replay. Sign in for one practice analysis and one daily-challenge analysis each day.</p></div><div><span className="quiet-badge">Subscription · coming soon</span><p>Subscription access supports more AI practice. Paid plans are not available for purchase yet.</p></div></section>
      </> : view==='daily-challenge' ? <>
        <DailyChallengeScreen
          recoveredTake={recoveredChallenge}
          onSave={onSaveDailyChallenge}
          sessions={sessions}
          user={user}
          onSignUp={onSignUp}
        />
      </> : view==='speech-debate' ? <>
        <Suspense fallback={<p className="screen-message" role="status">Loading Speech &amp; Debate…</p>}>
          <SpeechDebateSection />
        </Suspense>
      </> : <>
        <div className="practice-grid"><section className={`practice-setup${practiceSettingsExpanded ? '' : ' is-collapsed'}`} aria-label="Practice settings"><div className="practice-settings-heading"><h2>Practice settings</h2><button className="practice-settings-toggle" type="button" aria-expanded={practiceSettingsExpanded} aria-controls="practice-settings-content" onClick={() => setPracticeSettingsExpanded((expanded) => !expanded)}><span>{practiceSettingsExpanded ? "Hide settings" : "Show settings"}</span><span className="practice-settings-chevron" aria-hidden="true">⌄</span></button></div><div id="practice-settings-content" className="practice-settings-content" hidden={!practiceSettingsExpanded}><Tabs difficulty={difficulty} onDifficultyChange={onDifficultyChange} topicType={topicType} onTopicTypeChange={onTopicTypeChange}/><PracticeSettings topicType={topicType} settings={settings} onSettingsChange={onSettingsChange}/></div></section><section className="prompt-workspace"><h2>Choose a topic</h2>{difficulty ? <WheelSelector skill={practiceSkill} difficulty={difficulty} topicType={topicType} previousTopic={topic} onSelectTopic={onTopicSelect} onContinueToResearch={onContinueToResearch} showFavorite={isAuthenticated} isFavorite={favorites.includes(topic)} onToggleFavorite={onToggleFavorite}/> : <p className="home-panel">Choose a difficulty to find your next topic.</p>}<button className="text-button" onClick={onReset}>Reset this session</button></section></div>
      </>}
      </div><footer className="app-footer"><span>SimplyArticulate</span></footer>
    </section>
  </main>;
}


import PracticeSummary from '../components/PracticeSummary.jsx';
import '../components/homeLayout.css';
import GuestAdSpace from '../components/GuestAdSpace.jsx';
import PracticeStages from '../components/PracticeStages.jsx';
import RecoveryTakes from '../components/RecoveryTakes.jsx';
import StatsScreen from './StatsScreen.jsx';
import DailyChallengeLeaderboard from '../components/DailyChallengeLeaderboard.jsx';
import { nextStep } from '../lib/reports.js';
import { lazy, Suspense, useEffect, useState, useRef } from "react";
import Tabs from "../components/Tabs.jsx";
import WheelSelector from "../components/WheelSelector.jsx";
import PracticeSettings from "../components/PracticeSettings.jsx";
import DailyChallengeScreen from "./DailyChallengeScreen.jsx";
import MainNavigation from '../components/MainNavigation.jsx';

const SpeechDebateSection = lazy(() => import("../components/SpeechDebateSection.jsx"));

export default function DifficultyScreen({ onRemoveSavedFeedback, onRecover, onScore, view = 'home', onViewChange, recoveredChallenge, practiceSkill, weeklyPracticeDays, difficulty, topic, topicType, onDifficultyChange, onTopicTypeChange, onTopicSelect, onReset, onContinueToResearch, onSaveDailyChallenge, onOpenSettings, onOpenStats, onOpenRecordings, sessions = [], settings, onSettingsChange, user, isAuthenticated, onSignUp }) {
  const setView=onViewChange;
  const heading=useRef(null);
  const titles={home:'Your next minute',practice:'Speaking practice','daily-challenge':'Daily challenge',progress:'Your progress','speech-debate':'Speech & Debate'};
  useEffect(()=>{if(recoveredChallenge)setView('daily-challenge');},[recoveredChallenge]);
  const [practiceSettingsExpanded, setPracticeSettingsExpanded] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector('.app-nav nav [aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    heading.current?.focus({preventScroll:true});
  }, [view]);
  const feedback = sessions.find(s => s.analysis?.coaching);
  return <main tabIndex={-1} id="main-content" className="screen difficulty-screen">
    <section className="generator-card app-shell">
      <MainNavigation view={view} onViewChange={setView} isAuthenticated={isAuthenticated} onOpenSettings={onOpenSettings} onSignUp={onSignUp} user={user}/>
      <div key={view} className="view-enter"><div className={`destination-topline${view === 'practice' ? ' has-practice-stages' : ''}`}><h1 ref={heading} tabIndex={-1} className="destination-heading">{titles[view]}</h1>{view === 'practice' && <PracticeStages current="topic" includePreparation={topicType !== 'debate' && settings.researchSeconds > 0}/>}</div>
      {view==='home' ? <>
        <RecoveryTakes user={user} onRecover={onRecover} />
        <section className="practice-invitation"><h2>{topic?'Resume your practice':'One idea. One minute.'}</h2><p>{sessions.find(s=>s.nextFocus)?.nextFocus || nextStep(feedback?.analysis) || 'Practice a clear answer, get one useful correction, and try again.'}</p><button className="primary-button" onClick={()=>setView('practice')}>{topic?'Resume practice':'Start a practice'}</button></section>
        <div className="home-grid">
          <section className="home-panel"><h2>Progress</h2><div className="score-row"><div><strong>{sessions.length}</strong><span>Sessions</span></div><div><strong>{weeklyPracticeDays}/3</strong><span>Days in the last 7 days</span></div></div><p>{sessions.length?'Keep practicing to build your speaking habit.':'Finish a session to start seeing your progress.'}</p><button className="text-button" onClick={()=>setView('progress')}>See your progress →</button></section>
          <section className="home-panel"><h2>Feedback</h2><p>{nextStep(feedback?.analysis) || 'Record a speech, then request feedback to discover what works and what to try next.'}</p><button className="text-button" onClick={()=>setView('practice')}>Start a practice session →</button>{isAuthenticated&&<button className="text-button" onClick={onOpenRecordings}>Your recordings →</button>}</section>
          <section className="home-panel"><h2>Daily leaderboard</h2><DailyChallengeLeaderboard/><button className="text-button" onClick={()=>setView('daily-challenge')}>Open daily challenge →</button></section>
        </div>
        <section className="membership-strip"><div><h2>Practice is free.</h2><p>Topics, timers, recording and replay. Sign in for one practice analysis and one daily-challenge analysis each day.</p></div><div><span className="quiet-badge">Subscription · coming soon</span><p>Subscription access supports more AI practice. Paid plans are not available for purchase yet.</p></div></section>
      </> : view==='progress' ? <StatsScreen sessions={sessions} user={user} isAuthenticated={isAuthenticated} onSignUp={onSignUp} /> : view==='daily-challenge' ? <>
        <DailyChallengeScreen
          onRemoveSavedFeedback={onRemoveSavedFeedback}
          onScore={onScore}
          goal={settings.goal}
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
        <RecoveryTakes user={user} onRecover={onRecover} />
        <div className={`practice-grid${practiceSettingsExpanded ? ' is-settings-open' : ''}`}><section className={`practice-setup${practiceSettingsExpanded ? '' : ' is-collapsed'}`} aria-label="Practice settings"><div className="practice-settings-heading"><div className="practice-settings-summary"><h2 className="sr-only">Practice settings</h2><PracticeSummary topicType={topicType} difficulty={difficulty} seconds={settings.speechSeconds}/></div><button className="practice-settings-toggle" type="button" aria-expanded={practiceSettingsExpanded} aria-label={practiceSettingsExpanded ? "Close practice settings" : "Edit practice settings"} aria-controls="practice-settings-content" onClick={() => setPracticeSettingsExpanded((expanded) => !expanded)}><span>{practiceSettingsExpanded ? "Done" : "Edit"}</span></button></div><div id="practice-settings-content" className="practice-settings-content" hidden={!practiceSettingsExpanded}><Tabs difficulty={difficulty} onDifficultyChange={onDifficultyChange} topicType={topicType} onTopicTypeChange={onTopicTypeChange}/><PracticeSettings topicType={topicType} settings={settings} onSettingsChange={onSettingsChange}/></div></section><section className="prompt-workspace"><h2>{topic ? 'Your topic' : 'Choose a topic'}</h2>{difficulty ? <WheelSelector skill={practiceSkill} difficulty={difficulty} topicType={topicType} previousTopic={topic} onSelectTopic={onTopicSelect} onContinueToResearch={onContinueToResearch} /> : <p className="home-panel">Choose a difficulty to find your next topic.</p>}</section></div>
      </>}
      </div>{['home','practice','progress'].includes(view) && <GuestAdSpace isAuthenticated={isAuthenticated} placement={view}/>}<footer className="app-footer"><span>SimplyArticulate</span></footer>
    </section>
  </main>;
}












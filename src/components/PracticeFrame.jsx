import MainNavigation from './MainNavigation.jsx';
import PracticeStages from './PracticeStages.jsx';
import './practiceFrame.css';

export default function PracticeFrame({stage,includePreparation,user,onViewChange,onOpenSettings,onSignUp,children}) {
 return <main tabIndex={-1} id="main-content" className="screen difficulty-screen"><section className="generator-card app-shell">
  <MainNavigation view="practice" onViewChange={onViewChange} isAuthenticated={Boolean(user)} user={user} onOpenSettings={onOpenSettings} onSignUp={onSignUp}/>
  <div className="destination-topline has-practice-stages"><h1 className="destination-heading" tabIndex={-1}>Speaking practice</h1><PracticeStages current={stage} includePreparation={includePreparation}/></div>
  <div className="practice-session-content">{children}</div>
  <footer className="app-footer"><span>SimplyArticulate</span></footer>
 </section></main>;
}

import SiteFooter from './SiteFooter.jsx';
import {useLayoutEffect,useRef} from 'react';
import GuestAdSpace from './GuestAdSpace.jsx';
import MainNavigation from './MainNavigation.jsx';
import PracticeStages from './PracticeStages.jsx';
import './practiceFrame.css';

export default function PracticeFrame({stage,includePreparation,user,onViewChange,onOpenSettings,onSignUp,children}) {
 const heading=useRef(null);
 useLayoutEffect(()=>{heading.current?.focus({preventScroll:true});},[stage]);
 return <main tabIndex={-1} id="main-content" className="screen difficulty-screen compact-practice"><section className="generator-card app-shell">
  <MainNavigation view="practice" onViewChange={onViewChange} isAuthenticated={Boolean(user)} user={user} onOpenSettings={onOpenSettings} onSignUp={onSignUp}/>
  <div className="destination-topline has-practice-stages"><h1 ref={heading} className="destination-heading" tabIndex={-1}>Speaking practice</h1><PracticeStages current={stage} includePreparation={includePreparation}/></div>
  <div className="practice-session-content">{children}</div>
  {stage === 'review' && <GuestAdSpace isAuthenticated={Boolean(user)} placement="review"/>}
  <SiteFooter/>
 </section></main>;
}


import './mainNavigation.css';
import SubscriptionSurvey from './SubscriptionSurvey.jsx';
export default function MainNavigation({view,onViewChange,isAuthenticated,onOpenSettings,onSignUp,user}) {
 return <header className="app-nav"><span className="wordmark">SimplyArticulate</span><nav aria-label="Main navigation"><button aria-current={view==='home'?'page':undefined} onClick={()=>onViewChange('home')}>Home</button><button aria-current={view==='daily-challenge'?'page':undefined} onClick={()=>onViewChange('daily-challenge')}>Daily Challenge</button><button aria-current={view==='practice'?'page':undefined} onClick={()=>onViewChange('practice')}>Practice</button><button aria-current={view==='progress'?'page':undefined} onClick={()=>onViewChange('progress')}>Progress</button><button aria-current={view==='speech-debate'?'page':undefined} onClick={()=>onViewChange('speech-debate')}>Speech &amp; Debate</button></nav><span className="nav-scroll-hint" aria-hidden="true">Swipe the tabs for more sections →</span><button className={`secondary-button nav-account${isAuthenticated ? '' : ' nav-sign-in'}`} onClick={isAuthenticated?onOpenSettings:onSignUp}>{isAuthenticated?<><span aria-hidden="true">⚙︎</span><span>Settings</span></>:<><span>Sign in</span><span className="sign-in-arrow" aria-hidden="true">↗</span></>}</button><SubscriptionSurvey user={user} onSignUp={onSignUp}/></header>;
}



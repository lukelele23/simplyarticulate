import {useEffect,useRef,useState} from 'react';
import UsernameForm from '../components/UsernameForm.jsx';
export default function UsernameScreen({user,onComplete,onSignOut}){
 const heading=useRef(null),[error,setError]=useState(''),[leaving,setLeaving]=useState(false);
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
 async function leave(){setLeaving(true);setError('');try{await onSignOut();}catch{setError('Could not sign out. Please try again.');}finally{setLeaving(false);}}
 return <main id="main-content" className="username-onboarding"><section className="username-onboarding-card" aria-labelledby="choose-username-title"><p className="eyebrow">WELCOME TO SIMPLYARTICULATE</p><h1 id="choose-username-title" tabIndex={-1} ref={heading}>Choose your username</h1><p>Pick a name for your account. You only need to do this once, and you can change it in Settings.</p><UsernameForm key={user.id} user={user} onSaved={onComplete}/><p>Your username is shown publicly only if you choose to join a leaderboard. Your Google name stays separate.</p><button type="button" className="text-button" onClick={leave} disabled={leaving}>{leaving?'Signing out…':'Sign out'}</button>{error&&<p role="alert">{error}</p>}</section></main>;
}

import {useState} from 'react';

export default function LoginScreen({onGoogleSignIn,onBack,error}) {
 const [busy,setBusy]=useState(false);
 const [failure,setFailure]=useState('');
 async function googleSignIn(){if(busy)return;setBusy(true);setFailure('');try{await onGoogleSignIn();}catch(cause){setFailure(cause.message||'Google sign-in could not be started.');}finally{setBusy(false);}}
 return <main className="screen"><section className="auth-card" aria-labelledby="login-title"><span className="auth-brand">SimplyArticulate</span><h1 id="login-title">Welcome to your practice space.</h1><p>Sign in with Google to save your progress across devices.</p>
 {(failure||error)&&<p className="analysis-error" role="alert">{failure||error}</p>}
 <button type="button" className="primary-button" disabled={busy} onClick={googleSignIn}>{busy?'Connecting…':'Continue with Google'}</button><button type="button" className="text-button" disabled={busy} onClick={onBack}>Continue without signing in</button>
 </section></main>;
}

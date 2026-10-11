import {useState} from 'react';
import {supabase} from '../../utils/supabase.js';

export default function LoginScreen({onGoogleSignIn,onBack,error,auth=supabase.auth}) {
 const [email,setEmail]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [failure,setFailure]=useState('');
 async function emailSignIn(event){event.preventDefault();if(busy)return;setBusy(true);setFailure('');setNotice('');
  try{const {error}=await auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin,shouldCreateUser:true}});if(error)throw error;setNotice('Check your inbox for a secure sign-in link. Open it in this browser to sign in. If you do not see it, check your spam folder.');}
  catch(cause){setFailure(cause.message||'The sign-in email could not be sent. Please try again.');}finally{setBusy(false);}
 }
 async function googleSignIn(){if(busy)return;setBusy(true);setFailure('');try{await onGoogleSignIn();}catch(cause){setFailure(cause.message||'Google sign-in could not be started.');}finally{setBusy(false);}}
 return <main className="screen"><section className="auth-card" aria-labelledby="login-title"><span className="auth-brand">SimplyArticulate</span><h1 id="login-title">Welcome to your practice space.</h1><p>Sign in or create an account with a secure link sent to your email.</p>
 <form className="auth-form" onSubmit={emailSignIn}><label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} disabled={busy} placeholder="you@example.com"/></label><button type="submit" className="primary-button" disabled={busy}>{busy?'Connecting…':'Email me a sign-in link'}</button></form>
 {notice&&<p className="auth-notice" role="status">{notice}</p>}{(failure||error)&&<p className="analysis-error" role="alert">{failure||error}</p>}
 <div className="auth-divider">or</div><button type="button" className="secondary-button" disabled={busy} onClick={googleSignIn}>Continue with Google</button><p className="auth-small">Your sign-in link expires and can be used only once. SimplyArticulate never asks for your email password.</p><button type="button" className="text-button" disabled={busy} onClick={onBack}>Back to practice</button>
 </section></main>;
}

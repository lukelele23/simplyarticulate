import { useState } from 'react';
const prompts=['Explain a small habit that improved your day. Give one example.','Tell a friend about a mistake that taught you something.','Convince a friend to visit your favorite local place.'];
const features=[
 ['01','Find your starting point','Choose speech, research or debate topics and a difficulty that suits you. Set your preparation and speaking time.'],
 ['02','Hear yourself improve','Record a take, replay it and download your audio. Sign in to request a transcript, speaking metrics and AI coaching once per day in practice, with a separate daily-challenge analysis.'],
 ['03','Make a minute count','Take the daily one-minute challenge. After AI review, choose to join a leaderboard scored on relevance, organization, support and clarity.'],
 ['04','Prepare for the round','Practice with Lincoln–Douglas and Public Forum speech sequences, separate prep clocks and a clear round order.'],
];
export default function SplashScreen({onGoogleSignIn,onEmailSignIn,error,onTryDemo,onExplore}) {
 const [selectedPrompt,setSelectedPrompt]=useState(0);
 const [isSigningIn,setIsSigningIn]=useState(false);
 const [signInError,setSignInError]=useState('');
 async function signIn(){if(isSigningIn)return;setIsSigningIn(true);setSignInError('');try{await onGoogleSignIn();}catch(cause){setSignInError(cause.message||'Google sign-in could not be started. Please try again.');}finally{setIsSigningIn(false);}}
 return <main className="welcome-page splash-refresh"><div className="welcome-shell">
  <header className="splash-nav"><span className="splash-brand">SimplyArticulate<span className="splash-brand-dot" aria-hidden="true">.</span></span><div className="splash-sign-in"><button type="button" className="text-button" onClick={onEmailSignIn}>Sign in with email</button><button type="button" className="welcome-account-button splash-google" onClick={signIn} disabled={isSigningIn}><svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.43 38.05 47 31.96 47 24.55h-.02Z" />
              <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.54 2.56 10.78l7.97-6.19Z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
            </svg><span>{isSigningIn?'Connecting…':'Sign in with Google'}</span></button></div></header>
  {(signInError||error)&&<p className="welcome-error" role="alert">{signInError||error}</p>}
  <section className="splash-hero" aria-labelledby="splash-title">
   <div className="splash-hero-copy"><p className="splash-eyebrow">A LITTLE PRACTICE. A CLEARER VOICE.</p><h1 id="splash-title">You have something<br/>worth <em>saying.</em></h1><p className="splash-purpose">Everyone deserves the space to find their voice, shape their ideas and be understood. Start with a small moment of practice. Build from there.</p><div className="splash-actions"><button type="button" className="welcome-demo-button" onClick={()=>onTryDemo(prompts[selectedPrompt])}>Try a one-minute practice <span aria-hidden="true">↗</span></button><button type="button" className="text-button" onClick={onExplore}>Explore the practice space →</button></div><p className="splash-small">Recording and replay are free. No account needed to start.</p></div>
   <div className="splash-prompt-card"><div className="splash-card-top"><span>YOUR FIRST MINUTE</span><span className="splash-time">01:00</span></div><div className="splash-wave" aria-hidden="true">{[18,32,54,26,72,44,88,60,34,76,50,24,62,38,18].map((height,index)=><i key={index} style={{height:height+'px'}}/>)}</div><p className="splash-prompt-label">Try talking about this</p><h2>{prompts[selectedPrompt]}</h2><div className="splash-card-bottom"><button type="button" className="text-button" onClick={()=>setSelectedPrompt(index=>(index+1)%prompts.length)}>Another prompt ↻</button><span>Just you. One idea. One minute.</span></div></div>
  </section>
  <section className="splash-features" aria-labelledby="splash-features-title"><div className="splash-section-intro"><p className="splash-eyebrow">FROM FIRST TAKE TO NEXT STEP</p><h2 id="splash-features-title">A place to practice.<br/>A reason to come back.</h2><p>Real tools for everyday speaking, classroom presentations and debate preparation.</p></div><div className="splash-feature-grid">{features.map(([number,title,copy])=><article key={number}><span className="splash-feature-number">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
  <section className="splash-closing"><div><p className="splash-eyebrow">PROGRESS STARTS WITH SHOWING UP</p><h2>Make room for your next idea.</h2><p>Keep a practice history, save favorite topics and choose what to work on next.</p></div><button type="button" className="welcome-demo-button" onClick={onExplore}>Find a topic <span aria-hidden="true">→</span></button></section>
  <footer className="splash-footer"><span>SimplyArticulate</span><p>Practice at your pace. Share on your terms.</p><span>Sign in for one practice analysis and one daily-challenge analysis per day.</span></footer>
 </div></main>;
}

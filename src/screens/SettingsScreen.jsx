import BillingPanel from '../components/BillingPanel.jsx';
import UsernameForm from '../components/UsernameForm.jsx';
import {removeAccountDrafts} from '../lib/drafts.js';
import {analysisRequest} from '../lib/speechAnalysis.js';
import { useEffect, useState } from "react";
import { supabase } from "../../utils/supabase.js";


function getAccountName(user) {
  const metadata = user?.user_metadata || {};
  return (
    metadata.username ||
    metadata.full_name ||
    metadata.name ||
    user?.email ||
    "your account"
  );
}

export default function SettingsScreen({
  user,
  onBack,
  backLabel="Back",
  onSignOut,
  onSignUp,
  onAccountDeleted,
}) {
  const [isWorking, setIsWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionOperation]=useState(()=>{try{return sessionStorage.getItem('sa-delete-operation:'+user?.id)||crypto.randomUUID();}catch{return crypto.randomUUID();}});
  const [removeRecovery,setRemoveRecovery]=useState(false);
  const [reauthCode,setReauthCode]=useState(''),[reauthSent,setReauthSent]=useState(false);
  const [deletionName, setDeletionName] = useState("");
  const accountName = getAccountName(user);
  const deletionVerified = Boolean(user) && deletionName === accountName;
  useEffect(() => {
    setDeletionName("");
    setConfirmDelete(false);
  }, [user?.id, accountName]);
  const [errorMessage, setErrorMessage] = useState("");

  async function runAccountAction(action) {
    setIsWorking(true);
    setErrorMessage("");
    try {
      await action();
    } catch (error) {
      console.error("Account action failed:", error);
      setErrorMessage(error.message || "The account action could not be completed.");
    } finally {
      setIsWorking(false);
    }
  }

  async function deleteAccount() {
    if (isWorking || !confirmDelete || !deletionVerified) return;
    setIsWorking(true);
    setIsDeleting(true);
    setErrorMessage("");
    try {
      try{sessionStorage.setItem('sa-delete-operation:'+user.id,deletionOperation);}catch{}
      let data,error;
      if(import.meta.env.VITE_ANALYSIS_SERVICE==='supabase'){const result=await supabase.functions.invoke('delete-account',{body:{confirmation:deletionName,operationId:deletionOperation}});data=result.data;error=result.error;}
      else data=await analysisRequest('/delete-account',{method:'POST',body:{confirmation:deletionName}});
      if (error || data?.error || !data?.message) {
        throw new Error(data?.error || "Deletion could not finish. Some data may already be removed. Verify your sign-in and retry to resume cleanup.");
      }
      let cleanupWarning='';if(removeRecovery)await removeAccountDrafts(user.id).catch(()=>{cleanupWarning='Your account was deleted, but this device’s recovery copies could not be removed.';});
      // Remove only this account's cached progress; preserve other accounts and audio recovery.
      try {
        for (const key of [`sa-survey-completed:${user.id}`, `sa-sync:session:${user.id}`,  `sa-sync:favorite:${user.id}`, `simply-articulate-sessions:${user.id}`, `simply-articulate-favorites:${user.id}`]) {
          localStorage.removeItem(key);
        }
      } catch { /* Account deletion remains successful when browser storage is unavailable. */ }
      try{sessionStorage.removeItem('sa-delete-operation:'+user.id);}catch{}
      await supabase.auth.signOut({ scope: "local" });
      onAccountDeleted?.(cleanupWarning);
    } catch (error) {
      setErrorMessage(error.message || "Could not delete your account. Please try again.");
    } finally {
      setIsWorking(false);
      setIsDeleting(false);
    }
  }
  return (
    <main tabIndex={-1} id="main-content" className="screen min-h-screen">
      <section className="settings-card grid w-full max-w-xl gap-6 rounded-[28px] border border-line bg-panel/95 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.4),inset_0_1px_rgba(255,255,255,0.04)] sm:p-8">
        <header className="grid gap-2">
          <nav aria-label="Current section"><h1 tabIndex={-1}>Settings</h1></nav>
          {user ? (
            <p className="m-0 text-sm text-[#b9bbbd]">
              Signed in as {getAccountName(user)}
            </p>
          ) : (
            <p className="m-0 text-sm text-[#b9bbbd]">
              Sign in to manage your account.
            </p>
          )}
        </header>

        {errorMessage && (
          <p
            role="alert"
            className="m-0 rounded-lg border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-200"
          >
            {errorMessage}
          </p>
        )}

        {user ? (
          <div className="grid gap-3">
            <BillingPanel user={user} onSignUp={onSignUp}/>
            <section className="username-settings" aria-labelledby="settings-username-title"><h2 id="settings-username-title">Your username</h2><p>Your name is public only when you join a leaderboard. Existing leaderboard entries keep the name used when they were posted.</p><UsernameForm key={user.id} user={user} editing/></section>
            <button
              type="button"
              onClick={() => runAccountAction(onSignOut)}
              disabled={isWorking}
              className="secondary-button w-full"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
                <path d="M7.5 5.5V4.75A1.75 1.75 0 0 1 9.25 3h6A1.75 1.75 0 0 1 17 4.75v10.5A1.75 1.75 0 0 1 15.25 17h-6A1.75 1.75 0 0 1 7.5 15.25v-.75M3.5 10h8.5m0 0-2.5-2.5M12 10l-2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isWorking && !isDeleting ? "Working…" : "Sign out"}
            </button>
            <section className="grid gap-3 rounded-lg border border-red-400/40 p-4" aria-labelledby="delete-account-heading">
              <h2 id="delete-account-heading" className="m-0 text-lg font-bold">Delete account</h2>
              <p className="m-0 text-sm text-[#b9bbbd]">Permanently delete your account, synced progress, survey response, and saved recordings. This cannot be undone. Download any recordings you want to keep first. Local recovery copies can include audio, transcripts and coaching. Other devices need their own local cleanup.</p>
              {confirmDelete ? <>
                <h3 className="m-0 text-base font-bold">Verify this deletion</h3>
                <p>For account security, sign in again if your last sign-in was more than ten minutes ago.</p>
                <button className="secondary-button" disabled={isWorking} onClick={()=>runAccountAction(async()=>{if(user.app_metadata?.provider==='google'){const r=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/settings',queryParams:{prompt:'select_account'}}});if(r.error)throw r.error;}else{const r=await supabase.auth.signInWithOtp({email:user.email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+'/settings'}});if(r.error)throw r.error;setReauthSent(true);}})}>Verify sign-in again</button>
                {reauthSent&&<><label>Verification code<input value={reauthCode} autoComplete="one-time-code" inputMode="numeric" onChange={e=>setReauthCode(e.target.value)}/></label><button className="secondary-button" disabled={isWorking||!reauthCode} onClick={()=>runAccountAction(async()=>{const r=await supabase.auth.verifyOtp({email:user.email,token:reauthCode,type:'email'});if(r.error)throw r.error;setReauthSent(false);})}>Confirm sign-in code</button><p>Alternatively, follow the email link to return to Settings.</p></>}
                <label><input type="checkbox" checked={removeRecovery} onChange={e=>setRemoveRecovery(e.target.checked)} disabled={isWorking}/> Also remove this account’s recovery audio, transcripts and coaching from this device</label>
                <p id="deletion-name-help" className="m-0 text-sm text-[#b9bbbd]">Type {user.user_metadata?.username ? "your username" : "your account name"} exactly as shown to confirm: <strong className="text-white">{accountName}</strong></p>
                <label htmlFor="deletion-name" className="text-sm font-bold">{user.user_metadata?.username ? "Username" : "Account name"}</label>
                <input id="deletion-name" type="text" value={deletionName} onChange={(event) => setDeletionName(event.target.value)} disabled={isWorking} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="deletion-name-help" className="min-h-11 w-full rounded-lg border border-[#9da1a3]/70 bg-[#202224] px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f7b2b0]" />
                <button type="button" className="secondary-button danger-button danger-button-solid" disabled={isWorking || !deletionVerified} onClick={deleteAccount}>{isDeleting ? "Deleting account…" : "Permanently delete account"}</button>
                <button type="button" className="secondary-button" disabled={isWorking} onClick={() => { setConfirmDelete(false); setDeletionName(""); }}>Cancel</button>
              </> : <button type="button" className="secondary-button danger-button" disabled={isWorking} onClick={() => { setDeletionName(""); setConfirmDelete(true); }}>Delete account</button>}
            </section>          </div>
        ) : (
          <button
            type="button"
            onClick={onSignUp}
            className="min-h-11 rounded-lg border border-[#9da1a3] bg-[#c7c9cb] px-4 py-2.5 font-bold text-[#202224] transition-colors hover:bg-[#d8d9db] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#347db8]"
          >
            Sign in or sign up
          </button>
        )}

        <button
          type="button"
          disabled={isWorking}
          onClick={onBack}
          className="secondary-button justify-self-start"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
            <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </button>
      </section>
    </main>
  );
}

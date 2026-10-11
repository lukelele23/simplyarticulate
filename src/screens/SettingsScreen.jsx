import { useState } from "react";


function getAccountName(user) {
  const metadata = user?.user_metadata || {};
  return (
    metadata.full_name ||
    metadata.name ||
    user?.email ||
    "your account"
  );
}

export default function SettingsScreen({
  user,
  onBack,
  onSignOut,
  onSignUp,
}) {
  const [isWorking, setIsWorking] = useState(false);
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

  return (
    <main className="screen min-h-screen">
      <section className="grid w-full max-w-xl gap-6 rounded-[28px] border border-line bg-panel/95 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.4),inset_0_1px_rgba(255,255,255,0.04)] sm:p-8">
        <header className="grid gap-2">
          <nav aria-label="Current section"><strong aria-current="page">Settings</strong></nav>
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
            <button
              type="button"
              onClick={() => runAccountAction(onSignOut)}
              disabled={isWorking}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#f39a9a]/60 bg-gradient-to-r from-[#3d1a1d] to-[#241517] px-4 py-2.5 text-sm font-bold text-[#ffe9ea] shadow-[0_10px_22px_rgba(120,30,36,0.24)] transition-[background,border-color,box-shadow,transform] hover:-translate-y-px hover:border-[#f7b2b0] hover:from-[#4e2023] hover:to-[#2f1719] hover:shadow-[0_12px_26px_rgba(120,30,36,0.3)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f7b2b0]"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
                <path d="M7.5 5.5V4.75A1.75 1.75 0 0 1 9.25 3h6A1.75 1.75 0 0 1 17 4.75v10.5A1.75 1.75 0 0 1 15.25 17h-6A1.75 1.75 0 0 1 7.5 15.25v-.75M3.5 10h8.5m0 0-2.5-2.5M12 10l-2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isWorking ? "Signing out..." : "Sign out"}
            </button>
          </div>
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
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-lg border border-[#9da1a3]/70 bg-gradient-to-r from-[#3a3c3e] to-[#303234] px-4 py-2.5 text-sm font-bold text-[#e5f4ff] shadow-[0_5px_16px_rgba(45,111,163,0.2)] transition-[background,border-color,box-shadow,transform] hover:-translate-y-px hover:border-[#d8d9db] hover:from-[#205781] hover:to-[#3a3c3e] hover:shadow-[0_8px_20px_rgba(45,111,163,0.34)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d0d2d4]"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
            <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Practice
        </button>
      </section>
    </main>
  );
}

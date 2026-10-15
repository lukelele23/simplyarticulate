import {weeklyDays} from '../lib/practice.js';
import LearningProgress from './LearningProgress.jsx';
import SpeechStars from './SpeechStars.jsx';
import SavedFeedback from './SavedFeedback.jsx';
function getLocalDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPracticeStreak(sessions) {
  const dates = new Set(sessions.map((session) => session.date));
  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const today = getLocalDateKey(todayDate);
  const yesterday = getLocalDateKey(yesterdayDate);
  let cursor = dates.has(today) ? today : dates.has(yesterday) ? yesterday : null;
  if (!cursor) return 0;

  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    const [year, month, day] = cursor.split("-").map(Number);
    cursor = getLocalDateKey(new Date(year, month - 1, day - 1));
  }
  return streak;
}

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  const profileName = [
    metadata.full_name,
    metadata.name,
    [metadata.given_name, metadata.family_name]
      .filter((part) => typeof part === "string")
      .join(" "),
  ].find((name) => typeof name === "string" && name.trim());
  return profileName || user?.email || "your account";
}

export default function PracticeDashboard({
  sessions,
  user,
  isAuthenticated,
  onSignUp,
}) {
  const streak = getPracticeStreak(sessions);
  const weeklyPracticeCount = weeklyDays(sessions);

  return (
    <section className="grid w-full gap-4 rounded-2xl border border-line bg-ink/40 p-4 text-left sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <h2 className="m-0 text-base font-bold text-[#f3f5f7]">
            {isAuthenticated ? "Your personal statistics" : "Your practice"}
          </h2>
          {isAuthenticated ? (
            <p className="m-0 text-xs text-[#b9bbbd]">
              Signed in as {getDisplayName(user)}
            </p>
          ) : (
            <p className="m-0 text-xs text-[#b9bbbd]">
              Settings save on this device. Personal statistics are available after sign-up.
            </p>
          )}
        </div>
      </header>

      {!isAuthenticated && <div className="guest-progress-actions"><p>Sign in to save your scores and review progress across devices. Recording and replay are available without an account.</p><button type="button" className="primary-button" onClick={onSignUp}>Sign in to save progress</button><a className="text-button" href="/practice">Practice without signing in</a></div>}
      {isAuthenticated && (
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          aria-label="Personal practice statistics"
          role="group"
        >
          <article className="rounded-xl border border-line bg-gradient-to-br from-panel-raised to-panel p-4 shadow-[inset_0_1px_rgba(255,255,255,0.035)]">
            <p className="m-0 text-3xl font-extrabold tabular-nums tracking-tight text-copy">
              {sessions.length}
            </p>
            <p className="mb-0 mt-1 text-xs font-semibold text-[#b9bbbd]">
              speeches completed
            </p>
          </article>
          <article className="rounded-xl border border-line bg-gradient-to-br from-panel-raised to-panel p-4 shadow-[inset_0_1px_rgba(255,255,255,0.035)]">
            <p className="m-0 text-3xl font-extrabold tabular-nums tracking-tight text-mint">
              {streak}
            </p>
            <p className="mb-0 mt-1 text-xs font-semibold text-[#b9bbbd]">
              day streak
            </p>
          </article>
          <article className="rounded-xl border border-line bg-gradient-to-br from-panel-raised to-panel p-4 shadow-[inset_0_1px_rgba(255,255,255,0.035)]">
            <p className="m-0 text-3xl font-extrabold tabular-nums tracking-tight text-accent">
              {weeklyPracticeCount}/3
            </p>
            <p className="mb-0 mt-1 text-xs font-semibold text-[#b9bbbd]">
              days in the last 7 days
            </p>
          </article>
        </div>
      )}

      {isAuthenticated && <LearningProgress sessions={sessions} />}
      {isAuthenticated && <details className="rounded-lg border border-[#494b4d] bg-[#262729]">
        <summary className="cursor-pointer px-3 py-2.5 font-semibold text-[#d8d9db]">
          Recent practice (latest {Math.min(50,sessions.length)} of {sessions.length})
        </summary>
        <div className="grid gap-2 border-t border-[#494b4d] p-3">
          {sessions.length ? (
            sessions.slice(0, 50).map((session) => (
              <article
                key={session.id}
                className="rounded-md bg-[#222830] px-3 py-2"
              >
                <p className="m-0 font-semibold text-[#f3f5f7]">{session.topic}</p>
                <p className="mb-0 mt-1 text-xs text-[#b9bbbd]">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                  }).format(new Date(`${session.date}T12:00:00`))}
                </p>
                <SpeechStars rating={session.rating || session.analysis?.coaching?.rating} />
                {session.analysis && <details className="analysis-history">
                  <summary>Saved speech feedback</summary>
                  <SavedFeedback report={session.analysis} />
                </details>}
              </article>
            ))
          ) : (
            <p className="m-0 text-sm text-[#b9bbbd]">
              Completed speeches will appear here.
            </p>
          )}
        </div>
      </details>}


    </section>
  );
}

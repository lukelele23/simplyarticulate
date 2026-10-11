import ProgressInsights from '../components/ProgressInsights.jsx';
import PracticeDashboard from "../components/PracticeDashboard.jsx";

export default function StatsScreen({
  sessions,
  favorites,
  onPracticeFavorite,
  onRemoveFavorite,
  user,
  isAuthenticated,
  onSignUp,
  onBack,
  onPracticePlan,
}) {
  return (
    <main className="screen min-h-screen">
      <section className="grid w-full max-w-3xl gap-6 rounded-[28px] border border-line bg-panel/95 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.4),inset_0_1px_rgba(255,255,255,0.04)] sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Current section"><strong aria-current="page">Progress</strong></nav>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#9da1a3]/70 bg-gradient-to-r from-[#3a3c3e] to-[#303234] px-4 py-2.5 text-sm font-bold text-[#e5f4ff] shadow-[0_5px_16px_rgba(45,111,163,0.2)] transition-[background,border-color,box-shadow,transform] hover:-translate-y-px hover:border-[#d8d9db] hover:from-[#205781] hover:to-[#3a3c3e] hover:shadow-[0_8px_20px_rgba(45,111,163,0.34)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d0d2d4]"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
              <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Practice
          </button>
        </header>
        <ProgressInsights sessions={sessions} onPractice={onPracticePlan} />
        <PracticeDashboard
          sessions={sessions}
          favorites={favorites}
          onPracticeFavorite={onPracticeFavorite}
          onRemoveFavorite={onRemoveFavorite}
          user={user}
          isAuthenticated={isAuthenticated}
          onSignUp={onSignUp}
        />
      </section>
    </main>
  );
}

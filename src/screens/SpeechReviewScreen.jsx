import { useCallback, useState } from 'react';
import SaveAudio from '../components/SaveAudio.jsx';
import TakeComparison from '../components/TakeComparison.jsx';
import { lazy, Suspense } from 'react';
const SpeechAnalysis = lazy(() => import('../components/SpeechAnalysis.jsx'));

export default function SpeechReviewScreen({
  user, onSignUp, onRetry, previousTake, focus, onResult, initialReport,
  topic,
  onSave,
  recording,
  analysisMetadata,
  onAnalysisChange,
}) {
  const [report,setReport]=useState(initialReport || null);
  const receiveReport=useCallback(value=>{setReport(value);onResult?.(value);},[onResult]);
  return (
    <main className="screen timer-screen">
      <section className="grid w-full max-w-2xl gap-5 rounded-[28px] border border-line bg-panel/95 p-5 text-left shadow-[0_32px_90px_rgba(0,0,0,0.4),inset_0_1px_rgba(255,255,255,0.04)] sm:p-8">
        <header className="grid gap-2">
          <p className="eyebrow">SPEECH COMPLETE</p>
          <h1 className="m-0 text-3xl font-bold text-[#f3f5f7]">Review your practice</h1>
          <p className="timer-topic">{topic}</p>
        </header>

        {recording && <Suspense fallback={<p className="analysis-muted" role="status">Loading speech analysis…</p>}><SpeechAnalysis recording={recording} metadata={analysisMetadata} user={user} onSignUp={onSignUp} onRetry={onRetry} onReportChange={onAnalysisChange} onResult={receiveReport} initialReport={initialReport} /></Suspense>}

        {recording && <SaveAudio recording={recording} user={user} topic={topic} difficulty={analysisMetadata.difficulty}/>}
        <TakeComparison previous={previousTake} recording={recording} report={report} focus={focus}/>
        <div className="grid gap-3">
          <button
            className="primary-button"
            type="button"
            onClick={onSave}
            disabled={!recording}
          >
            {user ? "Save progress" : "Finish practice"}
          </button>
          <p className="analysis-muted">Save progress keeps the date, topic and duration. Feedback is included only if you select “Keep this transcript and feedback.” Audio is a separate choice above.</p>
        </div>
      </section>
    </main>
  );
}

import PracticeStages from '../components/PracticeStages.jsx';
import { useCallback, useState } from 'react';
import SaveAudio from '../components/SaveAudio.jsx';
import TakeComparison from '../components/TakeComparison.jsx';
import { lazy, Suspense } from 'react';
const SpeechAnalysis = lazy(() => import('../components/SpeechAnalysis.jsx'));

export default function SpeechReviewScreen({
  practiceSessions, onUpdatePracticeActions,
  embedded = false,
  includePreparation = false,
  onRemoveSavedFeedback, onScore, user, onSignUp, onRetry, previousTake, focus, onResult, initialReport,
  topic,
  onSave,
  recording,
  analysisMetadata,
  onAnalysisChange,
}) {
  const [report,setReport]=useState(initialReport || null);
  const receiveReport=useCallback(value=>{setReport(value);onResult?.(value);},[onResult]);
  const Container = embedded ? 'div' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  return (
    <Container tabIndex={embedded ? undefined : -1} id={embedded ? undefined : "main-content"} className={embedded ? "practice-session-screen" : "screen timer-screen"}>
      <section className="practice-review-card grid w-full max-w-2xl gap-5 rounded-[28px] border border-line bg-panel/95 p-5 text-left shadow-[0_32px_90px_rgba(0,0,0,0.4),inset_0_1px_rgba(255,255,255,0.04)] sm:p-8">
        {!embedded && <PracticeStages current="review" includePreparation={includePreparation}/>}<header className="grid gap-2">
          <p className="eyebrow">SPEECH COMPLETE</p>
          <Heading className="m-0 text-3xl font-bold text-[#f3f5f7]">Review your practice</Heading>
          <p className="timer-topic">{topic}</p>
        </header>

        {recording && <Suspense fallback={<p className="analysis-muted" role="status">Loading speech analysis…</p>}><SpeechAnalysis practiceSessions={practiceSessions} onUpdatePracticeActions={onUpdatePracticeActions} onRemoveSavedFeedback={onRemoveSavedFeedback} onScore={onScore} recording={recording} metadata={analysisMetadata} user={user} onSignUp={onSignUp} onRetry={onRetry} onFeedbackPreference={onAnalysisChange} onReportChange={onAnalysisChange} onResult={receiveReport} initialReport={initialReport} /></Suspense>}

        {recording && <SaveAudio recording={recording} user={user} topic={topic} difficulty={analysisMetadata.difficulty}/>}
        <TakeComparison previous={previousTake} recording={recording} report={report} focus={focus}/>
        <div className="grid gap-3">
          <button
            className="primary-button"
            type="button"
            onClick={onSave}
            disabled={!recording}
          >
            {user ? "Done — save practice" : "Finish practice"}
          </button>
          <p className="analysis-muted">Your star score saves automatically after analysis. Save progress keeps the date, topic and duration. Full feedback is included only if you choose to keep it. Audio is a separate choice above.</p>
        </div>
      </section>
    </Container>
  );
}




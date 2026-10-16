import PracticeActionPlan from './PracticeActionPlan.jsx';
import SpeechStars from './SpeechStars.jsx';
import FrameworkFeedback from './FrameworkFeedback.jsx';

export default function SavedFeedback({ report, actionState, onActionChange, topic }) {
  const c = report?.coaching;
  if (!report) return null;
  return <div className="analysis-history">
    <p>{report.metrics?.wordsPerMinute ?? '—'} words/min · {report.metrics?.fillerCount ?? '—'} fillers · {report.metrics?.estimatedPauses?.length ?? 0} estimated pauses</p>
    <details><summary>Original transcript</summary><p>{report.transcript}</p></details>
    {c?.argumentLogic && c?.structureLanguage ? <FrameworkFeedback coaching={c} /> : c ? <>
      <p>{c.summary}</p>{c.strength && <><p><strong>What worked:</strong> {c.strength.observation}</p><blockquote>{c.strength.quote}</blockquote></>}
      <p><strong>Organization:</strong> {c.organization}</p><p><strong>Relevance:</strong> {c.relevance}</p>
      <ul>{(c.improvements || []).map((item, i) => <li key={i}>{item}</li>)}</ul><p><strong>Next exercise:</strong> {c.nextExercise}</p>
    </> : <p>{report.coachingError || 'Written coaching unavailable.'}</p>}
    {onActionChange && <PracticeActionPlan report={report} state={actionState} onChange={onActionChange} topic={topic}/>}
    <SpeechStars rating={c?.rating} />
  </div>;
}

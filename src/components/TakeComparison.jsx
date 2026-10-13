import { useEffect, useState } from 'react';
import { fillerRate, nextStep } from '../lib/reports.js';

function AudioTake({ take, label }) {
  const [url,setUrl] = useState('');
  useEffect(() => { if(!take?.recording?.blob)return; const value=URL.createObjectURL(take.recording.blob); setUrl(value); return()=>URL.revokeObjectURL(value); },[take?.recording?.blob]);
  return <div><h4>{label}</h4>{url && <audio controls preload="metadata" src={url} aria-label={label}/>}</div>;
}
export default function TakeComparison({ previous, recording, report, focus }) {
  if (!previous) return null;
  const a=previous.report?.metrics, b=report?.metrics;
  const rows=[['Pace (words/min)',a?.wordsPerMinute,b?.wordsPerMinute],['Fillers per 100 words',fillerRate(a),fillerRate(b)]];
  return <section className="take-comparison"><h2>Compare your takes</h2><p>Focus: {focus || nextStep(previous.report) || 'Notice what changed in your second take.'}</p>{report?.coaching?.focusReview && <section><h3>Your practiced improvement</h3><p>{report.coaching.focusReview.assessment}</p><blockquote>Before: {report.coaching.focusReview.previousQuote}</blockquote><blockquote>Now: {report.coaching.focusReview.currentQuote}</blockquote></section>}<div className="comparison-audio"><AudioTake take={previous} label="Previous take"/><AudioTake take={{recording}} label="Current take"/></div><table><thead><tr><th>Measure</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>{rows.map(([name,left,right])=><tr key={name}><th>{name}</th><td>{left ?? '—'}</td><td>{right ?? '—'}</td><td>{Number.isFinite(left)&&Number.isFinite(right)?`${right-left>0?'+':''}${Math.round((right-left)*10)/10}`:'Analyze both takes'}</td></tr>)}</tbody></table><p>Pace changes are descriptive; faster does not always mean clearer. Listen for the improvement you practiced.</p>{report?.coaching && <p>Current next step: {nextStep(report)}</p>}</section>;
}

export function nextStep(report) {
  const c = report?.coaching;
  return c?.nextStep || c?.improvements?.[0] || c?.nextExercise || '';
}

export function reportText(report, topic = '') {
  if (!report) return 'No feedback available.';
  const lines = [topic, report.demo ? 'SAMPLE — not your recording' : 'SimplyArticulate practice feedback', '', 'Original transcript', report.transcript || '', '', 'Recording metrics'];
  const m = report.metrics || {};
  lines.push(`${m.wordCount ?? '—'} words · ${m.wordsPerMinute ?? '—'} words/min · ${m.fillerCount ?? '—'} fillers`, `Duration: ${m.durationSeconds ?? '—'} seconds`, '');
  const c = report.coaching;
  if(c?.focusReview)lines.push('Practiced improvement',c.focusReview.assessment,'Before: '+c.focusReview.previousQuote,'Now: '+c.focusReview.currentQuote,'');
  if (c?.rating) lines.push('Speech score: ' + c.rating.stars + '/10 stars', c.rating.reason, '');
  if (!c) lines.push(report.coachingError || 'Written coaching unavailable.');
  else if (c.argumentLogic) {
    lines.push(c.summary || '', '', 'Argument and logic', c.argumentLogic.assessment || '', 'Rhetorical structure', c.argumentLogic.rhetoricalStructure || '', 'Persuasiveness', c.argumentLogic.persuasiveness || '');
    for (const strength of c.argumentLogic.strengths || []) lines.push(`Strength: ${strength}`);
    const issues = (title, items) => { if (items?.length) lines.push('', title); for (const item of items || []) lines.push(`“${item.quote}”`, item.explanation || '', `Try: ${item.suggestion || ''}`); };
    issues('Strengthen your argument', c.argumentLogic.issues);
    for (const claim of c.argumentLogic.factChecks || []) {
      lines.push('', `Claim: ${claim.claimQuote}`, `Evidence: ${claim.status}`, claim.explanation || '', claim.correction || '');
      for (const id of claim.sourceIds || []) { const source = c.sources?.find(s => s.id === id); if (source) lines.push(`${source.title}: ${source.url}`); }
    }
    const s = c.structureLanguage || {};
    lines.push('', 'Structure and language', s.assessment || '', ...(s.strengths || []));
    issues('Sentence construction', s.sentenceStructure); issues('Word choice', s.wordChoice);
    for (const item of s.fillerOccurrences || []) lines.push(`Filler: “${item.quote}”`);
    for (const item of s.visibleDisfluencies || []) lines.push(`“${item.quote}”: ${item.explanation}`);
    lines.push(...(s.transcriptLimitations || []), '', 'Suggested revision', c.suggestedRevision || '', '', 'Next step', c.nextStep || '');
  } else lines.push(c.summary || '', c.strength?.observation || '', c.strength?.quote ? `Evidence: “${c.strength.quote}”` : '', c.organization || '', c.relevance || '', ...(c.improvements || []), c.nextExercise || '');
  return lines.join('\n');
}

export function fillerRate(metrics) {
  return metrics?.wordCount > 0 ? Math.round((metrics.fillerCount || 0) / metrics.wordCount * 1000) / 10 : null;
}

// Provider word timestamps are milliseconds. Never invent timing for legacy reports.
export function transcriptSegments(report) {
  const words = (report?.words || []).filter(w => typeof w.text === 'string' && Number.isFinite(w.start) && w.start >= 0 && Number.isFinite(w.end) && w.end >= w.start);
  const segments = []; let current = [];
  for (const word of words) {
    if (current.length && (word.start - current.at(-1).end > 1500 || current.length >= 24)) { segments.push(current); current = []; }
    current.push(word);
    if (/[.!?]$/.test(word.text)) { segments.push(current); current = []; }
  }
  if (current.length) segments.push(current);
  return segments.map(group => ({ startSeconds: group[0].start / 1000, text: group.map(w => w.text).join(' '), words: group }));
}

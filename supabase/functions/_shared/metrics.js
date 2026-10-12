const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'erm', 'er', 'hmm']);

export function measureSpeech(words, durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid recording duration.');
  const valid = (Array.isArray(words) ? words : []).filter((word) =>
    typeof word.text === 'string' && Number.isFinite(word.start) &&
    Number.isFinite(word.end) && word.start >= 0 && word.end >= word.start &&
    word.end <= duration * 1000 + 1000
  ).sort((a, b) => a.start - b.start);
  const fillers = {};
  const pauses = [];
  let previousEnd = 0;
  for (const [index, word] of valid.entries()) {
    const normalized = word.text.toLowerCase().replace(/[^a-z]/g, '');
    if (FILLERS.has(normalized)) fillers[normalized] = (fillers[normalized] || 0) + 1;
    if (index > 0 && word.start - previousEnd >= 1500) {
      pauses.push({ startSeconds: previousEnd / 1000, durationSeconds: (word.start - previousEnd) / 1000 });
    }
    previousEnd = Math.max(previousEnd, word.end);
  }
  return {
    durationSeconds: Math.round(duration * 10) / 10,
    wordCount: valid.length,
    wordsPerMinute: Math.round(valid.length / duration * 60),
    fillerCount: Object.values(fillers).reduce((sum, count) => sum + count, 0),
    fillers,
    estimatedPauses: pauses,
    pauseThresholdSeconds: 1.5,
  };
}

export function validateMetadata(value, maxSeconds = 600) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid practice details.');
  const durationSeconds = Number(value.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > maxSeconds) {
    throw new Error(`Record between 1 and ${maxSeconds} seconds.`);
  }
  if (typeof value.topic !== 'string' || !value.topic.trim() || value.topic.length > 500) {
    throw new Error('A topic of 1–500 characters is required.');
  }
  if (!['speech', 'debate', 'research', 'daily-challenge'].includes(value.format)) throw new Error('Invalid practice format.');
  if (!['easy', 'medium', 'hard'].includes(value.difficulty)) throw new Error('Invalid difficulty.');
  if (value.consent !== true) throw new Error('Permission to analyze this recording is required.');
  if (value.format === 'daily-challenge' && (!/^\d{4}-\d{2}-\d{2}$/.test(value.challengeId || '') || !/^[A-Za-z0-9_-]{3,24}$/.test(value.publicUsername || ''))) throw new Error('Choose a public username of 3–24 letters, numbers, underscores or hyphens for the daily challenge.');
  return {
    ...(value.format === 'daily-challenge' ? {challengeId:value.challengeId,publicUsername:value.publicUsername} : {}),
    topic: value.topic.trim(), format: value.format, difficulty: value.difficulty,
    debateSide: ['for', 'against', 'pro', 'con'].includes(value.debateSide) ? value.debateSide : null,
    durationSeconds,
  };
}



export function saveSpeechRating(current, { rating, recording, metadata }, date) {
  const items = Array.isArray(current) ? current : [];
  if (!Number.isInteger(rating?.stars) || rating.stars < 0 || rating.stars > 10) return items;
  const id = recording.draftId || recording.requestKey;
  if (!id) return items;
  const existing = items.find(item => item.id === id);
  const improvement=metadata.focusReview?{status:metadata.focusReview.status,assessment:metadata.focusReview.assessment}:existing?.improvement;
  if (existing && JSON.stringify(existing.rating) === JSON.stringify(rating) && JSON.stringify(existing.improvement)===JSON.stringify(improvement) && existing.goal===metadata.goal && existing.nextFocus===metadata.nextFocus && existing.analysisVersion===metadata.analysisVersion) return items;
  const session = { ...existing, id, date,
    createdAt: new Date(recording.recordedAt || Date.now()).toISOString(), topic: metadata.topic,
    difficulty: metadata.difficulty, format: metadata.format, challengeId: metadata.challengeId,
    durationSeconds: recording.durationSeconds, goal: metadata.goal, nextFocus:metadata.nextFocus, analysisVersion:metadata.analysisVersion, improvement, rating };
  return [session, ...items.filter(item => item.id !== id)];
}

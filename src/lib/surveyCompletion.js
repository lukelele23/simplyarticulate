const key = owner => 'sa-survey-completed:' + owner;
export function readSurveyCompletion(owner, storage = globalThis.localStorage) {
  if (!owner) return false;
  try { return storage.getItem(key(owner)) === 'true'; } catch { return false; }
}
export function rememberSurveyCompletion(owner, status, storage = globalThis.localStorage) {
  if (!owner || status?.completed !== true) return;
  try { storage.setItem(key(owner), 'true'); } catch { /* The account backend remains authoritative. */ }
}
export function shouldShowSurvey(owner, status) {
  return Boolean(owner) && status?.owner === owner && status.completed === false;
}


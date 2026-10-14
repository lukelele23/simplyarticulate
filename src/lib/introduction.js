// Called once per page load, outside React's repeated development renders.
export function introductionForLoad(storage, navigationType) {
 try {
  if (storage.getItem('sa-introduction-seen') !== '1') return true;
  if (navigationType !== 'reload') return false;
  const stored = Number(storage.getItem('sa-introduction-refreshes') || 0);
  const count = Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  const next = (count + 1) % 4;
  storage.setItem('sa-introduction-refreshes', String(next));
  return next === 0;
 } catch { return true; }
}

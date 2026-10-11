let database;
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('simply-articulate-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('takes', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}
async function transaction(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('takes', mode); const request = action(tx.objectStore('takes'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Local saving was interrupted.'));
  });
}
export async function saveDraft(take) {
  await transaction('readwrite', store => store.put({ ...take, updatedAt: Date.now() }));
}
export async function listDrafts(owner) {
  const all = await transaction('readonly', store => store.getAll());
  return all.filter(d => d.owner === (owner || 'signed-out')).sort((a,b) => b.updatedAt - a.updatedAt);
}
export async function updateDraft(id, changes) {
  const db = await open();
  await new Promise((resolve,reject) => {
    const tx = db.transaction('takes','readwrite'), store = tx.objectStore('takes');
    const get = store.get(id); get.onsuccess = () => { if (get.result) store.put({...get.result,...changes}); };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function removeDraft(id) { await transaction('readwrite', store => store.delete(id)); }

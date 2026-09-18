import { enableStandardEditing } from '../a-rich-text.js';
import { IndexedDBPersistence, createAutosave } from '../../packages/persistence-indexeddb/dist/index.js';

await customElements.whenDefined('a-rich-text');
const editor = document.querySelector('#editor');
enableStandardEditing(editor);
const status = document.querySelector('#save-status');
const snapshotStatus = document.querySelector('#snapshot-status');
const retry = document.querySelector('#retry');
const before = document.querySelector('#before');
const after = document.querySelector('#after');
const store = new IndexedDBPersistence({ databaseName: 'art-local-first-example' });
const documentId = 'draft';
let loaded = false;
const autosave = createAutosave(store, {
  documentId, debounceMs: 250,
  getDocument: () => editor.getJSON(),
  onError: error => {
    status.textContent = `Draft could not be saved: ${error.message ?? error}. Keep this page open and retry.`;
    retry.disabled = false;
  },
});
const save = async () => {
  if (!loaded) return;
  status.textContent = 'Saving…';
  await autosave.flush();
  status.textContent = 'Draft saved in this browser.';
  retry.disabled = true;
};
// The host awaits saving so the status describes a committed transaction.
let timer;
editor.addEventListener('input', () => {
  if (!loaded) return;
  clearTimeout(timer);
  status.textContent = 'Unsaved changes…';
  timer = setTimeout(() => { void save().catch(() => {}); }, 250);
});
retry.addEventListener('click', () => { clearTimeout(timer); void save().catch(() => {}); });

async function listSnapshots() {
  const snapshots = await store.listSnapshots(documentId);
  const previous = [before.value, after.value];
  for (const [index, select] of [before, after].entries()) {
    select.replaceChildren(...snapshots.map(snapshot => {
      const option = document.createElement('option'); option.value = snapshot.id;
      option.textContent = snapshot.name || new Date(snapshot.createdAt).toLocaleString(); return option;
    }));
    if (snapshots.some(snapshot => snapshot.id === previous[index])) select.value = previous[index];
  }
  document.querySelector('#compare').disabled = snapshots.length === 0;
  document.querySelector('#restore').disabled = snapshots.length === 0;
}
function action(id, work) {
  document.querySelector(id).addEventListener('click', () => {
    void work().catch(error => { snapshotStatus.textContent = `Snapshot action failed: ${error.message ?? error}`; });
  });
}
action('#snapshot', async () => {
  const snapshot = await store.createSnapshot(documentId, editor.getJSON(), document.querySelector('#name').value);
  await listSnapshots(); after.value = snapshot.id;
  snapshotStatus.textContent = 'Snapshot saved.';
});
action('#compare', async () => {
  const comparison = await store.compareSnapshots(before.value, after.value);
  if (!comparison) throw new Error('A selected snapshot is no longer available.');
  document.querySelector('#comparison').textContent = comparison.changes.length ? JSON.stringify(comparison.changes, null, 2) : 'No differences.';
  snapshotStatus.textContent = `${comparison.changes.length} structural differences. Draft unchanged.`;
});
action('#restore', async () => {
  const document = await store.restoreSnapshot(after.value);
  if (!document) throw new Error('The selected snapshot is no longer available.');
  editor.setJSON(document); await save(); snapshotStatus.textContent = 'Snapshot restored and saved as the draft.';
});
try {
  const draft = await store.loadDocument(documentId);
  if (draft) editor.setJSON(draft);
  loaded = true; editor.disabled = false;
  document.querySelector('#snapshot').disabled = false;
  status.textContent = draft ? 'Draft recovered from this browser.' : 'Ready. Start a local draft.';
  try { await listSnapshots(); } catch (error) { snapshotStatus.textContent = `Snapshots could not be loaded: ${error.message ?? error}`; }
} catch (error) {
  status.textContent = `Draft could not be loaded: ${error.message ?? error}. Stored data has not been overwritten.`;
}
const offlineStatus = document.querySelector('#offline-status');
const offlineButton = document.querySelector('#offline');
if (!('serviceWorker' in navigator)) { offlineButton.disabled = true; offlineStatus.textContent = 'Offline pages are not supported in this browser.'; }
else {
  if (navigator.serviceWorker.controller) offlineStatus.textContent = 'This page is available offline.';
  offlineButton.addEventListener('click', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      offlineStatus.textContent = 'This page is available offline.';
    } catch (error) { offlineStatus.textContent = `Offline setup failed: ${error.message ?? error}`; }
  });
}

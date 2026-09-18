# Local-first persistence

A Rich Text keeps durable browser storage optional and separate from the editor bundle.

`@arichtext/persistence-indexeddb` uses the browser's native IndexedDB implementation directly. It has no runtime storage-library dependency and does not contact A Rich Text Cloud.

## Documents

```ts
import { IndexedDBPersistence } from '@arichtext/persistence-indexeddb';

const persistence = new IndexedDBPersistence();

await persistence.saveDocument('article-123', editor.getJSON());

const document = await persistence.loadDocument('article-123');
if (document) editor.setJSON(document);
```

Documents are validated against the ART schema before they are written and again when they are read. Callers receive cloned document values rather than references to IndexedDB records.

## Snapshots

```ts
const snapshot = await persistence.createSnapshot(
  'article-123',
  editor.getJSON(),
  'Before rewrite',
);

const versions = await persistence.listSnapshots('article-123');
const restored = await persistence.restoreSnapshot(snapshot.id);
```

Deleting a document deletes its local snapshots by default. This can be disabled when the application needs independent retention.

## Autosave

```ts
import { createAutosave } from '@arichtext/persistence-indexeddb';

const autosave = createAutosave(persistence, {
  documentId: 'article-123',
  debounceMs: 500,
  getDocument: () => editor.getJSON(),
  onError: (error) => console.error(error),
});

editor.addEventListener('input', () => autosave.schedule());

// Save immediately before navigating away or completing a workflow.
await autosave.flush();
```

Autosave writes are serialized so overlapping flushes cannot reorder document versions. A failed write is surfaced to the host application and does not permanently poison later retries.

## Design boundary

IndexedDB is for local drafts, offline recovery and local history. The integrating application remains free to use its own API/database as the authoritative store. Future A Rich Text Cloud persistence is an optional managed provider, not a prerequisite for this package.

## Snapshot comparison

```ts
const comparison = await persistence.compareSnapshots(beforeSnapshotId, afterSnapshotId);
if (comparison) {
  // Render safely as text or use each change's structured path in your own UI.
  console.log(comparison.changes);
}
```

Comparison reads both snapshots in one readonly transaction and never changes the
saved draft. A missing snapshot returns `null`; snapshots from different documents
are rejected. Invalid or unsupported ART versions reject without migration,
deletion or replacement. `restoreSnapshot` returns a detached document; the host
explicitly applies and saves it when the user requests a restore.

The optional `@arichtext/core/diff` entry exports `diffDocuments(before, after)`.
Changes have `kind: 'add' | 'remove' | 'replace'`, a `(string | number)[]` path and
appropriate `before`/`after` JSON values. Object keys are compared in sorted order;
arrays use their current positions and a changed text string is one replacement.
Results are detached descriptive differences, not executable patches, semantic
text alignment, move detection or concurrent collaboration operations.

## Offline example and recovery

Build with `pnpm build:distribution`, serve `dist/browser` with a static HTTP server,
and open `local-first/`. Use **Make available offline** once while connected. The
opt-in worker caches just this example and its editor bundle. After installation,
drafts, snapshots, comparison, saving and reload need no network request. Serve
over HTTPS or localhost; host applications own cache versioning and deployment.
The editor and persistence packages do not register a service worker themselves.
Development servers that inject network-dependent HMR scripts are not an offline
deployment of the built example.

The example waits for a committed transaction before showing a saved status.
Failed writes keep the previous stored document intact and expose a retry action;
keep the page open to retain edits that have not been saved. A corrupt draft stays
stored and is not replaced by a blank editor. Hosts should offer a data export or
explicit recovery workflow rather than silently deleting it. Committed drafts can
be recovered after reload or loss of the editor page; changes still in a debounce
timer or a failed transaction are not durable. Await `flush()` before deliberate
navigation; browser termination is not an opportunity to guarantee an async save.

Connections invalidated by another tab's schema change are released and reopened
on the next operation. Newer IndexedDB database versions fail rather than being
downgraded. Request and transaction failures settle as one rejected operation,
allowing callers to retry without an unhandled secondary rejection.

Browser verification uses native IndexedDB and a cached static page in five
Playwright profiles with the origin server stopped (and an uncached fetch verified
to fail). Chromium and Firefox additionally use offline emulation. WebKit's
`setOffline(true)` rejects service-worker navigation in [Playwright #42775](https://github.com/microsoft/playwright/issues/42775);
its test uses origin unavailability rather than claiming offline-emulation support.
Quota failures are injected at the native write boundary;
transaction aborts are real. This checks recovery behavior without claiming to
fill every device's storage quota or simulate an operating-system crash. Browser
storage eviction and the user's clearing site data still remove local data; a host
that needs another durable copy must provide its own export or optional backup.

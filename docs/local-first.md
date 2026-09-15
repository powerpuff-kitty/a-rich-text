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

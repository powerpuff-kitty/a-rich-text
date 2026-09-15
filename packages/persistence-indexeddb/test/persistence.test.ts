import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';
import { createTextDocument } from '../../core/src/index.js';
import { createAutosave, IndexedDBPersistence } from '../src/index.js';

const openDatabases: IndexedDBPersistence[] = [];

function createPersistence(): IndexedDBPersistence {
  const persistence = new IndexedDBPersistence({
    databaseName: `a-rich-text-test-${crypto.randomUUID()}`,
  });
  openDatabases.push(persistence);
  return persistence;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((persistence) => persistence.close()));
});

describe('@arichtext/persistence-indexeddb', () => {
  it('stores isolated copies of ART documents', async () => {
    const persistence = createPersistence();
    const source = createTextDocument('Original');

    await persistence.saveDocument('doc-1', source);
    const paragraph = source.content[0];
    if (paragraph?.type === 'paragraph' && paragraph.content?.[0]) {
      paragraph.content[0].text = 'Mutated after save';
    }

    expect(await persistence.loadDocument('doc-1')).toEqual(createTextDocument('Original'));
    expect(await persistence.getDocumentMetadata('doc-1')).toMatchObject({ id: 'doc-1' });
  });

  it('creates, lists, restores and cascades snapshots', async () => {
    const persistence = createPersistence();
    const first = createTextDocument('First');
    const second = createTextDocument('Second');

    await persistence.saveDocument('doc-1', second);
    const snapshot = await persistence.createSnapshot('doc-1', first, 'Before edit');

    expect(await persistence.listSnapshots('doc-1')).toEqual([
      expect.objectContaining({ id: snapshot.id, documentId: 'doc-1', name: 'Before edit' }),
    ]);
    expect(await persistence.restoreSnapshot(snapshot.id)).toEqual(first);

    await persistence.deleteDocument('doc-1');
    expect(await persistence.loadDocument('doc-1')).toBeNull();
    expect(await persistence.listSnapshots('doc-1')).toEqual([]);
  });

  it('serializes autosave writes and persists the latest flushed document', async () => {
    const persistence = createPersistence();
    let current = createTextDocument('One');
    const autosave = createAutosave(persistence, {
      documentId: 'doc-1',
      debounceMs: 0,
      getDocument: () => current,
    });

    await autosave.flush();
    current = createTextDocument('Two');
    await autosave.flush();
    await autosave.dispose();

    expect(await persistence.loadDocument('doc-1')).toEqual(createTextDocument('Two'));
  });
});

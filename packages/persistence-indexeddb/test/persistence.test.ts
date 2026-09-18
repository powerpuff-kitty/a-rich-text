import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';
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
  vi.restoreAllMocks();
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

it('compares snapshots without overwriting the draft and isolates returned values', async () => {
  const persistence = createPersistence();
  await persistence.saveDocument('doc', createTextDocument('Current'));
  const a = await persistence.createSnapshot('doc', createTextDocument('Before'));
  const b = await persistence.createSnapshot('doc', createTextDocument('After'));
  expect(await persistence.compareSnapshots(a.id, b.id)).toEqual({ before: a, after: b, changes: [
    { kind: 'replace', path: ['content', 0, 'content', 0, 'text'], before: 'Before', after: 'After' },
  ] });
  expect((await persistence.compareSnapshots(a.id, a.id))?.changes).toEqual([]);
  expect(await persistence.compareSnapshots(a.id, 'missing')).toBeNull();
  const other = await persistence.createSnapshot('another-doc', createTextDocument('Other'));
  await expect(persistence.compareSnapshots(a.id, other.id)).rejects.toThrow('different documents');
  expect(await persistence.loadDocument('doc')).toEqual(createTextDocument('Current'));
});

it('rejects corrupt and future-version records without changing them', async () => {
  const persistence = createPersistence();
  await persistence.saveDocument('doc', createTextDocument('Current'));
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(persistence.databaseName);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  for (const document of [{ type: 'doc', version: 2, content: [] }, { invalid: true }]) {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ id: 'doc', updatedAt: 1, document });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    await expect(persistence.loadDocument('doc')).rejects.toThrow('Corrupt ART document');
    const record = await new Promise<any>((resolve, reject) => {
      const req = database.transaction('documents').objectStore('documents').get('doc');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    expect(record.document).toEqual(document);
  }
  database.close();
});

it('reopens after an external database deletion instead of caching a closed connection', async () => {
  const persistence = createPersistence();
  await persistence.saveDocument('doc', createTextDocument('Before'));
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(persistence.databaseName);
    req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
  });
  expect(await persistence.loadDocument('doc')).toBeNull();
  await persistence.saveDocument('doc', createTextDocument('After'));
  expect(await persistence.loadDocument('doc')).toEqual(createTextDocument('After'));
});

it('settles an aborted read without an unhandled transaction rejection and permits retry', async () => {
  const persistence = createPersistence();
  await persistence.saveDocument('doc', createTextDocument('Saved'));
  const original = IDBObjectStore.prototype.get;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(function (this: IDBObjectStore, key) {
    const request = original.call(this, key); this.transaction.abort(); return request;
  });
  await expect(persistence.loadDocument('doc')).rejects.toMatchObject({ name: 'AbortError' });
  expect(await persistence.loadDocument('doc')).toEqual(createTextDocument('Saved'));
});

it('reports quota errors, preserves the last good draft and retries autosave', async () => {
  const persistence = createPersistence();
  let current = createTextDocument('Saved');
  const onError = vi.fn();
  const autosave = createAutosave(persistence, { documentId: 'doc', getDocument: () => current, onError });
  await autosave.flush();
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  current = createTextDocument('Retry');
  await expect(autosave.flush()).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(onError).toHaveBeenCalledOnce();
  expect(await persistence.loadDocument('doc')).toEqual(createTextDocument('Saved'));
  await autosave.flush();
  expect(await persistence.loadDocument('doc')).toEqual(current);
  await autosave.dispose();
});

it('rejects corrupt snapshots during load, restore and comparison without overwriting them', async () => {
  const persistence = createPersistence();
  const good = await persistence.createSnapshot('doc', createTextDocument('Good'));
  const bad = await persistence.createSnapshot('doc', createTextDocument('Original'));
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(persistence.databaseName);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const document = { type: 'doc', version: 2, content: [] };
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ ...bad, document });
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  });
  await expect(persistence.loadSnapshot(bad.id)).rejects.toThrow('Corrupt ART document');
  await expect(persistence.restoreSnapshot(bad.id)).rejects.toThrow('Corrupt ART document');
  await expect(persistence.compareSnapshots(good.id, bad.id)).rejects.toThrow('Corrupt ART document');
  const record = await new Promise<any>((resolve, reject) => {
    const request = database.transaction('snapshots').objectStore('snapshots').get(bad.id);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  expect(record.document).toEqual(document);
  expect(await persistence.loadSnapshot(good.id)).toEqual(createTextDocument('Good'));
  database.close();
});

it('rejects an externally upgraded database without downgrading or deleting its draft', async () => {
  const persistence = createPersistence();
  await persistence.saveDocument('doc', createTextDocument('Preserved'));
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(persistence.databaseName, 2);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await expect(persistence.loadDocument('doc')).rejects.toMatchObject({ name: 'VersionError' });
  expect(database.version).toBe(2);
  const record = await new Promise<any>((resolve, reject) => {
    const request = database.transaction('documents').objectStore('documents').get('doc');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  expect(record.document).toEqual(createTextDocument('Preserved'));
  database.close();
});

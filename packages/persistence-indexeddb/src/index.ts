import { isARTDocument, type ARTDocument } from '@arichtext/core';

const DATABASE_VERSION = 1;
const DOCUMENT_STORE = 'documents';
const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_DOCUMENT_INDEX = 'documentId';

export interface IndexedDBPersistenceOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
}

export interface StoredDocumentMetadata {
  id: string;
  updatedAt: number;
}

export interface SnapshotMetadata {
  id: string;
  documentId: string;
  createdAt: number;
  name?: string;
}

interface DocumentRecord extends StoredDocumentMetadata {
  document: ARTDocument;
}

interface SnapshotRecord extends SnapshotMetadata {
  document: ARTDocument;
}

export interface AutosaveOptions {
  documentId: string;
  getDocument: () => ARTDocument;
  debounceMs?: number;
  onError?: (error: unknown) => void;
}

export interface AutosaveController {
  schedule(): void;
  flush(): Promise<void>;
  cancel(): void;
  dispose(): Promise<void>;
}

export class IndexedDBPersistence {
  readonly databaseName: string;
  #factory?: IDBFactory;
  #database?: Promise<IDBDatabase>;

  constructor(options: IndexedDBPersistenceOptions = {}) {
    this.databaseName = options.databaseName ?? 'a-rich-text';
    this.#factory = options.indexedDB;
  }

  async saveDocument(id: string, document: ARTDocument): Promise<StoredDocumentMetadata> {
    assertDocumentId(id);
    const copy = cloneDocument(document);
    const updatedAt = Date.now();
    const database = await this.#open();
    const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(DOCUMENT_STORE).put({ id, updatedAt, document: copy } satisfies DocumentRecord);
    await done;
    return { id, updatedAt };
  }

  async loadDocument(id: string): Promise<ARTDocument | null> {
    assertDocumentId(id);
    const database = await this.#open();
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult<DocumentRecord | undefined>(
      transaction.objectStore(DOCUMENT_STORE).get(id),
    );
    await done;
    return record ? validateStoredDocument(record.document, `document:${id}`) : null;
  }

  async getDocumentMetadata(id: string): Promise<StoredDocumentMetadata | null> {
    assertDocumentId(id);
    const database = await this.#open();
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult<DocumentRecord | undefined>(
      transaction.objectStore(DOCUMENT_STORE).get(id),
    );
    await done;
    return record ? { id: record.id, updatedAt: record.updatedAt } : null;
  }

  async deleteDocument(id: string, deleteSnapshots = true): Promise<void> {
    assertDocumentId(id);
    const database = await this.#open();
    const stores = deleteSnapshots ? [DOCUMENT_STORE, SNAPSHOT_STORE] : [DOCUMENT_STORE];
    const transaction = database.transaction(stores, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(DOCUMENT_STORE).delete(id);

    if (deleteSnapshots) {
      const snapshots = transaction.objectStore(SNAPSHOT_STORE);
      const keys = await requestResult<IDBValidKey[]>(snapshots.index(SNAPSHOT_DOCUMENT_INDEX).getAllKeys(id));
      for (const key of keys) snapshots.delete(key);
    }

    await done;
  }

  async createSnapshot(documentId: string, document: ARTDocument, name?: string): Promise<SnapshotMetadata> {
    assertDocumentId(documentId);
    const copy = cloneDocument(document);
    const createdAt = Date.now();
    const id = `${documentId}:${createdAt}:${randomId()}`;
    const record: SnapshotRecord = {
      id,
      documentId,
      createdAt,
      ...(name?.trim() ? { name: name.trim() } : {}),
      document: copy,
    };

    const database = await this.#open();
    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(SNAPSHOT_STORE).add(record);
    await done;
    return snapshotMetadata(record);
  }

  async listSnapshots(documentId: string): Promise<SnapshotMetadata[]> {
    assertDocumentId(documentId);
    const database = await this.#open();
    const transaction = database.transaction(SNAPSHOT_STORE, 'readonly');
    const done = transactionDone(transaction);
    const records = await requestResult<SnapshotRecord[]>(
      transaction.objectStore(SNAPSHOT_STORE).index(SNAPSHOT_DOCUMENT_INDEX).getAll(documentId),
    );
    await done;
    return records
      .map(snapshotMetadata)
      .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));
  }

  async loadSnapshot(snapshotId: string): Promise<ARTDocument | null> {
    assertDocumentId(snapshotId);
    const database = await this.#open();
    const transaction = database.transaction(SNAPSHOT_STORE, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult<SnapshotRecord | undefined>(
      transaction.objectStore(SNAPSHOT_STORE).get(snapshotId),
    );
    await done;
    return record ? validateStoredDocument(record.document, `snapshot:${snapshotId}`) : null;
  }

  async restoreSnapshot(snapshotId: string): Promise<ARTDocument | null> {
    return this.loadSnapshot(snapshotId);
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    assertDocumentId(snapshotId);
    const database = await this.#open();
    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(SNAPSHOT_STORE).delete(snapshotId);
    await done;
  }

  async close(): Promise<void> {
    if (!this.#database) return;
    const database = await this.#database;
    database.close();
    this.#database = undefined;
  }

  #open(): Promise<IDBDatabase> {
    if (this.#database) return this.#database;

    const factory = this.#factory ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new Error('@arichtext/persistence-indexeddb requires IndexedDB'));

    this.#database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(this.databaseName, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
          database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const snapshots = database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
          snapshots.createIndex(SNAPSHOT_DOCUMENT_INDEX, 'documentId', { unique: false });
        }
      };

      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open connection'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    }).catch((error) => {
      this.#database = undefined;
      throw error;
    });

    return this.#database;
  }
}

export function createAutosave(
  persistence: IndexedDBPersistence,
  options: AutosaveOptions,
): AutosaveController {
  assertDocumentId(options.documentId);
  const debounceMs = Math.max(0, options.debounceMs ?? 500);
  let timer: number | undefined;
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;

  const cancel = (): void => {
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): Promise<void> => {
    cancel();
    if (disposed) return chain;

    let document: ARTDocument;
    try {
      document = cloneDocument(options.getDocument());
    } catch (error) {
      options.onError?.(error);
      return Promise.reject(error);
    }

    chain = chain
      .catch(() => undefined)
      .then(() => persistence.saveDocument(options.documentId, document))
      .then(() => undefined)
      .catch((error) => {
        options.onError?.(error);
        throw error;
      });
    return chain;
  };

  return {
    schedule(): void {
      if (disposed) return;
      cancel();
      timer = globalThis.setTimeout(() => {
        timer = undefined;
        void flush().catch(() => undefined);
      }, debounceMs);
    },
    flush,
    cancel,
    async dispose(): Promise<void> {
      if (disposed) return chain;
      const hadPendingTimer = timer !== undefined;
      cancel();
      if (hadPendingTimer) await flush();
      disposed = true;
      await chain;
    },
  };
}

function cloneDocument(document: ARTDocument): ARTDocument {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  const copy = typeof structuredClone === 'function'
    ? structuredClone(document)
    : JSON.parse(JSON.stringify(document)) as unknown;
  if (!isARTDocument(copy)) throw new TypeError('Failed to clone ART document');
  return copy;
}

function validateStoredDocument(value: unknown, source: string): ARTDocument {
  if (!isARTDocument(value)) throw new TypeError(`Corrupt ART document in IndexedDB (${source})`);
  return cloneDocument(value);
}

function snapshotMetadata(record: SnapshotRecord): SnapshotMetadata {
  return {
    id: record.id,
    documentId: record.documentId,
    createdAt: record.createdAt,
    ...(record.name ? { name: record.name } : {}),
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function assertDocumentId(id: string): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('Document and snapshot ids must be non-empty strings');
  }
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

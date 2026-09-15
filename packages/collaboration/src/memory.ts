import type { ARTDocument } from '@arichtext/core';
import {
  CollaborationError,
  type CollaborationCapabilities,
  type CollaborationConnectionOptions,
  type CollaborationDocumentUpdate,
  type CollaborationPresence,
  type CollaborationProvider,
  type CollaborationSession,
  type CollaborationStatus,
  type PresenceUpdate,
  type PublishDocumentOptions,
  type UpdatePresenceOptions,
} from './types.js';
import {
  assertIdentifier,
  cloneARTDocument,
  cloneDocumentUpdate,
  clonePresence,
  createPresence,
} from './validation.js';

interface MemoryRoom {
  revision: number;
  document: CollaborationDocumentUpdate | null;
  presence: Map<string, CollaborationPresence>;
  sessions: Set<MemorySession>;
}

const MEMORY_CAPABILITIES: CollaborationCapabilities = Object.freeze({
  merge: 'snapshot',
  presence: true,
});

export class MemoryCollaborationProvider implements CollaborationProvider {
  readonly name = 'memory';
  readonly capabilities = MEMORY_CAPABILITIES;
  #rooms = new Map<string, MemoryRoom>();

  async connect(options: CollaborationConnectionOptions): Promise<CollaborationSession> {
    assertIdentifier(options.documentId, 'documentId');
    assertIdentifier(options.clientId, 'clientId');
    throwIfAborted(options.signal);

    const room = this.#rooms.get(options.documentId) ?? {
      revision: 0,
      document: null,
      presence: new Map<string, CollaborationPresence>(),
      sessions: new Set<MemorySession>(),
    };
    this.#rooms.set(options.documentId, room);

    if (!room.document && options.initialDocument) {
      room.document = {
        document: cloneARTDocument(options.initialDocument),
        origin: {
          clientId: options.clientId,
          changeId: `${options.clientId}:initial`,
        },
        revision: '0',
        timestamp: Date.now(),
      };
    }

    const session = new MemorySession(room, options.documentId, options.clientId);
    room.sessions.add(session);

    if (options.initialPresence) {
      await session.updatePresence(options.initialPresence);
    }

    if (options.signal) {
      const abort = () => { void session.close(); };
      options.signal.addEventListener('abort', abort, { once: true });
      session.onClose(() => options.signal?.removeEventListener('abort', abort));
    }

    return session;
  }
}

export function createMemoryCollaborationProvider(): MemoryCollaborationProvider {
  return new MemoryCollaborationProvider();
}

class MemorySession implements CollaborationSession {
  readonly capabilities = MEMORY_CAPABILITIES;
  readonly documentId: string;
  readonly clientId: string;
  #room: MemoryRoom;
  #status: CollaborationStatus = 'connected';
  #documentListeners = new Set<(update: CollaborationDocumentUpdate) => void>();
  #presenceListeners = new Set<(update: PresenceUpdate) => void>();
  #statusListeners = new Set<(status: CollaborationStatus) => void>();
  #closeListeners = new Set<() => void>();
  #sequence = 0;

  constructor(room: MemoryRoom, documentId: string, clientId: string) {
    this.#room = room;
    this.documentId = documentId;
    this.clientId = clientId;
  }

  get status(): CollaborationStatus {
    return this.#status;
  }

  getDocument(): CollaborationDocumentUpdate | null {
    return this.#room.document ? cloneDocumentUpdate(this.#room.document) : null;
  }

  async publishDocument(
    document: ARTDocument,
    options: PublishDocumentOptions = {},
  ): Promise<CollaborationDocumentUpdate> {
    this.#assertOpen();
    const copy = cloneARTDocument(document);
    const currentRevision = this.#room.document?.revision;
    if (options.baseRevision !== undefined && options.baseRevision !== currentRevision) {
      throw new CollaborationError(
        'revision-conflict',
        `Snapshot revision conflict: expected ${options.baseRevision}, current ${currentRevision ?? 'none'}`,
      );
    }

    this.#room.revision += 1;
    const update: CollaborationDocumentUpdate = {
      document: copy,
      origin: {
        clientId: this.clientId,
        changeId: options.changeId ?? `${this.clientId}:${++this.#sequence}`,
      },
      revision: String(this.#room.revision),
      timestamp: Date.now(),
    };
    this.#room.document = update;

    for (const session of this.#room.sessions) {
      if (session === this || session.status === 'closed') continue;
      session.receiveDocument(update);
    }
    return cloneDocumentUpdate(update);
  }

  subscribeDocument(listener: (update: CollaborationDocumentUpdate) => void): () => void {
    this.#documentListeners.add(listener);
    return () => this.#documentListeners.delete(listener);
  }

  async updatePresence(update: UpdatePresenceOptions): Promise<CollaborationPresence> {
    this.#assertOpen();
    const previous = this.#room.presence.get(this.clientId);
    const merged: UpdatePresenceOptions = {
      selection: update.selection !== undefined ? update.selection : previous?.selection,
      data: update.data !== undefined ? update.data : previous?.data,
    };
    const presence = createPresence(
      this.clientId,
      this.#room.document?.document ?? null,
      merged,
    );
    this.#room.presence.set(this.clientId, presence);
    const event: PresenceUpdate = { type: 'upsert', presence: clonePresence(presence) };
    for (const session of this.#room.sessions) {
      if (session === this || session.status === 'closed') continue;
      session.receivePresence(event);
    }
    return clonePresence(presence);
  }

  getPresence(): readonly CollaborationPresence[] {
    return [...this.#room.presence.values()].map(clonePresence);
  }

  subscribePresence(listener: (update: PresenceUpdate) => void): () => void {
    this.#presenceListeners.add(listener);
    return () => this.#presenceListeners.delete(listener);
  }

  subscribeStatus(listener: (status: CollaborationStatus) => void): () => void {
    this.#statusListeners.add(listener);
    return () => this.#statusListeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.#status === 'closed') return;
    this.#status = 'closed';
    this.#room.sessions.delete(this);
    const hadPresence = this.#room.presence.delete(this.clientId);
    if (hadPresence) {
      const event: PresenceUpdate = {
        type: 'remove',
        clientId: this.clientId,
        timestamp: Date.now(),
      };
      for (const session of this.#room.sessions) {
        if (session.status !== 'closed') session.receivePresence(event);
      }
    }
    for (const listener of this.#statusListeners) listener('closed');
    for (const listener of this.#closeListeners) listener();
    this.#documentListeners.clear();
    this.#presenceListeners.clear();
    this.#statusListeners.clear();
    this.#closeListeners.clear();
  }

  receiveDocument(update: CollaborationDocumentUpdate): void {
    for (const listener of this.#documentListeners) listener(cloneDocumentUpdate(update));
  }

  receivePresence(update: PresenceUpdate): void {
    const cloned: PresenceUpdate = update.type === 'upsert'
      ? { type: 'upsert', presence: clonePresence(update.presence) }
      : { ...update };
    for (const listener of this.#presenceListeners) listener(cloned);
  }

  onClose(listener: () => void): void {
    this.#closeListeners.add(listener);
  }

  #assertOpen(): void {
    if (this.#status === 'closed') {
      throw new CollaborationError('closed', 'Collaboration session is closed');
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new CollaborationError('aborted', 'Collaboration connection was aborted', signal.reason);
  }
}

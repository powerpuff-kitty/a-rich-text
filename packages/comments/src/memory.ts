import {
  CommentsError,
  type CommentAuthor,
  type CommentMessage,
  type CommentThread,
  type CommentThreadEvent,
  type CommentsConnectionOptions,
  type CommentsProvider,
  type CommentsSession,
  type CreateThreadInput,
  type EditMessageInput,
  type ReplyInput,
  type ThreadMutationOptions,
} from './types.js';
import {
  assertIdentifier,
  checkedId,
  cloneAnchor,
  cloneAuthor,
  cloneThread,
  normalizeBody,
  normalizeMentions,
  normalizeReactionKey,
} from './validation.js';

interface CommentsRoom {
  threads: Map<string, CommentThread>;
  sessions: Set<MemoryCommentsSession>;
}

export class MemoryCommentsProvider implements CommentsProvider {
  readonly name = 'memory';
  #rooms = new Map<string, CommentsRoom>();

  async connect(options: CommentsConnectionOptions): Promise<CommentsSession> {
    assertIdentifier(options.documentId, 'document id');
    assertIdentifier(options.clientId, 'client id');
    if (options.signal?.aborted) throw new CommentsError('aborted', 'Comments connection was aborted', options.signal.reason);

    const room = this.#rooms.get(options.documentId) ?? {
      threads: new Map<string, CommentThread>(),
      sessions: new Set<MemoryCommentsSession>(),
    };
    this.#rooms.set(options.documentId, room);

    const session = new MemoryCommentsSession(room, options.documentId, options.clientId);
    room.sessions.add(session);
    if (options.signal) {
      const abort = () => { void session.close(); };
      options.signal.addEventListener('abort', abort, { once: true });
      session.onClose(() => options.signal?.removeEventListener('abort', abort));
    }
    return session;
  }
}

export function createMemoryCommentsProvider(): MemoryCommentsProvider {
  return new MemoryCommentsProvider();
}

class MemoryCommentsSession implements CommentsSession {
  readonly documentId: string;
  readonly clientId: string;
  #room: CommentsRoom;
  #listeners = new Set<(event: CommentThreadEvent) => void>();
  #closeListeners = new Set<() => void>();
  #closed = false;
  #sequence = 0;

  constructor(room: CommentsRoom, documentId: string, clientId: string) {
    this.#room = room;
    this.documentId = documentId;
    this.clientId = clientId;
  }

  listThreads(): readonly CommentThread[] {
    this.#assertOpen();
    return [...this.#room.threads.values()]
      .map(cloneThread)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  getThread(threadId: string): CommentThread | null {
    this.#assertOpen();
    assertIdentifier(threadId, 'thread id');
    const thread = this.#room.threads.get(threadId);
    return thread ? cloneThread(thread) : null;
  }

  async createThread(input: CreateThreadInput): Promise<CommentThread> {
    this.#assertOpen();
    const id = input.id ?? this.#newId('thread');
    assertIdentifier(id, 'thread id');
    if (this.#room.threads.has(id)) throw new CommentsError('invalid-thread', `Thread already exists: ${id}`);
    const now = Date.now();
    const message = createMessage({
      id: this.#newId('message', input.id ? 1 : undefined),
      body: input.body,
      author: input.author,
      mentions: input.mentions,
      now,
    });
    const thread: CommentThread = {
      id,
      documentId: this.documentId,
      anchor: cloneAnchor(input.anchor),
      messages: [message],
      status: 'open',
      revision: '1',
      createdAt: now,
      updatedAt: now,
    };
    this.#room.threads.set(id, cloneThread(thread));
    this.#broadcast('created', thread);
    return cloneThread(thread);
  }

  async reply(threadId: string, input: ReplyInput, options: ThreadMutationOptions = {}): Promise<CommentThread> {
    return this.#mutate(threadId, options, (thread, now) => {
      const id = input.id ?? this.#newId('message');
      if (thread.messages.some((message) => message.id === id)) throw new CommentsError('invalid-message', `Message already exists: ${id}`);
      thread.messages.push(createMessage({ id, body: input.body, author: input.author, mentions: input.mentions, now }));
    });
  }

  async editMessage(threadId: string, messageId: string, input: EditMessageInput): Promise<CommentThread> {
    return this.#mutate(threadId, input, (thread, now) => {
      const message = findMessage(thread, messageId);
      if (message.deletedAt !== undefined) throw new CommentsError('invalid-message', 'Deleted comments cannot be edited');
      message.body = normalizeBody(input.body);
      message.mentions = normalizeMentions(input.mentions);
      message.updatedAt = now;
    });
  }

  async deleteMessage(threadId: string, messageId: string, options: ThreadMutationOptions = {}): Promise<CommentThread> {
    return this.#mutate(threadId, options, (thread, now) => {
      const message = findMessage(thread, messageId);
      if (message.deletedAt !== undefined) return;
      message.body = '';
      message.mentions = undefined;
      message.reactions = [];
      message.deletedAt = now;
      message.updatedAt = now;
    });
  }

  async resolveThread(threadId: string, author: CommentAuthor, options: ThreadMutationOptions = {}): Promise<CommentThread> {
    return this.#mutate(threadId, options, (thread, now) => {
      thread.status = 'resolved';
      thread.resolvedAt = now;
      thread.resolvedBy = cloneAuthor(author);
    });
  }

  async reopenThread(threadId: string, options: ThreadMutationOptions = {}): Promise<CommentThread> {
    return this.#mutate(threadId, options, (thread) => {
      thread.status = 'open';
      delete thread.resolvedAt;
      delete thread.resolvedBy;
    });
  }

  async addReaction(
    threadId: string,
    messageId: string,
    key: string,
    userId: string,
    options: ThreadMutationOptions = {},
  ): Promise<CommentThread> {
    const normalizedKey = normalizeReactionKey(key);
    const normalizedUser = checkedId(userId, 'reaction user id');
    return this.#mutate(threadId, options, (thread, now) => {
      const message = findMessage(thread, messageId);
      if (message.deletedAt !== undefined) throw new CommentsError('invalid-message', 'Cannot react to a deleted comment');
      if (message.reactions.some((reaction) => reaction.key === normalizedKey && reaction.userId === normalizedUser)) return;
      message.reactions.push({ key: normalizedKey, userId: normalizedUser, createdAt: now });
      message.updatedAt = now;
    });
  }

  async removeReaction(
    threadId: string,
    messageId: string,
    key: string,
    userId: string,
    options: ThreadMutationOptions = {},
  ): Promise<CommentThread> {
    const normalizedKey = normalizeReactionKey(key);
    const normalizedUser = checkedId(userId, 'reaction user id');
    return this.#mutate(threadId, options, (thread, now) => {
      const message = findMessage(thread, messageId);
      const before = message.reactions.length;
      message.reactions = message.reactions.filter((reaction) => !(reaction.key === normalizedKey && reaction.userId === normalizedUser));
      if (message.reactions.length !== before) message.updatedAt = now;
    });
  }

  async updateAnchor(
    threadId: string,
    anchor: CommentThread['anchor'],
    options: ThreadMutationOptions = {},
  ): Promise<CommentThread> {
    const safeAnchor = cloneAnchor(anchor);
    return this.#mutate(threadId, options, (thread) => {
      thread.anchor = safeAnchor;
    });
  }

  subscribe(listener: (event: CommentThreadEvent) => void): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#room.sessions.delete(this);
    this.#listeners.clear();
    for (const listener of this.#closeListeners) listener();
    this.#closeListeners.clear();
  }

  receive(event: CommentThreadEvent): void {
    if (this.#closed) return;
    const safe: CommentThreadEvent = {
      type: event.type,
      thread: cloneThread(event.thread),
      originClientId: event.originClientId,
    };
    for (const listener of this.#listeners) listener(safe);
  }

  onClose(listener: () => void): void {
    this.#closeListeners.add(listener);
  }

  async #mutate(
    threadId: string,
    options: ThreadMutationOptions,
    mutate: (thread: CommentThread, now: number) => void,
  ): Promise<CommentThread> {
    this.#assertOpen();
    assertIdentifier(threadId, 'thread id');
    const stored = this.#room.threads.get(threadId);
    if (!stored) throw new CommentsError('not-found', `Unknown comment thread: ${threadId}`);
    if (options.expectedRevision !== undefined && options.expectedRevision !== stored.revision) {
      throw new CommentsError('revision-conflict', `Expected thread revision ${options.expectedRevision}, current ${stored.revision}`);
    }

    const thread = cloneThread(stored);
    const now = Date.now();
    mutate(thread, now);
    thread.updatedAt = now;
    thread.revision = String(Number.parseInt(stored.revision, 10) + 1);
    this.#room.threads.set(threadId, cloneThread(thread));
    this.#broadcast('updated', thread);
    return cloneThread(thread);
  }

  #broadcast(type: CommentThreadEvent['type'], thread: CommentThread): void {
    const event: CommentThreadEvent = {
      type,
      thread: cloneThread(thread),
      originClientId: this.clientId,
    };
    for (const session of this.#room.sessions) session.receive(event);
  }

  #newId(kind: string, suffix?: number): string {
    this.#sequence += 1;
    return `${this.clientId}:${kind}:${suffix ?? this.#sequence}:${randomPart()}`;
  }

  #assertOpen(): void {
    if (this.#closed) throw new CommentsError('closed', 'Comments session is closed');
  }
}

function createMessage(input: {
  id: string;
  body: string;
  author: CommentAuthor;
  mentions?: readonly string[];
  now: number;
}): CommentMessage {
  assertIdentifier(input.id, 'message id');
  return {
    id: input.id,
    author: cloneAuthor(input.author),
    body: normalizeBody(input.body),
    ...(normalizeMentions(input.mentions) ? { mentions: normalizeMentions(input.mentions) } : {}),
    reactions: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function findMessage(thread: CommentThread, messageId: string): CommentMessage {
  assertIdentifier(messageId, 'message id');
  const message = thread.messages.find((candidate) => candidate.id === messageId);
  if (!message) throw new CommentsError('not-found', `Unknown comment message: ${messageId}`);
  return message;
}

function randomPart(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

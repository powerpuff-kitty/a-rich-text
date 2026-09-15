import {
  AnchoredRangeTracker,
  createAnchoredRange,
  inferSimpleReconcileOperations,
  mapAnchoredRangeThroughOperations,
  samePoint,
  type AnchoredRangeMappingResult,
} from '@arichtext/annotations';
import {
  cloneThread,
  type CommentAuthor,
  type CommentThread,
  type CommentThreadEvent,
  type CommentsProvider,
  type CommentsSession,
} from '@arichtext/comments';
import {
  parseDocument,
  serializeDocument,
  type ARTDocument,
} from '@arichtext/core';
import type { TransactionResult } from '@arichtext/engine';
import type { ARichTextElement } from '@arichtext/web-component';

export interface CommentsEditorOptions {
  documentId: string;
  clientId: string;
  author?: CommentAuthor;
  captureQuote?: boolean;
  quoteContextChars?: number;
  signal?: AbortSignal;
  onThread?: (event: CommentThreadEvent) => void;
  onAnchor?: (thread: CommentThread) => void;
  onError?: (error: unknown) => void;
}

export interface CommentsThreadDetail {
  event: CommentThreadEvent;
}

export interface CommentsAnchorDetail {
  thread: CommentThread;
}

export interface CommentsEditorErrorDetail {
  error: unknown;
}

interface ThreadEntry {
  thread: CommentThread;
  tracker?: AnchoredRangeTracker;
}

export class CommentsEditorController {
  readonly editor: ARichTextElement;
  readonly session: CommentsSession;
  readonly options: CommentsEditorOptions;

  #entries = new Map<string, ThreadEntry>();
  #lastDocument: ARTDocument;
  #anchorQueue: Promise<void> = Promise.resolve();
  #unsubscribeProvider?: () => void;
  #destroyed = false;

  constructor(
    editor: ARichTextElement,
    session: CommentsSession,
    options: CommentsEditorOptions,
  ) {
    this.editor = editor;
    this.session = session;
    this.options = options;
    this.#lastDocument = cloneDocument(editor.getJSON());

    for (const thread of session.listThreads()) this.#ingestThread(thread, false);
    this.#unsubscribeProvider = session.subscribe(this.#handleProviderEvent);
    editor.addEventListener('transaction', this.#handleTransaction);
    editor.addEventListener('reconcile', this.#handleReconcile);
    editor.addEventListener('collaboration-remote-document', this.#handleRemoteDocument);
  }

  get threads(): readonly CommentThread[] {
    return [...this.#entries.values()]
      .map((entry) => cloneThread(entry.thread))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  getThread(threadId: string): CommentThread | null {
    const entry = this.#entries.get(threadId);
    return entry ? cloneThread(entry.thread) : null;
  }

  async createThread(
    body: string,
    author: CommentAuthor | undefined = this.options.author,
    mentions?: readonly string[],
  ): Promise<CommentThread> {
    this.#assertActive();
    if (!author) throw new TypeError('Comment author is required');
    const selection = this.editor.getSelection();
    if (!selection) throw new RangeError('Creating a comment requires an editor selection');
    const range = createAnchoredRange(this.#lastDocument, selection, {
      captureQuote: this.options.captureQuote ?? true,
      quoteContextChars: this.options.quoteContextChars,
    });
    const anchor: AnchoredRangeMappingResult = samePoint(range.start, range.end)
      ? { status: 'collapsed', range }
      : { status: 'mapped', range };
    const thread = await this.session.createThread({ anchor, body, author, mentions });
    this.#ingestThread(thread, true);
    return cloneThread(this.#entries.get(thread.id)?.thread ?? thread);
  }

  async reply(
    threadId: string,
    body: string,
    author: CommentAuthor | undefined = this.options.author,
    mentions?: readonly string[],
  ): Promise<CommentThread> {
    this.#assertActive();
    if (!author) throw new TypeError('Comment author is required');
    const current = this.#requireThread(threadId);
    const updated = await this.session.reply(threadId, { body, author, mentions }, { expectedRevision: current.revision });
    this.#ingestThread(updated, true);
    return cloneThread(this.#requireThread(threadId));
  }

  async resolve(threadId: string, author: CommentAuthor | undefined = this.options.author): Promise<CommentThread> {
    this.#assertActive();
    if (!author) throw new TypeError('Resolver author is required');
    const current = this.#requireThread(threadId);
    const updated = await this.session.resolveThread(threadId, author, { expectedRevision: current.revision });
    this.#ingestThread(updated, true);
    return cloneThread(this.#requireThread(threadId));
  }

  async reopen(threadId: string): Promise<CommentThread> {
    this.#assertActive();
    const current = this.#requireThread(threadId);
    const updated = await this.session.reopenThread(threadId, { expectedRevision: current.revision });
    this.#ingestThread(updated, true);
    return cloneThread(this.#requireThread(threadId));
  }

  async addReaction(threadId: string, messageId: string, key: string, userId: string): Promise<CommentThread> {
    this.#assertActive();
    const current = this.#requireThread(threadId);
    const updated = await this.session.addReaction(threadId, messageId, key, userId, { expectedRevision: current.revision });
    this.#ingestThread(updated, true);
    return cloneThread(this.#requireThread(threadId));
  }

  async removeReaction(threadId: string, messageId: string, key: string, userId: string): Promise<CommentThread> {
    this.#assertActive();
    const current = this.#requireThread(threadId);
    const updated = await this.session.removeReaction(threadId, messageId, key, userId, { expectedRevision: current.revision });
    this.#ingestThread(updated, true);
    return cloneThread(this.#requireThread(threadId));
  }

  /** Reconcile after a programmatic `setJSON/setHTML/...` that emits no transaction. */
  reconcileNow(): void {
    this.#assertActive();
    this.#reconcileDocument(cloneDocument(this.editor.getJSON()), 'Programmatic document replacement');
  }

  async disconnect(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.editor.removeEventListener('transaction', this.#handleTransaction);
    this.editor.removeEventListener('reconcile', this.#handleReconcile);
    this.editor.removeEventListener('collaboration-remote-document', this.#handleRemoteDocument);
    this.#unsubscribeProvider?.();
    this.#unsubscribeProvider = undefined;
    await this.#anchorQueue.catch(() => undefined);
    await this.session.close();
  }

  #handleTransaction = (event: Event): void => {
    if (this.#destroyed) return;
    const result = (event as CustomEvent<{ result?: TransactionResult }>).detail?.result;
    if (!result) return;
    const before = this.#lastDocument;

    for (const [threadId, entry] of this.#entries) {
      if (!entry.tracker) continue;
      const mapped = entry.tracker.handle(before, result);
      this.#setLocalAnchor(threadId, mapped);
    }
    this.#lastDocument = cloneDocument(result.state.document);
  };

  #handleReconcile = (): void => {
    if (this.#destroyed) return;
    this.#reconcileDocument(cloneDocument(this.editor.getJSON()), 'Native editor reconciliation');
  };

  #handleRemoteDocument = (): void => {
    if (this.#destroyed) return;
    this.#reconcileDocument(cloneDocument(this.editor.getJSON()), 'Remote collaboration document replacement');
  };

  #reconcileDocument(after: ARTDocument, reason: string): void {
    if (serializeDocument(after) === serializeDocument(this.#lastDocument)) return;
    const operations = inferSimpleReconcileOperations(this.#lastDocument, after);

    for (const [threadId, entry] of this.#entries) {
      if (entry.thread.anchor.status === 'orphaned') continue;
      if (operations === null) {
        entry.tracker = undefined;
        this.#setLocalAnchor(threadId, {
          status: 'orphaned',
          range: null,
          reason: `${reason} changed document structure without deterministic anchor mapping`,
        });
        continue;
      }

      const mapped = mapAnchoredRangeThroughOperations(
        this.#lastDocument,
        entry.thread.anchor.range,
        operations,
      );
      if (mapped.status === 'orphaned') {
        entry.tracker = undefined;
      } else {
        entry.tracker = new AnchoredRangeTracker(after, mapped.range);
      }
      this.#setLocalAnchor(threadId, mapped);
    }
    this.#lastDocument = cloneDocument(after);
  }

  #handleProviderEvent = (event: CommentThreadEvent): void => {
    if (this.#destroyed) return;
    const selfOrigin = event.originClientId === this.session.clientId;
    this.#ingestThread(event.thread, selfOrigin);
    const safeEvent: CommentThreadEvent = {
      type: event.type,
      thread: cloneThread(this.#requireThread(event.thread.id)),
      originClientId: event.originClientId,
    };
    this.options.onThread?.(safeEvent);
    this.editor.dispatchEvent(new CustomEvent<CommentsThreadDetail>('comments-thread', {
      detail: { event: safeEvent },
      bubbles: true,
      composed: true,
    }));
  };

  #ingestThread(thread: CommentThread, selfOrigin: boolean): void {
    const incoming = cloneThread(thread);
    const existing = this.#entries.get(incoming.id);

    if (existing && selfOrigin) {
      // Provider acknowledgements update revision/message state but must not
      // rewind a newer locally mapped anchor waiting in the persistence queue.
      incoming.anchor = cloneThread(existing.thread).anchor;
      existing.thread = incoming;
      return;
    }

    if (existing && anchorEquals(existing.thread.anchor, incoming.anchor)) {
      existing.thread = incoming;
      return;
    }

    let tracker: AnchoredRangeTracker | undefined;
    if (incoming.anchor.status !== 'orphaned') {
      try {
        tracker = new AnchoredRangeTracker(this.#lastDocument, incoming.anchor.range);
      } catch (error) {
        incoming.anchor = {
          status: 'orphaned',
          range: null,
          reason: 'Provider anchor is not valid for the current editor document',
        };
        this.#emitError(error);
      }
    }
    this.#entries.set(incoming.id, { thread: incoming, tracker });
  }

  #setLocalAnchor(threadId: string, anchor: AnchoredRangeMappingResult): void {
    const entry = this.#entries.get(threadId);
    if (!entry || anchorEquals(entry.thread.anchor, anchor)) return;
    entry.thread = { ...entry.thread, anchor: cloneAnchorState(anchor) };

    const safe = cloneThread(entry.thread);
    this.options.onAnchor?.(safe);
    this.editor.dispatchEvent(new CustomEvent<CommentsAnchorDetail>('comments-anchor', {
      detail: { thread: safe },
      bubbles: true,
      composed: true,
    }));

    const intended = cloneAnchorState(anchor);
    this.#anchorQueue = this.#anchorQueue
      .then(async () => {
        const current = this.#entries.get(threadId);
        if (!current) return;
        const updated = await this.session.updateAnchor(threadId, intended, {
          expectedRevision: current.thread.revision,
        });
        this.#ingestThread(updated, true);
      })
      .catch((error) => {
        this.#emitError(error);
        const latest = this.session.getThread(threadId);
        if (latest) this.#ingestThread(latest, false);
      });
  }

  #requireThread(threadId: string): CommentThread {
    const entry = this.#entries.get(threadId);
    if (!entry) throw new RangeError(`Unknown comment thread: ${threadId}`);
    return entry.thread;
  }

  #emitError(error: unknown): void {
    this.options.onError?.(error);
    this.editor.dispatchEvent(new CustomEvent<CommentsEditorErrorDetail>('comments-error', {
      detail: { error },
      bubbles: true,
      composed: true,
    }));
  }

  #assertActive(): void {
    if (this.#destroyed) throw new Error('Comments editor controller is disconnected');
  }
}

export async function connectComments(
  editor: ARichTextElement,
  provider: CommentsProvider,
  options: CommentsEditorOptions,
): Promise<CommentsEditorController> {
  const session = await provider.connect({
    documentId: options.documentId,
    clientId: options.clientId,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return new CommentsEditorController(editor, session, options);
}

function cloneDocument(document: ARTDocument): ARTDocument {
  return parseDocument(serializeDocument(document));
}

function anchorEquals(left: AnchoredRangeMappingResult, right: AnchoredRangeMappingResult): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneAnchorState(anchor: AnchoredRangeMappingResult): AnchoredRangeMappingResult {
  return JSON.parse(JSON.stringify(anchor)) as AnchoredRangeMappingResult;
}

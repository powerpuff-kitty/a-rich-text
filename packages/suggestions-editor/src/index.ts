import {
  AnchoredRangeTracker,
  createAnchoredRange,
  inferSimpleReconcileOperations,
  listInlineBlocks,
  mapAnchoredRangeThroughOperations,
  samePath,
  samePoint,
  type AnchoredRangeMappingResult,
} from '@arichtext/annotations';
import {
  parseDocument,
  serializeDocument,
  type ARTDocument,
  type ARTJSONObject,
} from '@arichtext/core';
import { transaction, type TransactionResult } from '@arichtext/engine';
import {
  SuggestionsError,
  cloneSuggestion,
  type SuggestionAuthor,
  type SuggestionEvent,
  type SuggestionsProvider,
  type SuggestionsSession,
  type TrackedSuggestion,
} from '@arichtext/suggestions';
import type { ARichTextElement } from '@arichtext/web-component';

export type SuggestionsEditorErrorCode =
  | 'editor-locked'
  | 'no-selection'
  | 'cross-block-selection'
  | 'source-mismatch'
  | 'persistence-failed'
  | 'disconnected';

export class SuggestionsEditorError extends Error {
  readonly code: SuggestionsEditorErrorCode;
  readonly cause?: unknown;
  readonly transactionResult?: TransactionResult;
  readonly suggestion?: TrackedSuggestion;

  constructor(
    code: SuggestionsEditorErrorCode,
    message: string,
    options: {
      cause?: unknown;
      transactionResult?: TransactionResult;
      suggestion?: TrackedSuggestion;
    } = {},
  ) {
    super(message);
    this.name = 'SuggestionsEditorError';
    this.code = code;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.transactionResult !== undefined) this.transactionResult = options.transactionResult;
    if (options.suggestion !== undefined) this.suggestion = cloneSuggestion(options.suggestion);
  }
}

export interface SuggestionsEditorOptions {
  documentId: string;
  clientId: string;
  author?: SuggestionAuthor;
  captureQuote?: boolean;
  quoteContextChars?: number;
  signal?: AbortSignal;
  onSuggestion?: (event: SuggestionEvent) => void;
  onConflict?: (suggestion: TrackedSuggestion) => void;
  onApplied?: (suggestion: TrackedSuggestion, result: TransactionResult) => void;
  onError?: (error: unknown) => void;
}

export interface CreateEditorSuggestionOptions {
  author?: SuggestionAuthor;
  metadata?: ARTJSONObject;
  id?: string;
}

export interface SuggestionEventDetail {
  event: SuggestionEvent;
}

export interface SuggestionConflictDetail {
  suggestion: TrackedSuggestion;
}

export interface SuggestionAppliedDetail {
  suggestion: TrackedSuggestion;
  result: TransactionResult;
}

export interface SuggestionsEditorErrorDetail {
  error: unknown;
}

interface SuggestionEntry {
  suggestion: TrackedSuggestion;
  tracker?: AnchoredRangeTracker;
}

export class SuggestionsEditorController {
  readonly editor: ARichTextElement;
  readonly session: SuggestionsSession;
  readonly options: SuggestionsEditorOptions;

  #entries = new Map<string, SuggestionEntry>();
  #lastDocument: ARTDocument;
  #mutationQueue: Promise<void> = Promise.resolve();
  #pendingLocal = new Set<string>();
  #unsubscribeProvider?: () => void;
  #destroyed = false;
  #applyingSuggestionId: string | null = null;

  constructor(
    editor: ARichTextElement,
    session: SuggestionsSession,
    options: SuggestionsEditorOptions,
  ) {
    this.editor = editor;
    this.session = session;
    this.options = options;
    this.#lastDocument = cloneDocument(editor.getJSON());

    for (const suggestion of session.listSuggestions()) this.#ingestSuggestion(suggestion, false);
    this.#unsubscribeProvider = session.subscribe(this.#handleProviderEvent);
    editor.addEventListener('transaction', this.#handleTransaction);
    editor.addEventListener('reconcile', this.#handleReconcile);
    editor.addEventListener('collaboration-remote-document', this.#handleRemoteDocument);
  }

  get suggestions(): readonly TrackedSuggestion[] {
    return [...this.#entries.values()]
      .map((entry) => cloneSuggestion(entry.suggestion))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  getSuggestion(suggestionId: string): TrackedSuggestion | null {
    const entry = this.#entries.get(suggestionId);
    return entry ? cloneSuggestion(entry.suggestion) : null;
  }

  async createSuggestion(
    replacementText: string,
    options: CreateEditorSuggestionOptions = {},
  ): Promise<TrackedSuggestion> {
    this.#assertActive();
    const author = options.author ?? this.options.author;
    if (!author) throw new TypeError('Suggestion author is required');

    const selection = this.editor.getSelection();
    if (!selection) throw new SuggestionsEditorError('no-selection', 'Creating a suggestion requires a logical editor selection');
    if (!samePath(selection.anchor.blockPath, selection.head.blockPath)) {
      throw new SuggestionsEditorError(
        'cross-block-selection',
        'Text suggestions currently require one paragraph/heading block',
      );
    }

    const document = cloneDocument(this.editor.getJSON());
    const range = createAnchoredRange(document, selection, {
      captureQuote: this.options.captureQuote ?? true,
      quoteContextChars: this.options.quoteContextChars,
    });
    const anchor: AnchoredRangeMappingResult = samePoint(range.start, range.end)
      ? { status: 'collapsed', range }
      : { status: 'mapped', range };
    const originalText = textAtAnchor(document, anchor);
    if (originalText === null) {
      throw new SuggestionsEditorError(
        'cross-block-selection',
        'Suggestion source no longer resolves to one text block',
      );
    }

    const created = await this.session.createSuggestion({
      anchor,
      originalText,
      replacementText,
      author,
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
      ...(options.id !== undefined ? { id: options.id } : {}),
    });
    this.#ingestSuggestion(created, true);
    return cloneSuggestion(this.#requireSuggestion(created.id));
  }

  async accept(
    suggestionId: string,
    reviewer: SuggestionAuthor | undefined = this.options.author,
  ): Promise<TrackedSuggestion> {
    this.#assertActive();
    if (this.editor.disabled || this.editor.readOnly) {
      throw new SuggestionsEditorError('editor-locked', 'Cannot accept a suggestion in a disabled or readonly editor');
    }
    if (!reviewer) throw new TypeError('Suggestion reviewer is required');

    let suggestion = this.#refreshSuggestion(suggestionId);
    this.#assertPendingSource(suggestion);

    const anchor = suggestion.anchor;
    if (anchor.status === 'orphaned') {
      suggestion = await this.#conflictNow(
        suggestion,
        'Suggestion anchor is orphaned and cannot be accepted safely',
      );
      throw new SuggestionsEditorError('source-mismatch', 'Suggestion anchor is orphaned', { suggestion });
    }

    const currentText = textAtAnchor(this.editor.getJSON(), anchor);
    if (currentText === null || currentText !== suggestion.originalText) {
      suggestion = await this.#conflictNow(
        suggestion,
        'Suggestion source text changed before acceptance',
      );
      throw new SuggestionsEditorError('source-mismatch', 'Suggestion source text changed before acceptance', { suggestion });
    }

    const start = anchor.range.start;
    const end = anchor.range.end;
    const tx = transaction()
      .replaceText(
        { blockPath: [...start.blockPath], offset: start.offset },
        { blockPath: [...end.blockPath], offset: end.offset },
        suggestion.replacementText,
      )
      .setMeta('suggestionId', suggestion.id)
      .setMeta('suggestionAction', 'accept')
      .build();

    this.#applyingSuggestionId = suggestion.id;
    let result: TransactionResult;
    try {
      result = this.editor.dispatch(tx);
    } finally {
      this.#applyingSuggestionId = null;
    }

    try {
      const accepted = await this.#resolveAccepted(suggestion, reviewer);
      this.#ingestSuggestion(accepted, true);
      const safe = cloneSuggestion(this.#requireSuggestion(accepted.id));
      this.options.onApplied?.(safe, result);
      this.editor.dispatchEvent(new CustomEvent<SuggestionAppliedDetail>('suggestion-applied', {
        detail: { suggestion: safe, result },
        bubbles: true,
        composed: true,
      }));
      return safe;
    } catch (error) {
      const persistenceError = new SuggestionsEditorError(
        'persistence-failed',
        'Suggestion text was applied, but provider acceptance could not be persisted',
        { cause: error, transactionResult: result, suggestion },
      );
      this.#emitError(persistenceError);
      throw persistenceError;
    }
  }

  async reject(
    suggestionId: string,
    reviewer: SuggestionAuthor | undefined = this.options.author,
  ): Promise<TrackedSuggestion> {
    this.#assertActive();
    if (!reviewer) throw new TypeError('Suggestion reviewer is required');
    const suggestion = this.#refreshSuggestion(suggestionId);
    this.#assertPendingSource(suggestion, false);
    const rejected = await this.session.rejectSuggestion(suggestion.id, {
      reviewer,
      expectedRevision: suggestion.revision,
    });
    this.#ingestSuggestion(rejected, true);
    return cloneSuggestion(this.#requireSuggestion(rejected.id));
  }

  /** Reconcile anchors after programmatic `setJSON/setHTML/setMarkdown/setText`. */
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
    await this.#mutationQueue.catch(() => undefined);
    this.#pendingLocal.clear();
    await this.session.close();
  }

  #handleTransaction = (event: Event): void => {
    if (this.#destroyed) return;
    const result = (event as CustomEvent<{ result?: TransactionResult }>).detail?.result;
    if (!result) return;
    const before = this.#lastDocument;
    const after = cloneDocument(result.state.document);

    for (const [suggestionId, entry] of this.#entries) {
      if (entry.suggestion.status !== 'pending' || !entry.tracker) continue;
      if (suggestionId === this.#applyingSuggestionId) continue;

      const mapped = entry.tracker.handle(before, result);
      this.#processMappedSuggestion(suggestionId, mapped, after);
    }
    this.#lastDocument = after;
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

    for (const [suggestionId, entry] of this.#entries) {
      if (entry.suggestion.status !== 'pending') continue;
      if (operations === null) {
        this.#queueConflict(suggestionId, {
          status: 'orphaned',
          range: null,
          reason: `${reason} changed document structure without deterministic suggestion mapping`,
        }, `${reason} invalidated suggestion structure`);
        continue;
      }

      const mapped = mapAnchoredRangeThroughOperations(
        this.#lastDocument,
        entry.suggestion.anchor.status === 'orphaned'
          ? null as never
          : entry.suggestion.anchor.range,
        operations,
      );
      this.#processMappedSuggestion(suggestionId, mapped, after);
      if (mapped.status !== 'orphaned') {
        entry.tracker = new AnchoredRangeTracker(after, mapped.range);
      }
    }
    this.#lastDocument = after;
  }

  #processMappedSuggestion(
    suggestionId: string,
    mapped: AnchoredRangeMappingResult,
    after: ARTDocument,
  ): void {
    const entry = this.#entries.get(suggestionId);
    if (!entry || entry.suggestion.status !== 'pending') return;

    if (mapped.status === 'orphaned') {
      entry.tracker = undefined;
      this.#queueConflict(suggestionId, mapped, mapped.reason ?? 'Suggestion anchor became orphaned');
      return;
    }

    const currentText = textAtAnchor(after, mapped);
    if (currentText === null || currentText !== entry.suggestion.originalText) {
      entry.tracker = undefined;
      this.#queueConflict(suggestionId, mapped, 'Suggestion source text changed');
      return;
    }

    entry.tracker = new AnchoredRangeTracker(after, mapped.range);
    this.#setLocalAnchor(suggestionId, mapped);
  }

  #handleProviderEvent = (event: SuggestionEvent): void => {
    if (this.#destroyed) return;
    const selfOrigin = event.originClientId === this.session.clientId;
    this.#ingestSuggestion(event.suggestion, selfOrigin);
    const safe: SuggestionEvent = {
      type: event.type,
      suggestion: cloneSuggestion(this.#requireSuggestion(event.suggestion.id)),
      originClientId: event.originClientId,
    };
    this.options.onSuggestion?.(safe);
    this.editor.dispatchEvent(new CustomEvent<SuggestionEventDetail>('suggestion-event', {
      detail: { event: safe },
      bubbles: true,
      composed: true,
    }));
  };

  #ingestSuggestion(suggestion: TrackedSuggestion, selfOrigin: boolean): void {
    const incoming = cloneSuggestion(suggestion);
    const existing = this.#entries.get(incoming.id);
    const pending = this.#pendingLocal.has(incoming.id);

    if (existing && pending && incoming.status === 'pending') {
      incoming.anchor = cloneAnchorState(existing.suggestion.anchor);
      existing.suggestion = incoming;
      return;
    }

    if (existing && selfOrigin && existing.suggestion.status !== 'pending' && incoming.status === 'pending') {
      return;
    }

    let tracker: AnchoredRangeTracker | undefined;
    if (incoming.status === 'pending' && incoming.anchor.status !== 'orphaned') {
      try {
        tracker = new AnchoredRangeTracker(this.#lastDocument, incoming.anchor.range);
        if (textAtAnchor(this.#lastDocument, incoming.anchor) !== incoming.originalText) {
          tracker = undefined;
          incoming.status = 'conflicted';
          incoming.conflictReason = 'Provider suggestion source does not match current editor document';
        }
      } catch (error) {
        tracker = undefined;
        incoming.status = 'conflicted';
        incoming.conflictReason = 'Provider suggestion anchor is invalid for the current editor document';
        this.#emitError(error);
      }
    }
    this.#entries.set(incoming.id, { suggestion: incoming, tracker });
  }

  #setLocalAnchor(suggestionId: string, anchor: AnchoredRangeMappingResult): void {
    const entry = this.#entries.get(suggestionId);
    if (!entry || entry.suggestion.status !== 'pending') return;
    if (anchorEquals(entry.suggestion.anchor, anchor)) return;
    entry.suggestion = { ...entry.suggestion, anchor: cloneAnchorState(anchor) };
    this.#pendingLocal.add(suggestionId);
    const intended = cloneAnchorState(anchor);
    this.#mutationQueue = this.#mutationQueue
      .then(() => this.#persistAnchor(suggestionId, intended))
      .catch((error) => this.#emitError(error));
  }

  #queueConflict(
    suggestionId: string,
    anchor: AnchoredRangeMappingResult,
    reason: string,
  ): void {
    const entry = this.#entries.get(suggestionId);
    if (!entry || entry.suggestion.status !== 'pending') return;
    entry.suggestion = {
      ...entry.suggestion,
      anchor: cloneAnchorState(anchor),
      status: 'conflicted',
      conflictReason: reason,
      resolvedAt: Date.now(),
    };
    entry.tracker = undefined;
    this.#pendingLocal.add(suggestionId);
    const intended = cloneAnchorState(anchor);
    this.#emitConflict(entry.suggestion);
    this.#mutationQueue = this.#mutationQueue
      .then(() => this.#persistConflict(suggestionId, intended, reason))
      .catch((error) => this.#emitError(error));
  }

  async #persistAnchor(
    suggestionId: string,
    anchor: AnchoredRangeMappingResult,
    attempts = 3,
  ): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const entry = this.#entries.get(suggestionId);
      if (!entry || entry.suggestion.status !== 'pending') return;
      try {
        const updated = await this.session.updateAnchor(suggestionId, anchor, {
          expectedRevision: entry.suggestion.revision,
        });
        this.#ingestSuggestion(updated, true);
        if (anchorEquals(this.#requireSuggestion(suggestionId).anchor, anchor)) {
          this.#pendingLocal.delete(suggestionId);
        }
        return;
      } catch (error) {
        if (!(error instanceof SuggestionsError) || error.code !== 'revision-conflict' || attempt === attempts - 1) {
          throw error;
        }
        const latest = this.session.getSuggestion(suggestionId);
        if (!latest || latest.status !== 'pending') {
          if (latest) this.#ingestSuggestion(latest, false);
          return;
        }
        this.#ingestSuggestion(latest, false);
      }
    }
  }

  async #persistConflict(
    suggestionId: string,
    anchor: AnchoredRangeMappingResult,
    reason: string,
    attempts = 3,
  ): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const latest = this.session.getSuggestion(suggestionId);
      if (!latest) return;
      if (latest.status !== 'pending') {
        this.#pendingLocal.delete(suggestionId);
        this.#ingestSuggestion(latest, false);
        return;
      }
      try {
        const updated = await this.session.markConflicted(suggestionId, {
          reason,
          anchor,
          expectedRevision: latest.revision,
        });
        this.#pendingLocal.delete(suggestionId);
        this.#ingestSuggestion(updated, true);
        return;
      } catch (error) {
        if (!(error instanceof SuggestionsError) || error.code !== 'revision-conflict' || attempt === attempts - 1) {
          throw error;
        }
      }
    }
  }

  async #conflictNow(
    suggestion: TrackedSuggestion,
    reason: string,
  ): Promise<TrackedSuggestion> {
    if (suggestion.status !== 'pending') return suggestion;
    const updated = await this.session.markConflicted(suggestion.id, {
      reason,
      anchor: suggestion.anchor,
      expectedRevision: suggestion.revision,
    });
    this.#pendingLocal.delete(suggestion.id);
    this.#ingestSuggestion(updated, true);
    this.#emitConflict(updated);
    return cloneSuggestion(this.#requireSuggestion(updated.id));
  }

  async #resolveAccepted(
    original: TrackedSuggestion,
    reviewer: SuggestionAuthor,
  ): Promise<TrackedSuggestion> {
    let expectedRevision = original.revision;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.session.acceptSuggestion(original.id, {
          reviewer,
          expectedRevision,
        });
      } catch (error) {
        if (!(error instanceof SuggestionsError) || error.code !== 'revision-conflict' || attempt === 1) throw error;
        const latest = this.session.getSuggestion(original.id);
        if (!latest || latest.status !== 'pending') throw error;
        if (
          latest.originalText !== original.originalText
          || latest.replacementText !== original.replacementText
          || !anchorEquals(latest.anchor, original.anchor)
        ) {
          throw error;
        }
        expectedRevision = latest.revision;
        this.#ingestSuggestion(latest, false);
      }
    }
    throw new Error('Unreachable suggestion acceptance state');
  }

  #refreshSuggestion(suggestionId: string): TrackedSuggestion {
    const latest = this.session.getSuggestion(suggestionId);
    if (!latest) throw new RangeError(`Unknown suggestion: ${suggestionId}`);
    this.#ingestSuggestion(latest, false);
    return cloneSuggestion(this.#requireSuggestion(suggestionId));
  }

  #assertPendingSource(suggestion: TrackedSuggestion, validateSource = true): void {
    if (suggestion.status !== 'pending') {
      throw new SuggestionsError('invalid-transition', `Suggestion ${suggestion.id} is ${suggestion.status}`);
    }
    if (!validateSource) return;
    const text = textAtAnchor(this.editor.getJSON(), suggestion.anchor);
    if (text === null || text !== suggestion.originalText) {
      throw new SuggestionsEditorError('source-mismatch', 'Suggestion source text no longer matches the document', {
        suggestion,
      });
    }
  }

  #requireSuggestion(suggestionId: string): TrackedSuggestion {
    const entry = this.#entries.get(suggestionId);
    if (!entry) throw new RangeError(`Unknown suggestion: ${suggestionId}`);
    return entry.suggestion;
  }

  #emitConflict(suggestion: TrackedSuggestion): void {
    const safe = cloneSuggestion(suggestion);
    this.options.onConflict?.(safe);
    this.editor.dispatchEvent(new CustomEvent<SuggestionConflictDetail>('suggestion-conflict', {
      detail: { suggestion: safe },
      bubbles: true,
      composed: true,
    }));
  }

  #emitError(error: unknown): void {
    this.options.onError?.(error);
    this.editor.dispatchEvent(new CustomEvent<SuggestionsEditorErrorDetail>('suggestions-error', {
      detail: { error },
      bubbles: true,
      composed: true,
    }));
  }

  #assertActive(): void {
    if (this.#destroyed) {
      throw new SuggestionsEditorError('disconnected', 'Suggestions editor controller is disconnected');
    }
  }
}

export async function connectSuggestions(
  editor: ARichTextElement,
  provider: SuggestionsProvider,
  options: SuggestionsEditorOptions,
): Promise<SuggestionsEditorController> {
  const session = await provider.connect({
    documentId: options.documentId,
    clientId: options.clientId,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return new SuggestionsEditorController(editor, session, options);
}

function textAtAnchor(
  document: ARTDocument,
  anchor: AnchoredRangeMappingResult,
): string | null {
  if (anchor.status === 'orphaned') return null;
  const { start, end } = anchor.range;
  if (!samePath(start.blockPath, end.blockPath)) return null;
  const block = listInlineBlocks(document).find((entry) => samePath(entry.path, start.blockPath));
  if (!block || start.offset > block.text.length || end.offset > block.text.length) return null;
  return block.text.slice(start.offset, end.offset);
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

import {
  SuggestionsError,
  type ConflictSuggestionInput,
  type CreateSuggestionInput,
  type ResolveSuggestionInput,
  type SuggestionEvent,
  type SuggestionMutationOptions,
  type SuggestionsConnectionOptions,
  type SuggestionsProvider,
  type SuggestionsSession,
  type TrackedSuggestion,
} from './types.js';
import {
  assertIdentifier,
  cloneAnchor,
  cloneAuthor,
  cloneJSONObject,
  cloneSuggestion,
  deriveSuggestionKind,
  normalizeConflictReason,
} from './validation.js';

interface SuggestionsRoom {
  suggestions: Map<string, TrackedSuggestion>;
  sessions: Set<MemorySuggestionsSession>;
}

export class MemorySuggestionsProvider implements SuggestionsProvider {
  readonly name = 'memory';
  #rooms = new Map<string, SuggestionsRoom>();

  async connect(options: SuggestionsConnectionOptions): Promise<SuggestionsSession> {
    assertIdentifier(options.documentId, 'document id');
    assertIdentifier(options.clientId, 'client id');
    if (options.signal?.aborted) {
      throw new SuggestionsError('aborted', 'Suggestions connection was aborted', options.signal.reason);
    }

    const room = this.#rooms.get(options.documentId) ?? {
      suggestions: new Map<string, TrackedSuggestion>(),
      sessions: new Set<MemorySuggestionsSession>(),
    };
    this.#rooms.set(options.documentId, room);

    const session = new MemorySuggestionsSession(room, options.documentId, options.clientId);
    room.sessions.add(session);

    if (options.signal) {
      const abort = () => { void session.close(); };
      options.signal.addEventListener('abort', abort, { once: true });
      session.onClose(() => options.signal?.removeEventListener('abort', abort));
    }

    return session;
  }
}

export function createMemorySuggestionsProvider(): MemorySuggestionsProvider {
  return new MemorySuggestionsProvider();
}

class MemorySuggestionsSession implements SuggestionsSession {
  readonly documentId: string;
  readonly clientId: string;
  #room: SuggestionsRoom;
  #listeners = new Set<(event: SuggestionEvent) => void>();
  #closeListeners = new Set<() => void>();
  #closed = false;
  #sequence = 0;

  constructor(room: SuggestionsRoom, documentId: string, clientId: string) {
    this.#room = room;
    this.documentId = documentId;
    this.clientId = clientId;
  }

  listSuggestions(): readonly TrackedSuggestion[] {
    this.#assertOpen();
    return [...this.#room.suggestions.values()]
      .map(cloneSuggestion)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  getSuggestion(suggestionId: string): TrackedSuggestion | null {
    this.#assertOpen();
    assertIdentifier(suggestionId, 'suggestion id');
    const suggestion = this.#room.suggestions.get(suggestionId);
    return suggestion ? cloneSuggestion(suggestion) : null;
  }

  async createSuggestion(input: CreateSuggestionInput): Promise<TrackedSuggestion> {
    this.#assertOpen();
    const id = input.id ?? this.#newId('suggestion');
    assertIdentifier(id, 'suggestion id');
    if (this.#room.suggestions.has(id)) {
      throw new SuggestionsError('invalid-suggestion', `Suggestion already exists: ${id}`);
    }

    const anchor = cloneAnchor(input.anchor);
    if (anchor.status === 'orphaned') {
      throw new SuggestionsError('invalid-anchor', 'New suggestions cannot start with an orphaned anchor');
    }

    const originalText = input.originalText;
    const replacementText = input.replacementText;
    const kind = deriveSuggestionKind(originalText, replacementText);
    const now = Date.now();
    const suggestion: TrackedSuggestion = {
      id,
      documentId: this.documentId,
      anchor,
      kind,
      originalText,
      replacementText,
      author: cloneAuthor(input.author),
      status: 'pending',
      revision: '1',
      createdAt: now,
      updatedAt: now,
      ...(input.metadata !== undefined
        ? { metadata: cloneJSONObject(input.metadata, 'suggestion metadata')! }
        : {}),
    };

    this.#room.suggestions.set(id, cloneSuggestion(suggestion));
    this.#broadcast('created', suggestion);
    return cloneSuggestion(suggestion);
  }

  async updateAnchor(
    suggestionId: string,
    anchor: TrackedSuggestion['anchor'],
    options: SuggestionMutationOptions = {},
  ): Promise<TrackedSuggestion> {
    const safeAnchor = cloneAnchor(anchor);
    return this.#mutatePending(suggestionId, options, (suggestion) => {
      if (JSON.stringify(suggestion.anchor) === JSON.stringify(safeAnchor)) return;
      suggestion.anchor = safeAnchor;
    });
  }

  async acceptSuggestion(
    suggestionId: string,
    input: ResolveSuggestionInput,
  ): Promise<TrackedSuggestion> {
    const reviewer = cloneAuthor(input.reviewer);
    return this.#mutatePending(suggestionId, input, (suggestion, now) => {
      suggestion.status = 'accepted';
      suggestion.resolvedAt = now;
      suggestion.resolvedBy = reviewer;
      delete suggestion.conflictReason;
    });
  }

  async rejectSuggestion(
    suggestionId: string,
    input: ResolveSuggestionInput,
  ): Promise<TrackedSuggestion> {
    const reviewer = cloneAuthor(input.reviewer);
    return this.#mutatePending(suggestionId, input, (suggestion, now) => {
      suggestion.status = 'rejected';
      suggestion.resolvedAt = now;
      suggestion.resolvedBy = reviewer;
      delete suggestion.conflictReason;
    });
  }

  async markConflicted(
    suggestionId: string,
    input: ConflictSuggestionInput,
  ): Promise<TrackedSuggestion> {
    const reason = normalizeConflictReason(input.reason);
    const reviewer = input.reviewer ? cloneAuthor(input.reviewer) : undefined;
    return this.#mutatePending(suggestionId, input, (suggestion, now) => {
      suggestion.status = 'conflicted';
      suggestion.conflictReason = reason;
      suggestion.resolvedAt = now;
      if (reviewer) suggestion.resolvedBy = reviewer;
    });
  }

  subscribe(listener: (event: SuggestionEvent) => void): () => void {
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

  receive(event: SuggestionEvent): void {
    if (this.#closed) return;
    const safe: SuggestionEvent = {
      type: event.type,
      suggestion: cloneSuggestion(event.suggestion),
      originClientId: event.originClientId,
    };
    for (const listener of this.#listeners) listener(safe);
  }

  onClose(listener: () => void): void {
    this.#closeListeners.add(listener);
  }

  async #mutatePending(
    suggestionId: string,
    options: SuggestionMutationOptions,
    mutate: (suggestion: TrackedSuggestion, now: number) => void,
  ): Promise<TrackedSuggestion> {
    this.#assertOpen();
    assertIdentifier(suggestionId, 'suggestion id');
    const stored = this.#room.suggestions.get(suggestionId);
    if (!stored) throw new SuggestionsError('not-found', `Unknown suggestion: ${suggestionId}`);
    if (options.expectedRevision !== undefined && options.expectedRevision !== stored.revision) {
      throw new SuggestionsError(
        'revision-conflict',
        `Expected suggestion revision ${options.expectedRevision}, current ${stored.revision}`,
      );
    }
    if (stored.status !== 'pending') {
      throw new SuggestionsError(
        'invalid-transition',
        `Suggestion ${suggestionId} is already ${stored.status}`,
      );
    }

    const suggestion = cloneSuggestion(stored);
    const before = JSON.stringify(suggestion);
    const now = Date.now();
    mutate(suggestion, now);
    if (JSON.stringify(suggestion) === before) return cloneSuggestion(stored);

    suggestion.updatedAt = now;
    suggestion.revision = String(Number.parseInt(stored.revision, 10) + 1);
    this.#room.suggestions.set(suggestionId, cloneSuggestion(suggestion));
    this.#broadcast('updated', suggestion);
    return cloneSuggestion(suggestion);
  }

  #broadcast(type: SuggestionEvent['type'], suggestion: TrackedSuggestion): void {
    const event: SuggestionEvent = {
      type,
      suggestion: cloneSuggestion(suggestion),
      originClientId: this.clientId,
    };
    for (const session of this.#room.sessions) session.receive(event);
  }

  #newId(kind: string): string {
    this.#sequence += 1;
    return `${this.clientId}:${kind}:${this.#sequence}:${randomPart()}`;
  }

  #assertOpen(): void {
    if (this.#closed) throw new SuggestionsError('closed', 'Suggestions session is closed');
  }
}

function randomPart(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

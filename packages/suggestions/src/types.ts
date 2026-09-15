import type { AnchoredRangeMappingResult } from '@arichtext/annotations';
import type { ARTJSONObject } from '@arichtext/core';

export type SuggestionKind = 'insert' | 'delete' | 'replace';
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'conflicted';

export interface SuggestionAuthor {
  id: string;
  data?: ARTJSONObject;
}

export interface TrackedSuggestion {
  id: string;
  documentId: string;
  anchor: AnchoredRangeMappingResult;
  kind: SuggestionKind;
  originalText: string;
  replacementText: string;
  author: SuggestionAuthor;
  status: SuggestionStatus;
  revision: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolvedBy?: SuggestionAuthor;
  conflictReason?: string;
  metadata?: ARTJSONObject;
}

export interface CreateSuggestionInput {
  anchor: AnchoredRangeMappingResult;
  originalText: string;
  replacementText: string;
  author: SuggestionAuthor;
  metadata?: ARTJSONObject;
  id?: string;
}

export interface SuggestionMutationOptions {
  expectedRevision?: string;
}

export interface ResolveSuggestionInput extends SuggestionMutationOptions {
  reviewer: SuggestionAuthor;
}

export interface ConflictSuggestionInput extends SuggestionMutationOptions {
  reason: string;
  reviewer?: SuggestionAuthor;
  /** Latest deterministic location, including orphaned state, at conflict time. */
  anchor?: AnchoredRangeMappingResult;
}

export interface SuggestionEvent {
  type: 'created' | 'updated';
  suggestion: TrackedSuggestion;
  originClientId: string;
}

export interface SuggestionsConnectionOptions {
  documentId: string;
  clientId: string;
  signal?: AbortSignal;
}

export interface SuggestionsSession {
  readonly documentId: string;
  readonly clientId: string;

  listSuggestions(): readonly TrackedSuggestion[];
  getSuggestion(suggestionId: string): TrackedSuggestion | null;

  createSuggestion(input: CreateSuggestionInput): Promise<TrackedSuggestion>;
  updateAnchor(
    suggestionId: string,
    anchor: AnchoredRangeMappingResult,
    options?: SuggestionMutationOptions,
  ): Promise<TrackedSuggestion>;
  acceptSuggestion(suggestionId: string, input: ResolveSuggestionInput): Promise<TrackedSuggestion>;
  rejectSuggestion(suggestionId: string, input: ResolveSuggestionInput): Promise<TrackedSuggestion>;
  markConflicted(suggestionId: string, input: ConflictSuggestionInput): Promise<TrackedSuggestion>;

  subscribe(listener: (event: SuggestionEvent) => void): () => void;
  close(): Promise<void>;
}

export interface SuggestionsProvider {
  readonly name: string;
  connect(options: SuggestionsConnectionOptions): Promise<SuggestionsSession>;
}

export type SuggestionsErrorCode =
  | 'invalid-config'
  | 'invalid-suggestion'
  | 'invalid-anchor'
  | 'not-found'
  | 'revision-conflict'
  | 'invalid-transition'
  | 'closed'
  | 'aborted'
  | 'provider-error';

export class SuggestionsError extends Error {
  readonly code: SuggestionsErrorCode;
  readonly cause?: unknown;

  constructor(code: SuggestionsErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'SuggestionsError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

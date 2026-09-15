import { cloneAnchoredRange, type AnchoredRangeMappingResult } from '@arichtext/annotations';
import { isARTJSONValue, type ARTJSONObject } from '@arichtext/core';
import {
  SuggestionsError,
  type SuggestionAuthor,
  type SuggestionKind,
  type TrackedSuggestion,
} from './types.js';

const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 500_000;
const MAX_REASON_LENGTH = 10_000;

export function assertIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_ID_LENGTH) {
    throw new SuggestionsError('invalid-config', `${label} must be a non-empty string up to ${MAX_ID_LENGTH} characters`);
  }
}

export function deriveSuggestionKind(originalText: string, replacementText: string): SuggestionKind {
  validateText(originalText, 'original text');
  validateText(replacementText, 'replacement text');
  if (!originalText && !replacementText) {
    throw new SuggestionsError('invalid-suggestion', 'Suggestion must insert, delete, or replace text');
  }
  if (!originalText) return 'insert';
  if (!replacementText) return 'delete';
  return 'replace';
}

export function cloneAuthor(author: SuggestionAuthor): SuggestionAuthor {
  if (!author || typeof author !== 'object') throw new SuggestionsError('invalid-suggestion', 'Suggestion author is required');
  assertIdentifier(author.id, 'author id');
  const data = cloneJSONObject(author.data, 'author metadata');
  return { id: author.id, ...(data ? { data } : {}) };
}

export function cloneAnchor(anchor: AnchoredRangeMappingResult): AnchoredRangeMappingResult {
  if (!anchor || typeof anchor !== 'object') throw new SuggestionsError('invalid-anchor', 'Suggestion anchor is required');
  if (anchor.status === 'orphaned') {
    if (anchor.range !== null || typeof anchor.reason !== 'string' || !anchor.reason.trim()) {
      throw new SuggestionsError('invalid-anchor', 'Orphaned anchor requires null range and a reason');
    }
    return { status: 'orphaned', range: null, reason: anchor.reason };
  }
  if (anchor.status !== 'mapped' && anchor.status !== 'collapsed') {
    throw new SuggestionsError('invalid-anchor', 'Unknown suggestion anchor status');
  }
  validateRangeShape(anchor.range);
  return {
    status: anchor.status,
    range: cloneAnchoredRange(anchor.range),
    ...(anchor.reason !== undefined ? { reason: String(anchor.reason) } : {}),
  };
}

export function cloneSuggestion(suggestion: TrackedSuggestion): TrackedSuggestion {
  if (!suggestion || typeof suggestion !== 'object') throw new SuggestionsError('invalid-suggestion', 'Suggestion is required');
  assertIdentifier(suggestion.id, 'suggestion id');
  assertIdentifier(suggestion.documentId, 'document id');
  if (!['pending', 'accepted', 'rejected', 'conflicted'].includes(suggestion.status)) {
    throw new SuggestionsError('invalid-suggestion', 'Invalid suggestion status');
  }
  const kind = deriveSuggestionKind(suggestion.originalText, suggestion.replacementText);
  if (kind !== suggestion.kind) {
    throw new SuggestionsError('invalid-suggestion', `Suggestion kind ${suggestion.kind} does not match text payload (${kind})`);
  }
  if (typeof suggestion.revision !== 'string' || !suggestion.revision) {
    throw new SuggestionsError('invalid-suggestion', 'Suggestion revision is required');
  }
  if (!Number.isFinite(suggestion.createdAt) || !Number.isFinite(suggestion.updatedAt)) {
    throw new SuggestionsError('invalid-suggestion', 'Suggestion timestamps must be finite');
  }
  if (suggestion.conflictReason !== undefined) normalizeConflictReason(suggestion.conflictReason);
  if (suggestion.status === 'conflicted' && !suggestion.conflictReason) {
    throw new SuggestionsError('invalid-suggestion', 'Conflicted suggestion requires a conflict reason');
  }

  return {
    id: suggestion.id,
    documentId: suggestion.documentId,
    anchor: cloneAnchor(suggestion.anchor),
    kind,
    originalText: suggestion.originalText,
    replacementText: suggestion.replacementText,
    author: cloneAuthor(suggestion.author),
    status: suggestion.status,
    revision: suggestion.revision,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
    ...(suggestion.resolvedAt !== undefined ? { resolvedAt: finiteTimestamp(suggestion.resolvedAt, 'resolved') } : {}),
    ...(suggestion.resolvedBy !== undefined ? { resolvedBy: cloneAuthor(suggestion.resolvedBy) } : {}),
    ...(suggestion.conflictReason !== undefined ? { conflictReason: normalizeConflictReason(suggestion.conflictReason) } : {}),
    ...(suggestion.metadata !== undefined ? { metadata: cloneJSONObject(suggestion.metadata, 'suggestion metadata')! } : {}),
  };
}

export function cloneJSONObject(value: ARTJSONObject | undefined, label: string): ARTJSONObject | undefined {
  if (value === undefined) return undefined;
  if (!isARTJSONValue(value) || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SuggestionsError('invalid-suggestion', `${label} must be a JSON-safe object`);
  }
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as ARTJSONObject;
}

export function normalizeConflictReason(value: string): string {
  if (typeof value !== 'string') throw new SuggestionsError('invalid-suggestion', 'Conflict reason must be a string');
  const reason = value.trim();
  if (!reason || reason.length > MAX_REASON_LENGTH) {
    throw new SuggestionsError('invalid-suggestion', `Conflict reason must be 1-${MAX_REASON_LENGTH} characters`);
  }
  return reason;
}

function validateText(value: string, label: string): void {
  if (typeof value !== 'string') throw new SuggestionsError('invalid-suggestion', `${label} must be a string`);
  if (value.length > MAX_TEXT_LENGTH) throw new SuggestionsError('invalid-suggestion', `${label} exceeds ${MAX_TEXT_LENGTH} characters`);
}

function finiteTimestamp(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new SuggestionsError('invalid-suggestion', `${label} timestamp must be finite and non-negative`);
  return value;
}

function validateRangeShape(range: NonNullable<Extract<AnchoredRangeMappingResult, { status: 'mapped' | 'collapsed' }>['range']>): void {
  for (const point of [range.start, range.end]) {
    if (!Array.isArray(point.blockPath) || point.blockPath.length === 0 || point.blockPath.some((index) => !Number.isInteger(index) || index < 0)) {
      throw new SuggestionsError('invalid-anchor', 'Anchor paths must contain non-negative integer indexes');
    }
    if (!Number.isInteger(point.offset) || point.offset < 0) throw new SuggestionsError('invalid-anchor', 'Anchor offsets must be non-negative integers');
    if (point.affinity !== 'before' && point.affinity !== 'after') throw new SuggestionsError('invalid-anchor', 'Anchor affinity must be before or after');
  }
  if (range.quote) {
    if (typeof range.quote.text !== 'string') throw new SuggestionsError('invalid-anchor', 'Anchor quote text must be a string');
    if (range.quote.prefix !== undefined && typeof range.quote.prefix !== 'string') throw new SuggestionsError('invalid-anchor', 'Anchor quote prefix must be a string');
    if (range.quote.suffix !== undefined && typeof range.quote.suffix !== 'string') throw new SuggestionsError('invalid-anchor', 'Anchor quote suffix must be a string');
  }
}

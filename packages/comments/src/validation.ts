import { cloneAnchoredRange, type AnchoredRangeMappingResult } from '@arichtext/annotations';
import { isARTJSONValue, type ARTJSONObject } from '@arichtext/core';
import {
  CommentsError,
  type CommentAuthor,
  type CommentMessage,
  type CommentReaction,
  type CommentThread,
} from './types.js';

const MAX_ID_LENGTH = 256;
const MAX_BODY_LENGTH = 100_000;
const MAX_REACTION_LENGTH = 64;

export function assertIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_ID_LENGTH) {
    throw new CommentsError('invalid-config', `${label} must be a non-empty string up to ${MAX_ID_LENGTH} characters`);
  }
}

export function normalizeBody(value: string): string {
  if (typeof value !== 'string') throw new CommentsError('invalid-message', 'Comment body must be a string');
  const body = value.trim();
  if (!body) throw new CommentsError('invalid-message', 'Comment body cannot be empty');
  if (body.length > MAX_BODY_LENGTH) throw new CommentsError('invalid-message', `Comment body exceeds ${MAX_BODY_LENGTH} characters`);
  return body;
}

export function normalizeMentions(values: readonly string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  const unique = new Set<string>();
  for (const value of values) {
    assertIdentifier(value, 'mention user id');
    unique.add(value);
  }
  return unique.size > 0 ? [...unique].sort() : undefined;
}

export function normalizeReactionKey(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_REACTION_LENGTH) {
    throw new CommentsError('invalid-message', `Reaction key must be a non-empty string up to ${MAX_REACTION_LENGTH} characters`);
  }
  return value.trim();
}

export function cloneAuthor(author: CommentAuthor): CommentAuthor {
  if (!author || typeof author !== 'object') throw new CommentsError('invalid-message', 'Comment author is required');
  assertIdentifier(author.id, 'author id');
  const data = cloneJSONObject(author.data, 'author metadata');
  return { id: author.id, ...(data ? { data } : {}) };
}

export function cloneAnchor(anchor: AnchoredRangeMappingResult): AnchoredRangeMappingResult {
  if (!anchor || typeof anchor !== 'object') throw new CommentsError('invalid-anchor', 'Comment anchor is required');
  if (anchor.status === 'orphaned') {
    if (anchor.range !== null || typeof anchor.reason !== 'string' || !anchor.reason.trim()) {
      throw new CommentsError('invalid-anchor', 'Orphaned anchor requires a reason and null range');
    }
    return { status: 'orphaned', range: null, reason: anchor.reason };
  }
  if (anchor.status !== 'mapped' && anchor.status !== 'collapsed') {
    throw new CommentsError('invalid-anchor', 'Unknown comment anchor status');
  }
  validateRangeShape(anchor.range);
  return {
    status: anchor.status,
    range: cloneAnchoredRange(anchor.range),
    ...(anchor.reason !== undefined ? { reason: String(anchor.reason) } : {}),
  };
}

export function cloneThread(thread: CommentThread): CommentThread {
  if (!thread || typeof thread !== 'object') throw new CommentsError('invalid-thread', 'Comment thread is required');
  assertIdentifier(thread.id, 'thread id');
  assertIdentifier(thread.documentId, 'document id');
  if (thread.status !== 'open' && thread.status !== 'resolved') throw new CommentsError('invalid-thread', 'Invalid thread status');
  if (!Array.isArray(thread.messages) || thread.messages.length === 0) throw new CommentsError('invalid-thread', 'Thread must contain a root message');
  if (typeof thread.revision !== 'string' || !thread.revision) throw new CommentsError('invalid-thread', 'Thread revision is required');
  if (!Number.isFinite(thread.createdAt) || !Number.isFinite(thread.updatedAt)) throw new CommentsError('invalid-thread', 'Thread timestamps must be finite');

  return {
    id: thread.id,
    documentId: thread.documentId,
    anchor: cloneAnchor(thread.anchor),
    messages: thread.messages.map(cloneMessage),
    status: thread.status,
    revision: thread.revision,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    ...(thread.resolvedAt !== undefined ? { resolvedAt: thread.resolvedAt } : {}),
    ...(thread.resolvedBy !== undefined ? { resolvedBy: cloneAuthor(thread.resolvedBy) } : {}),
  };
}

export function cloneMessage(message: CommentMessage): CommentMessage {
  assertIdentifier(message.id, 'message id');
  if (typeof message.body !== 'string' || message.body.length > MAX_BODY_LENGTH) throw new CommentsError('invalid-message', 'Invalid stored comment body');
  if (!Number.isFinite(message.createdAt) || !Number.isFinite(message.updatedAt)) throw new CommentsError('invalid-message', 'Message timestamps must be finite');
  if (!Array.isArray(message.reactions)) throw new CommentsError('invalid-message', 'Message reactions must be an array');
  return {
    id: message.id,
    author: cloneAuthor(message.author),
    body: message.body,
    ...(message.mentions ? { mentions: normalizeMentions(message.mentions) } : {}),
    reactions: message.reactions.map(cloneReaction),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    ...(message.deletedAt !== undefined ? { deletedAt: message.deletedAt } : {}),
  };
}

export function cloneReaction(reaction: CommentReaction): CommentReaction {
  return {
    key: normalizeReactionKey(reaction.key),
    userId: checkedId(reaction.userId, 'reaction user id'),
    createdAt: finiteTimestamp(reaction.createdAt, 'reaction'),
  };
}

export function cloneJSONObject(value: ARTJSONObject | undefined, label = 'metadata'): ARTJSONObject | undefined {
  if (value === undefined) return undefined;
  if (!isARTJSONValue(value) || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommentsError('invalid-message', `${label} must be a JSON-safe object`);
  }
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as ARTJSONObject;
}

export function checkedId(value: string, label: string): string {
  assertIdentifier(value, label);
  return value;
}

export function finiteTimestamp(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new CommentsError('invalid-thread', `${label} timestamp must be finite and non-negative`);
  return value;
}

function validateRangeShape(range: NonNullable<Extract<AnchoredRangeMappingResult, { status: 'mapped' | 'collapsed' }>['range']>): void {
  for (const point of [range.start, range.end]) {
    if (!Array.isArray(point.blockPath) || point.blockPath.length === 0 || point.blockPath.some((index) => !Number.isInteger(index) || index < 0)) {
      throw new CommentsError('invalid-anchor', 'Anchor paths must contain non-negative integer indexes');
    }
    if (!Number.isInteger(point.offset) || point.offset < 0) throw new CommentsError('invalid-anchor', 'Anchor offsets must be non-negative integers');
    if (point.affinity !== 'before' && point.affinity !== 'after') throw new CommentsError('invalid-anchor', 'Anchor affinity must be before or after');
  }
  if (range.quote) {
    if (typeof range.quote.text !== 'string') throw new CommentsError('invalid-anchor', 'Anchor quote text must be a string');
    if (range.quote.prefix !== undefined && typeof range.quote.prefix !== 'string') throw new CommentsError('invalid-anchor', 'Anchor quote prefix must be a string');
    if (range.quote.suffix !== undefined && typeof range.quote.suffix !== 'string') throw new CommentsError('invalid-anchor', 'Anchor quote suffix must be a string');
  }
}

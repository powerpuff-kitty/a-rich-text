import type { AnchoredRangeMappingResult } from '@arichtext/annotations';
import type { ARTJSONObject } from '@arichtext/core';

export type CommentThreadStatus = 'open' | 'resolved';

export interface CommentAuthor {
  id: string;
  data?: ARTJSONObject;
}

export interface CommentReaction {
  key: string;
  userId: string;
  createdAt: number;
}

export interface CommentMessage {
  id: string;
  author: CommentAuthor;
  body: string;
  mentions?: string[];
  reactions: CommentReaction[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CommentThread {
  id: string;
  documentId: string;
  anchor: AnchoredRangeMappingResult;
  messages: CommentMessage[];
  status: CommentThreadStatus;
  revision: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolvedBy?: CommentAuthor;
}

export interface CreateThreadInput {
  anchor: AnchoredRangeMappingResult;
  body: string;
  author: CommentAuthor;
  mentions?: readonly string[];
  id?: string;
}

export interface ReplyInput {
  body: string;
  author: CommentAuthor;
  mentions?: readonly string[];
  id?: string;
}

export interface EditMessageInput {
  body: string;
  mentions?: readonly string[];
  expectedRevision?: string;
}

export interface ThreadMutationOptions {
  expectedRevision?: string;
}

export interface CommentThreadEvent {
  type: 'created' | 'updated';
  thread: CommentThread;
  originClientId: string;
}

export interface CommentsConnectionOptions {
  documentId: string;
  clientId: string;
  signal?: AbortSignal;
}

export interface CommentsSession {
  readonly documentId: string;
  readonly clientId: string;

  listThreads(): readonly CommentThread[];
  getThread(threadId: string): CommentThread | null;

  createThread(input: CreateThreadInput): Promise<CommentThread>;
  reply(threadId: string, input: ReplyInput, options?: ThreadMutationOptions): Promise<CommentThread>;
  editMessage(threadId: string, messageId: string, input: EditMessageInput): Promise<CommentThread>;
  deleteMessage(threadId: string, messageId: string, options?: ThreadMutationOptions): Promise<CommentThread>;
  resolveThread(threadId: string, author: CommentAuthor, options?: ThreadMutationOptions): Promise<CommentThread>;
  reopenThread(threadId: string, options?: ThreadMutationOptions): Promise<CommentThread>;
  addReaction(threadId: string, messageId: string, key: string, userId: string, options?: ThreadMutationOptions): Promise<CommentThread>;
  removeReaction(threadId: string, messageId: string, key: string, userId: string, options?: ThreadMutationOptions): Promise<CommentThread>;
  updateAnchor(threadId: string, anchor: AnchoredRangeMappingResult, options?: ThreadMutationOptions): Promise<CommentThread>;

  subscribe(listener: (event: CommentThreadEvent) => void): () => void;
  close(): Promise<void>;
}

export interface CommentsProvider {
  readonly name: string;
  connect(options: CommentsConnectionOptions): Promise<CommentsSession>;
}

export type CommentsErrorCode =
  | 'invalid-config'
  | 'invalid-thread'
  | 'invalid-message'
  | 'invalid-anchor'
  | 'not-found'
  | 'revision-conflict'
  | 'closed'
  | 'aborted'
  | 'provider-error';

export class CommentsError extends Error {
  readonly code: CommentsErrorCode;
  readonly cause?: unknown;

  constructor(code: CommentsErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'CommentsError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

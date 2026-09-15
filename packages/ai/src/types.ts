import type { ARTJSONObject } from '@arichtext/core';
import type { ARTSelection } from '@arichtext/engine';

export type AITextTask =
  | 'rewrite'
  | 'shorten'
  | 'expand'
  | 'summarize'
  | 'translate'
  | 'tone'
  | 'grammar'
  | 'continue'
  | 'custom';

export interface AITextRequest {
  task: AITextTask;
  /** Selected source text. Empty is permitted for continuation/custom tasks. */
  text: string;
  /** Text in the same block before the selection/caret. */
  before: string;
  /** Text in the same block after the selection/caret. */
  after: string;
  /** Optional bounded document-level context supplied explicitly by the caller. */
  documentContext?: string;
  instructions?: string;
  language?: string;
  tone?: string;
  metadata?: ARTJSONObject;
}

export interface AITextGenerationContext {
  signal?: AbortSignal;
}

export type AITextGeneration = string | AsyncIterable<string>;

export interface AITextProvider {
  readonly name: string;
  generateText(
    request: AITextRequest,
    context?: AITextGenerationContext,
  ): AITextGeneration | Promise<AITextGeneration>;
}

export interface GenerateTextProposalOptions {
  task: AITextTask;
  instructions?: string;
  language?: string;
  tone?: string;
  metadata?: ARTJSONObject;
  signal?: AbortSignal;
  /** Include bounded full-document plain-text context. Default false. */
  includeDocumentContext?: boolean;
  maxDocumentContextChars?: number;
  onDelta?: (delta: string, accumulated: string) => void;
}

export interface AITextProposal {
  id: string;
  provider: string;
  task: AITextTask;
  selection: ARTSelection;
  originalText: string;
  replacementText: string;
  /** Canonical serialized ART at proposal creation time. */
  baseDocument: string;
  createdAt: number;
  instructions?: string;
  metadata?: ARTJSONObject;
}

export type AIErrorCode =
  | 'no-selection'
  | 'invalid-document'
  | 'invalid-selection'
  | 'cross-block-selection'
  | 'empty-selection'
  | 'invalid-provider-result'
  | 'stale-proposal'
  | 'aborted'
  | 'provider-error';

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly cause?: unknown;

  constructor(code: AIErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

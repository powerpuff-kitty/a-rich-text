import {
  AIError,
  generateTextProposal,
  proposalToTransaction,
  type AITextProposal,
  type AITextProvider,
  type GenerateTextProposalOptions,
} from '@arichtext/ai';
import type { ARTJSONObject } from '@arichtext/core';
import type { ARichTextElement } from '@arichtext/web-component';

export type AIEditorErrorCode = 'editor-locked' | 'aborted' | 'generation-failed' | 'apply-failed';

export class AIEditorError extends Error {
  readonly code: AIEditorErrorCode;
  readonly cause?: unknown;

  constructor(code: AIEditorErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AIEditorError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export interface AIEditorProposalOptions extends Omit<GenerateTextProposalOptions, 'signal' | 'onDelta'> {
  signal?: AbortSignal;
  onDelta?: (delta: string, accumulated: string) => void;
  onReady?: (proposal: AITextProposal) => void;
  onError?: (error: unknown) => void;
}

export interface AIProposalTask {
  readonly requestId: string;
  readonly signal: AbortSignal;
  readonly promise: Promise<AITextProposal>;
  cancel(reason?: unknown): void;
}

export interface AIProposalStartDetail {
  requestId: string;
  task: GenerateTextProposalOptions['task'];
}

export interface AIProposalDeltaDetail {
  requestId: string;
  delta: string;
  accumulated: string;
}

export interface AIProposalReadyDetail {
  requestId: string;
  proposal: AITextProposal;
}

export interface AIProposalErrorDetail {
  requestId: string;
  error: unknown;
}

export interface AIProposalAppliedDetail {
  proposal: AITextProposal;
  result: ReturnType<ARichTextElement['dispatch']>;
}

export function createAIProposal(
  editor: ARichTextElement,
  provider: AITextProvider,
  options: AIEditorProposalOptions,
): AIProposalTask {
  const requestId = randomId();
  const controller = new AbortController();
  const detachExternalAbort = forwardAbort(options.signal, controller);

  if (editor.disabled || editor.readOnly) {
    const error = new AIEditorError('editor-locked', 'Cannot start AI editing for a disabled or readonly editor');
    detachExternalAbort();
    return rejectedTask(editor, requestId, controller, error, options.onError);
  }

  const document = editor.getJSON();
  const selection = editor.getSelection();

  editor.dispatchEvent(new CustomEvent<AIProposalStartDetail>('ai-proposal-start', {
    detail: { requestId, task: options.task },
    bubbles: true,
    composed: true,
  }));

  const promise = generateTextProposal(document, selection, provider, {
    task: options.task,
    ...(options.instructions !== undefined ? { instructions: options.instructions } : {}),
    ...(options.language !== undefined ? { language: options.language } : {}),
    ...(options.tone !== undefined ? { tone: options.tone } : {}),
    ...(options.metadata !== undefined ? { metadata: cloneMetadata(options.metadata) } : {}),
    ...(options.includeDocumentContext !== undefined ? { includeDocumentContext: options.includeDocumentContext } : {}),
    ...(options.maxDocumentContextChars !== undefined ? { maxDocumentContextChars: options.maxDocumentContextChars } : {}),
    signal: controller.signal,
    onDelta: (delta, accumulated) => {
      options.onDelta?.(delta, accumulated);
      editor.dispatchEvent(new CustomEvent<AIProposalDeltaDetail>('ai-proposal-delta', {
        detail: { requestId, delta, accumulated },
        bubbles: true,
        composed: true,
      }));
    },
  })
    .then((proposal) => {
      const safe = cloneProposal(proposal);
      options.onReady?.(cloneProposal(safe));
      editor.dispatchEvent(new CustomEvent<AIProposalReadyDetail>('ai-proposal-ready', {
        detail: { requestId, proposal: cloneProposal(safe) },
        bubbles: true,
        composed: true,
      }));
      return safe;
    })
    .catch((error) => {
      const normalized = normalizeGenerationError(error, controller.signal);
      options.onError?.(normalized);
      editor.dispatchEvent(new CustomEvent<AIProposalErrorDetail>('ai-proposal-error', {
        detail: { requestId, error: normalized },
        bubbles: true,
        composed: true,
      }));
      throw normalized;
    })
    .finally(detachExternalAbort);

  return {
    requestId,
    signal: controller.signal,
    promise,
    cancel(reason?: unknown): void {
      if (!controller.signal.aborted) controller.abort(reason ?? 'cancelled');
    },
  };
}

export function applyAIProposal(
  editor: ARichTextElement,
  proposal: AITextProposal,
): ReturnType<ARichTextElement['dispatch']> {
  if (editor.disabled || editor.readOnly) {
    throw new AIEditorError('editor-locked', 'Cannot apply an AI proposal to a disabled or readonly editor');
  }

  try {
    const safeProposal = cloneProposal(proposal);
    const transaction = proposalToTransaction(editor.getJSON(), safeProposal);
    const result = editor.dispatch(transaction);
    editor.dispatchEvent(new CustomEvent<AIProposalAppliedDetail>('ai-proposal-applied', {
      detail: { proposal: cloneProposal(safeProposal), result },
      bubbles: true,
      composed: true,
    }));
    return result;
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIEditorError('apply-failed', 'Failed to apply AI proposal', error);
  }
}

function rejectedTask(
  editor: ARichTextElement,
  requestId: string,
  controller: AbortController,
  error: unknown,
  onError?: (error: unknown) => void,
): AIProposalTask {
  onError?.(error);
  editor.dispatchEvent(new CustomEvent<AIProposalErrorDetail>('ai-proposal-error', {
    detail: { requestId, error },
    bubbles: true,
    composed: true,
  }));
  return {
    requestId,
    signal: controller.signal,
    promise: Promise.reject(error),
    cancel(reason?: unknown): void {
      if (!controller.signal.aborted) controller.abort(reason ?? 'cancelled');
    },
  };
}

function normalizeGenerationError(error: unknown, signal: AbortSignal): unknown {
  if (signal.aborted) {
    if (error instanceof AIError && error.code === 'aborted') return error;
    return new AIEditorError('aborted', 'AI proposal generation was aborted', signal.reason ?? error);
  }
  if (error instanceof AIError) return error;
  return new AIEditorError('generation-failed', 'AI proposal generation failed', error);
}

function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  if (source.aborted) {
    target.abort(source.reason);
    return () => undefined;
  }
  const abort = () => target.abort(source.reason);
  source.addEventListener('abort', abort, { once: true });
  return () => source.removeEventListener('abort', abort);
}

function cloneProposal(proposal: AITextProposal): AITextProposal {
  return {
    id: proposal.id,
    provider: proposal.provider,
    task: proposal.task,
    selection: {
      anchor: {
        blockPath: [...proposal.selection.anchor.blockPath],
        offset: proposal.selection.anchor.offset,
      },
      head: {
        blockPath: [...proposal.selection.head.blockPath],
        offset: proposal.selection.head.offset,
      },
    },
    originalText: proposal.originalText,
    replacementText: proposal.replacementText,
    baseDocument: proposal.baseDocument,
    createdAt: proposal.createdAt,
    ...(proposal.instructions !== undefined ? { instructions: proposal.instructions } : {}),
    ...(proposal.metadata !== undefined ? { metadata: cloneMetadata(proposal.metadata) } : {}),
  };
}

function cloneMetadata(value: ARTJSONObject): ARTJSONObject {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as ARTJSONObject;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ai-request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

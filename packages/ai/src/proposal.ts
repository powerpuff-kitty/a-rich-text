import {
  isARTJSONValue,
  serializeDocument,
  toPlainText,
  type ARTDocument,
  type ARTJSONObject,
  type ARTParagraphNode,
  type ARTHeadingNode,
} from '@arichtext/core';
import {
  transaction,
  type ARTSelection,
  type ARTTextPoint,
  type EditorTransaction,
} from '@arichtext/engine';
import {
  AIError,
  type AITextGeneration,
  type AITextProposal,
  type AITextProvider,
  type AITextRequest,
  type GenerateTextProposalOptions,
} from './types.js';

type InlineBlock = ARTParagraphNode | ARTHeadingNode;

export async function generateTextProposal(
  document: ARTDocument,
  selection: ARTSelection | null,
  provider: AITextProvider,
  options: GenerateTextProposalOptions,
): Promise<AITextProposal> {
  if (!selection) throw new AIError('no-selection', 'AI text proposals require a logical editor selection');
  if (!samePath(selection.anchor.blockPath, selection.head.blockPath)) {
    throw new AIError('cross-block-selection', 'AI text proposals currently require one paragraph/heading block');
  }
  throwIfAborted(options.signal);

  const block = getInlineBlock(document, selection.anchor.blockPath);
  const text = blockText(block);
  const from = Math.min(selection.anchor.offset, selection.head.offset);
  const to = Math.max(selection.anchor.offset, selection.head.offset);
  if (from < 0 || to > text.length) {
    throw new AIError('cross-block-selection', 'AI selection offsets are outside the target block');
  }

  const originalText = text.slice(from, to);
  if (!originalText && options.task !== 'continue' && options.task !== 'custom') {
    throw new AIError('empty-selection', `${options.task} requires non-empty selected text`);
  }

  const metadata = cloneMetadata(options.metadata);
  const request: AITextRequest = {
    task: options.task,
    text: originalText,
    before: text.slice(0, from),
    after: text.slice(to),
    ...(options.includeDocumentContext
      ? { documentContext: boundedDocumentContext(document, options.maxDocumentContextChars ?? 6000) }
      : {}),
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(options.language ? { language: options.language } : {}),
    ...(options.tone ? { tone: options.tone } : {}),
    ...(metadata ? { metadata } : {}),
  };

  let replacementText: string;
  try {
    const generation = await provider.generateText(request, { signal: options.signal });
    replacementText = await collectTextGeneration(generation, {
      signal: options.signal,
      onDelta: options.onDelta,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw new AIError('aborted', 'AI generation was aborted', options.signal.reason ?? error);
    }
    if (error instanceof AIError) throw error;
    throw new AIError('provider-error', `AI provider ${provider.name} failed`, error);
  }

  return {
    id: randomId(),
    provider: provider.name,
    task: options.task,
    selection: cloneSelection(selection),
    originalText,
    replacementText,
    baseDocument: serializeDocument(document),
    createdAt: Date.now(),
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export interface CollectTextGenerationOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string, accumulated: string) => void;
}

export async function collectTextGeneration(
  generation: AITextGeneration,
  options: CollectTextGenerationOptions = {},
): Promise<string> {
  throwIfAborted(options.signal);
  if (typeof generation === 'string') {
    options.onDelta?.(generation, generation);
    return generation;
  }
  if (!isAsyncIterable(generation)) {
    throw new AIError('invalid-provider-result', 'AI provider must return a string or AsyncIterable<string>');
  }

  let output = '';
  for await (const delta of generation) {
    throwIfAborted(options.signal);
    if (typeof delta !== 'string') {
      throw new AIError('invalid-provider-result', 'AI stream emitted a non-string delta');
    }
    output += delta;
    options.onDelta?.(delta, output);
  }
  return output;
}

export function proposalToTransaction(
  currentDocument: ARTDocument,
  proposal: AITextProposal,
): EditorTransaction {
  if (serializeDocument(currentDocument) !== proposal.baseDocument) {
    throw new AIError('stale-proposal', 'The document changed after this AI proposal was created');
  }

  return transaction()
    .replaceText(
      proposal.selection.anchor,
      proposal.selection.head,
      proposal.replacementText,
    )
    .setMeta('aiProposalId', proposal.id)
    .setMeta('aiProvider', proposal.provider)
    .setMeta('aiTask', proposal.task)
    .build();
}

function getInlineBlock(document: ARTDocument, path: readonly number[]): InlineBlock {
  let current: unknown = document;
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0 || !current || typeof current !== 'object') {
      throw new AIError('cross-block-selection', 'AI selection path is invalid');
    }
    const content = (current as { content?: unknown }).content;
    if (!Array.isArray(content) || index >= content.length) {
      throw new AIError('cross-block-selection', 'AI selection path does not resolve to a document node');
    }
    current = content[index];
  }

  if (!current || typeof current !== 'object') {
    throw new AIError('cross-block-selection', 'AI selection must target a paragraph or heading');
  }
  const block = current as { type?: unknown };
  if (block.type !== 'paragraph' && block.type !== 'heading') {
    throw new AIError('cross-block-selection', 'AI selection must target a paragraph or heading');
  }
  return current as InlineBlock;
}

function blockText(block: InlineBlock): string {
  return (block.content ?? []).map((node) => node.text).join('');
}

function boundedDocumentContext(document: ARTDocument, maxChars: number): string {
  const limit = Math.max(0, Math.floor(maxChars));
  const value = toPlainText(document);
  if (value.length <= limit) return value;
  if (limit === 0) return '';
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function cloneMetadata(value: ARTJSONObject | undefined): ARTJSONObject | undefined {
  if (value === undefined) return undefined;
  if (!isARTJSONValue(value) || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('AI metadata must be a JSON-safe object');
  }
  return JSON.parse(JSON.stringify(value)) as ARTJSONObject;
}

function cloneSelection(selection: ARTSelection): ARTSelection {
  return {
    anchor: clonePoint(selection.anchor),
    head: clonePoint(selection.head),
  };
}

function clonePoint(point: ARTTextPoint): ARTTextPoint {
  return { blockPath: [...point.blockPath], offset: point.offset };
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  return Boolean(value && typeof value === 'object' && Symbol.asyncIterator in value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AIError('aborted', 'AI generation was aborted', signal.reason);
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

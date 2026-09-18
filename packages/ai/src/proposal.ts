import {
  isARTDocument,
  isARTJSONValue,
  serializeDocument,
  toPlainText,
  type ARTDocument,
  type ARTJSONObject,
  type ARTParagraphNode,
  type ARTHeadingNode,
} from '@arichtext/core';
import {
  createEditorState,
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

const DEFAULT_DOCUMENT_CONTEXT_CHARS = 6000;
const MAX_DOCUMENT_CONTEXT_CHARS = 100_000;

export async function generateTextProposal(
  document: ARTDocument,
  selection: ARTSelection | null,
  provider: AITextProvider,
  options: GenerateTextProposalOptions,
): Promise<AITextProposal> {
  if (!isARTDocument(document)) {
    throw new AIError('invalid-document', 'AI text proposals require a valid ART document');
  }
  if (!selection) throw new AIError('no-selection', 'AI text proposals require a logical editor selection');
  if (!provider || typeof provider.generateText !== 'function' || typeof provider.name !== 'string' || !provider.name.trim()) {
    throw new AIError('invalid-provider-result', 'AI provider must expose a non-empty name and generateText()');
  }

  let validatedSelection: ARTSelection;
  try {
    validatedSelection = createEditorState(document, selection).selection!;
  } catch (error) {
    throw new AIError('invalid-selection', 'AI selection is not valid for the current ART document', error);
  }

  if (!samePath(validatedSelection.anchor.blockPath, validatedSelection.head.blockPath)) {
    throw new AIError('cross-block-selection', 'AI text proposals currently require one paragraph/heading block');
  }
  throwIfAborted(options.signal);

  const block = getInlineBlock(document, validatedSelection.anchor.blockPath);
  const text = blockText(block);
  const from = Math.min(validatedSelection.anchor.offset, validatedSelection.head.offset);
  const to = Math.max(validatedSelection.anchor.offset, validatedSelection.head.offset);

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
      ? { documentContext: boundedDocumentContext(document, resolveDocumentContextLimit(options.maxDocumentContextChars)) }
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
    selection: cloneSelection(validatedSelection),
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
  if (!isARTDocument(currentDocument)) {
    throw new AIError('invalid-document', 'Cannot apply an AI proposal to invalid ART');
  }
  if (serializeDocument(currentDocument) !== proposal.baseDocument) {
    throw new AIError('stale-proposal', 'The document changed after this AI proposal was created');
  }

  try {
    createEditorState(currentDocument, proposal.selection);
  } catch (error) {
    throw new AIError('invalid-selection', 'AI proposal selection is no longer valid', error);
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
      throw new AIError('invalid-selection', 'AI selection path is invalid');
    }
    const content = (current as { content?: unknown }).content;
    if (!Array.isArray(content) || index >= content.length) {
      throw new AIError('invalid-selection', 'AI selection path does not resolve to a document node');
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
  return (block.content ?? []).map((node) => {
    if (node.type !== 'text') throw new AIError('invalid-selection', 'Text proposals cannot target blocks containing inline extensions');
    return node.text;
  }).join('');
}

function resolveDocumentContextLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_DOCUMENT_CONTEXT_CHARS;
  if (!Number.isFinite(value)) return DEFAULT_DOCUMENT_CONTEXT_CHARS;
  return Math.min(MAX_DOCUMENT_CONTEXT_CHARS, Math.max(0, Math.floor(value)));
}

function boundedDocumentContext(document: ARTDocument, maxChars: number): string {
  const value = toPlainText(document);
  if (value.length <= maxChars) return value;
  if (maxChars === 0) return '';
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
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
  return Boolean(
    value
    && (typeof value === 'object' || typeof value === 'function')
    && Symbol.asyncIterator in value,
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AIError('aborted', 'AI generation was aborted', signal.reason);
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

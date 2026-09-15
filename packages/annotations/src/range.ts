import {
  isARTDocument,
  type ARTDocument,
  type ARTHeadingNode,
  type ARTParagraphNode,
} from '@arichtext/core';
import type { ARTPath, ARTSelection, ARTTextPoint } from '@arichtext/engine';
import type {
  AnchorAffinity,
  AnchoredTextPoint,
  AnchoredTextQuote,
  AnchoredTextRange,
  CreateAnchoredRangeOptions,
} from './types.js';

type InlineBlock = ARTParagraphNode | ARTHeadingNode;

export interface InlineBlockEntry {
  path: number[];
  text: string;
}

export function createAnchoredRange(
  document: ARTDocument,
  selection: ARTSelection,
  options: CreateAnchoredRangeOptions = {},
): AnchoredTextRange {
  const normalized = normalizeTextPoints(document, selection.anchor, selection.head);
  const collapsed = samePoint(normalized.start, normalized.end);
  const startAffinity = options.startAffinity ?? 'after';
  const endAffinity = options.endAffinity ?? (collapsed ? startAffinity : 'before');
  const start = anchoredPoint(normalized.start, startAffinity);
  const end = anchoredPoint(normalized.end, endAffinity);
  const quote = options.captureQuote
    ? captureTextQuote(document, start, end, options.quoteContextChars ?? 32)
    : undefined;
  return {
    start,
    end,
    ...(quote ? { quote } : {}),
  };
}

export function validateAnchoredRange(document: ARTDocument, range: AnchoredTextRange): void {
  if (!isARTDocument(document)) throw new TypeError('Anchored ranges require a valid ART document');
  validateAffinity(range.start.affinity);
  validateAffinity(range.end.affinity);
  const normalized = normalizeTextPoints(document, range.start, range.end);
  if (!samePoint(normalized.start, range.start) || !samePoint(normalized.end, range.end)) {
    throw new RangeError('Anchored range start/end must be normalized in document order');
  }
  if (range.quote) {
    if (typeof range.quote.text !== 'string') throw new TypeError('Anchored range quote text must be a string');
    if (range.quote.prefix !== undefined && typeof range.quote.prefix !== 'string') throw new TypeError('Anchored range quote prefix must be a string');
    if (range.quote.suffix !== undefined && typeof range.quote.suffix !== 'string') throw new TypeError('Anchored range quote suffix must be a string');
  }
}

export function cloneAnchoredRange(range: AnchoredTextRange): AnchoredTextRange {
  return {
    start: cloneAnchoredPoint(range.start),
    end: cloneAnchoredPoint(range.end),
    ...(range.quote ? { quote: { ...range.quote } } : {}),
  };
}

export function cloneAnchoredPoint(point: AnchoredTextPoint): AnchoredTextPoint {
  return {
    blockPath: [...point.blockPath],
    offset: point.offset,
    affinity: point.affinity,
  };
}

export function anchoredPoint(
  point: ARTTextPoint,
  affinity: AnchorAffinity,
): AnchoredTextPoint {
  validateAffinity(affinity);
  return {
    blockPath: [...point.blockPath],
    offset: point.offset,
    affinity,
  };
}

export function listInlineBlocks(document: ARTDocument): InlineBlockEntry[] {
  if (!isARTDocument(document)) throw new TypeError('Expected a valid ART document');
  const output: InlineBlockEntry[] = [];

  const visit = (node: unknown, path: number[]): void => {
    if (isInlineBlock(node)) {
      output.push({ path: [...path], text: inlineText(node) });
      return;
    }
    const children = childContent(node);
    for (let index = 0; index < children.length; index += 1) {
      visit(children[index], [...path, index]);
    }
  };

  for (let index = 0; index < document.content.length; index += 1) {
    visit(document.content[index], [index]);
  }
  return output;
}

export function normalizeTextPoints(
  document: ARTDocument,
  left: ARTTextPoint,
  right: ARTTextPoint,
): { start: ARTTextPoint; end: ARTTextPoint } {
  const blocks = listInlineBlocks(document);
  const leftIndex = validatePoint(blocks, left);
  const rightIndex = validatePoint(blocks, right);
  const leftFirst = leftIndex < rightIndex || (leftIndex === rightIndex && left.offset <= right.offset);
  return leftFirst
    ? { start: cloneTextPoint(left), end: cloneTextPoint(right) }
    : { start: cloneTextPoint(right), end: cloneTextPoint(left) };
}

export function compareTextPoints(
  document: ARTDocument,
  left: ARTTextPoint,
  right: ARTTextPoint,
): number {
  const blocks = listInlineBlocks(document);
  const leftIndex = validatePoint(blocks, left);
  const rightIndex = validatePoint(blocks, right);
  if (leftIndex !== rightIndex) return leftIndex < rightIndex ? -1 : 1;
  return left.offset === right.offset ? 0 : left.offset < right.offset ? -1 : 1;
}

export function captureTextQuote(
  document: ARTDocument,
  start: ARTTextPoint,
  end: ARTTextPoint,
  contextChars = 32,
): AnchoredTextQuote {
  const blocks = listInlineBlocks(document);
  const normalized = normalizeTextPoints(document, start, end);
  const startIndex = findBlockIndex(blocks, normalized.start.blockPath);
  const endIndex = findBlockIndex(blocks, normalized.end.blockPath);
  const context = Number.isFinite(contextChars) ? Math.max(0, Math.floor(contextChars)) : 32;

  const pieces: string[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const block = blocks[index]!;
    const from = index === startIndex ? normalized.start.offset : 0;
    const to = index === endIndex ? normalized.end.offset : block.text.length;
    pieces.push(block.text.slice(from, to));
  }

  const startText = blocks[startIndex]!.text;
  const endText = blocks[endIndex]!.text;
  const prefix = startText.slice(Math.max(0, normalized.start.offset - context), normalized.start.offset);
  const suffix = endText.slice(normalized.end.offset, normalized.end.offset + context);
  return {
    text: pieces.join('\n'),
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}

export function samePoint(left: ARTTextPoint, right: ARTTextPoint): boolean {
  return left.offset === right.offset && samePath(left.blockPath, right.blockPath);
}

export function samePath(left: ARTPath, right: ARTPath): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validatePoint(blocks: readonly InlineBlockEntry[], point: ARTTextPoint): number {
  if (!Number.isInteger(point.offset) || point.offset < 0) throw new RangeError('Text point offset must be a non-negative integer');
  const index = findBlockIndex(blocks, point.blockPath);
  if (point.offset > blocks[index]!.text.length) throw new RangeError('Text point offset is outside the target block');
  return index;
}

function findBlockIndex(blocks: readonly InlineBlockEntry[], path: ARTPath): number {
  const index = blocks.findIndex((block) => samePath(block.path, path));
  if (index === -1) throw new RangeError(`No paragraph/heading exists at [${path.join(',')}]`);
  return index;
}

function cloneTextPoint(point: ARTTextPoint): ARTTextPoint {
  return { blockPath: [...point.blockPath], offset: point.offset };
}

function validateAffinity(value: unknown): asserts value is AnchorAffinity {
  if (value !== 'before' && value !== 'after') throw new TypeError('Anchor affinity must be before or after');
}

function isInlineBlock(value: unknown): value is InlineBlock {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'paragraph' || type === 'heading';
}

function inlineText(block: InlineBlock): string {
  return (block.content ?? []).map((node) => node.text).join('');
}

function childContent(value: unknown): readonly unknown[] {
  if (!value || typeof value !== 'object') return [];
  const type = (value as { type?: unknown }).type;
  if (type === 'text' || type === 'codeBlock' || type === 'horizontalRule' || type === 'image') return [];
  const content = (value as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

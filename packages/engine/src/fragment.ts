import {
  ART_DOCUMENT_VERSION,
  isARTDocument,
  type ARTBlockNode,
  type ARTDocument,
  type ARTHeadingNode,
  type ARTParagraphNode,
} from '@arichtext/core';
import { textPoint } from './model.js';
import {
  cloneDocument,
  cloneInline,
  getInlineBlock,
  getNodeAtPath,
  inlineLength,
  normalizeInline,
  replaceInlineRange,
  samePath,
} from './tree.js';
import type { ARTTextPoint } from './types.js';

export interface FragmentResult {
  document: ARTDocument;
  caret: ARTTextPoint;
}

export function cloneARTFragment(content: readonly ARTBlockNode[]): ARTBlockNode[] {
  const candidate: ARTDocument = {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: cloneValue([...content]),
  };
  if (!isARTDocument(candidate)) throw new TypeError('Invalid ART fragment');
  return candidate.content;
}

export function replaceRangeWithFragment(
  document: ARTDocument,
  fromPoint: ARTTextPoint,
  toPoint: ARTTextPoint,
  fragmentContent: readonly ARTBlockNode[],
): FragmentResult {
  if (!samePath(fromPoint.blockPath, toPoint.blockPath)) {
    throw new RangeError('ART fragment replacement currently requires one text block');
  }

  const output = cloneDocument(document);
  const current = getInlineBlock(output, fromPoint.blockPath);
  const length = inlineLength(current);
  const from = Math.min(fromPoint.offset, toPoint.offset);
  const to = Math.max(fromPoint.offset, toPoint.offset);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > length) {
    throw new RangeError('ART fragment range is outside the target block');
  }

  const before = replaceInlineRange(current.content ?? [], from, length, '', []);
  const after = replaceInlineRange(current.content ?? [], 0, to, '', []);
  const fragment = cloneARTFragment(fragmentContent);

  if (fragment.length === 0) {
    const replacement = withCurrentType(current, [...before, ...after]);
    replaceCurrent(output, fromPoint.blockPath, [replacement]);
    return { document: output, caret: textPoint(fromPoint.blockPath, from) };
  }

  if (fragment.length === 1 && isInlineBlock(fragment[0])) {
    const inserted = fragment[0];
    const insertedLength = inlineLength(inserted);
    const replacement = withCurrentType(current, [
      ...before,
      ...cloneInline(inserted.content ?? []),
      ...after,
    ]);
    replaceCurrent(output, fromPoint.blockPath, [replacement]);
    return { document: output, caret: textPoint(fromPoint.blockPath, from + insertedLength) };
  }

  const replacements: ARTBlockNode[] = [];
  const first = fragment[0]!;
  const last = fragment[fragment.length - 1]!;
  let sourceIndex = 0;

  if (isInlineBlock(first)) {
    replacements.push(withCurrentType(current, [
      ...before,
      ...cloneInline(first.content ?? []),
    ]));
    sourceIndex = 1;
  } else {
    replacements.push(withCurrentType(current, before));
  }

  let caretRelativeIndex = -1;
  let caretOffset = 0;
  for (let index = sourceIndex; index < fragment.length; index += 1) {
    const block = fragment[index]!;
    const isLast = index === fragment.length - 1;
    if (isLast && isInlineBlock(block)) {
      caretRelativeIndex = replacements.length;
      caretOffset = inlineLength(block);
      replacements.push(withBlockType(block, [
        ...cloneInline(block.content ?? []),
        ...after,
      ]));
    } else {
      replacements.push(block);
    }
  }

  if (!isInlineBlock(last)) {
    caretRelativeIndex = replacements.length;
    caretOffset = 0;
    replacements.push(withCurrentType(current, after));
  }

  const parentPath = fromPoint.blockPath.slice(0, -1);
  const currentIndex = fromPoint.blockPath[fromPoint.blockPath.length - 1]!;
  replaceCurrent(output, fromPoint.blockPath, replacements);
  const caretPath = [...parentPath, currentIndex + caretRelativeIndex];
  return { document: output, caret: textPoint(caretPath, caretOffset) };
}

function replaceCurrent(document: ARTDocument, path: readonly number[], replacements: ARTBlockNode[]): void {
  if (path.length === 0) throw new RangeError('Fragment target must be a block');
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = getNodeAtPath(document, parentPath);
  if (!parent || typeof parent !== 'object') throw new RangeError('Fragment parent has no content array');
  const content = (parent as { content?: unknown }).content;
  if (!Array.isArray(content) || index < 0 || index >= content.length) {
    throw new RangeError('Fragment target is outside its parent');
  }
  content.splice(index, 1, ...replacements);
}

function withCurrentType(
  current: ARTParagraphNode | ARTHeadingNode,
  content: ARTParagraphNode['content'],
): ARTParagraphNode | ARTHeadingNode {
  return current.type === 'heading'
    ? { type: 'heading', level: current.level, content: normalizeInline(content ?? []) }
    : { type: 'paragraph', content: normalizeInline(content ?? []) };
}

function withBlockType(
  block: ARTParagraphNode | ARTHeadingNode,
  content: ARTParagraphNode['content'],
): ARTParagraphNode | ARTHeadingNode {
  return block.type === 'heading'
    ? { type: 'heading', level: block.level, content: normalizeInline(content ?? []) }
    : { type: 'paragraph', content: normalizeInline(content ?? []) };
}

function isInlineBlock(value: ARTBlockNode): value is ARTParagraphNode | ARTHeadingNode {
  return value.type === 'paragraph' || value.type === 'heading';
}

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

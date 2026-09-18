import { serializeDocument, type ARTDocument } from '@arichtext/core';
import {
  applyTransaction,
  createEditorState,
  type ARTPath,
  type ARTTextPoint,
  type EditorOperation,
  type EditorTransaction,
  type TransactionResult,
} from '@arichtext/engine';
import {
  cloneAnchoredPoint,
  cloneAnchoredRange,
  compareTextPoints,
  listInlineBlocks,
  normalizeTextPoints,
  samePath,
  samePoint,
  validateAnchoredRange,
} from './range.js';
import type {
  AnchoredRangeMappingResult,
  AnchoredTextPoint,
  AnchoredTextRange,
} from './types.js';

interface OperationApplication {
  document: ARTDocument;
  caret: ARTTextPoint | null;
}

interface MappingInternal {
  result: AnchoredRangeMappingResult;
  document: ARTDocument;
}

export function mapAnchoredRangeThroughOperation(
  document: ARTDocument,
  range: AnchoredTextRange,
  operation: EditorOperation,
): AnchoredRangeMappingResult {
  return mapOne(document, range, operation).result;
}

export function mapAnchoredRangeThroughOperations(
  document: ARTDocument,
  range: AnchoredTextRange,
  operations: readonly EditorOperation[],
): AnchoredRangeMappingResult {
  return mapMany(document, range, operations).result;
}

export function mapAnchoredRangeThroughTransaction(
  document: ARTDocument,
  range: AnchoredTextRange,
  transaction: EditorTransaction,
): AnchoredRangeMappingResult {
  return mapMany(document, range, transaction.operations).result;
}

/**
 * Map using the operations reported by an already-applied transaction result.
 * The reconstructed document is checked against `result.state.document` so a
 * future engine operation cannot silently bypass annotation mapping.
 */
export function mapAnchoredRangeThroughResult(
  beforeDocument: ARTDocument,
  range: AnchoredTextRange,
  result: TransactionResult,
): AnchoredRangeMappingResult {
  const mapped = mapMany(beforeDocument, range, result.operations);
  if (serializeDocument(mapped.document) !== serializeDocument(result.state.document)) {
    return {
      status: 'orphaned',
      range: null,
      reason: 'Transaction result cannot be reconstructed from its reported operations',
    };
  }
  return mapped.result;
}

function mapMany(
  document: ARTDocument,
  range: AnchoredTextRange,
  operations: readonly EditorOperation[],
): MappingInternal {
  validateAnchoredRange(document, range);
  let currentDocument = document;
  let currentRange = cloneAnchoredRange(range);

  for (const operation of operations) {
    const mapped = mapOne(currentDocument, currentRange, operation);
    currentDocument = mapped.document;
    if (mapped.result.status === 'orphaned') return mapped;
    currentRange = mapped.result.range;
  }

  return {
    document: currentDocument,
    result: mappingResult(currentRange),
  };
}

function mapOne(
  document: ARTDocument,
  range: AnchoredTextRange,
  operation: EditorOperation,
): MappingInternal {
  validateAnchoredRange(document, range);
  const applied = applySingleOperation(document, operation);

  const start = mapPoint(document, applied.document, range.start, operation, applied.caret);
  const end = mapPoint(document, applied.document, range.end, operation, applied.caret);

  if (!start || !end) {
    return {
      document: applied.document,
      result: {
        status: 'orphaned',
        range: null,
        reason: `Anchor mapping is unsupported for engine operation ${operation.type}`,
      },
    };
  }

  let mapped: AnchoredTextRange = {
    start,
    end,
    ...(range.quote ? { quote: { ...range.quote } } : {}),
  };

  try {
    if (compareTextPoints(applied.document, mapped.start, mapped.end) > 0) {
      mapped = {
        start: cloneAnchoredPoint(mapped.end),
        end: cloneAnchoredPoint(mapped.start),
        ...(mapped.quote ? { quote: { ...mapped.quote } } : {}),
      };
    }
    validateAnchoredRange(applied.document, mapped);
  } catch (error) {
    return {
      document: applied.document,
      result: {
        status: 'orphaned',
        range: null,
        reason: error instanceof Error ? error.message : 'Mapped range is no longer valid',
      },
    };
  }

  return { document: applied.document, result: mappingResult(mapped) };
}

function mapPoint(
  before: ARTDocument,
  after: ARTDocument,
  point: AnchoredTextPoint,
  operation: EditorOperation,
  caret: ARTTextPoint | null,
): AnchoredTextPoint | null {
  switch (operation.type) {
    case 'addMark':
    case 'removeMark':
    case 'toggleMark':
    case 'setBlockType':
      return cloneAnchoredPoint(point);
    case 'replaceText':
      return mapReplaceText(before, point, operation);
    case 'replaceBlock':
      return mapReplaceBlock(point, operation);
    case 'splitBlock':
      return mapSplitBlock(point, operation.point);
    case 'joinBlocks':
      return mapJoinBlocks(before, point, operation.leftPath, operation.rightPath);
    case 'replaceFragment':
      return caret ? mapReplaceFragment(before, after, point, operation, caret) : null;
  }
}

function mapReplaceText(
  document: ARTDocument,
  point: AnchoredTextPoint,
  operation: Extract<EditorOperation, { type: 'replaceText' }>,
): AnchoredTextPoint {
  const blocks = listInlineBlocks(document);
  const normalized = normalizeTextPoints(document, operation.from, operation.to);
  const fromIndex = findBlockIndex(blocks, normalized.start.blockPath);
  const toIndex = findBlockIndex(blocks, normalized.end.blockPath);
  const pointIndex = findBlockIndex(blocks, point.blockPath);

  if (pointIndex < fromIndex || pointIndex > toIndex) return cloneAnchoredPoint(point);

  if (fromIndex === toIndex) {
    return {
      ...cloneAnchoredPoint(point),
      offset: mapOffsetReplacement(
        point.offset,
        normalized.start.offset,
        normalized.end.offset,
        operation.text.length,
        point.affinity,
      ),
    };
  }

  if (pointIndex === fromIndex) {
    const from = normalized.start.offset;
    if (point.offset < from) return cloneAnchoredPoint(point);
    if (point.offset === from) return { ...cloneAnchoredPoint(point), offset: from };
    return {
      ...cloneAnchoredPoint(point),
      offset: point.affinity === 'before' ? from : from + operation.text.length,
    };
  }

  if (pointIndex === toIndex) {
    const to = normalized.end.offset;
    if (point.offset <= to) return { ...cloneAnchoredPoint(point), offset: 0 };
    return { ...cloneAnchoredPoint(point), offset: point.offset - to };
  }

  return { ...cloneAnchoredPoint(point), offset: 0 };
}

function mapReplaceBlock(
  point: AnchoredTextPoint,
  operation: Extract<EditorOperation, { type: 'replaceBlock' }>,
): AnchoredTextPoint | null {
  const parent = operation.path.slice(0, -1);
  const targetIndex = operation.path.at(-1)!;
  const replacementDelta = operation.content.length - 1;

  if (isDescendantOrSelf(point.blockPath, operation.path)) {
    const mapping = operation.pathMappings?.find((candidate) => samePath(candidate.from, point.blockPath));
    if (!mapping) return null;
    return {
      ...cloneAnchoredPoint(point),
      blockPath: [...mapping.to],
    };
  }

  return {
    ...cloneAnchoredPoint(point),
    blockPath: shiftSiblingPath(
      point.blockPath,
      parent,
      targetIndex,
      replacementDelta,
      'after',
    ),
  };
}

function mapOffsetReplacement(
  offset: number,
  from: number,
  to: number,
  insertedLength: number,
  affinity: AnchoredTextPoint['affinity'],
): number {
  if (from === to) {
    if (offset < from) return offset;
    if (offset > from) return offset + insertedLength;
    return affinity === 'before' ? from : from + insertedLength;
  }

  if (offset < from) return offset;
  if (offset > to) return offset + insertedLength - (to - from);
  if (offset === from) return from;
  if (offset === to) return from + insertedLength;
  return affinity === 'before' ? from : from + insertedLength;
}

function mapSplitBlock(
  point: AnchoredTextPoint,
  split: ARTTextPoint,
): AnchoredTextPoint {
  const parent = split.blockPath.slice(0, -1);
  const index = split.blockPath.at(-1)!;

  if (samePath(point.blockPath, split.blockPath)) {
    if (point.offset < split.offset) return cloneAnchoredPoint(point);
    if (point.offset > split.offset) {
      return {
        ...cloneAnchoredPoint(point),
        blockPath: [...parent, index + 1],
        offset: point.offset - split.offset,
      };
    }
    return point.affinity === 'before'
      ? cloneAnchoredPoint(point)
      : {
          ...cloneAnchoredPoint(point),
          blockPath: [...parent, index + 1],
          offset: 0,
        };
  }

  return {
    ...cloneAnchoredPoint(point),
    blockPath: shiftSiblingPath(point.blockPath, parent, index, 1, 'after'),
  };
}

function mapJoinBlocks(
  document: ARTDocument,
  point: AnchoredTextPoint,
  leftPath: ARTPath,
  rightPath: ARTPath,
): AnchoredTextPoint {
  const parent = leftPath.slice(0, -1);
  const leftIndex = leftPath.at(-1)!;
  const rightIndex = rightPath.at(-1)!;
  const leftLength = inlineBlockLength(document, leftPath);

  if (samePath(point.blockPath, leftPath)) return cloneAnchoredPoint(point);
  if (samePath(point.blockPath, rightPath)) {
    return {
      ...cloneAnchoredPoint(point),
      blockPath: [...leftPath],
      offset: leftLength + point.offset,
    };
  }

  return {
    ...cloneAnchoredPoint(point),
    blockPath: shiftSiblingPath(point.blockPath, parent, rightIndex, -1, 'after'),
  };
}

function mapReplaceFragment(
  before: ARTDocument,
  after: ARTDocument,
  point: AnchoredTextPoint,
  operation: Extract<EditorOperation, { type: 'replaceFragment' }>,
  caret: ARTTextPoint,
): AnchoredTextPoint | null {
  if (!samePath(operation.from.blockPath, operation.to.blockPath)) return null;
  const targetPath = operation.from.blockPath;
  const from = Math.min(operation.from.offset, operation.to.offset);
  const to = Math.max(operation.from.offset, operation.to.offset);
  const parent = targetPath.slice(0, -1);
  const targetIndex = targetPath.at(-1)!;
  const delta = childCount(after, parent) - childCount(before, parent);

  if (!samePath(point.blockPath, targetPath)) {
    return {
      ...cloneAnchoredPoint(point),
      blockPath: shiftSiblingPath(point.blockPath, parent, targetIndex, delta, 'after'),
    };
  }

  if (from === to) {
    if (point.offset < from) return cloneAnchoredPoint(point);
    if (point.offset > from) {
      return {
        ...cloneAnchoredPoint(point),
        blockPath: [...caret.blockPath],
        offset: caret.offset + (point.offset - from),
      };
    }
    return point.affinity === 'before'
      ? { ...cloneAnchoredPoint(point), offset: from }
      : { ...cloneAnchoredPoint(point), blockPath: [...caret.blockPath], offset: caret.offset };
  }

  if (point.offset < from) return cloneAnchoredPoint(point);
  if (point.offset > to) {
    return {
      ...cloneAnchoredPoint(point),
      blockPath: [...caret.blockPath],
      offset: caret.offset + (point.offset - to),
    };
  }
  if (point.offset === from) return { ...cloneAnchoredPoint(point), offset: from };
  if (point.offset === to) {
    return { ...cloneAnchoredPoint(point), blockPath: [...caret.blockPath], offset: caret.offset };
  }
  return point.affinity === 'before'
    ? { ...cloneAnchoredPoint(point), offset: from }
    : { ...cloneAnchoredPoint(point), blockPath: [...caret.blockPath], offset: caret.offset };
}

function applySingleOperation(document: ARTDocument, operation: EditorOperation): OperationApplication {
  const result = applyTransaction(createEditorState(document), { operations: [operation] });
  return {
    document: result.state.document,
    caret: result.state.selection?.anchor ?? null,
  };
}

function mappingResult(range: AnchoredTextRange): AnchoredRangeMappingResult {
  return samePoint(range.start, range.end)
    ? { status: 'collapsed', range: cloneAnchoredRange(range) }
    : { status: 'mapped', range: cloneAnchoredRange(range) };
}

function shiftSiblingPath(
  path: ARTPath,
  parent: ARTPath,
  pivotIndex: number,
  delta: number,
  relation: 'after' | 'at-or-after',
): number[] {
  const output = [...path];
  if (!pathStartsWith(output, parent) || output.length <= parent.length) return output;
  const siblingIndex = output[parent.length]!;
  const shouldShift = relation === 'after' ? siblingIndex > pivotIndex : siblingIndex >= pivotIndex;
  if (shouldShift) output[parent.length] = siblingIndex + delta;
  return output;
}

function pathStartsWith(path: ARTPath, prefix: ARTPath): boolean {
  return prefix.length <= path.length && prefix.every((value, index) => path[index] === value);
}

function isDescendantOrSelf(path: ARTPath, ancestor: ARTPath): boolean {
  return path.length >= ancestor.length
    && ancestor.every((value, index) => path[index] === value);
}

function findBlockIndex(
  blocks: ReturnType<typeof listInlineBlocks>,
  path: ARTPath,
): number {
  const index = blocks.findIndex((block) => samePath(block.path, path));
  if (index === -1) throw new RangeError(`No text block exists at [${path.join(',')}]`);
  return index;
}

function inlineBlockLength(document: ARTDocument, path: ARTPath): number {
  let current: unknown = document;
  for (const index of path) {
    const content = current && typeof current === 'object'
      ? (current as { content?: unknown }).content
      : undefined;
    if (!Array.isArray(content) || index < 0 || index >= content.length) {
      throw new RangeError(`Invalid text block path [${path.join(',')}]`);
    }
    current = content[index];
  }
  if (!current || typeof current !== 'object') throw new RangeError('Text block path does not target a block');
  const type = (current as { type?: unknown }).type;
  if (type !== 'paragraph' && type !== 'heading') throw new RangeError('Text block path does not target paragraph/heading');
  const content = (current as { content?: unknown }).content;
  return Array.isArray(content)
    ? content.reduce((length, node) => length + (node && typeof node === 'object' && typeof (node as { text?: unknown }).text === 'string'
      ? ((node as { text: string }).text.length)
      : node && typeof node === 'object' && (node as { type?: unknown }).type === 'extensionInline' ? 1 : 0), 0)
    : 0;
}

function childCount(document: ARTDocument, path: ARTPath): number {
  let current: unknown = document;
  if (path.length === 0) return document.content.length;
  for (const index of path) {
    const content = current && typeof current === 'object'
      ? (current as { content?: unknown }).content
      : undefined;
    if (!Array.isArray(content) || index < 0 || index >= content.length) {
      throw new RangeError(`Invalid parent path [${path.join(',')}]`);
    }
    current = content[index];
  }
  const content = current && typeof current === 'object'
    ? (current as { content?: unknown }).content
    : undefined;
  if (!Array.isArray(content)) throw new RangeError(`Parent path [${path.join(',')}] has no content array`);
  return content.length;
}

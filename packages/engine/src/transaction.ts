import { isARTDocument } from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTHeadingNode,
  ARTParagraphNode,
  ARTTextMark,
} from '@arichtext/core';
import { cloneARTFragment, replaceRangeWithFragment } from './fragment.js';
import { textPoint, textSelection } from './model.js';
import {
  addMark,
  cloneDocument,
  cloneInline,
  cloneMark,
  cloneMarks,
  cloneOperation,
  clonePoint,
  cloneSelection,
  getInlineBlock,
  getNodeAtPath,
  inlineLength,
  marksAtOffset,
  mutateInlineRange,
  normalizeRange,
  rangeHasMark,
  removeMark,
  removeMarkValue,
  replaceInlineRange,
  replaceNodeAtPath,
  sameDocument,
  samePath,
  sameSelection,
  validateSelection,
} from './tree.js';
import type {
  ARTMarkType,
  ARTPath,
  ARTPathMapping,
  ARTSelection,
  ARTTextPoint,
  EditorOperation,
  EditorState,
  EditorTransaction,
  TransactionResult,
} from './types.js';

export class TransactionBuilder {
  #operations: EditorOperation[] = [];
  #selection: ARTSelection | null | undefined;
  #meta: Record<string, unknown> = {};

  replaceText(from: ARTTextPoint, to: ARTTextPoint, text: string, marks?: ARTTextMark[]): this {
    this.#operations.push({
      type: 'replaceText',
      from: clonePoint(from),
      to: clonePoint(to),
      text,
      ...(marks ? { marks: cloneMarks(marks) } : {}),
    });
    return this;
  }

  replaceFragment(from: ARTTextPoint, to: ARTTextPoint, content: readonly ARTBlockNode[]): this {
    this.#operations.push({
      type: 'replaceFragment',
      from: clonePoint(from),
      to: clonePoint(to),
      content: cloneValue(content),
    });
    return this;
  }

  replaceBlock(
    path: ARTPath,
    content: readonly ARTBlockNode[],
    pathMappings: readonly ARTPathMapping[] = [],
  ): this {
    this.#operations.push({
      type: 'replaceBlock',
      path: [...path],
      content: cloneValue(content),
      ...(pathMappings.length > 0
        ? {
            pathMappings: pathMappings.map((mapping) => ({
              from: [...mapping.from],
              to: [...mapping.to],
            })),
          }
        : {}),
    });
    return this;
  }

  addMark(from: ARTTextPoint, to: ARTTextPoint, mark: ARTTextMark): this {
    this.#operations.push({ type: 'addMark', from: clonePoint(from), to: clonePoint(to), mark: cloneMark(mark) });
    return this;
  }

  removeMark(from: ARTTextPoint, to: ARTTextPoint, markType: ARTMarkType): this {
    this.#operations.push({ type: 'removeMark', from: clonePoint(from), to: clonePoint(to), markType });
    return this;
  }

  toggleMark(from: ARTTextPoint, to: ARTTextPoint, mark: ARTTextMark): this {
    this.#operations.push({ type: 'toggleMark', from: clonePoint(from), to: clonePoint(to), mark: cloneMark(mark) });
    return this;
  }

  setBlockType(path: ARTPath, blockType: 'paragraph' | 'heading', level?: ARTHeadingNode['level']): this {
    this.#operations.push({ type: 'setBlockType', path: [...path], blockType, ...(level !== undefined ? { level } : {}) });
    return this;
  }

  splitBlock(point: ARTTextPoint): this {
    this.#operations.push({ type: 'splitBlock', point: clonePoint(point) });
    return this;
  }

  joinBlocks(leftPath: ARTPath, rightPath: ARTPath): this {
    this.#operations.push({ type: 'joinBlocks', leftPath: [...leftPath], rightPath: [...rightPath] });
    return this;
  }

  setSelection(selection: ARTSelection | null): this {
    this.#selection = selection ? cloneSelection(selection) : null;
    return this;
  }

  setMeta(key: string, value: unknown): this {
    this.#meta[key] = value;
    return this;
  }

  build(): EditorTransaction {
    return {
      operations: this.#operations.map(cloneOperation),
      ...(this.#selection !== undefined
        ? { selection: this.#selection ? cloneSelection(this.#selection) : null }
        : {}),
      ...(Object.keys(this.#meta).length > 0 ? { meta: { ...this.#meta } } : {}),
    };
  }
}

export function transaction(): TransactionBuilder {
  return new TransactionBuilder();
}

export function applyTransaction(state: EditorState, transactionValue: EditorTransaction): TransactionResult {
  const originalDocument = cloneDocument(state.document);
  const originalSelection = state.selection ? cloneSelection(state.selection) : null;
  let document = cloneDocument(state.document);
  let selection = state.selection ? cloneSelection(state.selection) : null;

  for (const operation of transactionValue.operations) {
    switch (operation.type) {
      case 'replaceText': {
        const result = applyReplaceText(document, operation);
        document = result.document;
        selection = textSelection(result.caret);
        break;
      }
      case 'replaceFragment': {
        const result = replaceRangeWithFragment(document, operation.from, operation.to, operation.content);
        document = result.document;
        selection = textSelection(result.caret);
        break;
      }
      case 'replaceBlock':
        document = applyReplaceBlock(document, operation);
        break;
      case 'addMark':
        document = applyMarkOperation(document, operation.from, operation.to, (marks) => addMark(marks, operation.mark));
        break;
      case 'removeMark':
        document = applyMarkOperation(document, operation.from, operation.to, (marks) => removeMark(marks, operation.markType));
        break;
      case 'toggleMark': {
        const range = normalizeRange(document, operation.from, operation.to);
        const shouldRemove = rangeHasMark(range, operation.mark);
        document = applyMarkOperation(
          document,
          operation.from,
          operation.to,
          (marks) => shouldRemove ? removeMarkValue(marks, operation.mark) : addMark(marks, operation.mark),
        );
        break;
      }
      case 'setBlockType':
        document = applySetBlockType(document, operation);
        break;
      case 'splitBlock': {
        const result = applySplitBlock(document, operation);
        document = result.document;
        selection = textSelection(result.caret);
        break;
      }
      case 'joinBlocks': {
        const result = applyJoinBlocks(document, operation);
        document = result.document;
        selection = textSelection(result.caret);
        break;
      }
    }
  }

  if (transactionValue.selection !== undefined) {
    if (transactionValue.selection) validateSelection(document, transactionValue.selection);
    selection = transactionValue.selection ? cloneSelection(transactionValue.selection) : null;
  } else if (selection) {
    validateSelection(document, selection);
  }

  if (!isARTDocument(document)) throw new TypeError('Transaction produced an invalid ART document');

  const nextState: EditorState = { document, selection };
  return {
    state: {
      document: cloneDocument(nextState.document),
      selection: nextState.selection ? cloneSelection(nextState.selection) : null,
    },
    documentChanged: !sameDocument(originalDocument, nextState.document),
    selectionChanged: !sameSelection(originalSelection, nextState.selection),
    operations: transactionValue.operations.map(cloneOperation),
    ...(transactionValue.meta ? { meta: { ...transactionValue.meta } } : {}),
  };
}

function applyReplaceText(
  document: ARTDocument,
  operation: Extract<EditorOperation, { type: 'replaceText' }>,
): { document: ARTDocument; caret: ARTTextPoint } {
  const range = normalizeRange(document, operation.from, operation.to);
  const output = cloneDocument(document);
  const insertionMarks = operation.marks
    ? cloneMarks(operation.marks)
    : marksAtOffset(range.blocks[range.fromIndex]!.block, range.from.offset);
  for (let index = range.fromIndex; index <= range.toIndex; index += 1) {
    const entry = range.blocks[index]!;
    const block = getInlineBlock(output, entry.path);
    const length = inlineLength(block);
    const from = index === range.fromIndex ? range.from.offset : 0;
    const to = index === range.toIndex ? range.to.offset : length;
    const insertion = index === range.fromIndex ? operation.text : '';
    block.content = replaceInlineRange(block.content ?? [], from, to, insertion, insertionMarks);
  }
  return {
    document: output,
    caret: textPoint(range.from.blockPath, range.from.offset + operation.text.length),
  };
}

function applyReplaceBlock(
  document: ARTDocument,
  operation: Extract<EditorOperation, { type: 'replaceBlock' }>,
): ARTDocument {
  if (operation.path.length === 0) throw new RangeError('replaceBlock requires a block path');
  const output = cloneDocument(document);
  const fragment = cloneARTFragment(operation.content);
  const parentPath = operation.path.slice(0, -1);
  const index = operation.path.at(-1)!;
  const beforeParent = getNodeAtPath(document, parentPath);
  const beforeChildren = readonlyContent(beforeParent);
  if (index < 0 || index >= beforeChildren.length) {
    throw new RangeError('replaceBlock target is outside its parent');
  }

  const mappings = operation.pathMappings ?? [];
  const seenFrom = new Set<string>();
  for (const mapping of mappings) {
    if (!isDescendantOrSelf(mapping.from, operation.path)) {
      throw new RangeError('replaceBlock path mapping source must be inside the replaced subtree');
    }
    const key = mapping.from.join('.');
    if (seenFrom.has(key)) throw new RangeError(`Duplicate replaceBlock path mapping source: ${key}`);
    seenFrom.add(key);

    const oldBlock = getInlineBlock(document, mapping.from);
    const newPathIndex = mappedReplacementRootIndex(mapping.to, parentPath, index, fragment.length);
    if (newPathIndex === null) {
      throw new RangeError('replaceBlock path mapping target must be inside the replacement span');
    }
    // Target validation occurs after the splice below. Text equality is checked
    // afterward so offsets are safe to preserve.
    void oldBlock;
  }

  const parent = getNodeAtPath(output, parentPath);
  const children = mutableContent(parent);
  children.splice(index, 1, ...fragment);

  for (const mapping of mappings) {
    const beforeBlock = getInlineBlock(document, mapping.from);
    const afterBlock = getInlineBlock(output, mapping.to);
    if (inlineText(beforeBlock) !== inlineText(afterBlock)) {
      throw new RangeError(
        `replaceBlock path mapping must preserve logical text: [${mapping.from.join(',')}] -> [${mapping.to.join(',')}]`,
      );
    }
  }

  return output;
}

function applyMarkOperation(
  document: ARTDocument,
  fromPoint: ARTTextPoint,
  toPoint: ARTTextPoint,
  mutateMarks: (marks: ARTTextMark[]) => ARTTextMark[],
): ARTDocument {
  const range = normalizeRange(document, fromPoint, toPoint);
  if (range.fromIndex === range.toIndex && range.from.offset === range.to.offset) {
    return cloneDocument(document);
  }
  const output = cloneDocument(document);
  for (let index = range.fromIndex; index <= range.toIndex; index += 1) {
    const entry = range.blocks[index]!;
    const block = getInlineBlock(output, entry.path);
    const length = inlineLength(block);
    const from = index === range.fromIndex ? range.from.offset : 0;
    const to = index === range.toIndex ? range.to.offset : length;
    if (to <= from) continue;
    block.content = mutateInlineRange(block.content ?? [], from, to, mutateMarks);
  }
  return output;
}

function applySetBlockType(
  document: ARTDocument,
  operation: Extract<EditorOperation, { type: 'setBlockType' }>,
): ARTDocument {
  const output = cloneDocument(document);
  const current = getNodeAtPath(output, operation.path);
  if (!isInlineBlock(current)) {
    throw new RangeError('setBlockType path must target a paragraph or heading');
  }
  const content = cloneInline(current.content ?? []);
  const replacement: ARTParagraphNode | ARTHeadingNode = operation.blockType === 'heading'
    ? {
        type: 'heading',
        level: operation.level ?? (current.type === 'heading' ? current.level : 1),
        content,
      }
    : { type: 'paragraph', content };
  replaceNodeAtPath(output, operation.path, replacement);
  return output;
}

function applySplitBlock(
  document: ARTDocument,
  operation: Extract<EditorOperation, { type: 'splitBlock' }>,
): { document: ARTDocument; caret: ARTTextPoint } {
  const output = cloneDocument(document);
  const current = getInlineBlock(output, operation.point.blockPath);
  const length = inlineLength(current);
  if (
    !Number.isInteger(operation.point.offset)
    || operation.point.offset < 0
    || operation.point.offset > length
  ) {
    throw new RangeError('splitBlock offset is outside the target block');
  }
  if (operation.point.blockPath.length === 0) {
    throw new RangeError('splitBlock requires a block path');
  }
  const parentPath = operation.point.blockPath.slice(0, -1);
  const index = operation.point.blockPath[operation.point.blockPath.length - 1]!;
  const parent = getNodeAtPath(output, parentPath);
  const children = mutableContent(parent);
  if (children[index] !== current) {
    throw new RangeError('splitBlock path does not target its expected parent child');
  }
  const leftContent = replaceInlineRange(
    current.content ?? [],
    operation.point.offset,
    length,
    '',
    [],
  );
  const rightContent = replaceInlineRange(
    current.content ?? [],
    0,
    operation.point.offset,
    '',
    [],
  );
  const left: ARTParagraphNode | ARTHeadingNode = current.type === 'heading'
    ? { type: 'heading', level: current.level, content: leftContent }
    : { type: 'paragraph', content: leftContent };
  const right: ARTParagraphNode = { type: 'paragraph', content: rightContent };
  children.splice(index, 1, left, right);
  return {
    document: output,
    caret: textPoint([...parentPath, index + 1], 0),
  };
}

function applyJoinBlocks(
  document: ARTDocument,
  operation: Extract<EditorOperation, { type: 'joinBlocks' }>,
): { document: ARTDocument; caret: ARTTextPoint } {
  if (operation.leftPath.length === 0 || operation.rightPath.length === 0) {
    throw new RangeError('joinBlocks requires block paths');
  }
  const leftParent = operation.leftPath.slice(0, -1);
  const rightParent = operation.rightPath.slice(0, -1);
  if (!samePath(leftParent, rightParent)) {
    throw new RangeError('joinBlocks only supports siblings with the same parent');
  }
  const leftIndex = operation.leftPath.at(-1)!;
  const rightIndex = operation.rightPath.at(-1)!;
  if (rightIndex !== leftIndex + 1) {
    throw new RangeError('joinBlocks requires adjacent left/right siblings');
  }
  const output = cloneDocument(document);
  const children = mutableContent(getNodeAtPath(output, leftParent));
  const left = children[leftIndex];
  const right = children[rightIndex];
  if (!isInlineBlock(left) || !isInlineBlock(right)) {
    throw new RangeError('joinBlocks only supports paragraph/heading siblings');
  }
  const caretOffset = inlineLength(left);
  const mergedContent = cloneInline([...(left.content ?? []), ...(right.content ?? [])]);
  const merged: ARTParagraphNode | ARTHeadingNode = left.type === 'heading'
    ? { type: 'heading', level: left.level, content: mergedContent }
    : { type: 'paragraph', content: mergedContent };
  children.splice(leftIndex, 2, merged);
  return {
    document: output,
    caret: textPoint(operation.leftPath, caretOffset),
  };
}

function readonlyContent(value: unknown): readonly unknown[] {
  if (!value || typeof value !== 'object') throw new RangeError('ART path parent has no content array');
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new RangeError('ART path parent has no content array');
  return content;
}

function mutableContent(value: unknown): unknown[] {
  return readonlyContent(value) as unknown[];
}

function mappedReplacementRootIndex(
  target: ARTPath,
  parentPath: ARTPath,
  firstIndex: number,
  count: number,
): number | null {
  if (target.length <= parentPath.length) return null;
  if (!samePath(target.slice(0, parentPath.length), parentPath)) return null;
  const rootIndex = target[parentPath.length]!;
  return rootIndex >= firstIndex && rootIndex < firstIndex + count ? rootIndex : null;
}

function isDescendantOrSelf(candidate: ARTPath, ancestor: ARTPath): boolean {
  return candidate.length >= ancestor.length
    && ancestor.every((value, index) => candidate[index] === value);
}

function inlineText(block: ARTParagraphNode | ARTHeadingNode): string {
  return (block.content ?? []).map((node) => node.text).join('');
}

function isInlineBlock(value: unknown): value is ARTParagraphNode | ARTHeadingNode {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown };
  return candidate.type === 'paragraph' || candidate.type === 'heading';
}

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

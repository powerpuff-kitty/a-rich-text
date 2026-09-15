import { isARTDocument } from '@arichtext/core';
import type {
  ARTDocument,
  ARTHeadingNode,
  ARTParagraphNode,
  ARTTextMark,
} from '@arichtext/core';
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
  replaceInlineRange,
  replaceNodeAtPath,
  sameDocument,
  sameSelection,
  validateSelection,
} from './tree.js';
import type {
  ARTMarkType,
  ARTPath,
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
    this.#operations.push({
      type: 'setBlockType',
      path: [...path],
      blockType,
      ...(level !== undefined ? { level } : {}),
    });
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
          (marks) => shouldRemove ? removeMark(marks, operation.mark.type) : addMark(marks, operation.mark),
        );
        break;
      }
      case 'setBlockType':
        document = applySetBlockType(document, operation);
        break;
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

function applyMarkOperation(
  document: ARTDocument,
  fromPoint: ARTTextPoint,
  toPoint: ARTTextPoint,
  mutateMarks: (marks: ARTTextMark[]) => ARTTextMark[],
): ARTDocument {
  const range = normalizeRange(document, fromPoint, toPoint);
  if (range.fromIndex === range.toIndex && range.from.offset === range.to.offset) return cloneDocument(document);

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
  if (!isInlineBlock(current)) throw new RangeError('setBlockType path must target a paragraph or heading');

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

function isInlineBlock(value: unknown): value is ARTParagraphNode | ARTHeadingNode {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown };
  return candidate.type === 'paragraph' || candidate.type === 'heading';
}

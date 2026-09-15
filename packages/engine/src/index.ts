import { isARTDocument } from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTHeadingNode,
  ARTParagraphNode,
  ARTTextMark,
  ARTTextNode,
} from '@arichtext/core';

export type ARTPath = readonly number[];
export type ARTMarkType = ARTTextMark['type'];

export interface ARTTextPoint {
  /** Path to a paragraph or heading block, not to an individual text run. */
  blockPath: ARTPath;
  /** Character offset across the block's concatenated inline text. */
  offset: number;
}

export interface ARTSelection {
  anchor: ARTTextPoint;
  head: ARTTextPoint;
}

export interface EditorState {
  document: ARTDocument;
  selection: ARTSelection | null;
}

export type EditorOperation =
  | {
      type: 'replaceText';
      from: ARTTextPoint;
      to: ARTTextPoint;
      text: string;
      marks?: ARTTextMark[];
    }
  | {
      type: 'addMark';
      from: ARTTextPoint;
      to: ARTTextPoint;
      mark: ARTTextMark;
    }
  | {
      type: 'removeMark';
      from: ARTTextPoint;
      to: ARTTextPoint;
      markType: ARTMarkType;
    }
  | {
      type: 'toggleMark';
      from: ARTTextPoint;
      to: ARTTextPoint;
      mark: ARTTextMark;
    }
  | {
      type: 'setBlockType';
      path: ARTPath;
      blockType: 'paragraph' | 'heading';
      level?: ARTHeadingNode['level'];
    };

export interface EditorTransaction {
  operations: readonly EditorOperation[];
  selection?: ARTSelection | null;
  meta?: Readonly<Record<string, unknown>>;
}

export interface TransactionResult {
  state: EditorState;
  documentChanged: boolean;
  selectionChanged: boolean;
  operations: readonly EditorOperation[];
  meta?: Readonly<Record<string, unknown>>;
}

export interface EditorEngineOptions {
  historyLimit?: number;
}

export type EditorEngineListener = (result: TransactionResult) => void;

type InlineBlock = ARTParagraphNode | ARTHeadingNode;
type TreeNode = ARTDocument | ARTBlockNode | ARTTextNode | Record<string, unknown>;

interface TextBlockEntry {
  path: number[];
  block: InlineBlock;
}

interface NormalizedRange {
  from: ARTTextPoint;
  to: ARTTextPoint;
  fromIndex: number;
  toIndex: number;
  blocks: TextBlockEntry[];
}

const MARK_ORDER: Record<ARTMarkType, number> = {
  bold: 0,
  italic: 1,
  underline: 2,
  strike: 3,
  code: 4,
  link: 5,
};

export function createEditorState(
  document: ARTDocument,
  selection: ARTSelection | null = null,
): EditorState {
  const cloned = cloneDocument(document);
  if (selection) validateSelection(cloned, selection);
  return {
    document: cloned,
    selection: selection ? cloneSelection(selection) : null,
  };
}

export function textPoint(blockPath: ARTPath, offset: number): ARTTextPoint {
  return { blockPath: [...blockPath], offset };
}

export function textSelection(anchor: ARTTextPoint, head: ARTTextPoint = anchor): ARTSelection {
  return { anchor: clonePoint(anchor), head: clonePoint(head) };
}

export function isCollapsedSelection(selection: ARTSelection): boolean {
  return samePath(selection.anchor.blockPath, selection.head.blockPath)
    && selection.anchor.offset === selection.head.offset;
}

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
  const original = cloneState(state);
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
    state: cloneState(nextState),
    documentChanged: !sameDocument(original.document, nextState.document),
    selectionChanged: !sameSelection(original.selection, nextState.selection),
    operations: transactionValue.operations.map(cloneOperation),
    ...(transactionValue.meta ? { meta: { ...transactionValue.meta } } : {}),
  };
}

export class EditorEngine {
  #state: EditorState;
  #past: EditorState[] = [];
  #future: EditorState[] = [];
  #historyLimit: number;
  #listeners = new Set<EditorEngineListener>();

  constructor(initialState: EditorState, options: EditorEngineOptions = {}) {
    this.#state = createEditorState(initialState.document, initialState.selection);
    this.#historyLimit = Math.max(0, Math.floor(options.historyLimit ?? 100));
  }

  get state(): EditorState {
    return cloneState(this.#state);
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  dispatch(transactionValue: EditorTransaction | TransactionBuilder): TransactionResult {
    const tx = transactionValue instanceof TransactionBuilder ? transactionValue.build() : transactionValue;
    const before = cloneState(this.#state);
    const result = applyTransaction(this.#state, tx);

    if (result.documentChanged && this.#historyLimit > 0) {
      this.#past.push(before);
      if (this.#past.length > this.#historyLimit) this.#past.splice(0, this.#past.length - this.#historyLimit);
      this.#future = [];
    }

    if (result.documentChanged || result.selectionChanged) {
      this.#state = cloneState(result.state);
      this.#emit(result);
    }

    return cloneResult(result);
  }

  undo(): TransactionResult | null {
    const previous = this.#past.pop();
    if (!previous) return null;
    const before = cloneState(this.#state);
    this.#future.push(before);
    this.#state = cloneState(previous);
    const result: TransactionResult = {
      state: cloneState(this.#state),
      documentChanged: !sameDocument(before.document, this.#state.document),
      selectionChanged: !sameSelection(before.selection, this.#state.selection),
      operations: [],
      meta: { history: 'undo' },
    };
    this.#emit(result);
    return cloneResult(result);
  }

  redo(): TransactionResult | null {
    const next = this.#future.pop();
    if (!next) return null;
    const before = cloneState(this.#state);
    this.#past.push(before);
    if (this.#past.length > this.#historyLimit) this.#past.splice(0, this.#past.length - this.#historyLimit);
    this.#state = cloneState(next);
    const result: TransactionResult = {
      state: cloneState(this.#state),
      documentChanged: !sameDocument(before.document, this.#state.document),
      selectionChanged: !sameSelection(before.selection, this.#state.selection),
      operations: [],
      meta: { history: 'redo' },
    };
    this.#emit(result);
    return cloneResult(result);
  }

  subscribe(listener: EditorEngineListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(result: TransactionResult): void {
    for (const listener of this.#listeners) listener(cloneResult(result));
  }
}

function applyReplaceText(
  document: ARTDocument,
  operation: Extract<EditorOperation, { type: 'replaceText' }>,
): { document: ARTDocument; caret: ARTTextPoint } {
  const range = normalizeRange(document, operation.from, operation.to);
  const output = cloneDocument(document);
  const insertionMarks = operation.marks
    ? normalizeMarks(operation.marks)
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
  const replacement: InlineBlock = operation.blockType === 'heading'
    ? {
        type: 'heading',
        level: operation.level ?? (current.type === 'heading' ? current.level : 1),
        content,
      }
    : { type: 'paragraph', content };

  replaceNodeAtPath(output, operation.path, replacement);
  return output;
}

function normalizeRange(document: ARTDocument, fromPoint: ARTTextPoint, toPoint: ARTTextPoint): NormalizedRange {
  const blocks = listInlineBlocks(document);
  const fromIndex = findBlockIndex(blocks, fromPoint.blockPath);
  const toIndex = findBlockIndex(blocks, toPoint.blockPath);
  validatePoint(blocks[fromIndex]!.block, fromPoint);
  validatePoint(blocks[toIndex]!.block, toPoint);

  if (fromIndex < toIndex || (fromIndex === toIndex && fromPoint.offset <= toPoint.offset)) {
    return {
      from: clonePoint(fromPoint),
      to: clonePoint(toPoint),
      fromIndex,
      toIndex,
      blocks,
    };
  }

  return {
    from: clonePoint(toPoint),
    to: clonePoint(fromPoint),
    fromIndex: toIndex,
    toIndex: fromIndex,
    blocks,
  };
}

function validateSelection(document: ARTDocument, selection: ARTSelection): void {
  normalizeRange(document, selection.anchor, selection.head);
}

function validatePoint(block: InlineBlock, point: ARTTextPoint): void {
  if (!Number.isInteger(point.offset) || point.offset < 0 || point.offset > inlineLength(block)) {
    throw new RangeError(`Text offset ${point.offset} is outside the target block`);
  }
}

function listInlineBlocks(document: ARTDocument): TextBlockEntry[] {
  const output: TextBlockEntry[] = [];

  const visit = (node: unknown, path: number[]): void => {
    if (isInlineBlock(node)) {
      output.push({ path: [...path], block: node });
      return;
    }
    const children = getChildren(node);
    for (let index = 0; index < children.length; index += 1) visit(children[index], [...path, index]);
  };

  for (let index = 0; index < document.content.length; index += 1) {
    visit(document.content[index], [index]);
  }
  return output;
}

function findBlockIndex(blocks: readonly TextBlockEntry[], path: ARTPath): number {
  const index = blocks.findIndex((entry) => samePath(entry.path, path));
  if (index === -1) throw new RangeError(`No inline text block exists at path [${path.join(',')}]`);
  return index;
}

function getInlineBlock(document: ARTDocument, path: ARTPath): InlineBlock {
  const node = getNodeAtPath(document, path);
  if (!isInlineBlock(node)) throw new RangeError(`Path [${path.join(',')}] does not target an inline text block`);
  return node;
}

function getNodeAtPath(document: ARTDocument, path: ARTPath): unknown {
  if (path.length === 0) return document;
  let current: unknown = document;
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0) throw new RangeError('ART paths contain non-negative integer indexes');
    const children = getChildren(current);
    if (index >= children.length) throw new RangeError(`ART path index ${index} is out of bounds`);
    current = children[index];
  }
  return current;
}

function replaceNodeAtPath(document: ARTDocument, path: ARTPath, replacement: unknown): void {
  if (path.length === 0) throw new RangeError('The document root cannot be replaced by a block operation');
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = getNodeAtPath(document, parentPath);
  const children = getMutableChildren(parent);
  if (index >= children.length) throw new RangeError(`ART path index ${index} is out of bounds`);
  children[index] = replacement;
}

function getChildren(node: unknown): readonly unknown[] {
  if (!node || typeof node !== 'object') return [];
  const candidate = node as { type?: unknown; content?: unknown };
  if (candidate.type === 'codeBlock' || candidate.type === 'horizontalRule' || candidate.type === 'image' || candidate.type === 'text') {
    return [];
  }
  return Array.isArray(candidate.content) ? candidate.content : [];
}

function getMutableChildren(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') throw new RangeError('ART path parent has no children');
  const candidate = node as { content?: unknown };
  if (!Array.isArray(candidate.content)) throw new RangeError('ART path parent has no child content array');
  return candidate.content;
}

function isInlineBlock(value: unknown): value is InlineBlock {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown };
  return candidate.type === 'paragraph' || candidate.type === 'heading';
}

function inlineLength(block: InlineBlock): number {
  return (block.content ?? []).reduce((length, node) => length + node.text.length, 0);
}

function mutateInlineRange(
  content: readonly ARTTextNode[],
  from: number,
  to: number,
  mutateMarks: (marks: ARTTextMark[]) => ARTTextMark[],
): ARTTextNode[] {
  const output: ARTTextNode[] = [];
  let cursor = 0;

  for (const node of content) {
    const start = cursor;
    const end = cursor + node.text.length;
    cursor = end;

    if (end <= from || start >= to) {
      pushTextNode(output, node.text, node.marks ?? []);
      continue;
    }

    const localFrom = Math.max(0, from - start);
    const localTo = Math.min(node.text.length, to - start);
    if (localFrom > 0) pushTextNode(output, node.text.slice(0, localFrom), node.marks ?? []);
    if (localTo > localFrom) {
      pushTextNode(output, node.text.slice(localFrom, localTo), mutateMarks(cloneMarks(node.marks ?? [])));
    }
    if (localTo < node.text.length) pushTextNode(output, node.text.slice(localTo), node.marks ?? []);
  }

  return output;
}

function replaceInlineRange(
  content: readonly ARTTextNode[],
  from: number,
  to: number,
  text: string,
  marks: readonly ARTTextMark[],
): ARTTextNode[] {
  const output: ARTTextNode[] = [];
  const before = sliceInline(content, 0, from);
  const after = sliceInline(content, to, content.reduce((length, node) => length + node.text.length, 0));
  for (const node of before) pushTextNode(output, node.text, node.marks ?? []);
  if (text) pushTextNode(output, text, marks);
  for (const node of after) pushTextNode(output, node.text, node.marks ?? []);
  return output;
}

function sliceInline(content: readonly ARTTextNode[], from: number, to: number): ARTTextNode[] {
  if (to <= from) return [];
  const output: ARTTextNode[] = [];
  let cursor = 0;

  for (const node of content) {
    const start = cursor;
    const end = cursor + node.text.length;
    cursor = end;
    if (end <= from || start >= to) continue;
    const localFrom = Math.max(0, from - start);
    const localTo = Math.min(node.text.length, to - start);
    pushTextNode(output, node.text.slice(localFrom, localTo), node.marks ?? []);
  }
  return output;
}

function marksAtOffset(block: InlineBlock, offset: number): ARTTextMark[] {
  const content = block.content ?? [];
  if (content.length === 0) return [];
  let cursor = 0;

  for (const node of content) {
    const end = cursor + node.text.length;
    if (offset >= cursor && offset < end) return cloneMarks(node.marks ?? []);
    if (offset === end && end > 0) return cloneMarks(node.marks ?? []);
    cursor = end;
  }
  return [];
}

function rangeHasMark(range: NormalizedRange, mark: ARTTextMark): boolean {
  let sawText = false;
  for (let index = range.fromIndex; index <= range.toIndex; index += 1) {
    const block = range.blocks[index]!.block;
    const length = inlineLength(block);
    const from = index === range.fromIndex ? range.from.offset : 0;
    const to = index === range.toIndex ? range.to.offset : length;
    if (to <= from) continue;

    let cursor = 0;
    for (const node of block.content ?? []) {
      const start = cursor;
      const end = cursor + node.text.length;
      cursor = end;
      if (end <= from || start >= to) continue;
      sawText = true;
      if (!hasMark(node.marks ?? [], mark)) return false;
    }
  }
  return sawText;
}

function hasMark(marks: readonly ARTTextMark[], mark: ARTTextMark): boolean {
  return marks.some((candidate) => {
    if (candidate.type !== mark.type) return false;
    return mark.type !== 'link' || (candidate.type === 'link' && candidate.href === mark.href);
  });
}

function addMark(marks: readonly ARTTextMark[], mark: ARTTextMark): ARTTextMark[] {
  return normalizeMarks([...marks.filter((candidate) => candidate.type !== mark.type), cloneMark(mark)]);
}

function removeMark(marks: readonly ARTTextMark[], type: ARTMarkType): ARTTextMark[] {
  return normalizeMarks(marks.filter((mark) => mark.type !== type));
}

function normalizeMarks(marks: readonly ARTTextMark[]): ARTTextMark[] {
  const byType = new Map<ARTMarkType, ARTTextMark>();
  for (const mark of marks) byType.set(mark.type, cloneMark(mark));
  return [...byType.values()].sort((left, right) => MARK_ORDER[left.type] - MARK_ORDER[right.type]);
}

function pushTextNode(output: ARTTextNode[], text: string, marks: readonly ARTTextMark[]): void {
  if (!text) return;
  const normalized = normalizeMarks(marks);
  const previous = output.at(-1);
  if (previous && sameMarks(previous.marks ?? [], normalized)) {
    previous.text += text;
    return;
  }
  output.push({ type: 'text', text, ...(normalized.length ? { marks: normalized } : {}) });
}

function sameMarks(left: readonly ARTTextMark[], right: readonly ARTTextMark[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((mark, index) => {
    const other = right[index];
    if (!other || mark.type !== other.type) return false;
    return mark.type !== 'link' || (other.type === 'link' && mark.href === other.href);
  });
}

function samePath(left: ARTPath, right: ARTPath): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSelection(left: ARTSelection | null, right: ARTSelection | null): boolean {
  if (!left || !right) return left === right;
  return samePath(left.anchor.blockPath, right.anchor.blockPath)
    && left.anchor.offset === right.anchor.offset
    && samePath(left.head.blockPath, right.head.blockPath)
    && left.head.offset === right.head.offset;
}

function sameDocument(left: ARTDocument, right: ARTDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneDocument(document: ARTDocument): ARTDocument {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  const copy = cloneValue(document);
  if (!isARTDocument(copy)) throw new TypeError('Failed to clone ART document');
  return copy;
}

function cloneState(state: EditorState): EditorState {
  return createEditorState(state.document, state.selection);
}

function cloneResult(result: TransactionResult): TransactionResult {
  return {
    state: cloneState(result.state),
    documentChanged: result.documentChanged,
    selectionChanged: result.selectionChanged,
    operations: result.operations.map(cloneOperation),
    ...(result.meta ? { meta: { ...result.meta } } : {}),
  };
}

function cloneOperation(operation: EditorOperation): EditorOperation {
  return cloneValue(operation);
}

function cloneSelection(selection: ARTSelection): ARTSelection {
  return { anchor: clonePoint(selection.anchor), head: clonePoint(selection.head) };
}

function clonePoint(point: ARTTextPoint): ARTTextPoint {
  return { blockPath: [...point.blockPath], offset: point.offset };
}

function cloneInline(content: readonly ARTTextNode[]): ARTTextNode[] {
  return content.map((node) => ({
    type: 'text',
    text: node.text,
    ...(node.marks ? { marks: cloneMarks(node.marks) } : {}),
  }));
}

function cloneMarks(marks: readonly ARTTextMark[]): ARTTextMark[] {
  return marks.map(cloneMark);
}

function cloneMark(mark: ARTTextMark): ARTTextMark {
  return mark.type === 'link' ? { type: 'link', href: mark.href } : { type: mark.type };
}

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

import { isARTDocument } from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTHeadingNode,
  ARTParagraphNode,
  ARTTextMark,
  ARTTextNode,
} from '@arichtext/core';
import type {
  ARTMarkType,
  ARTPath,
  ARTSelection,
  ARTTextPoint,
  EditorOperation,
  EditorState,
  TransactionResult,
} from './types.js';

export type InlineBlock = ARTParagraphNode | ARTHeadingNode;

export interface TextBlockEntry {
  path: number[];
  block: InlineBlock;
}

export interface NormalizedRange {
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

export function cloneDocument(document: ARTDocument): ARTDocument {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  const copy = cloneValue(document);
  if (!isARTDocument(copy)) throw new TypeError('Failed to clone ART document');
  return copy;
}

export function cloneState(state: EditorState): EditorState {
  const document = cloneDocument(state.document);
  if (state.selection) validateSelection(document, state.selection);
  return {
    document,
    selection: state.selection ? cloneSelection(state.selection) : null,
  };
}

export function cloneResult(result: TransactionResult): TransactionResult {
  return {
    state: cloneState(result.state),
    documentChanged: result.documentChanged,
    selectionChanged: result.selectionChanged,
    operations: result.operations.map(cloneOperation),
    ...(result.meta ? { meta: { ...result.meta } } : {}),
  };
}

export function cloneOperation(operation: EditorOperation): EditorOperation {
  return cloneValue(operation);
}

export function cloneSelection(selection: ARTSelection): ARTSelection {
  return { anchor: clonePoint(selection.anchor), head: clonePoint(selection.head) };
}

export function clonePoint(point: ARTTextPoint): ARTTextPoint {
  return { blockPath: [...point.blockPath], offset: point.offset };
}

export function cloneInline(content: readonly ARTTextNode[]): ARTTextNode[] {
  return content.map((node) => ({
    type: 'text',
    text: node.text,
    ...(node.marks ? { marks: cloneMarks(node.marks) } : {}),
  }));
}

export function cloneMarks(marks: readonly ARTTextMark[]): ARTTextMark[] {
  return marks.map(cloneMark);
}

export function cloneMark(mark: ARTTextMark): ARTTextMark {
  return mark.type === 'link' ? { type: 'link', href: mark.href } : { type: mark.type };
}

export function sameDocument(left: ARTDocument, right: ARTDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameSelection(left: ARTSelection | null, right: ARTSelection | null): boolean {
  if (!left || !right) return left === right;
  return samePath(left.anchor.blockPath, right.anchor.blockPath)
    && left.anchor.offset === right.anchor.offset
    && samePath(left.head.blockPath, right.head.blockPath)
    && left.head.offset === right.head.offset;
}

export function samePath(left: ARTPath, right: ARTPath): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function normalizeRange(
  document: ARTDocument,
  fromPoint: ARTTextPoint,
  toPoint: ARTTextPoint,
): NormalizedRange {
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

export function validateSelection(document: ARTDocument, selection: ARTSelection): void {
  normalizeRange(document, selection.anchor, selection.head);
}

export function listInlineBlocks(document: ARTDocument): TextBlockEntry[] {
  const output: TextBlockEntry[] = [];

  const visit = (node: unknown, path: number[]): void => {
    if (isInlineBlock(node)) {
      output.push({ path: [...path], block: node });
      return;
    }
    const children = getChildren(node);
    for (let index = 0; index < children.length; index += 1) {
      visit(children[index], [...path, index]);
    }
  };

  for (let index = 0; index < document.content.length; index += 1) {
    visit(document.content[index], [index]);
  }
  return output;
}

export function getInlineBlock(document: ARTDocument, path: ARTPath): InlineBlock {
  const node = getNodeAtPath(document, path);
  if (!isInlineBlock(node)) {
    throw new RangeError(`Path [${path.join(',')}] does not target an inline text block`);
  }
  return node;
}

export function getNodeAtPath(document: ARTDocument, path: ARTPath): unknown {
  if (path.length === 0) return document;
  let current: unknown = document;
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError('ART paths contain non-negative integer indexes');
    }
    const children = getChildren(current);
    if (index >= children.length) throw new RangeError(`ART path index ${index} is out of bounds`);
    current = children[index];
  }
  return current;
}

export function replaceNodeAtPath(document: ARTDocument, path: ARTPath, replacement: unknown): void {
  if (path.length === 0) throw new RangeError('The document root cannot be replaced by a block operation');
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = getNodeAtPath(document, parentPath);
  const children = getMutableChildren(parent);
  if (index >= children.length) throw new RangeError(`ART path index ${index} is out of bounds`);
  children[index] = replacement;
}

export function inlineLength(block: InlineBlock): number {
  return (block.content ?? []).reduce((length, node) => length + node.text.length, 0);
}

export function mutateInlineRange(
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

export function replaceInlineRange(
  content: readonly ARTTextNode[],
  from: number,
  to: number,
  text: string,
  marks: readonly ARTTextMark[],
): ARTTextNode[] {
  const output: ARTTextNode[] = [];
  const totalLength = content.reduce((length, node) => length + node.text.length, 0);
  const before = sliceInline(content, 0, from);
  const after = sliceInline(content, to, totalLength);
  for (const node of before) pushTextNode(output, node.text, node.marks ?? []);
  if (text) pushTextNode(output, text, marks);
  for (const node of after) pushTextNode(output, node.text, node.marks ?? []);
  return output;
}

export function marksAtOffset(block: InlineBlock, offset: number): ARTTextMark[] {
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

export function rangeHasMark(range: NormalizedRange, mark: ARTTextMark): boolean {
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

export function addMark(marks: readonly ARTTextMark[], mark: ARTTextMark): ARTTextMark[] {
  return normalizeMarks([...marks.filter((candidate) => candidate.type !== mark.type), cloneMark(mark)]);
}

export function removeMark(marks: readonly ARTTextMark[], type: ARTMarkType): ARTTextMark[] {
  return normalizeMarks(marks.filter((mark) => mark.type !== type));
}

function validatePoint(block: InlineBlock, point: ARTTextPoint): void {
  if (!Number.isInteger(point.offset) || point.offset < 0 || point.offset > inlineLength(block)) {
    throw new RangeError(`Text offset ${point.offset} is outside the target block`);
  }
}

function findBlockIndex(blocks: readonly TextBlockEntry[], path: ARTPath): number {
  const index = blocks.findIndex((entry) => samePath(entry.path, path));
  if (index === -1) throw new RangeError(`No inline text block exists at path [${path.join(',')}]`);
  return index;
}

function getChildren(node: unknown): readonly unknown[] {
  if (!node || typeof node !== 'object') return [];
  const candidate = node as { type?: unknown; content?: unknown };
  if (
    candidate.type === 'codeBlock'
    || candidate.type === 'horizontalRule'
    || candidate.type === 'image'
    || candidate.type === 'text'
  ) {
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

function hasMark(marks: readonly ARTTextMark[], mark: ARTTextMark): boolean {
  return marks.some((candidate) => {
    if (candidate.type !== mark.type) return false;
    return mark.type !== 'link' || (candidate.type === 'link' && candidate.href === mark.href);
  });
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

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

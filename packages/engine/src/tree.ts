import { isARTDocument, inlineNodeText } from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTHeadingNode,
  ARTParagraphNode,
  ARTTextMark,
  ARTInlineNode,
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
  extensionMark: 6,
  subscript: 7,
  superscript: 8,
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
  return { document, selection: state.selection ? cloneSelection(state.selection) : null };
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

export function cloneOperation(operation: EditorOperation): EditorOperation { return cloneValue(operation); }
export function cloneSelection(selection: ARTSelection): ARTSelection { return { anchor: clonePoint(selection.anchor), head: clonePoint(selection.head) }; }
export function clonePoint(point: ARTTextPoint): ARTTextPoint { return { blockPath: [...point.blockPath], offset: point.offset }; }

export function cloneInline(content: readonly ARTInlineNode[]): ARTInlineNode[] {
  return content.map(cloneValue);
}

/** Coalesce adjacent runs with identical marks after structural edits. */
export function normalizeInline(content: readonly ARTInlineNode[]): ARTInlineNode[] {
  const output: ARTInlineNode[] = [];
  for (const node of content) pushInlineNode(output, node);
  return output;
}

export function cloneMarks(marks: readonly ARTTextMark[]): ARTTextMark[] { return marks.map(cloneMark); }

export function cloneMark(mark: ARTTextMark): ARTTextMark {
  if (mark.type === 'link') return { type: 'link', href: mark.href };
  if (mark.type === 'extensionMark') return { type: 'extensionMark', name: mark.name, ...(mark.attrs ? { attrs: cloneValue(mark.attrs) } : {}) };
  return { type: mark.type };
}

export function sameDocument(left: ARTDocument, right: ARTDocument): boolean { return JSON.stringify(left) === JSON.stringify(right); }
export function sameSelection(left: ARTSelection | null, right: ARTSelection | null): boolean {
  if (!left || !right) return left === right;
  return samePath(left.anchor.blockPath, right.anchor.blockPath)
    && left.anchor.offset === right.anchor.offset
    && samePath(left.head.blockPath, right.head.blockPath)
    && left.head.offset === right.head.offset;
}
export function samePath(left: ARTPath, right: ARTPath): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }

export function normalizeRange(document: ARTDocument, fromPoint: ARTTextPoint, toPoint: ARTTextPoint): NormalizedRange {
  const blocks = listInlineBlocks(document);
  const fromIndex = findBlockIndex(blocks, fromPoint.blockPath);
  const toIndex = findBlockIndex(blocks, toPoint.blockPath);
  validatePoint(blocks[fromIndex]!.block, fromPoint);
  validatePoint(blocks[toIndex]!.block, toPoint);
  if (fromIndex < toIndex || (fromIndex === toIndex && fromPoint.offset <= toPoint.offset)) {
    return { from: clonePoint(fromPoint), to: clonePoint(toPoint), fromIndex, toIndex, blocks };
  }
  return { from: clonePoint(toPoint), to: clonePoint(fromPoint), fromIndex: toIndex, toIndex: fromIndex, blocks };
}

export function validateSelection(document: ARTDocument, selection: ARTSelection): void { normalizeRange(document, selection.anchor, selection.head); }

export function listInlineBlocks(document: ARTDocument): TextBlockEntry[] {
  const output: TextBlockEntry[] = [];
  const visit = (node: unknown, path: number[]): void => {
    if (isInlineBlock(node)) { output.push({ path: [...path], block: node }); return; }
    const children = getChildren(node);
    for (let index = 0; index < children.length; index += 1) visit(children[index], [...path, index]);
  };
  for (let index = 0; index < document.content.length; index += 1) visit(document.content[index], [index]);
  return output;
}

export function getInlineBlock(document: ARTDocument, path: ARTPath): InlineBlock {
  const node = getNodeAtPath(document, path);
  if (!isInlineBlock(node)) throw new RangeError(`Path [${path.join(',')}] does not target an inline text block`);
  return node;
}

export function getNodeAtPath(document: ARTDocument, path: ARTPath): unknown {
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

export function replaceNodeAtPath(document: ARTDocument, path: ARTPath, replacement: unknown): void {
  if (path.length === 0) throw new RangeError('The document root cannot be replaced by a block operation');
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = getNodeAtPath(document, parentPath);
  const children = getMutableChildren(parent);
  if (index >= children.length) throw new RangeError(`ART path index ${index} is out of bounds`);
  children[index] = replacement;
}

export function inlineLength(block: InlineBlock): number { return (block.content ?? []).reduce((length, node) => length + inlineNodeText(node).length, 0); }

export function mutateInlineRange(
  content: readonly ARTInlineNode[],
  from: number,
  to: number,
  mutateMarks: (marks: ARTTextMark[]) => ARTTextMark[],
): ARTInlineNode[] {
  const output: ARTInlineNode[] = [];
  let cursor = 0;
  for (const node of content) {
    const start = cursor;
    const end = cursor + inlineNodeText(node).length;
    cursor = end;
    if (node.type === 'extensionInline') { output.push(cloneValue(node)); continue; }
    if (end <= from || start >= to) { pushTextNode(output, node.text, node.marks ?? []); continue; }
    const localFrom = Math.max(0, from - start);
    const localTo = Math.min(inlineNodeText(node).length, to - start);
    if (localFrom > 0) pushTextNode(output, node.text.slice(0, localFrom), node.marks ?? []);
    if (localTo > localFrom) pushTextNode(output, node.text.slice(localFrom, localTo), mutateMarks(cloneMarks(node.marks ?? [])));
    if (localTo < inlineNodeText(node).length) pushTextNode(output, node.text.slice(localTo), node.marks ?? []);
  }
  return output;
}

export function replaceInlineRange(
  content: readonly ARTInlineNode[], from: number, to: number, text: string, marks: readonly ARTTextMark[],
): ARTInlineNode[] {
  const output: ARTInlineNode[] = [];
  const totalLength = content.reduce((length, node) => length + inlineNodeText(node).length, 0);
  for (const node of sliceInline(content, 0, from)) pushInlineNode(output, node);
  if (text) pushTextNode(output, text, marks);
  for (const node of sliceInline(content, to, totalLength)) pushInlineNode(output, node);
  return output;
}

export function marksAtOffset(block: InlineBlock, offset: number): ARTTextMark[] {
  const content = block.content ?? [];
  if (content.length === 0) return [];
  let cursor = 0;
  for (const node of content) {
    const end = cursor + inlineNodeText(node).length;
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
      const end = cursor + inlineNodeText(node).length;
      cursor = end;
      if (end <= from || start >= to || node.type === 'extensionInline') continue;
      sawText = true;
      if (!hasMark(node.marks ?? [], mark)) return false;
    }
  }
  return sawText;
}

export function addMark(marks: readonly ARTTextMark[], mark: ARTTextMark): ARTTextMark[] {
  const key = markKey(mark);
  return normalizeMarks([...marks.filter((candidate) => markKey(candidate) !== key), cloneMark(mark)]);
}

/** Remove all marks of a built-in type, or all extension marks when type is extensionMark. */
export function removeMark(marks: readonly ARTTextMark[], type: ARTMarkType): ARTTextMark[] {
  return normalizeMarks(marks.filter((mark) => mark.type !== type));
}

/** Remove only the specific logical mark identity (including extension namespace). */
export function removeMarkValue(marks: readonly ARTTextMark[], target: ARTTextMark): ARTTextMark[] {
  const key = markKey(target);
  return normalizeMarks(marks.filter((mark) => markKey(mark) !== key));
}

function validatePoint(block: InlineBlock, point: ARTTextPoint): void {
  if (!Number.isInteger(point.offset) || point.offset < 0 || point.offset > inlineLength(block)) throw new RangeError(`Text offset ${point.offset} is outside the target block`);
}

function findBlockIndex(blocks: readonly TextBlockEntry[], path: ARTPath): number {
  const index = blocks.findIndex((entry) => samePath(entry.path, path));
  if (index === -1) throw new RangeError(`No inline text block exists at path [${path.join(',')}]`);
  return index;
}

function getChildren(node: unknown): readonly unknown[] {
  if (!node || typeof node !== 'object') return [];
  const candidate = node as { type?: unknown; content?: unknown };
  if (candidate.type === 'codeBlock' || candidate.type === 'horizontalRule' || candidate.type === 'image' || candidate.type === 'text') return [];
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

function sliceInline(content: readonly ARTInlineNode[], from: number, to: number): ARTInlineNode[] {
  if (to <= from) return [];
  const output: ARTInlineNode[] = [];
  let cursor = 0;
  for (const node of content) {
    const start = cursor;
    const end = cursor + inlineNodeText(node).length;
    cursor = end;
    if (end <= from || start >= to) continue;
    if (node.type === 'extensionInline') { output.push(cloneValue(node)); continue; }
    const localFrom = Math.max(0, from - start);
    const localTo = Math.min(inlineNodeText(node).length, to - start);
    pushTextNode(output, node.text.slice(localFrom, localTo), node.marks ?? []);
  }
  return output;
}

function hasMark(marks: readonly ARTTextMark[], mark: ARTTextMark): boolean {
  const target = markKey(mark);
  return marks.some((candidate) => markKey(candidate) === target && sameMarkValue(candidate, mark));
}

function markKey(mark: ARTTextMark): string { return mark.type === 'extensionMark' ? `extensionMark:${mark.name}` : mark.type; }

function normalizeMarks(marks: readonly ARTTextMark[]): ARTTextMark[] {
  const byKey = new Map<string, ARTTextMark>();
  for (const mark of marks) byKey.set(markKey(mark), cloneMark(mark));
  return [...byKey.values()].sort((left, right) => {
    const order = MARK_ORDER[left.type] - MARK_ORDER[right.type];
    return order !== 0 ? order : markKey(left).localeCompare(markKey(right));
  });
}

function pushInlineNode(output: ARTInlineNode[], node: ARTInlineNode): void {
  if (node.type === 'extensionInline') output.push(cloneValue(node));
  else pushTextNode(output, node.text, node.marks ?? []);
}

function pushTextNode(output: ARTInlineNode[], text: string, marks: readonly ARTTextMark[]): void {
  if (!text) return;
  const normalized = normalizeMarks(marks);
  const previous = output.at(-1);
  if (previous?.type === 'text' && sameMarks(previous.marks ?? [], normalized)) { previous.text += text; return; }
  output.push({ type: 'text', text, ...(normalized.length ? { marks: normalized } : {}) });
}

function sameMarks(left: readonly ARTTextMark[], right: readonly ARTTextMark[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((mark, index) => { const other = right[index]; return !!other && sameMarkValue(mark, other); });
}

function sameMarkValue(left: ARTTextMark, right: ARTTextMark): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'link') return right.type === 'link' && left.href === right.href;
  if (left.type === 'extensionMark') {
    return right.type === 'extensionMark' && left.name === right.name && JSON.stringify(left.attrs ?? {}) === JSON.stringify(right.attrs ?? {});
  }
  return true;
}

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

/** Text blocks touched by a block-style selection; an ending offset of zero
 * does not include that following block. Selection direction is immaterial.
 */
export function selectedStyleBlocks(state: import('./types.js').EditorState): TextBlockEntry[] {
  if (!state.selection) return [];
  const range = normalizeRange(state.document, state.selection.anchor, state.selection.head);
  const end = range.toIndex > range.fromIndex && range.to.offset === 0 ? range.toIndex : range.toIndex + 1;
  return range.blocks.slice(range.fromIndex, end);
}

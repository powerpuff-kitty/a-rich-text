export const ART_DOCUMENT_VERSION = 1 as const;

export type ARTTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string };

export interface ARTTextNode {
  type: 'text';
  text: string;
  marks?: ARTTextMark[];
}

export interface ARTParagraphNode {
  type: 'paragraph';
  content?: ARTTextNode[];
}

export interface ARTHeadingNode {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content?: ARTTextNode[];
}

export interface ARTBlockquoteNode {
  type: 'blockquote';
  content: ARTBlockNode[];
}

export interface ARTCodeBlockNode {
  type: 'codeBlock';
  language?: string;
  text: string;
}

export interface ARTHorizontalRuleNode {
  type: 'horizontalRule';
}

export interface ARTListItemNode {
  type: 'listItem';
  checked?: boolean;
  content: ARTBlockNode[];
}

export interface ARTListNode {
  type: 'list';
  style: 'bullet' | 'ordered' | 'task';
  start?: number;
  content: ARTListItemNode[];
}

export interface ARTImageNode {
  type: 'image';
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface ARTTableCellNode {
  type: 'tableCell';
  colspan?: number;
  rowspan?: number;
  content: ARTBlockNode[];
}

export interface ARTTableRowNode {
  type: 'tableRow';
  content: ARTTableCellNode[];
}

export interface ARTTableNode {
  type: 'table';
  content: ARTTableRowNode[];
}

export type ARTBlockNode =
  | ARTParagraphNode
  | ARTHeadingNode
  | ARTBlockquoteNode
  | ARTCodeBlockNode
  | ARTHorizontalRuleNode
  | ARTListNode
  | ARTImageNode
  | ARTTableNode;

export interface ARTDocument {
  type: 'doc';
  version: typeof ART_DOCUMENT_VERSION;
  content: ARTBlockNode[];
}

const MAX_DOCUMENT_DEPTH = 32;

export function createEmptyDocument(): ARTDocument {
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: [{ type: 'paragraph', content: [] }],
  };
}

export function createTextDocument(text: string): ARTDocument {
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: [
      {
        type: 'paragraph',
        content: text.length > 0 ? [{ type: 'text', text }] : [],
      },
    ],
  };
}

export function isARTDocument(value: unknown): value is ARTDocument {
  if (!isRecord(value)) return false;
  if (value.type !== 'doc' || value.version !== ART_DOCUMENT_VERSION) return false;
  if (!Array.isArray(value.content)) return false;
  return value.content.every((node) => isBlockNode(node, 0));
}

function isBlockNode(value: unknown, depth: number): value is ARTBlockNode {
  if (depth > MAX_DOCUMENT_DEPTH || !isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'paragraph':
      return isInlineContent(value.content);
    case 'heading':
      return isHeadingLevel(value.level) && isInlineContent(value.content);
    case 'blockquote':
      return Array.isArray(value.content) && value.content.every((node) => isBlockNode(node, depth + 1));
    case 'codeBlock':
      return (
        typeof value.text === 'string' &&
        (value.language === undefined || typeof value.language === 'string')
      );
    case 'horizontalRule':
      return true;
    case 'list':
      return isListNode(value, depth);
    case 'image':
      return isImageNode(value);
    case 'table':
      return isTableNode(value, depth);
    default:
      return false;
  }
}

function isListNode(value: Record<string, unknown>, depth: number): value is ARTListNode {
  if (value.style !== 'bullet' && value.style !== 'ordered' && value.style !== 'task') return false;
  if (value.start !== undefined && (!Number.isInteger(value.start) || (value.start as number) < 1)) return false;
  if (!Array.isArray(value.content)) return false;

  return value.content.every((item) => {
    if (!isRecord(item) || item.type !== 'listItem' || !Array.isArray(item.content)) return false;
    if (item.checked !== undefined && typeof item.checked !== 'boolean') return false;
    if (value.style === 'task' && typeof item.checked !== 'boolean') return false;
    return item.content.every((node) => isBlockNode(node, depth + 1));
  });
}

function isImageNode(value: Record<string, unknown>): value is ARTImageNode {
  if (typeof value.src !== 'string' || value.src.length === 0) return false;
  if (value.alt !== undefined && typeof value.alt !== 'string') return false;
  if (value.title !== undefined && typeof value.title !== 'string') return false;
  if (value.width !== undefined && (!isPositiveFiniteNumber(value.width))) return false;
  if (value.height !== undefined && (!isPositiveFiniteNumber(value.height))) return false;
  return true;
}

function isTableNode(value: Record<string, unknown>, depth: number): value is ARTTableNode {
  if (!Array.isArray(value.content) || value.content.length === 0) return false;
  let expectedCellCount: number | undefined;

  return value.content.every((row) => {
    if (!isRecord(row) || row.type !== 'tableRow' || !Array.isArray(row.content) || row.content.length === 0) {
      return false;
    }

    const effectiveCellCount = row.content.reduce((count, cell) => {
      if (!isRecord(cell) || cell.type !== 'tableCell') return Number.NaN;
      const colspan = cell.colspan === undefined ? 1 : cell.colspan;
      return Number.isInteger(colspan) && (colspan as number) > 0 ? count + (colspan as number) : Number.NaN;
    }, 0);

    if (!Number.isFinite(effectiveCellCount)) return false;
    if (expectedCellCount === undefined) expectedCellCount = effectiveCellCount;
    if (expectedCellCount !== effectiveCellCount) return false;

    return row.content.every((cell) => {
      if (!isRecord(cell) || cell.type !== 'tableCell' || !Array.isArray(cell.content)) return false;
      if (cell.colspan !== undefined && (!Number.isInteger(cell.colspan) || (cell.colspan as number) < 1)) return false;
      if (cell.rowspan !== undefined && (!Number.isInteger(cell.rowspan) || (cell.rowspan as number) < 1)) return false;
      return cell.content.every((node) => isBlockNode(node, depth + 1));
    });
  });
}

function isInlineContent(value: unknown): value is ARTTextNode[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isTextNode));
}

function isTextNode(value: unknown): value is ARTTextNode {
  if (!isRecord(value) || value.type !== 'text' || typeof value.text !== 'string') return false;
  if (value.marks === undefined) return true;
  return Array.isArray(value.marks) && value.marks.every(isTextMark);
}

function isTextMark(value: unknown): value is ARTTextMark {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
    case 'code':
      return true;
    case 'link':
      return typeof value.href === 'string' && value.href.length > 0;
    default:
      return false;
  }
}

function isHeadingLevel(value: unknown): value is ARTHeadingNode['level'] {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toPlainText(document: ARTDocument): string {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  return document.content.map(blockToPlainText).join('\n');
}

function blockToPlainText(block: ARTBlockNode): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return (block.content ?? []).map((node) => node.text).join('');
    case 'blockquote':
      return block.content.map(blockToPlainText).join('\n');
    case 'codeBlock':
      return block.text;
    case 'horizontalRule':
      return '';
    case 'list':
      return block.content
        .map((item) => item.content.map(blockToPlainText).join('\n'))
        .join('\n');
    case 'image':
      return block.alt ?? '';
    case 'table':
      return block.content
        .map((row) => row.content.map((cell) => cell.content.map(blockToPlainText).join(' ')).join('\t'))
        .join('\n');
  }
}

export function serializeDocument(document: ARTDocument): string {
  if (!isARTDocument(document)) {
    throw new TypeError('Invalid ART document');
  }
  return JSON.stringify(document);
}

export function parseDocument(serialized: string): ARTDocument {
  const value: unknown = JSON.parse(serialized);
  if (!isARTDocument(value)) {
    throw new TypeError('Invalid ART document');
  }
  return value;
}

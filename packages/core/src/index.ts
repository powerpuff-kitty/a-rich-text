import { getTableLayout } from './table-layout.js';
export { getTableLayout, type ARTTableLayout, type ARTTableCellPosition } from './table-layout.js';

export const ART_DOCUMENT_VERSION = 1 as const;

export type ARTJSONPrimitive = string | number | boolean | null;
export type ARTJSONValue = ARTJSONPrimitive | ARTJSONObject | ARTJSONValue[];
export interface ARTJSONObject {
  [key: string]: ARTJSONValue;
}

export interface ARTExtensionMark {
  type: 'extensionMark';
  /** Namespaced identifier, for example `acme:mention`. */
  name: string;
  attrs?: ARTJSONObject;
}

export type ARTTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string }
  | ARTExtensionMark;

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

export interface ARTExtensionBlockNode {
  type: 'extensionBlock';
  /** Namespaced identifier, for example `acme:property-card`. */
  name: string;
  attrs?: ARTJSONObject;
  /** Optional nested ART blocks owned by the extension. */
  content?: ARTBlockNode[];
  /** Portable/readable fallback when the extension is unavailable. */
  fallbackText?: string;
}

export type ARTBlockNode =
  | ARTParagraphNode
  | ARTHeadingNode
  | ARTBlockquoteNode
  | ARTCodeBlockNode
  | ARTHorizontalRuleNode
  | ARTListNode
  | ARTImageNode
  | ARTTableNode
  | ARTExtensionBlockNode;

export interface ARTDocument {
  type: 'doc';
  version: typeof ART_DOCUMENT_VERSION;
  content: ARTBlockNode[];
}

const MAX_DOCUMENT_DEPTH = 32;
const EXTENSION_NAME = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/;
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

export function isExtensionName(value: unknown): value is string {
  return typeof value === 'string' && EXTENSION_NAME.test(value);
}

/**
 * Validate data that will survive JSON serialization without executing getters,
 * dropping hidden/symbol properties, or coercing runtime objects.
 */
export function isARTJSONValue(value: unknown, depth = 0): value is ARTJSONValue {
  if (depth > MAX_DOCUMENT_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return isARTJSONArray(value, depth);
  if (!isPlainJSONObject(value)) return false;

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
    if (!isARTJSONValue(descriptor.value, depth + 1)) return false;
  }
  return true;
}

function isARTJSONArray(value: unknown[], depth: number): value is ARTJSONValue[] {
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return false;
    if (key === 'length') continue;
    if (!ARRAY_INDEX.test(key)) return false;
    const index = Number(key);
    if (index >= value.length) return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
    if (!isARTJSONValue(descriptor.value, depth + 1)) return false;
  }
  return true;
}

function isPlainJSONObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
  return typeof constructor === 'function' && constructor.name === 'Object';
}

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
    case 'extensionBlock':
      return isExtensionBlockNode(value, depth);
    default:
      return false;
  }
}

function isExtensionBlockNode(value: Record<string, unknown>, depth: number): boolean {
  if (!isExtensionName(value.name)) return false;
  if (value.attrs !== undefined && (!isRecord(value.attrs) || !isARTJSONValue(value.attrs))) return false;
  if (value.fallbackText !== undefined && typeof value.fallbackText !== 'string') return false;
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return false;
    if (!value.content.every((node) => isBlockNode(node, depth + 1))) return false;
  }
  return true;
}

function isListNode(value: Record<string, unknown>, depth: number): boolean {
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

function isImageNode(value: Record<string, unknown>): boolean {
  if (typeof value.src !== 'string' || value.src.length === 0) return false;
  if (value.alt !== undefined && typeof value.alt !== 'string') return false;
  if (value.title !== undefined && typeof value.title !== 'string') return false;
  if (value.width !== undefined && (!isPositiveFiniteNumber(value.width))) return false;
  if (value.height !== undefined && (!isPositiveFiniteNumber(value.height))) return false;
  return true;
}

function isTableNode(value: Record<string, unknown>, depth: number): boolean {
  if (!Array.isArray(value.content) || value.content.length === 0) return false;
  if (!value.content.every(row => isRecord(row) && row.type === 'tableRow' && Array.isArray(row.content)
    && row.content.every(cell => isRecord(cell) && cell.type === 'tableCell' && Array.isArray(cell.content)
      && cell.content.every(node => isBlockNode(node, depth + 1))))) return false;
  return getTableLayout(value as unknown as ARTTableNode) !== null;
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
    case 'extensionMark':
      return (
        isExtensionName(value.name) &&
        (value.attrs === undefined || (isRecord(value.attrs) && isARTJSONValue(value.attrs)))
      );
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
    case 'extensionBlock': {
      const nested = block.content?.map(blockToPlainText).join('\n') ?? '';
      return block.fallbackText ?? nested;
    }
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

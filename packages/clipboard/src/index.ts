import {
  ART_DOCUMENT_VERSION,
  type ARTDocument,
} from '@arichtext/core';
import { fromHTML } from '@arichtext/html';

export interface ClipboardDataLike {
  readonly types: readonly string[] | DOMStringList;
  getData(format: string): string;
}

export interface ClipboardDocument {
  source: 'html' | 'text';
  document: ARTDocument;
}

/** Prefer sanitized rich HTML, falling back to literal plain text. */
export function clipboardToDocument(data: ClipboardDataLike): ClipboardDocument | null {
  if (hasType(data.types, 'text/html')) {
    const html = data.getData('text/html');
    if (html) return { source: 'html', document: fromHTML(html) };
  }

  if (hasType(data.types, 'text/plain')) {
    return {
      source: 'text',
      document: plainTextToDocument(data.getData('text/plain')),
    };
  }

  return null;
}

export function plainTextToDocument(value: string): ARTDocument {
  const normalized = value.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: lines.map((line) => ({
      type: 'paragraph' as const,
      content: line.length > 0 ? [{ type: 'text' as const, text: line }] : [],
    })),
  };
}

function hasType(types: readonly string[] | DOMStringList, type: string): boolean {
  if ('contains' in types && typeof types.contains === 'function') return types.contains(type);
  return Array.from(types).includes(type);
}

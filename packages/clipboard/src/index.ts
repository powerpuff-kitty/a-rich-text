import {
  ART_DOCUMENT_VERSION,
  type ARTDocument,
} from '@arichtext/core';
import { fromHTML, type HTMLConversionOptions } from '@arichtext/html';

export interface ClipboardDataLike {
  readonly types: readonly string[] | DOMStringList;
  getData(format: string): string;
}

export interface ClipboardDocument {
  source: 'html' | 'text';
  document: ARTDocument;
}

export interface ClipboardConversionOptions {
  html?: HTMLConversionOptions;
}

/** Prefer sanitized rich HTML, falling back to literal plain text. */
export function clipboardToDocument(
  data: ClipboardDataLike,
  options: ClipboardConversionOptions = {},
): ClipboardDocument | null {
  if (hasType(data.types, 'text/html')) {
    const html = data.getData('text/html');
    if (html) {
      return {
        source: 'html',
        document: fromHTML(normalizeClipboardHTML(html), options.html),
      };
    }
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

/**
 * Translate only the tiny inline CSS subset commonly emitted by office editors
 * into semantic elements that the normal allowlisted importer understands.
 * Everything else stays ignored; arbitrary CSS never becomes ART state.
 */
export function normalizeClipboardHTML(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  for (const element of Array.from(parsed.body.querySelectorAll('*'))) {
    const style = (element.getAttribute('style') ?? '').toLowerCase();
    const tags: string[] = [];

    const weight = style.match(/(?:^|;)\s*font-weight\s*:\s*([^;]+)/)?.[1]?.trim();
    if (weight && (weight === 'bold' || weight === 'bolder' || (Number.parseInt(weight, 10) >= 600))) {
      tags.push('strong');
    }

    const fontStyle = style.match(/(?:^|;)\s*font-style\s*:\s*([^;]+)/)?.[1]?.trim();
    if (fontStyle === 'italic' || fontStyle === 'oblique') tags.push('em');

    const decoration = style.match(/(?:^|;)\s*text-decoration(?:-line)?\s*:\s*([^;]+)/)?.[1] ?? '';
    if (/\bunderline\b/.test(decoration)) tags.push('u');
    if (/\bline-through\b/.test(decoration)) tags.push('s');

    element.removeAttribute('style');
    element.removeAttribute('class');
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }

    if (tags.length === 0) continue;
    let inner: Node = parsed.createDocumentFragment();
    while (element.firstChild) inner.appendChild(element.firstChild);
    for (const tag of tags) {
      const wrapper = parsed.createElement(tag);
      wrapper.append(inner);
      inner = wrapper;
    }
    element.append(inner);
  }

  return parsed.body.innerHTML;
}

function hasType(types: readonly string[] | DOMStringList, type: string): boolean {
  if ('contains' in types && typeof types.contains === 'function') return types.contains(type);
  return Array.from(types).includes(type);
}

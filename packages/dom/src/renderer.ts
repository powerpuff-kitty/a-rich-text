import { isARTDocument } from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTExtensionBlockNode,
  ARTExtensionMark,
  ARTTextMark,
  ARTInlineNode,
  ARTExtensionInlineNode,
} from '@arichtext/core';
import type { ARTPath } from '@arichtext/engine';

export const ART_TEXT_BLOCK_ATTRIBUTE = 'data-art-text-block';
export const ART_BLOCK_PATH_ATTRIBUTE = 'data-art-block-path';
export const ART_BREAK_ATTRIBUTE = 'data-art-break';
export const ART_EXTENSION_BLOCK_ATTRIBUTE = 'data-art-extension-block';
export const ART_EXTENSION_INLINE_ATTRIBUTE = 'data-art-extension-inline';
export const ART_EXTENSION_MARK_ATTRIBUTE = 'data-art-extension-mark';
export const ART_EXTENSION_ATTRS_ATTRIBUTE = 'data-art-extension-attrs';
export const ART_EXTENSION_FALLBACK_ATTRIBUTE = 'data-art-extension-fallback';

const MARK_ORDER: Record<ARTTextMark['type'], number> = {
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

export interface DOMExtensionRenderer {
  renderInline?(node: ARTExtensionInlineNode, context: { document: Document }): Node | undefined;
  renderBlock(
    node: ARTExtensionBlockNode,
    context: { document: Document },
  ): Node | undefined;
  renderMark(
    mark: ARTExtensionMark,
    context: { document: Document },
  ): HTMLElement | undefined;
}

export interface ARTDOMRenderOptions {
  extensions?: DOMExtensionRenderer;
}

export function encodeARTPath(path: ARTPath): string {
  return path.join('.');
}

export function decodeARTPath(value: string): number[] {
  if (!/^\d+(?:\.\d+)*$/.test(value)) throw new TypeError(`Invalid ART DOM path: ${value}`);
  return value.split('.').map((part) => Number.parseInt(part, 10));
}

export function renderARTDocument(
  root: HTMLElement,
  document: ARTDocument,
  options: ARTDOMRenderOptions = {},
): void {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  const owner = root.ownerDocument;
  const fragment = owner.createDocumentFragment();
  document.content.forEach((block, index) => fragment.append(renderBlock(owner, block, [index], options)));
  root.replaceChildren(fragment);
}

function renderBlock(
  owner: Document,
  block: ARTBlockNode,
  path: number[],
  options: ARTDOMRenderOptions,
): Node {
  switch (block.type) {
    case 'paragraph': {
      const element = partElement(owner, 'p', 'paragraph');
      markTextBlock(element, path);
      renderInline(owner, element, block.content ?? [], options);
      return element;
    }
    case 'heading': {
      const element = partElement(owner, `h${block.level}`, `heading heading-${block.level}`);
      markTextBlock(element, path);
      renderInline(owner, element, block.content ?? [], options);
      return element;
    }
    case 'blockquote': {
      const element = partElement(owner, 'blockquote', 'blockquote');
      block.content.forEach((child, index) => element.append(renderBlock(owner, child, [...path, index], options)));
      return element;
    }
    case 'codeBlock': {
      const pre = partElement(owner, 'pre', 'code-block');
      pre.setAttribute('data-art-code-path', encodeARTPath(path));
      const code = partElement(owner, 'code', 'code-content');
      if (block.language) {
        code.dataset.language = block.language;
        code.className = `language-${block.language}`;
      }
      code.textContent = block.text;
      pre.append(code);
      return pre;
    }
    case 'horizontalRule':
      return partElement(owner, 'hr', 'horizontal-rule');
    case 'list': {
      const list = partElement(owner, block.style === 'ordered' ? 'ol' : 'ul', `list ${block.style}-list`);
      list.dataset.artList = block.style;
      if (block.style === 'ordered' && block.start && block.start !== 1) list.setAttribute('start', String(block.start));
      block.content.forEach((item, itemIndex) => {
        const li = partElement(owner, 'li', 'list-item');
        if (block.style === 'task') {
          li.dataset.checked = String(item.checked === true);
          const checkbox = partElement(owner, 'input', 'task-checkbox');
          checkbox.type = 'checkbox';
          checkbox.checked = item.checked === true;
          checkbox.disabled = true;
          checkbox.contentEditable = 'false';
          checkbox.tabIndex = -1;
          li.append(checkbox);
        }
        item.content.forEach((child, childIndex) => {
          li.append(renderBlock(owner, child, [...path, itemIndex, childIndex], options));
        });
        list.append(li);
      });
      return list;
    }
    case 'image': {
      const image = partElement(owner, 'img', 'image');
      image.setAttribute('data-art-image-path', encodeARTPath(path));
      const src = safeUrl(block.src, true);
      if (src) image.src = src;
      if (block.alt !== undefined) image.alt = block.alt;
      if (block.title !== undefined) image.title = block.title;
      if (block.width) image.width = block.width;
      if (block.height) image.height = block.height;
      image.contentEditable = 'false';
      return image;
    }
    case 'table': {
      const table = partElement(owner, 'table', 'table');
      const tbody = partElement(owner, 'tbody', 'table-body');
      block.content.forEach((row, rowIndex) => {
        const tr = partElement(owner, 'tr', 'table-row');
        row.content.forEach((cell, cellIndex) => {
          const td = partElement(owner, 'td', 'table-cell');
          if (cell.colspan && cell.colspan > 1) td.colSpan = cell.colspan;
          if (cell.rowspan && cell.rowspan > 1) td.rowSpan = cell.rowspan;
          cell.content.forEach((child, childIndex) => {
            td.append(renderBlock(owner, child, [...path, rowIndex, cellIndex, childIndex], options));
          });
          tr.append(td);
        });
        tbody.append(tr);
      });
      table.append(tbody);
      return table;
    }
    case 'extensionBlock': {
      const element = partElement(owner, 'div', 'extension-block');
      writeExtensionEnvelope(element, block.name, block.attrs, block.fallbackText);
      element.contentEditable = 'false';

      const custom = options.extensions?.renderBlock(block, { document: owner });
      if (custom) {
        if (custom.ownerDocument !== owner) {
          throw new TypeError(`Extension renderer ${block.name} returned a node from another document`);
        }
        element.append(custom);
      } else if (block.fallbackText !== undefined) {
        element.textContent = block.fallbackText;
      } else {
        block.content?.forEach((child, index) => element.append(renderBlock(owner, child, [...path, index], options)));
      }
      return element;
    }
  }
}

function markTextBlock(element: HTMLElement, path: ARTPath): void {
  element.setAttribute(ART_TEXT_BLOCK_ATTRIBUTE, '');
  element.setAttribute(ART_BLOCK_PATH_ATTRIBUTE, encodeARTPath(path));
}

function renderInline(
  owner: Document,
  parent: HTMLElement,
  content: readonly ARTInlineNode[],
  options: ARTDOMRenderOptions,
): void {
  for (const textNode of content) {
    if (textNode.type === 'extensionInline') {
      const atom = partElement(owner, 'span', 'extension-inline');
      atom.setAttribute(ART_EXTENSION_INLINE_ATTRIBUTE, textNode.name);
      atom.setAttribute(ART_EXTENSION_FALLBACK_ATTRIBUTE, textNode.fallbackText);
      if (textNode.attrs) atom.setAttribute(ART_EXTENSION_ATTRS_ATTRIBUTE, JSON.stringify(textNode.attrs));
      atom.setAttribute('contenteditable', 'false');
      atom.setAttribute('aria-label', textNode.fallbackText);
      const custom = options.extensions?.renderInline?.(textNode, { document: owner });
      if (custom) atom.append(custom); else atom.textContent = textNode.fallbackText;
      parent.append(atom);
      continue;
    }
    let rendered: Node = renderText(owner, textNode.text);
    const marks = [...(textNode.marks ?? [])].sort((left, right) => {
      const order = MARK_ORDER[left.type] - MARK_ORDER[right.type];
      if (order !== 0) return order;
      const leftName = left.type === 'extensionMark' ? left.name : '';
      const rightName = right.type === 'extensionMark' ? right.name : '';
      return leftName.localeCompare(rightName);
    });

    for (const mark of marks) {
      const wrapper = markElement(owner, mark, options);
      if (!wrapper) continue;
      wrapper.append(rendered);
      rendered = wrapper;
    }
    parent.append(rendered);
  }
}

function renderText(owner: Document, value: string): Node {
  if (!value.includes('\n')) return owner.createTextNode(value);
  const fragment = owner.createDocumentFragment();
  const parts = value.split('\n');
  parts.forEach((part, index) => {
    if (part) fragment.append(owner.createTextNode(part));
    if (index < parts.length - 1) {
      const br = owner.createElement('br');
      br.setAttribute(ART_BREAK_ATTRIBUTE, '');
      fragment.append(br);
    }
  });
  return fragment;
}

function markElement(
  owner: Document,
  mark: ARTTextMark,
  options: ARTDOMRenderOptions,
): HTMLElement | null {
  switch (mark.type) {
    case 'bold':
      return partElement(owner, 'strong', 'bold');
    case 'italic':
      return partElement(owner, 'em', 'italic');
    case 'underline':
      return partElement(owner, 'u', 'underline');
    case 'strike':
      return partElement(owner, 's', 'strike');
    case 'code':
      return partElement(owner, 'code', 'inline-code');
    case 'subscript':
      return partElement(owner, 'sub', 'subscript');
    case 'superscript':
      return partElement(owner, 'sup', 'superscript');
    case 'link': {
      const href = safeUrl(mark.href, false);
      if (!href) return null;
      const anchor = partElement(owner, 'a', 'link');
      anchor.setAttribute('href', href);
      return anchor;
    }
    case 'extensionMark': {
      const custom = options.extensions?.renderMark(mark, { document: owner });
      const wrapper = custom ?? owner.createElement('span');
      if (wrapper.ownerDocument !== owner) {
        throw new TypeError(`Extension mark renderer ${mark.name} returned an element from another document`);
      }
      writeExtensionEnvelope(wrapper, mark.name, mark.attrs);
      wrapper.setAttribute(ART_EXTENSION_MARK_ATTRIBUTE, mark.name);
      wrapper.removeAttribute(ART_EXTENSION_BLOCK_ATTRIBUTE);
      return wrapper;
    }
  }
}

function writeExtensionEnvelope(
  element: Element,
  name: string,
  attrs?: Record<string, unknown>,
  fallbackText?: string,
): void {
  element.setAttribute(ART_EXTENSION_BLOCK_ATTRIBUTE, name);
  if (attrs) element.setAttribute(ART_EXTENSION_ATTRS_ATTRIBUTE, stableJSON(attrs));
  if (fallbackText !== undefined) element.setAttribute(ART_EXTENSION_FALLBACK_ATTRIBUTE, fallbackText);
}

function stableJSON(value: unknown): string {
  return JSON.stringify(sortJSON(value));
}

function sortJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJSON);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortJSON(record[key])]));
}

function safeUrl(value: string, image: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:\/|\.\/|\.\.\/|#|\?)/.test(trimmed)) return trimmed;
  if (image && /^data:image\/(?:png|gif|jpe?g|webp|avif);/i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed, 'https://arichtext.invalid');
    if (parsed.origin === 'https://arichtext.invalid' && !trimmed.startsWith('//')) return trimmed;
    const allowed = image ? ['http:', 'https:', 'blob:'] : ['http:', 'https:', 'mailto:', 'tel:'];
    return allowed.includes(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

/** Public styling hooks; canonical serialization is independent of DOM attributes. */
function partElement<K extends keyof HTMLElementTagNameMap>(owner: Document, tag: K, parts: string): HTMLElementTagNameMap[K];
function partElement(owner: Document, tag: string, parts: string): HTMLElement;
function partElement(owner: Document, tag: string, parts: string): HTMLElement {
  const element = owner.createElement(tag);
  element.setAttribute('part', parts);
  return element;
}

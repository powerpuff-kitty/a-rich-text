import {
  ART_DOCUMENT_VERSION,
  isARTDocument,
  isARTJSONValue,
  isExtensionName,
} from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTExtensionBlockNode,
  ARTExtensionMark,
  ARTImageNode,
  ARTListNode,
  ARTTableNode,
  ARTTextMark,
  ARTTextNode,
  ARTJSONObject,
} from '@arichtext/core';

const DEFAULT_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'] as const;
const DEFAULT_IMAGE_PROTOCOLS = ['http:', 'https:', 'blob:'] as const;
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'HR', 'UL', 'OL',
  'IMG', 'TABLE', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'FIGURE',
]);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT']);
const FORBIDDEN_DESCRIPTOR_TAGS = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript']);
const MARK_ORDER: Record<ARTTextMark['type'], number> = {
  bold: 0,
  italic: 1,
  underline: 2,
  strike: 3,
  code: 4,
  link: 5,
  extensionMark: 6,
};

export interface ExtensionHTMLDescriptorLike {
  tagName: string;
  attributes?: Readonly<Record<string, string>>;
  textContent?: string;
}

/** Structural interface implemented by `@arichtext/extensions`. */
export interface HTMLExtensionHooks {
  parseBlockHTML(element: Element): ARTExtensionBlockNode | undefined;
  parseMarkHTML(element: Element): ARTExtensionMark | undefined;
  serializeBlockHTML(node: ARTExtensionBlockNode): ExtensionHTMLDescriptorLike | undefined;
  serializeMarkHTML(mark: ARTExtensionMark): ExtensionHTMLDescriptorLike | undefined;
}

export interface HTMLConversionOptions {
  linkProtocols?: readonly string[];
  imageProtocols?: readonly string[];
  allowDataImages?: boolean;
  extensions?: HTMLExtensionHooks;
}

interface ResolvedOptions {
  linkProtocols: readonly string[];
  imageProtocols: readonly string[];
  allowDataImages: boolean;
  extensions?: HTMLExtensionHooks;
}

export function fromHTML(html: string, options: HTMLConversionOptions = {}): ARTDocument {
  if (typeof DOMParser === 'undefined') throw new Error('@arichtext/html fromHTML() requires a browser DOMParser');
  const resolved = resolveOptions(options);
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const content = parseBlocks(Array.from(parsed.body.childNodes), resolved);
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
  };
}

export function toHTML(document: ARTDocument, options: HTMLConversionOptions = {}): string {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  const resolved = resolveOptions(options);
  return document.content.map((block) => serializeBlock(block, resolved)).join('');
}

export function sanitizeHTML(html: string, options: HTMLConversionOptions = {}): string {
  return toHTML(fromHTML(html, options), options);
}

function resolveOptions(options: HTMLConversionOptions): ResolvedOptions {
  return {
    linkProtocols: options.linkProtocols ?? DEFAULT_LINK_PROTOCOLS,
    imageProtocols: options.imageProtocols ?? DEFAULT_IMAGE_PROTOCOLS,
    allowDataImages: options.allowDataImages ?? false,
    ...(options.extensions ? { extensions: options.extensions } : {}),
  };
}

function parseBlocks(nodes: readonly Node[], options: ResolvedOptions): ARTBlockNode[] {
  const blocks: ARTBlockNode[] = [];
  let inlineBuffer: Node[] = [];
  const flushInline = (): void => {
    if (inlineBuffer.length === 0) return;
    const content = parseInline(inlineBuffer, options);
    if (content.some((node) => node.text.length > 0)) blocks.push({ type: 'paragraph', content });
    inlineBuffer = [];
  };

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? '').trim()) inlineBuffer.push(node);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;
    if (DROP_TAGS.has(element.tagName)) continue;

    if (element.hasAttribute('data-art-extension-block')) {
      flushInline();
      const extension = parseExtensionBlock(element, options);
      if (extension) blocks.push(extension);
      continue;
    }

    const custom = options.extensions?.parseBlockHTML(element);
    if (custom) {
      if (!isValidExtensionBlock(custom)) throw new TypeError(`Extension HTML parser returned invalid block: ${custom.name}`);
      flushInline();
      blocks.push(custom);
      continue;
    }

    if (!BLOCK_TAGS.has(element.tagName)) {
      inlineBuffer.push(node);
      continue;
    }
    flushInline();
    blocks.push(...parseBlockElement(element, options));
  }
  flushInline();
  return blocks;
}

function parseBlockElement(element: Element, options: ResolvedOptions): ARTBlockNode[] {
  switch (element.tagName) {
    case 'P':
      return [{ type: 'paragraph', content: parseInline(Array.from(element.childNodes), options) }];
    case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
      return [{
        type: 'heading',
        level: Number(element.tagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
        content: parseInline(Array.from(element.childNodes), options),
      }];
    case 'BLOCKQUOTE': {
      const content = parseBlocks(Array.from(element.childNodes), options);
      return [{ type: 'blockquote', content }];
    }
    case 'PRE': {
      const code = element.querySelector(':scope > code');
      const className = code?.getAttribute('class') ?? '';
      const language = className.match(/(?:^|\s)language-([^\s]+)/)?.[1];
      return [{ type: 'codeBlock', ...(language ? { language } : {}), text: code?.textContent ?? element.textContent ?? '' }];
    }
    case 'HR': return [{ type: 'horizontalRule' }];
    case 'UL': case 'OL': return parseList(element, options);
    case 'IMG': {
      const image = parseImage(element, options);
      return image ? [image] : [];
    }
    case 'TABLE': {
      const table = parseTable(element as HTMLTableElement, options);
      return table ? [table] : [];
    }
    default: return parseBlocks(Array.from(element.childNodes), options);
  }
}

function parseExtensionBlock(element: Element, options: ResolvedOptions): ARTBlockNode | null {
  const name = element.getAttribute('data-art-extension-block');
  if (!isExtensionName(name)) return null;
  const attrs = parseAttrs(element.getAttribute('data-art-extension-attrs'));
  const fallbackText = element.getAttribute('data-art-extension-fallback');
  const contentContainer = element.querySelector(':scope > [data-art-extension-content]');
  const content = contentContainer ? parseBlocks(Array.from(contentContainer.childNodes), options) : undefined;
  return {
    type: 'extensionBlock',
    name,
    ...(attrs ? { attrs } : {}),
    ...(content && content.length > 0 ? { content } : {}),
    ...(fallbackText !== null ? { fallbackText } : {}),
  };
}

function parseInline(nodes: readonly Node[], options: ResolvedOptions, inheritedMarks: readonly ARTTextMark[] = []): ARTTextNode[] {
  const output: ARTTextNode[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(output, node.textContent ?? '', inheritedMarks);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;
    if (DROP_TAGS.has(element.tagName)) continue;
    if (element.tagName === 'BR') { appendText(output, '\n', inheritedMarks); continue; }
    if (element.tagName === 'IMG') {
      const alt = element.getAttribute('alt') ?? '';
      if (alt) appendText(output, alt, inheritedMarks);
      continue;
    }

    const marks = [...inheritedMarks];
    const extensionMark = parseExtensionMark(element) ?? options.extensions?.parseMarkHTML(element) ?? null;
    if (extensionMark) {
      if (!isValidExtensionMark(extensionMark)) throw new TypeError(`Extension HTML parser returned invalid mark: ${extensionMark.name}`);
      marks.push(extensionMark);
    } else {
      switch (element.tagName) {
        case 'STRONG': case 'B': marks.push({ type: 'bold' }); break;
        case 'EM': case 'I': marks.push({ type: 'italic' }); break;
        case 'U': marks.push({ type: 'underline' }); break;
        case 'S': case 'STRIKE': case 'DEL': marks.push({ type: 'strike' }); break;
        case 'CODE': marks.push({ type: 'code' }); break;
        case 'A': {
          const href = sanitizeUrl(element.getAttribute('href'), options.linkProtocols, false);
          if (href) marks.push({ type: 'link', href });
          break;
        }
      }
    }
    const children = parseInline(Array.from(element.childNodes), options, normalizeMarks(marks));
    for (const child of children) appendText(output, child.text, child.marks ?? []);
  }
  return output;
}

function parseExtensionMark(element: Element): ARTExtensionMark | null {
  const name = element.getAttribute('data-art-extension-mark');
  if (!isExtensionName(name)) return null;
  const attrs = parseAttrs(element.getAttribute('data-art-extension-attrs'));
  return { type: 'extensionMark', name, ...(attrs ? { attrs } : {}) };
}

function parseAttrs(raw: string | null): ARTJSONObject | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) && isARTJSONValue(value)
      ? value as ARTJSONObject
      : undefined;
  } catch {
    return undefined;
  }
}

function appendText(output: ARTTextNode[], text: string, marks: readonly ARTTextMark[]): void {
  if (!text) return;
  const normalized = normalizeMarks(marks);
  const previous = output.at(-1);
  if (previous && marksEqual(previous.marks ?? [], normalized)) { previous.text += text; return; }
  output.push({ type: 'text', text, ...(normalized.length > 0 ? { marks: normalized } : {}) });
}

function markKey(mark: ARTTextMark): string {
  if (mark.type === 'link') return `link:${mark.href}`;
  if (mark.type === 'extensionMark') return `extensionMark:${mark.name}`;
  return mark.type;
}

function normalizeMarks(marks: readonly ARTTextMark[]): ARTTextMark[] {
  const unique = new Map<string, ARTTextMark>();
  for (const mark of marks) unique.set(markKey(mark), mark);
  return [...unique.values()].sort((a, b) => {
    const order = MARK_ORDER[a.type] - MARK_ORDER[b.type];
    return order !== 0 ? order : markKey(a).localeCompare(markKey(b));
  });
}

function marksEqual(a: readonly ARTTextMark[], b: readonly ARTTextMark[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((mark, index) => {
    const other = b[index];
    if (!other || mark.type !== other.type) return false;
    if (mark.type === 'link') return other.type === 'link' && mark.href === other.href;
    if (mark.type === 'extensionMark') {
      return other.type === 'extensionMark' && mark.name === other.name && stableJSON(mark.attrs ?? {}) === stableJSON(other.attrs ?? {});
    }
    return true;
  });
}

function parseList(element: Element, options: ResolvedOptions): ARTListNode[] {
  const listItems = Array.from(element.children).filter((child) => child.tagName === 'LI');
  if (listItems.length === 0) return [];
  const explicitTask = element.getAttribute('data-art-list') === 'task';
  const task = explicitTask || listItems.some((item) => item.querySelector(':scope > input[type="checkbox"]') !== null);
  const style: ARTListNode['style'] = task ? 'task' : element.tagName === 'OL' ? 'ordered' : 'bullet';
  const content = listItems.map((item) => {
    const checkbox = item.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
    const childNodes = Array.from(item.childNodes).filter((node) => node !== checkbox);
    const blocks = parseBlocks(childNodes, options);
    const checkedAttr = item.getAttribute('data-checked');
    const checked = checkbox?.checked ?? checkbox?.hasAttribute('checked') ?? checkedAttr === 'true';
    return {
      type: 'listItem' as const,
      ...(style === 'task' ? { checked } : {}),
      content: blocks.length > 0 ? blocks : [{ type: 'paragraph' as const, content: [] }],
    };
  });
  const rawStart = element.getAttribute('start');
  const start = rawStart ? Number.parseInt(rawStart, 10) : undefined;
  return [{ type: 'list', style, ...(style === 'ordered' && start && start > 0 ? { start } : {}), content }];
}

function parseImage(element: Element, options: ResolvedOptions): ARTImageNode | null {
  const src = sanitizeUrl(element.getAttribute('src'), options.imageProtocols, options.allowDataImages);
  if (!src) return null;
  const width = positiveNumberAttribute(element, 'width');
  const height = positiveNumberAttribute(element, 'height');
  const alt = element.getAttribute('alt');
  const title = element.getAttribute('title');
  return {
    type: 'image', src,
    ...(alt !== null ? { alt } : {}),
    ...(title !== null ? { title } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function parseTable(element: HTMLTableElement, options: ResolvedOptions): ARTTableNode | null {
  const rows = Array.from(element.rows).map((row) => ({
    type: 'tableRow' as const,
    content: Array.from(row.cells).map((cell) => ({
      type: 'tableCell' as const,
      ...(cell.colSpan > 1 ? { colspan: cell.colSpan } : {}),
      ...(cell.rowSpan > 1 ? { rowspan: cell.rowSpan } : {}),
      content: (() => {
        const blocks = parseBlocks(Array.from(cell.childNodes), options);
        return blocks.length > 0 ? blocks : [{ type: 'paragraph' as const, content: [] }];
      })(),
    })),
  }));
  if (rows.length === 0) return null;
  return { type: 'table', content: rows };
}

function positiveNumberAttribute(element: Element, attribute: string): number | undefined {
  const raw = element.getAttribute(attribute);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function serializeBlock(block: ARTBlockNode, options: ResolvedOptions): string {
  switch (block.type) {
    case 'paragraph': return `<p>${serializeInline(block.content ?? [], options)}</p>`;
    case 'heading': return `<h${block.level}>${serializeInline(block.content ?? [], options)}</h${block.level}>`;
    case 'blockquote': return `<blockquote>${block.content.map((child) => serializeBlock(child, options)).join('')}</blockquote>`;
    case 'codeBlock': {
      const language = block.language ? ` class="language-${escapeAttribute(block.language)}"` : '';
      return `<pre><code${language}>${escapeText(block.text)}</code></pre>`;
    }
    case 'horizontalRule': return '<hr>';
    case 'list': return serializeList(block, options);
    case 'image': return serializeImage(block, options);
    case 'table':
      return `<table><tbody>${block.content.map((row) => `<tr>${row.content.map((cell) => {
        const attrs = [
          cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '',
          cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '',
        ].join('');
        return `<td${attrs}>${cell.content.map((child) => serializeBlock(child, options)).join('')}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
    case 'extensionBlock': return serializeExtensionBlock(block, options);
  }
}

function serializeExtensionBlock(block: ARTExtensionBlockNode, options: ResolvedOptions): string {
  const custom = options.extensions?.serializeBlockHTML(block);
  if (custom) {
    const inner = block.content?.map((child) => serializeBlock(child, options)).join('') ?? escapeText(block.fallbackText ?? '');
    return serializeDescriptor(custom, inner, options);
  }

  const attrs = block.attrs ? ` data-art-extension-attrs="${escapeAttribute(stableJSON(block.attrs))}"` : '';
  const fallback = block.fallbackText !== undefined
    ? ` data-art-extension-fallback="${escapeAttribute(block.fallbackText)}"`
    : '';
  const content = block.content?.length
    ? `<div data-art-extension-content>${block.content.map((child) => serializeBlock(child, options)).join('')}</div>`
    : escapeText(block.fallbackText ?? '');
  return `<div data-art-extension-block="${escapeAttribute(block.name)}"${attrs}${fallback}>${content}</div>`;
}

function serializeInline(nodes: readonly ARTTextNode[], options: ResolvedOptions): string {
  return nodes.map((node) => {
    let value = escapeText(node.text).replaceAll('\n', '<br>');
    for (const mark of normalizeMarks(node.marks ?? [])) {
      switch (mark.type) {
        case 'bold': value = `<strong>${value}</strong>`; break;
        case 'italic': value = `<em>${value}</em>`; break;
        case 'underline': value = `<u>${value}</u>`; break;
        case 'strike': value = `<s>${value}</s>`; break;
        case 'code': value = `<code>${value}</code>`; break;
        case 'link': {
          const href = sanitizeUrl(mark.href, options.linkProtocols, false);
          if (href) value = `<a href="${escapeAttribute(href)}">${value}</a>`;
          break;
        }
        case 'extensionMark': {
          const custom = options.extensions?.serializeMarkHTML(mark);
          if (custom) value = serializeDescriptor(custom, value, options);
          else {
            const attrs = mark.attrs ? ` data-art-extension-attrs="${escapeAttribute(stableJSON(mark.attrs))}"` : '';
            value = `<span data-art-extension-mark="${escapeAttribute(mark.name)}"${attrs}>${value}</span>`;
          }
          break;
        }
      }
    }
    return value;
  }).join('');
}

function serializeDescriptor(
  descriptor: ExtensionHTMLDescriptorLike,
  fallbackInner: string,
  options: ResolvedOptions,
): string {
  const tag = descriptor.tagName.toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(tag) || FORBIDDEN_DESCRIPTOR_TAGS.has(tag)) {
    throw new TypeError(`Unsafe extension HTML tag: ${descriptor.tagName}`);
  }

  const attributes = Object.entries(descriptor.attributes ?? {}).map(([name, raw]) => {
    if (!/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(name) || /^on/i.test(name) || name.toLowerCase() === 'style' || name.toLowerCase() === 'srcdoc') {
      throw new TypeError(`Unsafe extension HTML attribute: ${name}`);
    }
    let value = String(raw);
    if (name.toLowerCase() === 'href') {
      const safe = sanitizeUrl(value, options.linkProtocols, false);
      if (!safe) throw new TypeError('Unsafe extension href');
      value = safe;
    }
    if (name.toLowerCase() === 'src') {
      const safe = sanitizeUrl(value, options.imageProtocols, options.allowDataImages);
      if (!safe) throw new TypeError('Unsafe extension src');
      value = safe;
    }
    return ` ${name}="${escapeAttribute(value)}"`;
  }).join('');

  const inner = descriptor.textContent !== undefined ? escapeText(descriptor.textContent) : fallbackInner;
  return `<${tag}${attributes}>${inner}</${tag}>`;
}

function serializeList(list: ARTListNode, options: ResolvedOptions): string {
  const tag = list.style === 'ordered' ? 'ol' : 'ul';
  const attrs = [
    list.style === 'task' ? ' data-art-list="task"' : '',
    list.style === 'ordered' && list.start && list.start !== 1 ? ` start="${list.start}"` : '',
  ].join('');
  const items = list.content.map((item) => {
    const taskAttrs = list.style === 'task' ? ` data-checked="${item.checked === true ? 'true' : 'false'}"` : '';
    const checkbox = list.style === 'task' ? `<input type="checkbox" disabled${item.checked ? ' checked' : ''}>` : '';
    return `<li${taskAttrs}>${checkbox}${item.content.map((child) => serializeBlock(child, options)).join('')}</li>`;
  }).join('');
  return `<${tag}${attrs}>${items}</${tag}>`;
}

function serializeImage(image: ARTImageNode, options: ResolvedOptions): string {
  const src = sanitizeUrl(image.src, options.imageProtocols, options.allowDataImages);
  if (!src) return '';
  const attrs = [
    ` src="${escapeAttribute(src)}"`,
    image.alt !== undefined ? ` alt="${escapeAttribute(image.alt)}"` : '',
    image.title !== undefined ? ` title="${escapeAttribute(image.title)}"` : '',
    image.width ? ` width="${image.width}"` : '',
    image.height ? ` height="${image.height}"` : '',
  ].join('');
  return `<img${attrs}>`;
}

function isValidExtensionBlock(block: ARTExtensionBlockNode): boolean {
  return isARTDocument({ type: 'doc', version: ART_DOCUMENT_VERSION, content: [block] });
}

function isValidExtensionMark(mark: ARTExtensionMark): boolean {
  return isARTDocument({
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [mark] }] }],
  });
}

function sanitizeUrl(value: string | null, protocols: readonly string[], allowData: boolean): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('#') || trimmed.startsWith('?')) return trimmed;
  if (allowData && /^data:image\/(?:png|gif|jpe?g|webp|avif);/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, 'https://arichtext.invalid');
    if (url.origin === 'https://arichtext.invalid' && !trimmed.startsWith('//')) return trimmed;
    return protocols.includes(url.protocol) ? trimmed : null;
  } catch { return null; }
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

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

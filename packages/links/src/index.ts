import { inlineNodeText, type ARTInlineNode, type ARTTextMark } from '@arichtext/core';
import {
  getActiveMarks,
  transaction,
  type EditorState,
  type EditorTransaction,
} from '@arichtext/engine';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;

export interface DetectedLink {
  from: number;
  to: number;
  text: string;
  href: string;
}

/**
 * Normalize an application/user supplied href into the safe link subset used
 * by ART HTML/DOM serialization. Throws when the value cannot be represented
 * safely rather than storing a link that later disappears during export.
 */
export function normalizeLinkHref(value: string): string {
  if (typeof value !== 'string') throw new TypeError('Link href must be a string');
  const trimmed = value.trim();
  if (!trimmed) throw new TypeError('Link href cannot be empty');

  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(trimmed)) return `mailto:${trimmed}`;

  if (
    trimmed.startsWith('/')
    || trimmed.startsWith('./')
    || trimmed.startsWith('../')
    || trimmed.startsWith('#')
    || trimmed.startsWith('?')
  ) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed, 'https://arichtext.invalid');
  } catch {
    throw new TypeError(`Invalid link href: ${value}`);
  }

  if (url.origin === 'https://arichtext.invalid' && !trimmed.startsWith('//')) {
    // Plain relative path such as `docs/getting-started`.
    return trimmed;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new TypeError(`Unsafe or unsupported link protocol: ${url.protocol}`);
  }
  return trimmed;
}

export function createLinkMark(href: string): Extract<ARTTextMark, { type: 'link' }> {
  return { type: 'link', href: normalizeLinkHref(href) };
}

/** Add/update a link across a non-collapsed logical selection. */
export function setSelectionLink(state: EditorState, href: string): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || isCollapsed(selection)) return null;
  const mark = createLinkMark(href);
  return transaction()
    .addMark(selection.anchor, selection.head, mark)
    .setMeta('command', 'setLink')
    .build();
}

/** Remove any link mark across a non-collapsed logical selection. */
export function removeSelectionLink(state: EditorState): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || isCollapsed(selection)) return null;
  return transaction()
    .removeMark(selection.anchor, selection.head, 'link')
    .setMeta('command', 'removeLink')
    .build();
}

/** Return the common active href, or null when the selection is mixed/unlinked. */
export function getActiveLinkHref(state: EditorState): string | null {
  const link = getActiveMarks(state).find(
    (mark): mark is Extract<ARTTextMark, { type: 'link' }> => mark.type === 'link',
  );
  return link?.href ?? null;
}

/**
 * Detect obvious plain-text links without mutating editor state.
 * Hosts can decide when/how to turn these ranges into transactions.
 */
export function detectLinks(text: string): DetectedLink[] {
  if (!text) return [];
  const output: DetectedLink[] = [];
  const regex = /(?:https?:\/\/[^\s<>]+|www\.[^\s<>]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0] ?? '';
    const candidate = trimTrailingPunctuation(raw);
    if (!candidate) continue;
    try {
      const href = normalizeLinkHref(candidate);
      output.push({
        from: match.index,
        to: match.index + candidate.length,
        text: candidate,
        href,
      });
    } catch {
      // Detector is best-effort; unsafe/invalid candidates are skipped.
    }
  }
  return output;
}

function trimTrailingPunctuation(value: string): string {
  let result = value.replace(TRAILING_PUNCTUATION, '');
  while (result.endsWith(')') && count(result, '(') < count(result, ')')) result = result.slice(0, -1);
  while (result.endsWith(']') && count(result, '[') < count(result, ']')) result = result.slice(0, -1);
  while (result.endsWith('}') && count(result, '{') < count(result, '}')) result = result.slice(0, -1);
  return result;
}

function count(value: string, character: string): number {
  return [...value].filter((candidate) => candidate === character).length;
}

function isCollapsed(selection: NonNullable<EditorState['selection']>): boolean {
  return selection.anchor.offset === selection.head.offset
    && selection.anchor.blockPath.length === selection.head.blockPath.length
    && selection.anchor.blockPath.every((value, index) => value === selection.head.blockPath[index]);
}

/** Complete a plain-text URL/email when whitespace is typed at a collapsed caret.
 * Returns one transaction containing both whitespace and the link mark.
 */
export function insertAutoLinkBoundary(state: EditorState, text: string, marks = getActiveMarks(state)): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !isCollapsed(selection) || !/^[ \t]+$/.test(text)
    || marks.some(mark => mark.type === 'link' || mark.type === 'code')) return null;
  const point = selection.anchor;
  let node: unknown = state.document;
  for (const index of point.blockPath) node = (node as { content?: unknown[] })?.content?.[index];
  const block = node as { type?: string; content?: ARTInlineNode[] } | undefined;
  if (!block || (block.type !== 'paragraph' && block.type !== 'heading')) return null;
  const content = block.content ?? [];
  const before = content.map(run => run.type === 'text' ? run.text : ' ').join('').slice(0, point.offset);
  const tokenStart = before.search(/[^\s]+$/);
  if (tokenStart < 0) return null;
  const token = before.slice(tokenStart);
  const match = detectLinks(token)[0];
  // Require a whole token, allowing balanced-wrapper punctuation but never
  // a URL substring inside an identifier or an unsupported protocol.
  if (!match || !/^[([{“"']*$/.test(token.slice(0, match.from))
    || !/^[.,!?;:)\]}”"']*$/.test(token.slice(match.to))) return null;
  const from = tokenStart + match.from;
  const to = tokenStart + match.to;
  let offset = 0;
  for (const run of content) {
    const end = offset + inlineNodeText(run).length;
    if (offset < to && end > from && run.marks?.some(mark => mark.type === 'link' || mark.type === 'code')) return null;
    offset = end;
  }
  return transaction().replaceText(point, point, text, marks)
    .addMark({ ...point, offset: from }, { ...point, offset: to }, createLinkMark(match.href))
    .setMeta('command', 'autoLink').build();
}

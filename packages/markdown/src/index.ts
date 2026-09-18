import { ART_DOCUMENT_VERSION, isARTDocument } from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTListNode,
  ARTTextMark,
  ARTTextNode,
  ARTInlineNode,
} from '@arichtext/core';

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

interface ListMatch {
  indent: number;
  contentIndent: number;
  style: ARTListNode['style'];
  marker: string;
  body: string;
  checked?: boolean;
  number?: number;
}

export function fromMarkdown(markdown: string): ARTDocument {
  const lines = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  // split() adds a sentinel after the final line ending, not another content line.
  if (lines.at(-1) === '') lines.pop();
  const content = parseBlocks(lines);
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
  };
}

export function toMarkdown(document: ARTDocument): string {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  return serializeBlocks(document.content).replace(/[ \t\n]+$/, '');
}

interface BlockSource {
  length: number;
  get(index: number, allowLazy?: boolean, literal?: boolean): string | undefined;
}

function parseBlocks(lines: readonly string[]): ARTBlockNode[] {
  return parseBlockSequence({ length: lines.length, get: index => lines[index] }, 0).content;
}

function quoteSource(parent: BlockSource): BlockSource {
  return {
    length: parent.length,
    get(index, allowLazy = false, literal = false) {
      const line = parent.get(index, allowLazy, literal);
      if (line === undefined) return undefined;
      const match = line.match(/^ {0,3}> ?([^\r\n]*)$/);
      return match ? match[1]! : allowLazy ? line : undefined;
    },
  };
}

// Quote containers share source positions. Only an open paragraph may read a
// line with omitted markers; other blocks stop at the explicit quote boundary.
function parseBlockSequence(lines: BlockSource, start: number): { content: ARTBlockNode[]; next: number } {
  const blocks: ARTBlockNode[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines.get(index);
    if (line === undefined) break;
    if (isBlankLine(line)) { index += 1; continue; }

    if (stripCodeIndent(line) !== null) {
      const code: string[] = [];
      while (index < lines.length) {
        const current = lines.get(index);
        if (current === undefined) break;
        const stripped = stripCodeIndent(current);
        if (stripped === null && !/^[ \t]*$/.test(current)) break;
        code.push(stripped ?? '');
        index += 1;
      }
      // Blank lines between chunks belong to code; trailing blank lines do not.
      while (code.length && /^[ \t]*$/.test(code.at(-1)!)) code.pop();
      blocks.push({ type: 'codeBlock', text: code.join('\n') });
      continue;
    }

    const fence = matchOpeningFence(line);
    if (fence) {
      const { marker, indent, language } = fence;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && lines.get(index, false, true) !== undefined && !isClosingFence(lines.get(index, false, true)!, marker)) {
        code.push(stripFenceIndent(lines.get(index, false, true) ?? '', indent));
        index += 1;
      }
      if (lines.get(index) !== undefined) index += 1;
      blocks.push({ type: 'codeBlock', ...(language ? { language } : {}), text: code.join('\n') });
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading.level,
        content: parseInline(heading.text),
      });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) { blocks.push({ type: 'horizontalRule' }); index += 1; continue; }

    if (/^ {0,3}>/.test(line)) {
      const parsed = parseBlockSequence(quoteSource(lines), index);
      blocks.push({ type: 'blockquote', content: parsed.content });
      index = parsed.next;
      continue;
    }

    const listMatch = matchListItem(line);
    if (listMatch) {
      const parsed = parseList(lines, index, listMatch);
      blocks.push(parsed.node);
      index = parsed.next;
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      if (parsed) { blocks.push(parsed.node); index = parsed.next; continue; }
    }

    const image = parseImage(line);
    if (image) { blocks.push(image); index += 1; continue; }

    const paragraph: string[] = [line];
    let setextLevel: 1 | 2 | undefined;
    index += 1;
    while (index < lines.length) {
      const current = lines.get(index, true);
      if (current === undefined) break;
      // Underlines take precedence over thematic breaks only after paragraph text.
      const underline = current.match(/^ {0,3}(=+|-+)[ \t]*$/);
      if (underline && lines.get(index) !== undefined) {
        setextLevel = underline[1]!.startsWith('=') ? 1 : 2;
        index += 1;
        break;
      }
      if (isBlankLine(current) || isBlockStart(lines, index, true, true, true)) break;
      paragraph.push(current);
      index += 1;
    }
    const protectedInline = protectInlineAtoms(paragraph.join('\n'));
    const content = parseInline(joinParagraphLines(protectedInline.text.split('\n')), [], protectedInline);
    blocks.push(setextLevel ? { type: 'heading', level: setextLevel, content } : { type: 'paragraph', content });
  }

  return { content: blocks, next: index };
}

function isBlockStart(lines: BlockSource, index: number, includeTables = true, allowLazy = false, interruptParagraph = false): boolean {
  const line = lines.get(index, allowLazy) ?? '';
  // Indented code cannot interrupt an existing paragraph, even when its
  // literal contents resemble another block marker.
  if (stripCodeIndent(line) !== null) return false;
  const fence = matchOpeningFence(line);
  const list = matchListItem(line);
  const startsList = list !== null && (!interruptParagraph
    || ((list.style === 'task' || !isBlankLine(list.body)) && (list.style !== 'ordered' || list.number === 1)));
  return fence !== null
    || matchHeading(line) !== null
    || isHorizontalRule(line)
    || /^ {0,3}>/.test(line)
    || startsList
    || parseImage(line) !== null
    || (includeTables && isTableStart(lines, index));
}

// Tabs advance to four-column stops; content after column four is literal.
function stripCodeIndent(line: string): string | null {
  let column = 0;
  let index = 0;
  while (column < 4 && index < line.length) {
    if (line[index] === ' ') column += 1;
    else if (line[index] === '\t') column += 4 - column % 4;
    else return null;
    index += 1;
  }
  return column === 4 ? line.slice(index) : null;
}

// ATX markers require an ASCII space/tab or end of line. Only a trailing
// hash run preceded by space/tab is a closing marker; escaped hashes stay text.
function matchHeading(line: string): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | null {
  const match = line.match(/^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/);
  if (!match) return null;
  const text = match[2]!.replace(/[ \t]+#+[ \t]*$/, '').replace(/^[ \t]+|[ \t]+$/g, '');
  return { level: match[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, text };
}

function matchOpeningFence(line: string): { marker: string; indent: number; language: string | undefined } | null {
  const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
  if (!match || (match[2]!.startsWith('`') && match[3]!.includes('`'))) return null;
  // ART stores the first info-string word as language; extra metadata has no field.
  const language = unescapeMarkdown(match[3]!.replace(/^[ \t]+|[ \t]+$/g, '').split(/[ \t]+/)[0] ?? '') || undefined;
  return { marker: match[2]!, indent: match[1]!.length, language };
}

function stripFenceIndent(line: string, width: number): string {
  let column = 0;
  let index = 0;
  while (column < width && index < line.length) {
    if (line[index] === ' ') column += 1;
    else if (line[index] === '\t') column += 4 - column % 4;
    else break;
    index += 1;
  }
  return ' '.repeat(Math.max(0, column - width)) + line.slice(index);
}

function isClosingFence(line: string, opening: string): boolean {
  const character = opening[0];
  if (!character) return false;
  return new RegExp(`^ {0,3}${escapeRegExp(character)}{${opening.length},}[ \\t]*$`).test(line);
}

function isHorizontalRule(line: string): boolean {
  // Three or more identical markers, with only ASCII spaces/tabs between or
  // after them. Four-column indentation belongs to code, not a thematic break.
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
}

function matchListItem(line: string): ListMatch | null {
  const match = line.match(/^([ \t]*)(?:([0-9]{1,9})([.)])|([-+*]))(?=[ \t]|$)([^\r\n]*)$/);
  if (!match) return null;
  const indent = indentationWidth(match[1]!);
  const marker = match[3] ?? match[4]!;
  const width = (match[2]?.length ?? 0) + 1;
  const remainder = match[5]!;
  const whitespace = remainder.match(/^[ \t]*/)?.[0] ?? '';
  const padding = indentationWidth(whitespace, indent + width);
  // One to four spaces establish the item's content column. Larger padding
  // leaves indented code after consuming one space; empty items also use one.
  const contentPadding = isBlankLine(remainder) || padding > 4 ? 1 : padding;
  const body = isBlankLine(remainder) ? '' : removeIndent(remainder, contentPadding, indent + width);
  const task = !match[2] && body.match(/^\[([ xX])\][ \t]+([^\r\n]*)$/);
  return {
    indent, contentIndent: indent + width + contentPadding, marker,
    style: match[2] ? 'ordered' : task ? 'task' : 'bullet',
    ...(match[2] ? { number: Number.parseInt(match[2], 10) } : {}),
    ...(task ? { checked: task[1]!.toLowerCase() === 'x' } : {}),
    body: task ? task[2]! : body,
  };
}

function parseList(lines: BlockSource, start: number, first: ListMatch): { node: ARTListNode; next: number } {
  const items: ARTListNode['content'] = [];
  const baseIndent = first.indent;
  const style = first.style;
  let index = start;

  while (index < lines.length) {
    // A thematic break wins over a list marker, including between list items.
    if (isHorizontalRule(lines.get(index) ?? '')) break;
    const current = matchListItem(lines.get(index) ?? '');
    if (!current || current.indent !== baseIndent || current.style !== style || current.marker !== first.marker) break;
    const itemStart = index;
    let nextContent = -1;
    const itemSource: BlockSource = {
      length: lines.length,
      get(position, allowLazy = false, literal = false) {
        if (position === itemStart) return current.body;
        const line = lines.get(position, allowLazy, literal);
        if (line === undefined) return undefined;
        if (isBlankLine(line)) {
          // An empty item may contain one initial blank line, not two.
          if (position === itemStart + 1 && current.style !== 'task' && isBlankLine(current.body)) return undefined;
          if (nextContent <= position) nextContent = findNextNonEmpty(lines, position + 1);
          return nextContent !== -1 && leadingIndent(lines.get(nextContent)!) >= current.contentIndent
            ? literal ? stripFenceIndent(line, current.contentIndent) : removeIndent(line, current.contentIndent)
            : undefined;
        }
        if (leadingIndent(line) >= current.contentIndent) return literal ? stripFenceIndent(line, current.contentIndent) : removeIndent(line, current.contentIndent);
        const nextItem = matchListItem(line);
        // A sibling marker ends this item, even if its number is not one.
        if (nextItem && nextItem.indent === baseIndent && nextItem.style === style) return undefined;
        return allowLazy ? line : undefined;
      },
    };
    const parsed = parseBlockSequence(itemSource, itemStart);
    index = parsed.next;
    items.push({
      type: 'listItem',
      ...(style === 'task' ? { checked: current.checked === true } : {}),
      content: parsed.content.length > 0 ? parsed.content : [{ type: 'paragraph', content: [] }],
    });
    const next = findNextNonEmpty(lines, index);
    if (next === -1) break;
    const following = matchListItem(lines.get(next)!);
    if (!following || following.indent !== baseIndent || following.style !== style || following.marker !== first.marker) break;
    index = next;
  }

  return {
    node: {
      type: 'list',
      style,
      ...(style === 'ordered' && (first.number ?? 1) > 1 ? { start: first.number } : {}),
      content: items,
    },
    next: index,
  };
}

function isTableStart(lines: BlockSource, index: number): boolean {
  const header = lines.get(index) ?? '';
  if (index + 1 >= lines.length || !hasTablePipe(header)) return false;
  const cells = splitTableRow(header);
  const separators = splitTableRow(lines.get(index + 1) ?? '');
  return cells.length > 0 && cells.length === separators.length
    && separators.every(cell => /^:?-+:?$/.test(trimInlineWhitespace(cell)));
}

function hasTablePipe(line: string): boolean {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '|' && line[index - 1] !== '\\') return true;
  }
  return false;
}

function parseTable(lines: BlockSource, start: number): { node: ARTBlockNode; next: number } | null {
  const header = splitTableRow(lines.get(start) ?? '');
  if (header.length === 0) return null;
  const rows = [header];
  // Bound expansion when a wide header is followed by many short rows.
  let remainingPadding = 65_536;
  let index = start + 2;
  while (index < lines.length && !isBlankLine(lines.get(index) ?? '') && !isBlockStart(lines, index, false)) {
    const row = splitTableRow(lines.get(index) ?? '');
    const missing = Math.max(0, header.length - row.length);
    if (missing > remainingPadding) break;
    remainingPadding -= missing;
    rows.push(Array.from({ length: header.length }, (_, column) => row[column] ?? ''));
    index += 1;
  }
  return {
    node: {
      type: 'table',
      content: rows.map((row) => ({
        type: 'tableRow',
        content: row.map((cell) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: parseInline(trimInlineWhitespace(cell)) }] })),
      })),
    },
    next: index,
  };
}

function splitTableRow(line: string): string[] {
  const trimmed = trimInlineWhitespace(line);
  const cells: string[] = [];
  let current = '';
  let trailingPipe = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index]!;
    trailingPipe = false;
    if (character === '\\' && trimmed[index + 1] === '|') {
      // A directly preceding backslash escapes the pipe even after another
      // backslash. Remove only this escape before parsing code/other inlines.
      current += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(current);
      current = '';
      trailingPipe = true;
    } else current += character;
  }
  cells.push(current);
  if (trimmed.startsWith('|')) cells.shift();
  if (trailingPipe) cells.pop();
  return cells;
}

function parseImage(line: string): ARTBlockNode | null {
  const match = line.trim().match(/^!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/);
  if (!match) return null;
  const src = safeUrl(match[2] ?? '', true);
  if (!src) return null;
  return { type: 'image', src, alt: unescapeMarkdown(match[1] ?? ''), ...(match[3] !== undefined ? { title: match[3] } : {}) };
}

function joinParagraphLines(lines: readonly string[]): string {
  return lines.map((line, index) => {
    const hasNext = index < lines.length - 1;
    const slashRun = line.match(/\\+$/)?.[0].length ?? 0;
    const slashBreak = hasNext && slashRun % 2 === 1;
    const hardBreak = hasNext && (/ {2}$/.test(line) || slashBreak);
    const value = trimInlineWhitespace(slashBreak ? line.slice(0, -1) : line);
    return value + (hasNext ? hardBreak ? '\n' : ' ' : '');
  }).join('');
}

interface ProtectedInline {
  text: string;
  prefix: string;
  values: { text: string; mark?: ARTTextMark }[];
  raw: string[];
}

// Protect code and autolinks in encounter order before parsing links/emphasis
// or folding paragraph whitespace. Neither atom interprets markup inside itself.
function protectInlineAtoms(text: string): ProtectedInline {
  let prefix = '\uE000';
  while (text.includes(prefix)) prefix += '\uE000';
  const values: ProtectedInline['values'] = [];
  const raw: string[] = [];
  let output = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] === '\\' && index + 1 < text.length) {
      output += text.slice(index, index + 2); index += 2; continue;
    }
    if (text[index] === '<') {
      const autolink = matchAutolink(text.slice(index));
      if (autolink) {
        output += prefix + values.length + prefix;
        values.push(autolink.href
          ? { text: autolink.label, mark: { type: 'link', href: autolink.href } }
          : { text: autolink.raw });
        raw.push(autolink.raw);
        index += autolink.raw.length;
        continue;
      }
    }
    if (text[index] !== '`') { output += text[index++]; continue; }
    const length = countRun(text, index, '`');
    let end = index + length;
    while (end < text.length) {
      end = text.indexOf('`', end);
      if (end === -1) break;
      const closingLength = countRun(text, end, '`');
      if (closingLength === length) break;
      end += closingLength;
    }
    if (end < 0 || end >= text.length) {
      output += text.slice(index, index + length); index += length; continue;
    }
    let value = text.slice(index + length, end).replaceAll('\n', ' ');
    if (value.startsWith(' ') && value.endsWith(' ') && /[^ ]/.test(value)) value = value.slice(1, -1);
    output += prefix + values.length + prefix;
    values.push({ text: value, mark: { type: 'code' } });
    raw.push(text.slice(index, end + length));
    index = end + length;
  }
  return { text: output, prefix, values, raw };
}

function matchAutolink(text: string): { raw: string; label: string; href: string | null } | null {
  const uri = text.match(/^<([a-z][a-z0-9+.-]{1,31}:[^\x00-\x20<>\x7f]*)>/i);
  const email = uri ? null : text.match(/^<([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)>/i);
  const match = uri ?? email;
  if (!match) return null;
  const label = match[1]!;
  let href: string | null = null;
  try {
    // Preserve existing percent escapes while encoding literal backslashes,
    // brackets, backticks and Unicode. Backslash escapes/entities are not parsed.
    const target = encodeURI((email ? 'mailto:' : '') + label).replace(/%25([\da-f]{2})/gi, '%$1');
    href = safeUrl(target, false);
  } catch {
    // A lone UTF-16 surrogate is invalid URI input, not an import failure.
  }
  return { raw: match[0], label, href };
}

function parseInline(text: string, inherited: readonly ARTTextMark[] = [], protectedInline?: ProtectedInline): ARTTextNode[] {
  if (!protectedInline) { protectedInline = protectInlineAtoms(text); text = protectedInline.text; }
  const chunks: ARTTextNode[][] = [[]];
  let output = chunks[0]!;
  const delimiters: EmphasisDelimiter[] = [];
  let index = 0;
  while (index < text.length) {
    if (text.startsWith(protectedInline.prefix, index)) {
      const start = index + protectedInline.prefix.length;
      const end = text.indexOf(protectedInline.prefix, start);
      const value = protectedInline.values[Number(text.slice(start, end))];
      if (end !== -1 && value !== undefined) {
        const marks = value.mark?.type === 'link' ? inherited.filter(mark => mark.type !== 'link') : inherited;
        appendText(output, value.text, value.mark ? [...marks, value.mark] : marks);
        index = end + protectedInline.prefix.length; continue;
      }
    }
    if (text[index] === '\\' && isEscapable(text[index + 1])) { appendText(output, text[index + 1] ?? '', inherited); index += 2; continue; }
    if (text.startsWith('~~', index)) {
      const end = text.indexOf('~~', index + 2);
      if (end !== -1) { appendParsed(output, text.slice(index + 2, end), [...inherited, { type: 'strike' }], protectedInline); index = end + 2; continue; }
    }
    if (text.startsWith('<u>', index)) {
      const end = text.indexOf('</u>', index + 3);
      if (end !== -1) { appendParsed(output, text.slice(index + 3, end), [...inherited, { type: 'underline' }], protectedInline); index = end + 4; continue; }
    }
    if (text[index] === '[') {
      const labelEnd = text.indexOf('](', index + 1);
      const label = text.slice(index + 1, labelEnd);
      // Links cannot enclose other links. Keep the surrounding bracket syntax
      // literal if an autolink has already claimed part of this label.
      const containsAutolink = protectedInline.values.some((value, token) =>
        value.mark?.type === 'link' && label.includes(protectedInline.prefix + token + protectedInline.prefix),
      );
      if (labelEnd !== -1 && !containsAutolink) {
        const openParen = labelEnd + 1;
        const targetEnd = findMatchingParen(text, openParen);
        if (targetEnd !== -1) {
          let target = text.slice(openParen + 1, targetEnd).trim();
          // Protected atoms in a destination retain their literal URL syntax.
          protectedInline.raw.forEach((raw, token) => {
            target = target.replaceAll(protectedInline.prefix + token + protectedInline.prefix, () => raw);
          });
          const destination = target.match(/^(?:<([^<>\s]+)>|(\S+?))(?:\s+["'][^"']*["'])?$/);
          const href = destination?.[1] ?? destination?.[2];
          const safe = href ? safeUrl(href, false) : null;
          appendParsed(output, label, safe ? [...inherited, { type: 'link', href: safe }] : inherited, protectedInline);
          index = targetEnd + 1;
          continue;
        }
      }
    }
    if (text[index] === '*' || text[index] === '_') {
      const character = text[index]!;
      const length = countRun(text, index, character);
      const before = emphasisNeighbor(text, index, -1, protectedInline);
      const after = emphasisNeighbor(text, index + length, 1, protectedInline);
      const whitespace = (value: string) => !value || /[\p{Zs}\t\n\f\r]/u.test(value);
      const punctuation = (value: string) => /[\p{P}\p{S}]/u.test(value);
      const left = !whitespace(after) && (!punctuation(after) || whitespace(before) || punctuation(before));
      const right = !whitespace(before) && (!punctuation(before) || whitespace(after) || punctuation(after));
      const node: ARTTextNode = { type: 'text', text: character.repeat(length), ...(inherited.length ? { marks: normalizeMarks(inherited) } : {}) };
      chunks.push([node]);
      delimiters.push({ character, length, original: length, node, chunk: chunks.length - 1,
        open: left && (character === '*' || !right || punctuation(before)),
        close: right && (character === '*' || !left || punctuation(after)) });
      output = [];
      chunks.push(output);
      index += length;
      continue;
    }
    appendText(output, text[index] ?? '', inherited);
    index += 1;
  }
  return resolveEmphasis(chunks, delimiters);
}

interface EmphasisDelimiter {
  character: string;
  length: number;
  original: number;
  node: ARTTextNode;
  chunk: number;
  open: boolean;
  close: boolean;
}

// Protected atoms retain the punctuation at their original source boundaries.
function emphasisNeighbor(text: string, index: number, direction: -1 | 1, atoms: ProtectedInline): string {
  const prefix = atoms.prefix;
  if (direction === 1 && text.startsWith(prefix, index)) {
    const end = text.indexOf(prefix, index + prefix.length);
    const raw = atoms.raw[Number(text.slice(index + prefix.length, end))];
    if (end !== -1 && raw) return [...raw][0]!;
  }
  if (direction === -1 && text.endsWith(prefix, index)) {
    const start = text.lastIndexOf(prefix, index - prefix.length - 1);
    const raw = atoms.raw[Number(text.slice(start + prefix.length, index - prefix.length))];
    if (start !== -1 && raw) return [...raw].at(-1)!;
  }
  if (direction === 1) return index < text.length ? String.fromCodePoint(text.codePointAt(index)!) : '';
  if (!index) return '';
  const last = text.charCodeAt(index - 1);
  return text.slice(last >= 0xdc00 && last <= 0xdfff && index > 1 ? index - 2 : index - 1, index);
}

function resolveEmphasis(chunks: ARTTextNode[][], delimiters: EmphasisDelimiter[]): ARTTextNode[] {
  const previous = delimiters.map((_, index) => index - 1);
  const next = delimiters.map((_, index) => index + 1);
  const bounds = new Map<string, number>();
  const events = new Map<number, { bold: number; italic: number }>();
  const event = (chunk: number, type: 'bold' | 'italic', delta: number) => {
    const value = events.get(chunk) ?? { bold: 0, italic: 0 };
    value[type] += delta;
    events.set(chunk, value);
  };
  const remove = (index: number) => {
    const before = previous[index]!;
    const after = next[index]!;
    if (before >= 0) next[before] = after;
    if (after < delimiters.length) previous[after] = before;
  };
  let closerIndex = 0;
  while (closerIndex < delimiters.length) {
    const closer = delimiters[closerIndex]!;
    if (!closer.close) { closerIndex = next[closerIndex]!; continue; }
    const key = `${closer.character}:${closer.open}:${closer.original % 3}`;
    const bound = bounds.get(key) ?? -1;
    let openerIndex = previous[closerIndex]!;
    while (openerIndex > bound) {
      const opener = delimiters[openerIndex]!;
      const odd = (closer.open || opener.close) && closer.original % 3 !== 0 && (opener.original + closer.original) % 3 === 0;
      if (opener.open && opener.character === closer.character && !odd) break;
      openerIndex = previous[openerIndex]!;
    }
    if (openerIndex <= bound) {
      bounds.set(key, previous[closerIndex]!);
      const after = next[closerIndex]!;
      if (!closer.open) remove(closerIndex);
      closerIndex = after;
      continue;
    }
    const opener = delimiters[openerIndex]!;
    const count = opener.length >= 2 && closer.length >= 2 ? 2 : 1;
    const type = count === 2 ? 'bold' : 'italic';
    event(opener.chunk + 1, type, 1);
    event(closer.chunk, type, -1);
    opener.length -= count;
    closer.length -= count;
    opener.node.text = opener.character.repeat(opener.length);
    closer.node.text = closer.character.repeat(closer.length);
    // Delimiters inside a resolved pair cannot subsequently cross its boundary.
    next[openerIndex] = closerIndex;
    previous[closerIndex] = openerIndex;
    if (!opener.length) remove(openerIndex);
    if (!closer.length) {
      const after = next[closerIndex]!;
      remove(closerIndex);
      closerIndex = after;
    }
  }
  const output: ARTTextNode[] = [];
  let bold = 0;
  let italic = 0;
  chunks.forEach((chunk, index) => {
    const change = events.get(index);
    bold += change?.bold ?? 0;
    italic += change?.italic ?? 0;
    for (const node of chunk) {
      const marks: ARTTextMark[] = [...(node.marks ?? [])];
      if (bold > 0) marks.push({ type: 'bold' });
      if (italic > 0) marks.push({ type: 'italic' });
      appendText(output, node.text, marks);
    }
  });
  return output;
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === '(') depth += 1;
    if (character === ')') { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
}

function appendParsed(output: ARTTextNode[], value: string, marks: readonly ARTTextMark[], protectedInline: ProtectedInline): void {
  for (const node of parseInline(value, marks, protectedInline)) appendText(output, node.text, node.marks ?? []);
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

function marksEqual(left: readonly ARTTextMark[], right: readonly ARTTextMark[]): boolean {
  return left.length === right.length && left.every((mark, index) => {
    const other = right[index];
    if (!other || mark.type !== other.type) return false;
    if (mark.type === 'link') return other.type === 'link' && mark.href === other.href;
    if (mark.type === 'extensionMark') {
      return other.type === 'extensionMark' && mark.name === other.name && JSON.stringify(mark.attrs ?? {}) === JSON.stringify(other.attrs ?? {});
    }
    return true;
  });
}

function serializeBlocks(blocks: readonly ARTBlockNode[]): string {
  let previousStyle: ARTListNode['style'] | undefined;
  let alternate = false;
  return blocks.map(block => {
    if (block.type !== 'list') {
      previousStyle = undefined;
      return serializeBlock(block);
    }
    // Blank lines alone do not separate lists. Alternate marker spelling to
    // preserve adjacent ART lists without storing source punctuation in ART.
    alternate = previousStyle === block.style ? !alternate : false;
    previousStyle = block.style;
    return serializeList(block, alternate);
  }).join('\n\n');
}

function serializeBlock(block: ARTBlockNode): string {
  switch (block.type) {
    case 'paragraph': return serializeInline(block.content ?? []);
    case 'heading': return `${'#'.repeat(block.level)} ${serializeInline(block.content ?? [])}`;
    case 'blockquote': return serializeBlocks(block.content).split('\n').map((line) => `> ${line}`).join('\n');
    case 'codeBlock': { const fence = createFence(block.text, block.language); return `${fence}${block.language?.replaceAll('\\', '\\\\') ?? ''}\n${block.text}\n${fence}`; }
    case 'horizontalRule': return '---';
    case 'list': return serializeList(block);
    case 'image': {
      const src = safeUrl(block.src, true);
      if (!src) return escapeMarkdown(block.alt ?? '');
      const title = block.title ? ` "${block.title.replaceAll('"', '\\"')}"` : '';
      return `![${escapeMarkdown(block.alt ?? '')}](${src}${title})`;
    }
    case 'table': return serializeTable(block);
    case 'extensionBlock': return block.fallbackText ?? (block.content ? serializeBlocks(block.content) : '');
  }
}

function serializeInline(nodes: readonly ARTInlineNode[]): string {
  let output = '';
  let active: ARTTextMark[] = [];
  const delimiter = (mark: ARTTextMark, closing: boolean): string => {
    switch (mark.type) {
      case 'bold': return '**';
      case 'italic': return '*';
      case 'underline': return closing ? '</u>' : '<u>';
      case 'strike': return '~~';
      case 'link': return closing ? `](${safeUrl(mark.href, false)})` : '[';
      case 'subscript': return closing ? '</sub>' : '<sub>';
      case 'superscript': return closing ? '</sup>' : '<sup>';
      default: return '';
    }
  };
  for (const node of nodes) {
    const text = node.type === 'text' ? node.text : node.fallbackText;
    const marks = normalizeMarks(node.marks ?? []);
    const isCode = marks.some(mark => mark.type === 'code');
    const link = marks.find(mark => mark.type === 'link');
    const autolink = !isCode && link ? matchAutolink(`<${text}>`) : null;
    // Use angle syntax only when it recreates this entire label and exact href.
    const useAutolink = autolink?.raw === `<${text}>` && autolink.href === link?.href;
    const wrappers = marks.filter(mark => mark.type !== 'code' && mark.type !== 'extensionMark'
      && (mark.type !== 'link' || (!useAutolink && safeUrl(mark.href, false)))).reverse();
    // Keep the shared outer marks open across code and other formatting changes.
    // Reopening bold on every text node can create ambiguous adjacent star runs.
    let shared = 0;
    while (shared < active.length && wrappers.some(mark => markKey(mark) === markKey(active[shared]!))) shared += 1;
    for (let index = active.length - 1; index >= shared; index -= 1) output += delimiter(active[index]!, true);
    active = active.slice(0, shared);
    for (const mark of wrappers) {
      if (!active.some(open => markKey(open) === markKey(mark))) {
        output += delimiter(mark, false);
        active.push(mark);
      }
    }
    output += useAutolink ? autolink.raw : isCode ? codeSpan(text) : escapeMarkdown(text).replaceAll('\n', '  \n');
  }
  for (let index = active.length - 1; index >= 0; index -= 1) output += delimiter(active[index]!, true);
  return output;
}

function serializeList(list: ARTListNode, alternate = false): string {
  return list.content.map((item, itemIndex) => {
    const start = list.start ?? 1;
    // Only the first marker determines the start. Keep subsequent markers valid
    // when numbering a representable list would otherwise exceed nine digits.
    const number = start <= 999_999_999 ? Math.min(start + itemIndex, 999_999_999) : start + itemIndex;
    const marker = list.style === 'ordered'
      ? `${number}${alternate ? ')' : '.'} `
      : list.style === 'task' ? `${alternate ? '+' : '-'} [${item.checked ? 'x' : ' '}] ` : `${alternate ? '+' : '-'} `;
    // "- ---" is itself a thematic break. Use a different rule marker when
    // the first block of a bullet item is a rule so the list survives reimport.
    let body = serializeBlocks(item.content);
    if (list.style === 'bullet' && item.content[0]?.type === 'horizontalRule') body = '***' + body.slice(3);
    const indent = ' '.repeat(list.style === 'task' ? 2 : marker.length);
    return body.split('\n').map((line, lineIndex) => `${lineIndex === 0 ? marker : indent}${line}`).join('\n');
  }).join('\n');
}

function serializeTable(table: Extract<ARTBlockNode, { type: 'table' }>): string {
  const rows = table.content.map((row) => row.content.map((cell) =>
    cell.content.map(serializeBlock).join('<br>').replaceAll('\n', '<br>').replaceAll('|', '\\|'),
  ));
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalize = (row: readonly string[]): string[] => Array.from({ length: width }, (_, index) => row[index] ?? '');
  const header = normalize(rows[0] ?? []);
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${normalize(row).join(' | ')} |`),
  ].join('\n');
}

function createFence(text: string, language?: string): string {
  const marker = language?.includes('`') ? '~' : '`';
  const longest = (text.match(marker === '~' ? /~+/g : /`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  return marker.repeat(Math.max(3, longest + 1));
}

function codeSpan(text: string): string {
  const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const delimiter = '`'.repeat(Math.max(1, longest + 1));
  const padding = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && /[^ ]/.test(text)) ? ' ' : '';
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

function safeUrl(value: string, image: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:\/|\.\/|\.\.\/|#|\?)/.test(trimmed)) return trimmed;
  if (image && /^data:image\/(?:png|gif|jpe?g|webp|avif);/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, 'https://arichtext.invalid');
    if (url.origin === 'https://arichtext.invalid' && !trimmed.startsWith('//')) return trimmed;
    const allowed = image ? ['http:', 'https:', 'blob:'] : ['http:', 'https:', 'mailto:', 'tel:'];
    return allowed.includes(url.protocol) ? trimmed : null;
  } catch { return null; }
}

// Markdown block whitespace is ASCII space/tab, not JavaScript's broader \s.
function isBlankLine(line: string): boolean { return /^[ \t]*$/.test(line); }
function trimInlineWhitespace(value: string): string { return value.replace(/^[ \t]+|[ \t]+$/g, ''); }

function findNextNonEmpty(lines: BlockSource, from: number): number {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines.get(index);
    if (line === undefined) break;
    if (!isBlankLine(line)) return index;
  }
  return -1;
}

function leadingIndent(line: string): number { return indentationWidth(line.match(/^[ \t]*/)?.[0] ?? ''); }
function indentationWidth(value: string, startColumn = 0): number {
  return [...value].reduce((column, character) => column + (character === '\t' ? 4 - column % 4 : 1), startColumn) - startColumn;
}
function removeIndent(line: string, width: number, startColumn = 0): string {
  let column = startColumn; let index = 0;
  // Resolve tabs through the child block's four-column code boundary. Beyond
  // that boundary, tabs are literal code content and must remain unchanged.
  while (index < line.length && column - startColumn < width + 4) {
    if (line[index] === ' ') column += 1;
    else if (line[index] === '\t') column += 4 - column % 4;
    else break;
    index += 1;
  }
  return ' '.repeat(Math.max(0, column - startColumn - width)) + line.slice(index);
}
function countRun(value: string, start: number, character: string): number { let index = start; while (value[index] === character) index += 1; return index - start; }
function escapeMarkdown(value: string): string { return value.replace(/([\\`*_[\]<>#])/g, '\\$1'); }
function isEscapable(value: string | undefined): boolean { return value !== undefined && /^[!-/:-@\[-`{-~]$/.test(value); }
function unescapeMarkdown(value: string): string { return value.replace(/\\([!-/:-@\[-`{-~])/g, '$1'); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

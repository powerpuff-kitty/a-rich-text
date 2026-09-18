import { ART_DOCUMENT_VERSION, isARTDocument } from '@arichtext/core';
import type {
  ARTBlockNode,
  ARTDocument,
  ARTListNode,
  ARTTextMark,
  ARTTextNode,
} from '@arichtext/core';

const MARK_ORDER: Record<ARTTextMark['type'], number> = {
  bold: 0,
  italic: 1,
  underline: 2,
  strike: 3,
  code: 4,
  link: 5,
  extensionMark: 6,
};

interface ListMatch {
  indent: number;
  style: ARTListNode['style'];
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
  return serializeBlocks(document.content).trimEnd();
}

function parseBlocks(lines: readonly string[]): ARTBlockNode[] {
  const blocks: ARTBlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') { index += 1; continue; }

    if (stripCodeIndent(line) !== null) {
      const code: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
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
      while (index < lines.length && !isClosingFence(lines[index] ?? '', marker)) {
        code.push(stripFenceIndent(lines[index] ?? '', indent));
        index += 1;
      }
      if (index < lines.length) index += 1;
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

    if (/^\s{0,3}>/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? '').match(/^\s{0,3}> ?(.*)$/);
        if (!match) break;
        quoted.push(match[1] ?? '');
        index += 1;
      }
      const content = parseBlocks(quoted);
      if (content.length > 0) blocks.push({ type: 'blockquote', content });
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
      const current = lines[index] ?? '';
      // Underlines take precedence over thematic breaks only after paragraph text.
      const underline = current.match(/^ {0,3}(=+|-+)[ \t]*$/);
      if (underline) {
        setextLevel = underline[1]!.startsWith('=') ? 1 : 2;
        index += 1;
        break;
      }
      if (current.trim() === '' || isBlockStart(lines, index)) break;
      paragraph.push(current);
      index += 1;
    }
    const protectedInline = protectInlineAtoms(paragraph.join('\n'));
    const content = parseInline(joinParagraphLines(protectedInline.text.split('\n')), [], protectedInline);
    blocks.push(setextLevel ? { type: 'heading', level: setextLevel, content } : { type: 'paragraph', content });
  }

  return blocks;
}

function isBlockStart(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  // Indented code cannot interrupt an existing paragraph, even when its
  // literal contents resemble another block marker.
  if (stripCodeIndent(line) !== null) return false;
  const fence = matchOpeningFence(line);
  return fence !== null
    || matchHeading(line) !== null
    || isHorizontalRule(line)
    || /^\s{0,3}>/.test(line)
    || matchListItem(line) !== null
    || parseImage(line) !== null
    || isTableStart(lines, index);
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
  const task = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/);
  if (task) {
    return { indent: indentationWidth(task[1] ?? ''), style: 'task', checked: (task[2] ?? '').toLowerCase() === 'x', body: task[3] ?? '' };
  }
  const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
  if (ordered) {
    return { indent: indentationWidth(ordered[1] ?? ''), style: 'ordered', number: Number.parseInt(ordered[2] ?? '1', 10), body: ordered[3] ?? '' };
  }
  const bullet = line.match(/^(\s*)[-+*]\s+(.*)$/);
  if (bullet) return { indent: indentationWidth(bullet[1] ?? ''), style: 'bullet', body: bullet[2] ?? '' };
  return null;
}

function parseList(lines: readonly string[], start: number, first: ListMatch): { node: ARTListNode; next: number } {
  const items: ARTListNode['content'] = [];
  const baseIndent = first.indent;
  const style = first.style;
  let index = start;

  while (index < lines.length) {
    // A thematic break wins over a list marker, including between list items.
    if (isHorizontalRule(lines[index] ?? '')) break;
    const current = matchListItem(lines[index] ?? '');
    if (!current || current.indent !== baseIndent || current.style !== style) break;
    const itemLines = [current.body];
    index += 1;

    while (index < lines.length) {
      const line = lines[index] ?? '';
      const nextItem = matchListItem(line);
      if (nextItem && nextItem.indent === baseIndent && nextItem.style === style) break;

      if (line.trim() === '') {
        const next = findNextNonEmpty(lines, index + 1);
        if (next === -1) { index = lines.length; break; }
        const following = lines[next] ?? '';
        const followingItem = matchListItem(following);
        if (followingItem && followingItem.indent === baseIndent && followingItem.style === style) { index = next; break; }
        if (leadingIndent(following) > baseIndent) { itemLines.push(''); index += 1; continue; }
        break;
      }

      if (leadingIndent(line) > baseIndent) { itemLines.push(removeIndent(line, baseIndent + 2)); index += 1; continue; }
      break;
    }

    const content = parseBlocks(itemLines);
    items.push({
      type: 'listItem',
      ...(style === 'task' ? { checked: current.checked === true } : {}),
      content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
    });
  }

  return {
    node: {
      type: 'list',
      style,
      ...(style === 'ordered' && (first.number ?? 1) !== 1 ? { start: Math.max(1, first.number ?? 1) } : {}),
      content: items,
    },
    next: index,
  };
}

function isTableStart(lines: readonly string[], index: number): boolean {
  return index + 1 < lines.length && (lines[index] ?? '').includes('|') && isTableSeparator(lines[index + 1] ?? '');
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTable(lines: readonly string[], start: number): { node: ARTBlockNode; next: number } | null {
  const header = splitTableRow(lines[start] ?? '');
  if (header.length === 0) return null;
  const rows = [header];
  let index = start + 2;
  while (index < lines.length && (lines[index] ?? '').trim() !== '' && (lines[index] ?? '').includes('|')) {
    const row = splitTableRow(lines[index] ?? '');
    if (row.length !== header.length) break;
    rows.push(row);
    index += 1;
  }
  return {
    node: {
      type: 'table',
      content: rows.map((row) => ({
        type: 'tableRow',
        content: row.map((cell) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: parseInline(cell.trim()) }] })),
      })),
    },
    next: index,
  };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  if (!trimmed) return [];
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) { current += `\\${character}`; escaped = false; }
    else if (character === '\\') escaped = true;
    else if (character === '|') { cells.push(current); current = ''; }
    else current += character;
  }
  if (escaped) current += '\\';
  cells.push(current);
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
    const value = (slashBreak ? line.slice(0, -1) : line).trim();
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
  const output: ARTTextNode[] = [];
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
    const strong = text.startsWith('**', index) ? '**' : text.startsWith('__', index) ? '__' : null;
    if (strong) {
      const end = text.indexOf(strong, index + 2);
      if (end !== -1) { appendParsed(output, text.slice(index + 2, end), [...inherited, { type: 'bold' }], protectedInline); index = end + 2; continue; }
    }
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
      const delimiter = text[index]!;
      const end = text.indexOf(delimiter, index + 1);
      if (end > index + 1) { appendParsed(output, text.slice(index + 1, end), [...inherited, { type: 'italic' }], protectedInline); index = end + 1; continue; }
    }
    appendText(output, text[index] ?? '', inherited);
    index += 1;
  }
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
  return blocks.map(serializeBlock).join('\n\n');
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

function serializeInline(nodes: readonly ARTTextNode[]): string {
  return nodes.map((node) => {
    const marks = normalizeMarks(node.marks ?? []);
    const isCode = marks.some(mark => mark.type === 'code');
    const link = marks.find(mark => mark.type === 'link');
    const autolink = !isCode && link ? matchAutolink(`<${node.text}>`) : null;
    // Use angle syntax only when it recreates this entire label and exact href.
    // This also avoids bracket/parenthesis ambiguity in URL-shaped link labels.
    const useAutolink = autolink?.raw === `<${node.text}>` && autolink.href === link?.href;
    let value = useAutolink ? autolink.raw : isCode ? codeSpan(node.text) : escapeMarkdown(node.text).replaceAll('\n', '  \n');
    for (const mark of marks) {
      switch (mark.type) {
        case 'bold': value = `**${value}**`; break;
        case 'italic': value = `*${value}*`; break;
        case 'underline': value = `<u>${value}</u>`; break;
        case 'strike': value = `~~${value}~~`; break;
        case 'code': break;
        case 'link': { const href = safeUrl(mark.href, false); if (href && !useAutolink) value = `[${value}](${href})`; break; }
        case 'extensionMark': break;
      }
    }
    return value;
  }).join('');
}

function serializeList(list: ARTListNode): string {
  return list.content.map((item, itemIndex) => {
    const marker = list.style === 'ordered'
      ? `${(list.start ?? 1) + itemIndex}. `
      : list.style === 'task' ? `- [${item.checked ? 'x' : ' '}] ` : '- ';
    // "- ---" is itself a thematic break. Use a different rule marker when
    // the first block of a bullet item is a rule so the list survives reimport.
    const body = item.content.map((block, index) =>
      index === 0 && list.style === 'bullet' && block.type === 'horizontalRule' ? '***' : serializeBlock(block),
    ).join('\n\n');
    const indent = ' '.repeat(marker.length);
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

function findNextNonEmpty(lines: readonly string[], from: number): number {
  for (let index = from; index < lines.length; index += 1) if ((lines[index] ?? '').trim() !== '') return index;
  return -1;
}

function leadingIndent(line: string): number { return indentationWidth(line.match(/^\s*/)?.[0] ?? ''); }
function indentationWidth(value: string): number { return [...value].reduce((width, character) => width + (character === '\t' ? 4 : 1), 0); }
function removeIndent(line: string, width: number): string {
  let consumed = 0; let index = 0;
  while (index < line.length && consumed < width) {
    if (line[index] === ' ') consumed += 1;
    else if (line[index] === '\t') consumed += 4;
    else break;
    index += 1;
  }
  return line.slice(index);
}
function countRun(value: string, start: number, character: string): number { let index = start; while (value[index] === character) index += 1; return index - start; }
function escapeMarkdown(value: string): string { return value.replace(/([\\`*_[\]<>#])/g, '\\$1'); }
function isEscapable(value: string | undefined): boolean { return value !== undefined && /^[!-/:-@\[-`{-~]$/.test(value); }
function unescapeMarkdown(value: string): string { return value.replace(/\\([!-/:-@\[-`{-~])/g, '$1'); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

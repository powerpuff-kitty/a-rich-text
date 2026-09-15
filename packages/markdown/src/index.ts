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
};

interface ListMatch {
  indent: number;
  style: ARTListNode['style'];
  body: string;
  checked?: boolean;
  number?: number;
}

export function fromMarkdown(markdown: string): ARTDocument {
  const normalized = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const content = parseLines(normalized.split('\n'));
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

function parseLines(lines: readonly string[]): ARTBlockNode[] {
  const blocks: ARTBlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})([^`]*)$/);
    if (fence) {
      const marker = fence[1]!;
      const language = fence[2]?.trim() || undefined;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !isClosingFence(lines[index] ?? '', marker)) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: 'codeBlock',
        ...(language ? { language } : {}),
        text: code.join('\n'),
      });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        content: parseInline(heading[2] ?? ''),
      });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const match = current.match(/^\s{0,3}> ?(.*)$/);
        if (!match) break;
        quoted.push(match[1] ?? '');
        index += 1;
      }
      const content = parseLines(quoted);
      if (content.length > 0) blocks.push({ type: 'blockquote', content });
      continue;
    }

    const list = matchListItem(line);
    if (list) {
      const parsed = parseList(lines, index, list);
      blocks.push(parsed.node);
      index = parsed.next;
      continue;
    }

    if (index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '') && looksLikeTableRow(line)) {
      const parsed = parseTable(lines, index);
      if (parsed) {
        blocks.push(parsed.node);
        index = parsed.next;
        continue;
      }
    }

    const image = parseImageLine(line);
    if (image) {
      blocks.push(image);
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (current.trim() === '' || isBlockStart(lines, index)) break;
      paragraphLines.push(current);
      index += 1;
    }

    blocks.push({ type: 'paragraph', content: parseInline(joinParagraphLines(paragraphLines)) });
  }

  return blocks;
}

function isClosingFence(line: string, opening: string): boolean {
  const character = opening[0];
  if (!character) return false;
  const expression = new RegExp(`^\\s{0,3}${escapeRegExp(character)}{${opening.length},}\\s*$`);
  return expression.test(line);
}

function isBlockStart(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) return true;
  if (/^\s{0,3}#{1,6}\s+/.test(line)) return true;
  if (isHorizontalRule(line)) return true;
  if (/^\s{0,3}>/.test(line)) return true;
  if (matchListItem(line)) return true;
  if (parseImageLine(line)) return true;
  return index + 1 < lines.length && looksLikeTableRow(line) && isTableSeparator(lines[index + 1] ?? '');
}

function isHorizontalRule(line: string): boolean {
  const compact = line.trim().replaceAll(' ', '');
  return /^(?:\*{3,}|-{3,}|_{3,})$/.test(compact);
}

function matchListItem(line: string): ListMatch | null {
  const task = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/);
  if (task) {
    return {
      indent: indentationWidth(task[1] ?? ''),
      style: 'task',
      checked: (task[2] ?? '').toLowerCase() === 'x',
      body: task[3] ?? '',
    };
  }

  const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
  if (ordered) {
    return {
      indent: indentationWidth(ordered[1] ?? ''),
      style: 'ordered',
      number: Number.parseInt(ordered[2] ?? '1', 10),
      body: ordered[3] ?? '',
    };
  }

  const bullet = line.match(/^(\s*)[-+*]\s+(.*)$/);
  if (bullet) {
    return {
      indent: indentationWidth(bullet[1] ?? ''),
      style: 'bullet',
      body: bullet[2] ?? '',
    };
  }

  return null;
}

function parseList(
  lines: readonly string[],
  start: number,
  first: ListMatch,
): { node: ARTListNode; next: number } {
  const baseIndent = first.indent;
  const style = first.style;
  const items: ARTListNode['content'] = [];
  let index = start;

  while (index < lines.length) {
    const match = matchListItem(lines[index] ?? '');
    if (!match || match.indent !== baseIndent || match.style !== style) break;

    const itemLines = [match.body];
    index += 1;

    while (index < lines.length) {
      const current = lines[index] ?? '';
      const nextItem = matchListItem(current);
      if (nextItem && nextItem.indent === baseIndent && nextItem.style === style) break;

      if (current.trim() === '') {
        const nextNonEmpty = findNextNonEmpty(lines, index + 1);
        if (nextNonEmpty === -1) {
          index = lines.length;
          break;
        }
        const nextLine = lines[nextNonEmpty] ?? '';
        const nextMatch = matchListItem(nextLine);
        if (nextMatch && nextMatch.indent === baseIndent && nextMatch.style === style) {
          index = nextNonEmpty;
          break;
        }
        if (leadingIndent(nextLine) > baseIndent) {
          itemLines.push('');
          index += 1;
          continue;
        }
        break;
      }

      if (leadingIndent(current) > baseIndent) {
        itemLines.push(removeIndent(current, baseIndent + 2));
        index += 1;
        continue;
      }
      break;
    }

    const content = parseLines(itemLines);
    items.push({
      type: 'listItem',
      ...(style === 'task' ? { checked: match.checked === true } : {}),
      content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
    });
  }

  return {
    node: {
      type: 'list',
      style,
      ...(style === 'ordered' && first.number && first.number !== 1 ? { start: first.number } : {}),
      content: items,
    },
    next: index,
  };
}

function findNextNonEmpty(lines: readonly string[], from: number): number {
  for (let index = from; index < lines.length; index += 1) {
    if ((lines[index] ?? '').trim() !== '') return index;
  }
  return -1;
}

function leadingIndent(line: string): number {
  return indentationWidth(line.match(/^\s*/)?.[0] ?? '');
}

function indentationWidth(value: string): number {
  return [...value].reduce((width, character) => width + (character === '\t' ? 4 : 1), 0);
}

function removeIndent(line: string, width: number): string {
  let consumed = 0;
  let index = 0;
  while (index < line.length && consumed < width) {
    if (line[index] === ' ') consumed += 1;
    else if (line[index] === '\t') consumed += 4;
    else break;
    index += 1;
  }
  return line.slice(index);
}

function looksLikeTableRow(line: string): boolean {
  return line.includes('|');
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTable(lines: readonly string[], start: number): { node: ARTBlockNode; next: number } | null {
  const header = splitTableRow(lines[start] ?? '');
  if (header.length === 0 || !isTableSeparator(lines[start + 1] ?? '')) return null;

  const rows: string[][] = [header];
  let index = start + 2;
  while (index < lines.length && looksLikeTableRow(lines[index] ?? '') && (lines[index] ?? '').trim() !== '') {
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
        content: row.map((cell) => ({
          type: 'tableCell',
          content: [{ type: 'paragraph', content: parseInline(cell.trim()) }],
        })),
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
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
      current += character;
    } else if (character === '|') {
      cells.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

function parseImageLine(line: string): ARTBlockNode | null {
  const match = line.trim().match(/^!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/);
  if (!match) return null;
  const src = safeUrl(match[2] ?? '', true);
  if (!src) return null;
  return {
    type: 'image',
    src,
    alt: unescapeMarkdown(match[1] ?? ''),
    ...(match[3] !== undefined ? { title: match[3] } : {}),
  };
}

function joinParagraphLines(lines: readonly string[]): string {
  let output = '';
  for (const line of lines) {
    const hardBreak = / {2}$/.test(line);
    const normalized = hardBreak ? line.slice(0, -2) : line;
    if (output) output += hardBreak ? '\n' : ' ';
    output += normalized.trim();
  }
  return output;
}

function parseInline(text: string, inherited: readonly ARTTextMark[] = []): ARTTextNode[] {
  const output: ARTTextNode[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === '\\' && index + 1 < text.length) {
      appendInline(output, text[index + 1] ?? '', inherited);
      index += 2;
      continue;
    }

    if (text[index] === '`') {
      const run = countRun(text, index, '`');
      const delimiter = '`'.repeat(run);
      const end = text.indexOf(delimiter, index + run);
      if (end !== -1) {
        appendInline(output, text.slice(index + run, end), [...inherited, { type: 'code' }]);
        index = end + run;
        continue;
      }
    }

    const strong = text.startsWith('**', index) ? '**' : text.startsWith('__', index) ? '__' : null;
    if (strong) {
      const end = text.indexOf(strong, index + 2);
      if (end !== -1) {
        appendParsed(output, text.slice(index + 2, end), [...inherited, { type: 'bold' }]);
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith('~~', index)) {
      const end = text.indexOf('~~', index + 2);
      if (end !== -1) {
        appendParsed(output, text.slice(index + 2, end), [...inherited, { type: 'strike' }]);
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith('<u>', index)) {
      const end = text.indexOf('</u>', index + 3);
      if (end !== -1) {
        appendParsed(output, text.slice(index + 3, end), [...inherited, { type: 'underline' }]);
        index = end + 4;
        continue;
      }
    }

    if (text[index] === '[') {
      const labelEnd = text.indexOf('](', index + 1);
      if (labelEnd !== -1) {
        const targetEnd = text.indexOf(')', labelEnd + 2);
        if (targetEnd !== -1) {
          const target = text.slice(labelEnd + 2, targetEnd).trim();
          const href = target.match(/^(\S+?)(?:\s+["'][^"']*["'])?$/)?.[1];
          const safe = href ? safeUrl(href, false) : null;
          const label = text.slice(index + 1, labelEnd);
          appendParsed(output, label, safe ? [...inherited, { type: 'link', href: safe }] : inherited);
          index = targetEnd + 1;
          continue;
        }
      }
    }

    if (text[index] === '*' || text[index] === '_') {
      const delimiter = text[index]!;
      const end = text.indexOf(delimiter, index + 1);
      if (end > index + 1) {
        appendParsed(output, text.slice(index + 1, end), [...inherited, { type: 'italic' }]);
        index = end + 1;
        continue;
      }
    }

    appendInline(output, text[index] ?? '', inherited);
    index += 1;
  }

  return output;
}

function appendParsed(output: ARTTextNode[], value: string, marks: readonly ARTTextMark[]): void {
  for (const node of parseInline(value, marks)) appendInline(output, node.text, node.marks ?? []);
}

function appendInline(output: ARTTextNode[], text: string, marks: readonly ARTTextMark[]): void {
  if (!text) return;
  const normalized = normalizeMarks(marks);
  const previous = output.at(-1);
  if (previous && marksEqual(previous.marks ?? [], normalized)) {
    previous.text += text;
    return;
  }
  output.push({ type: 'text', text, ...(normalized.length > 0 ? { marks: normalized } : {}) });
}

function normalizeMarks(marks: readonly ARTTextMark[]): ARTTextMark[] {
  const unique = new Map<string, ARTTextMark>();
  for (const mark of marks) {
    const key = mark.type === 'link' ? `link:${mark.href}` : mark.type;
    unique.set(key, mark);
  }
  return [...unique.values()].sort((a, b) => MARK_ORDER[a.type] - MARK_ORDER[b.type]);
}

function marksEqual(a: readonly ARTTextMark[], b: readonly ARTTextMark[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((mark, index) => {
    const other = b[index];
    if (!other || mark.type !== other.type) return false;
    return mark.type !== 'link' || (other.type === 'link' && mark.href === other.href);
  });
}

function serializeBlocks(blocks: readonly ARTBlockNode[]): string {
  return blocks.map(serializeBlock).join('\n\n');
}

function serializeBlock(block: ARTBlockNode): string {
  switch (block.type) {
    case 'paragraph':
      return serializeInline(block.content ?? []);
    case 'heading':
      return `${'#'.repeat(block.level)} ${serializeInline(block.content ?? [])}`;
    case 'blockquote':
      return serializeBlocks(block.content)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'codeBlock': {
      const fence = createFence(block.text);
      return `${fence}${block.language ?? ''}\n${block.text}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'list':
      return serializeList(block);
    case 'image': {
      const src = safeUrl(block.src, true);
      if (!src) return block.alt ? escapeMarkdown(block.alt) : '';
      const title = block.title ? ` "${block.title.replaceAll('"', '\\"')}"` : '';
      return `![${escapeMarkdown(block.alt ?? '')}](${src}${title})`;
    }
    case 'table':
      return serializeTable(block);
  }
}

function serializeInline(nodes: readonly ARTTextNode[]): string {
  return nodes.map((node) => {
    const marks = normalizeMarks(node.marks ?? []);
    const code = marks.some((mark) => mark.type === 'code');
    let value = code ? codeSpan(node.text) : escapeMarkdown(node.text);

    for (const mark of marks) {
      switch (mark.type) {
        case 'bold':
          value = `**${value}**`;
          break;
        case 'italic':
          value = `*${value}*`;
          break;
        case 'underline':
          value = `<u>${value}</u>`;
          break;
        case 'strike':
          value = `~~${value}~~`;
          break;
        case 'code':
          break;
        case 'link': {
          const href = safeUrl(mark.href, false);
          if (href) value = `[${value}](${href})`;
          break;
        }
      }
    }
    return value;
  }).join('');
}

function serializeList(list: ARTListNode): string {
  return list.content.map((item, itemIndex) => {
    const marker = list.style === 'ordered'
      ? `${(list.start ?? 1) + itemIndex}. `
      : list.style === 'task'
        ? `- [${item.checked ? 'x' : ' '}] `
        : '- ';
    const body = serializeBlocks(item.content) || '';
    const lines = body.split('\n');
    const indent = ' '.repeat(marker.length);
    return lines.map((line, lineIndex) => `${lineIndex === 0 ? marker : indent}${line}`).join('\n');
  }).join('\n');
}

function serializeTable(table: Extract<ARTBlockNode, { type: 'table' }>): string {
  const rows = table.content.map((row) => row.content.map((cell) =>
    cell.content.map(serializeBlock).join('<br>').replaceAll('\n', '<br>').replaceAll('|', '\\|'),
  ));
  const width = Math.max(...rows.map((row) => row.length));
  const normalize = (row: readonly string[]): string[] =>
    Array.from({ length: width }, (_, index) => row[index] ?? '');
  const header = normalize(rows[0] ?? []);
  const body = rows.slice(1).map(normalize);
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function createFence(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const delimiter = '`'.repeat(Math.max(1, longest + 1));
  const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

function countRun(value: string, start: number, character: string): number {
  let index = start;
  while (value[index] === character) index += 1;
  return index - start;
}

function safeUrl(value: string, image: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:\/|\.\/|\.\.\/|#|\?)/.test(trimmed)) return trimmed;
  if (image && /^data:image\/(?:png|gif|jpe?g|webp|avif);/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, 'https://arichtext.invalid');
    if (url.origin === 'https://arichtext.invalid' && !trimmed.startsWith('//')) return trimmed;
    const allowed = image
      ? ['http:', 'https:', 'blob:']
      : ['http:', 'https:', 'mailto:', 'tel:'];
    return allowed.includes(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, '\\$1');
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\`*_[\]<>])/g, '$1');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import { isARTDocument, toPlainText, type ARTDocument, type ARTBlockNode, type ARTInlineNode, type ARTTextMark } from '@arichtext/core';
import type { ConversionDiagnostic, ConversionOutput, FormatProfile } from '@arichtext/core/profiles';

type Attributes = Record<string, unknown>;
type Operation = { insert: string | Record<string, unknown>; attributes?: Attributes };
const inline = ['bold', 'italic', 'underline', 'strike', 'code', 'link'];
const blocks = ['header', 'blockquote', 'code-block', 'list'];
const record = (value: unknown): value is Attributes => !!value && typeof value === 'object' && !Array.isArray(value);
const active = (value: unknown) => value !== undefined && value !== null && value !== false;
function notes() {
  const values = new Map<string, ConversionDiagnostic>();
  return {
    add(code: string, message: string) { values.set(code, { code, message, severity: 'loss' }); },
    extra(value: object, keys: string[]) {
      for (const key of Object.keys(value)) if (!keys.includes(key)) this.add('extra-fields', 'Unmapped object fields are omitted');
    },
    result() { return [...values.values()]; },
  };
}

/** Import a complete Quill document snapshot, never an operational change Delta. */
export function importQuillDelta(source: string): ConversionOutput<ARTDocument> {
  const delta: unknown = JSON.parse(source);
  if (!record(delta) || !Array.isArray(delta.ops)) throw new TypeError('Expected a Delta object with an ops array');
  const diagnostics = notes(); diagnostics.extra(delta, ['ops']);
  const content: ARTBlockNode[] = [];
  let line: ARTInlineNode[] = [];
  let ended = false;
  function finish(attrs: Attributes) {
    const enabled = blocks.filter(key => active(attrs[key]));
    if (enabled.length > 1) throw new TypeError('Conflicting Delta line formats');
    const previous = content.at(-1);
    if (active(attrs.header)) {
      if (!Number.isInteger(attrs.header) || (attrs.header as number) < 1 || (attrs.header as number) > 6) throw new TypeError('Invalid Delta header');
      content.push({ type: 'heading', level: attrs.header as 1 | 2 | 3 | 4 | 5 | 6, content: line });
    } else if (active(attrs.list)) {
      if (!['bullet', 'ordered', 'checked', 'unchecked'].includes(attrs.list as string)) throw new TypeError('Invalid Delta list');
      const style = attrs.list === 'bullet' ? 'bullet' : attrs.list === 'ordered' ? 'ordered' : 'task';
      const item = { type: 'listItem' as const, ...(style === 'task' ? { checked: attrs.list === 'checked' } : {}), content: [{ type: 'paragraph' as const, content: line }] };
      if (previous?.type === 'list' && previous.style === style) previous.content.push(item);
      else content.push({ type: 'list', style, content: [item] });
    } else if (active(attrs.blockquote)) {
      if (attrs.blockquote !== true) throw new TypeError('Invalid Delta blockquote');
      const paragraph = { type: 'paragraph' as const, content: line };
      if (previous?.type === 'blockquote') previous.content.push(paragraph);
      else content.push({ type: 'blockquote', content: [paragraph] });
    } else if (active(attrs['code-block'])) {
      const language = attrs['code-block'];
      if (language !== true && typeof language !== 'string') throw new TypeError('Invalid Delta code block');
      if (line.some(node => node.marks?.length)) diagnostics.add('code-marks', 'Code block inline marks are omitted');
      const text = line.map(node => node.type === 'text' ? node.text : node.fallbackText).join('');
      const lang = typeof language === 'string' ? language : undefined;
      if (previous?.type === 'codeBlock' && previous.language === lang) previous.text += '\n' + text;
      else content.push({ type: 'codeBlock', text, ...(lang !== undefined ? { language: lang } : {}) });
    } else content.push({ type: 'paragraph', content: line });
    line = [];
  }
  for (const op of delta.ops) {
    if (!record(op) || 'retain' in op || 'delete' in op) throw new TypeError('Only insert-only document Deltas are supported');
    if (typeof op.insert !== 'string') {
      if (!record(op.insert) || Object.keys(op.insert).length !== 1) throw new TypeError('Invalid Quill embed');
      const [kind] = Object.keys(op.insert); const value = op.insert[kind!];
      if (kind === 'image' && typeof value === 'string' && value) content.push({ type: 'image', src: value });
      else if (kind === 'video' && typeof value === 'string' && value) { content.push({ type: 'extensionBlock', name: 'quill:video', attrs: { src: value }, fallbackText: value }); diagnostics.add('adapter-embed', 'Quill video is preserved as a quill:video extension block'); }
      else if (kind === 'formula' && typeof value === 'string') { line.push({ type: 'extensionInline', name: 'quill:formula', attrs: { formula: value }, fallbackText: value }); diagnostics.add('adapter-embed', 'Quill formula is preserved as a quill:formula inline extension'); }
      else diagnostics.add('unsupported-embed', `Quill ${kind} embed is not represented by ART`);
      ended = false; continue;
    }
    if (!op.insert.length) throw new TypeError('Only nonempty text inserts are supported');
    if (op.attributes !== undefined && !record(op.attributes)) throw new TypeError('Invalid Delta attributes');
    diagnostics.extra(op, ['insert', 'attributes']);
    const attrs = (op.attributes ?? {}) as Attributes;
    for (const key of Object.keys(attrs)) if (![...inline, ...blocks].includes(key)) diagnostics.add('unsupported-attributes', 'Unsupported Delta attributes (including indentation/style) are omitted');
    if (!op.insert.includes('\n') && blocks.some(key => active(attrs[key]))) diagnostics.add('misplaced-line-format', 'Line attributes without a newline are omitted');
    const marks: ARTTextMark[] = [];
    for (const key of inline) {
      if (!active(attrs[key])) continue;
      if (key === 'link') {
        if (typeof attrs[key] !== 'string' || !attrs[key]) throw new TypeError('Invalid Delta link');
        marks.push({ type: 'link', href: attrs[key] as string });
      } else {
        if (attrs[key] !== true) throw new TypeError('Invalid Delta inline mark');
        marks.push({ type: key as 'bold' | 'italic' | 'underline' | 'strike' | 'code' });
      }
    }
    const parts = op.insert.split('\n');
    for (let index = 0; index < parts.length; index++) {
      const text = parts[index];
      if (text) {
        const previous = line.at(-1);
        if (previous?.type === 'text' && JSON.stringify(previous.marks ?? []) === JSON.stringify(marks)) previous.text += text;
        else line.push({ type: 'text', text, ...(marks.length ? { marks: marks.map(mark => ({ ...mark })) } : {}) });
      }
      if (index < parts.length - 1) finish(attrs);
    }
    ended = op.insert.endsWith('\n');
  }
  if (!ended) throw new TypeError('A complete Quill document must end with a newline');
  const value: ARTDocument = { type: 'doc', version: 1, content };
  if (!isARTDocument(value)) throw new TypeError('Delta conversion produced invalid ART');
  return { value, diagnostics: diagnostics.result() };
}

/** Export supported ART semantics; report every deliberate fallback as a loss. */
export function exportQuillDelta(document: ARTDocument): ConversionOutput<string> {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document');
  const diagnostics = notes(); diagnostics.extra(document, ['type', 'version', 'content']);
  const ops: Operation[] = [];
  function insert(text: string, attributes: Attributes = {}) {
    if (!text) return;
    const previous = ops.at(-1);
    if (previous && typeof previous.insert === 'string' && JSON.stringify(previous.attributes ?? {}) === JSON.stringify(attributes)) previous.insert += text;
    else ops.push({ insert: text, ...(Object.keys(attributes).length ? { attributes } : {}) });
  }
  function embed(value: Record<string, unknown>): void { ops.push({ insert: value }); }
  function paragraph(nodes: ARTInlineNode[], attributes: Attributes = {}) {
    for (const node of nodes) {
      if (node.type === 'extensionInline' && node.name === 'quill:formula') {
        embed({ formula: typeof node.attrs?.formula === 'string' ? node.attrs.formula : node.fallbackText });
        diagnostics.add('adapter-embed', 'quill:formula is exported as a Quill formula embed');
        continue;
      }
      if (node.type === 'extensionInline') diagnostics.add('extension-inline', 'Inline extensions become fallback text');
      else diagnostics.extra(node, ['type', 'text', 'marks']);
      const marks: Attributes = {};
      for (const mark of node.marks ?? []) {
        diagnostics.extra(mark, mark.type === 'link' ? ['type', 'href'] : ['type']);
        if (mark.type === 'extensionMark') { diagnostics.add('extension-marks', 'Extension marks are omitted'); continue; }
        if (mark.type in marks) diagnostics.add('duplicate-marks', 'Repeated marks are collapsed');
        marks[mark.type] = mark.type === 'link' ? mark.href : true;
      }
      const parts = (node.type === 'text' ? node.text : node.fallbackText).split('\n');
      if (parts.length > 1) diagnostics.add('inline-newlines', 'Inline newlines become block boundaries');
      parts.forEach((part, index) => { insert(part, marks); if (index < parts.length - 1) insert('\n', attributes); });
    }
    insert('\n', attributes);
  }
  function fallback(block: ARTBlockNode) {
    diagnostics.add('unsupported-structure', 'Unsupported block structure is flattened to plain text');
    const text = toPlainText({ type: 'doc', version: 1, content: [block] });
    insert(text + '\n');
  }
  let previousGroup: string | undefined;
  for (const block of document.content) {
    const group = block.type === 'list' ? 'list:' + block.style : block.type === 'blockquote' ? 'quote' : block.type === 'codeBlock' ? 'code:' + (block.language ?? '') : undefined;
    if (group && group === previousGroup) diagnostics.add('adjacent-groups', 'Adjacent matching list, quote or code groups merge in Delta');
    previousGroup = group;
    if (block.type === 'paragraph' || block.type === 'heading') {
      diagnostics.extra(block, block.type === 'heading' ? ['type', 'level', 'content'] : ['type', 'content']);
      paragraph(block.content ?? [], block.type === 'heading' ? { header: block.level } : {});
    } else if (block.type === 'image') {
      diagnostics.extra(block, ['type', 'src', 'alt', 'title', 'width', 'height']);
      embed({ image: block.src }); insert('\n');
    } else if (block.type === 'extensionBlock' && block.name === 'quill:video' && typeof block.attrs?.src === 'string') {
      embed({ video: block.attrs.src }); insert('\n'); diagnostics.add('adapter-embed', 'quill:video is exported as a Quill video embed');
    } else if (block.type === 'codeBlock') {
      diagnostics.extra(block, ['type', 'text', 'language']);
      for (const text of block.text.split('\n')) { insert(text); insert('\n', { 'code-block': block.language ?? true }); }
    } else if (block.type === 'blockquote' && block.content.length && block.content.every(child => child.type === 'paragraph')) {
      diagnostics.extra(block, ['type', 'content']);
      for (const child of block.content) if (child.type === 'paragraph') { diagnostics.extra(child, ['type', 'content']); paragraph(child.content ?? [], { blockquote: true }); }
    } else if (block.type === 'list' && block.content.length && block.content.every(item => item.content.length === 1 && item.content[0].type === 'paragraph')) {
      diagnostics.extra(block, ['type', 'style', 'start', 'content']);
      if (block.start !== undefined && block.start !== 1) diagnostics.add('list-start', 'Custom list start numbering is omitted');
      for (const item of block.content) {
        diagnostics.extra(item, ['type', 'checked', 'content']);
        if (block.style !== 'task' && item.checked !== undefined) diagnostics.add('non-task-checked', 'Checked state on a non-task list is omitted');
        const child = item.content[0];
        if (child.type === 'paragraph') { diagnostics.extra(child, ['type', 'content']); paragraph(child.content ?? [], { list: block.style === 'task' ? item.checked ? 'checked' : 'unchecked' : block.style }); }
      }
    } else fallback(block);
  }
  if (!ops.length) { insert('\n'); diagnostics.add('empty-document', 'An empty ART document becomes one empty Quill line'); }
  return { value: JSON.stringify({ ops }), diagnostics: diagnostics.result() };
}

/** Optional profile: register explicitly on each editor or FormatProfileRegistry. */
export const quillDeltaProfile: Readonly<FormatProfile> = Object.freeze({
  id: 'quill:delta-v2', family: 'json', label: 'Quill Delta (text blocks)',
  import: importQuillDelta, export: exportQuillDelta,
});

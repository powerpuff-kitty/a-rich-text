import { ART_DOCUMENT_VERSION, isARTDocument, type ARTBlockNode, type ARTDocument, type ARTParagraphNode } from '@arichtext/core';
import { toHTML } from '@arichtext/html';
import type { ConversionDiagnostic, ConversionOutput } from '@arichtext/core/profiles';

type Data = Record<string, unknown>;
const record = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
function diagnostics() { const list: ConversionDiagnostic[] = []; return { add(code: string, message: string) { list.push({ code, message, severity: 'loss' }); }, get value() { return list; } }; }
function inlineHTML(value: string): ARTParagraphNode { const plain = value.replace(/<[^>]*>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"'); return { type: 'paragraph', content: plain ? [{ type: 'text', text: plain }] : [] }; }

/** Import Editor.js OutputData (the shape returned by editor.save()). */
export function importEditorJS(source: string): ConversionOutput<ARTDocument> {
  const input: unknown = JSON.parse(source); if (!record(input) || !Array.isArray(input.blocks)) throw new TypeError('Expected Editor.js OutputData with a blocks array');
  const notes = diagnostics(); if (input.time !== undefined && !Number.isFinite(input.time)) notes.add('time', 'Invalid Editor.js time metadata is ignored');
  const content: ARTBlockNode[] = [];
  for (const block of input.blocks) {
    if (!record(block) || !text(block.type) || !record(block.data)) throw new TypeError('Invalid Editor.js block');
    const data = block.data;
    switch (block.type) {
      case 'paragraph': { if (!text(data.text)) throw new TypeError('Editor.js paragraph text must be a string'); content.push(inlineHTML(data.text)); break; }
      case 'header': { if (!text(data.text) || !Number.isInteger(data.level) || (data.level as number) < 1 || (data.level as number) > 6) throw new TypeError('Invalid Editor.js header'); const level = data.level as 1|2|3|4|5|6; content.push({ type: 'heading', level, content: inlineHTML(data.text).content }); break; }
      case 'quote': { if (!text(data.text)) throw new TypeError('Invalid Editor.js quote'); content.push({ type: 'blockquote', content: [inlineHTML(data.text)] }); break; }
      case 'code': { if (!text(data.code)) throw new TypeError('Invalid Editor.js code block'); content.push({ type: 'codeBlock', text: data.code }); break; }
      case 'delimiter': content.push({ type: 'horizontalRule' }); break;
      case 'image': { const file = record(data.file) ? data.file : data; const url = file.url; if (!text(url) || !url) throw new TypeError('Invalid Editor.js image'); content.push({ type: 'image', src: url, ...(text(data.caption) ? { alt: data.caption } : {}) }); break; }
      case 'embed': { if (!text(data.embed) || !data.embed) throw new TypeError('Invalid Editor.js embed'); content.push({ type: 'extensionBlock', name: 'editorjs:embed', attrs: { url: data.embed, ...(text(data.service) ? { service: data.service } : {}) }, fallbackText: data.embed }); notes.add('adapter-embed', 'Editor.js embed is preserved as an editorjs:embed extension block'); break; }
      case 'table': { if (!Array.isArray(data.content) || !data.content.every(row => Array.isArray(row) && row.every(text))) throw new TypeError('Invalid Editor.js table'); content.push({ type: 'table', content: data.content.map(row => ({ type: 'tableRow', content: row.map(cell => ({ type: 'tableCell', content: [inlineHTML(cell)] })) })) }); break; }
      case 'warning': { if (!text(data.title) || !text(data.message)) throw new TypeError('Invalid Editor.js warning'); content.push({ type: 'extensionBlock', name: 'editorjs:warning', attrs: { title: data.title, message: data.message }, fallbackText: `${data.title}: ${data.message}` }); notes.add('adapter-warning', 'Editor.js warning is preserved as an editorjs:warning extension block'); break; }
      case 'list': { if (!Array.isArray(data.items)) throw new TypeError('Invalid Editor.js list'); const style = data.style === 'ordered' ? 'ordered' : data.style === 'unordered' ? 'bullet' : data.style === 'checklist' ? 'task' : undefined; if (!style) notes.add('list-style', 'Unknown Editor.js list style becomes a bullet list'); const items = data.items.map(item => { if (style === 'task' && record(item)) { if (!text(item.text) || (item.checked !== undefined && typeof item.checked !== 'boolean')) throw new TypeError('Invalid Editor.js checklist item'); return { type: 'listItem' as const, checked: item.checked ?? false, content: [inlineHTML(item.text)] }; } if (!text(item)) throw new TypeError('Invalid Editor.js list item'); return { type: 'listItem' as const, ...(style === 'task' ? { checked: false } : {}), content: [inlineHTML(item)] }; }); content.push({ type: 'list', style: style ?? 'bullet', content: items }); break; }
      default: notes.add('unsupported-block', `Editor.js ${block.type} block is omitted`);
    }
  }
  const value: ARTDocument = { type: 'doc', version: ART_DOCUMENT_VERSION, content }; if (!isARTDocument(value)) throw new TypeError('Editor.js conversion produced invalid ART'); return { value, diagnostics: notes.value };
}

/** Export the supported ART block subset as Editor.js OutputData. */
export function exportEditorJS(document: ARTDocument): ConversionOutput<string> {
  if (!isARTDocument(document)) throw new TypeError('Invalid ART document'); const notes = diagnostics(); const blocks: Data[] = [];
  for (const block of document.content) {
    if (block.type === 'paragraph') blocks.push({ type: 'paragraph', data: { text: toHTML({ type: 'doc', version: 1, content: [block] }).replace(/^<p>|<\/p>$/g, '') } });
    else if (block.type === 'heading') blocks.push({ type: 'header', data: { text: toHTML({ type: 'doc', version: 1, content: [block] }).replace(/^<h[1-6]>|<\/h[1-6]>$/g, ''), level: block.level } });
    else if (block.type === 'codeBlock') blocks.push({ type: 'code', data: { code: block.text } });
    else if (block.type === 'horizontalRule') blocks.push({ type: 'delimiter', data: {} });
    else if (block.type === 'image') blocks.push({ type: 'image', data: { file: { url: block.src }, ...(block.alt ? { caption: block.alt } : {}) } });
    else if (block.type === 'extensionBlock' && block.name === 'editorjs:embed' && typeof block.attrs?.url === 'string') { blocks.push({ type: 'embed', data: { embed: block.attrs.url, ...(typeof block.attrs.service === 'string' ? { service: block.attrs.service } : {}) } }); notes.add('adapter-embed', 'editorjs:embed is exported as an Editor.js embed block'); }
    else if (block.type === 'table') blocks.push({ type: 'table', data: { content: block.content.map(row => row.content.map(cell => toHTML({ type: 'doc', version: 1, content: cell.content }).replace(/^<p>|<\/p>$/g, ''))) } });
    else if (block.type === 'extensionBlock' && block.name === 'editorjs:warning' && typeof block.attrs?.title === 'string' && typeof block.attrs?.message === 'string') { blocks.push({ type: 'warning', data: { title: block.attrs.title, message: block.attrs.message } }); notes.add('adapter-warning', 'editorjs:warning is exported as an Editor.js warning block'); }
    else if (block.type === 'blockquote' && block.content.length === 1 && block.content[0]?.type === 'paragraph') blocks.push({ type: 'quote', data: { text: toHTML({ type: 'doc', version: 1, content: [block.content[0]] }).replace(/^<p>|<\/p>$/g, '') } });
    else if (block.type === 'list' && block.content.every(item => item.content.length === 1 && item.content[0]?.type === 'paragraph')) blocks.push({ type: 'list', data: { style: block.style === 'ordered' ? 'ordered' : block.style === 'task' ? 'checklist' : 'unordered', items: block.content.map(item => { const value = toHTML({ type: 'doc', version: 1, content: [item.content[0]!] }).replace(/^<p>|<\/p>$/g, ''); return block.style === 'task' ? { text: value, checked: item.checked ?? false } : value; }) } });
    else { notes.add('unsupported-block', `ART ${block.type} block is flattened to fallback text`); blocks.push({ type: 'paragraph', data: { text: '' } }); }
  }
  return { value: JSON.stringify({ time: Date.now(), blocks }), diagnostics: notes.value };
}

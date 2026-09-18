import { describe, expect, it } from 'vitest';
import { exportEditorJS, importEditorJS } from '../src/index.js';
describe('Editor.js adapter', () => {
  it('imports supported OutputData blocks and reports unknown tools', () => {
    const result = importEditorJS(JSON.stringify({ time: 1, blocks: [
      { type: 'paragraph', data: { text: '<b>Hello</b>' } },
      { type: 'header', data: { text: 'Title', level: 2 } },
      { type: 'list', data: { style: 'unordered', items: ['One', 'Two'] } },
      { type: 'delimiter', data: {} }, { type: 'unknown', data: {} },
    ] }));
    expect(result.value.content.map(block => block.type)).toEqual(['paragraph', 'heading', 'list', 'horizontalRule']);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'unsupported-block', severity: 'loss' }));
  });
  it('exports supported ART blocks with explicit fallback diagnostics', () => {
    const result = exportEditorJS({ type: 'doc', version: 1, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      { type: 'image', src: 'https://example.com/x.png', alt: 'photo' },
    ] });
    expect(JSON.parse(result.value).blocks[0]).toMatchObject({ type: 'paragraph' });
    expect(JSON.parse(result.value).blocks[1]).toMatchObject({ type: 'image' });
    expect(result.diagnostics).toEqual([]);
  });
  it('round-trips Editor.js checklist item objects and checked state', () => {
    const imported = importEditorJS(JSON.stringify({ blocks: [{ type: 'list', data: { style: 'checklist', items: [{ text: 'Done', checked: true }, { text: 'Next', checked: false }] } }] }));
    expect(imported.value.content[0]).toMatchObject({ style: 'task', content: [{ checked: true }, { checked: false }] });
    const exported = exportEditorJS(imported.value);
    expect(JSON.parse(exported.value).blocks[0].data.items).toEqual([{ text: 'Done', checked: true }, { text: 'Next', checked: false }]);
  });
  it('round-trips the common Editor.js image block shape', () => {
    const imported = importEditorJS(JSON.stringify({ blocks: [{ type: 'image', data: { file: { url: 'https://example.com/image.png' }, caption: 'Photo' } }] }));
    expect(imported.value.content[0]).toMatchObject({ type: 'image', src: 'https://example.com/image.png', alt: 'Photo' });
    const exported = exportEditorJS(imported.value);
    expect(JSON.parse(exported.value).blocks[0].data).toMatchObject({ file: { url: 'https://example.com/image.png' }, caption: 'Photo' });
  });
});

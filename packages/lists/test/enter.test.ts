import { describe, expect, it } from 'vitest';
import { createAnchoredRange, mapAnchoredRangeThroughTransaction } from '../../annotations/src/index.js';
import type { ARTDocument, ARTListNode } from '../../core/src/index.js';
import { applyTransaction, createEditorState, textPoint, textSelection } from '../../engine/src/index.js';
import { insertListParagraph } from '../src/index.js';

function listDocument(style: ARTListNode['style'] = 'bullet'): ARTDocument {
  return {
    type: 'doc',
    version: 1,
    content: [{
      type: 'list',
      style,
      content: [
        {
          type: 'listItem',
          ...(style === 'task' ? { checked: true } : {}),
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
        },
        {
          type: 'listItem',
          ...(style === 'task' ? { checked: false } : {}),
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'later' }] }],
        },
      ],
    }],
  };
}

describe('@arichtext/lists Enter semantics', () => {
  it('splits a list item into two sibling items at the caret', () => {
    const doc = listDocument();
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0], 2)));
    const tx = insertListParagraph(state)!;
    const result = applyTransaction(state, tx);
    const list = result.state.document.content[0] as ARTListNode;

    expect(list.content).toHaveLength(3);
    expect(list.content[0]?.content[0]).toMatchObject({ content: [{ text: 'he' }] });
    expect(list.content[1]?.content[0]).toMatchObject({ content: [{ text: 'llo' }] });
    expect(list.content[2]?.content[0]).toMatchObject({ content: [{ text: 'later' }] });
    expect(result.state.selection).toEqual(textSelection(textPoint([0, 1, 0], 0)));
  });

  it('deletes a selected range before splitting the item', () => {
    const doc = listDocument();
    const state = createEditorState(
      doc,
      textSelection(textPoint([0, 0, 0], 1), textPoint([0, 0, 0], 4)),
    );
    const result = applyTransaction(state, insertListParagraph(state)!);
    const list = result.state.document.content[0] as ARTListNode;

    expect(list.content[0]?.content[0]).toMatchObject({ content: [{ text: 'h' }] });
    expect(list.content[1]?.content[0]).toMatchObject({ content: [{ text: 'o' }] });
  });

  it('maps an annotation in trailing text into the newly created item', () => {
    const doc = listDocument();
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0], 2)));
    const anchor = createAnchoredRange(
      doc,
      textSelection(textPoint([0, 0, 0], 3), textPoint([0, 0, 0], 5)),
    );
    const tx = insertListParagraph(state)!;
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, tx);

    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start).toMatchObject({ blockPath: [0, 1, 0], offset: 1 });
      expect(mapped.range.end).toMatchObject({ blockPath: [0, 1, 0], offset: 3 });
    }
  });

  it('creates an unchecked new task item while retaining the original check state', () => {
    const doc = listDocument('task');
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0], 5)));
    const result = applyTransaction(state, insertListParagraph(state)!);
    const list = result.state.document.content[0] as ARTListNode;

    expect(list.content[0]?.checked).toBe(true);
    expect(list.content[1]?.checked).toBe(false);
    expect(list.content[2]?.checked).toBe(false);
  });

  it('exits an empty middle list item into a paragraph and splits ordered numbering', () => {
    const doc: ARTDocument = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'list',
        style: 'ordered',
        start: 5,
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'three' }] }] },
        ],
      }],
    };
    const state = createEditorState(doc, textSelection(textPoint([0, 1, 0], 0)));
    const result = applyTransaction(state, insertListParagraph(state)!);

    expect(result.state.document.content).toHaveLength(3);
    expect(result.state.document.content[0]).toMatchObject({
      type: 'list',
      style: 'ordered',
      start: 5,
      content: [{ content: [{ content: [{ text: 'one' }] }] }],
    });
    expect(result.state.document.content[1]).toEqual({ type: 'paragraph', content: [] });
    expect(result.state.document.content[2]).toMatchObject({
      type: 'list',
      style: 'ordered',
      start: 7,
      content: [{ content: [{ content: [{ text: 'three' }] }] }],
    });
    expect(result.state.selection).toEqual(textSelection(textPoint([1], 0)));
  });

  it('returns null for complex multi-block list items instead of flattening them', () => {
    const doc: ARTDocument = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'list',
        style: 'bullet',
        content: [{
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
          ],
        }],
      }],
    };
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0], 1)));
    expect(insertListParagraph(state)).toBeNull();
  });

  it('preserves marks and maps later items when splitting inside a blockquote', () => {
    const inner = listDocument('ordered');
    const list = inner.content[0] as ARTListNode;
    list.start = 4;
    list.content[0]!.content[0] = {
      type: 'paragraph', content: [{ type: 'text', text: 'hello', marks: [{ type: 'bold' }] }],
    };
    const doc: ARTDocument = { type: 'doc', version: 1, content: [{ type: 'blockquote', content: [list] }] };
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0], 2)));
    const anchor = createAnchoredRange(doc, textSelection(textPoint([0, 0, 1, 0], 0), textPoint([0, 0, 1, 0], 5)));
    const tx = insertListParagraph(state)!;
    const result = applyTransaction(state, tx);
    expect(result.state.document.content[0]).toMatchObject({
      content: [{ start: 4, content: [
        { content: [{ content: [{ text: 'he', marks: [{ type: 'bold' }] }] }] },
        { content: [{ content: [{ text: 'llo', marks: [{ type: 'bold' }] }] }] },
        { content: [{ content: [{ text: 'later' }] }] },
      ] }],
    });
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, tx);
    expect(mapped.range?.start.blockPath).toEqual([0, 0, 2, 0]);
    expect(doc.content[0]).toMatchObject({ content: [{ content: [{ content: [{ content: [{ text: 'hello' }] }] }, {}] }] });
  });

  it.each([0, 1])('exits an empty edge item (%s) and preserves its neighbor', (emptyIndex) => {
    const doc = listDocument();
    const list = doc.content[0] as ARTListNode;
    list.content[emptyIndex]!.content = [{ type: 'paragraph', content: [] }];
    const state = createEditorState(doc, textSelection(textPoint([0, emptyIndex, 0], 0)));
    const result = applyTransaction(state, insertListParagraph(state)!);
    expect(result.state.document.content).toHaveLength(2);
    expect(result.state.document.content[emptyIndex]).toEqual({ type: 'paragraph', content: [] });
    expect((result.state.document.content[1 - emptyIndex] as ARTListNode).content).toHaveLength(1);
  });
});

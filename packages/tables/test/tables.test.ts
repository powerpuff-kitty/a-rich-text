import { describe, expect, it } from 'vitest';
import { createAnchoredRange, mapAnchoredRangeThroughTransaction } from '../../annotations/src/index.js';
import type { ARTBlockNode, ARTDocument, ARTTableNode } from '../../core/src/index.js';
import {
  EditorEngine,
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
} from '../../engine/src/index.js';
import {
  TableCommandError,
  addTableColumn,
  addTableRow,
  getActiveTable,
  insertTable,
  removeCurrentTableColumn,
  removeCurrentTableRow,
} from '../src/index.js';

function paragraph(text: string): ARTBlockNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function cell(text: string) {
  return { type: 'tableCell' as const, content: [paragraph(text)] };
}

function table(rows: string[][]): ARTTableNode {
  return {
    type: 'table',
    content: rows.map((row) => ({
      type: 'tableRow',
      content: row.map(cell),
    })),
  };
}

function document(...content: ARTBlockNode[]): ARTDocument {
  return { type: 'doc', version: 1, content };
}

describe('@arichtext/tables', () => {
  it('inserts a table by splitting the surrounding text block and focuses the first cell', () => {
    const doc = document(paragraph('hello world'));
    const state = createEditorState(doc, textSelection(textPoint([0], 5)));
    const tx = insertTable(state, { rows: 2, columns: 3 })!;
    const result = applyTransaction(state, tx);

    expect(result.state.document.content).toHaveLength(3);
    expect(result.state.document.content[0]).toEqual(paragraph('hello'));
    expect(result.state.document.content[1]).toMatchObject({
      type: 'table',
      content: [
        { content: [{}, {}, {}] },
        { content: [{}, {}, {}] },
      ],
    });
    expect(result.state.document.content[2]).toEqual(paragraph(' world'));
    expect(result.state.selection).toEqual(textSelection(textPoint([1, 0, 0, 0], 0)));
  });

  it('maps surrounding review anchors correctly through table insertion', () => {
    const doc = document(paragraph('hello world'));
    const state = createEditorState(doc, textSelection(textPoint([0], 5)));
    const anchor = createAnchoredRange(
      doc,
      textSelection(textPoint([0], 6), textPoint([0], 11)),
    );
    const tx = insertTable(state, { rows: 1, columns: 1 })!;
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, tx);

    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start).toMatchObject({ blockPath: [2], offset: 1 });
      expect(mapped.range.end).toMatchObject({ blockPath: [2], offset: 6 });
    }
  });

  it('adds a row and preserves existing cell annotation paths after the insertion point', () => {
    const doc = document(table([
      ['a', 'b'],
      ['c', 'd'],
    ]));
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0], 1)));
    const anchor = createAnchoredRange(
      doc,
      textSelection(textPoint([0, 1, 1, 0], 0), textPoint([0, 1, 1, 0], 1)),
    );
    const tx = addTableRow(state, 'after')!;
    const result = applyTransaction(state, tx);
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, tx);

    expect((result.state.document.content[0] as ARTTableNode).content).toHaveLength(3);
    expect(result.state.selection).toEqual(textSelection(textPoint([0, 1, 0, 0], 0)));
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start.blockPath).toEqual([0, 2, 1, 0]);
      expect(mapped.range.end.blockPath).toEqual([0, 2, 1, 0]);
    }
  });

  it('adds a column and shifts preserved cells to the right', () => {
    const doc = document(table([['a', 'b']]));
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0], 0)));
    const tx = addTableColumn(state, 'after')!;
    const result = applyTransaction(state, tx);
    const updated = result.state.document.content[0] as ARTTableNode;

    expect(updated.content[0]?.content).toHaveLength(3);
    expect((updated.content[0]?.content[0]?.content[0] as any).content?.[0]?.text).toBe('a');
    expect((updated.content[0]?.content[2]?.content[0] as any).content?.[0]?.text).toBe('b');
    expect(result.state.selection).toEqual(textSelection(textPoint([0, 0, 1, 0], 0)));
  });

  it('removes the current row/column while preserving remaining table shape', () => {
    let state = createEditorState(
      document(table([
        ['a', 'b'],
        ['c', 'd'],
      ])),
      textSelection(textPoint([0, 0, 1, 0], 0)),
    );

    state = applyTransaction(state, removeCurrentTableRow(state)!).state;
    let updated = state.document.content[0] as ARTTableNode;
    expect(updated.content).toHaveLength(1);
    expect(updated.content[0]?.content).toHaveLength(2);
    expect(state.selection).toEqual(textSelection(textPoint([0, 0, 1, 0], 0)));

    state = applyTransaction(state, removeCurrentTableColumn(state)!).state;
    updated = state.document.content[0] as ARTTableNode;
    expect(updated.content).toHaveLength(1);
    expect(updated.content[0]?.content).toHaveLength(1);
    expect(state.selection).toEqual(textSelection(textPoint([0, 0, 0, 0], 0)));

    expect(removeCurrentTableRow(state)).toBeNull();
    expect(removeCurrentTableColumn(state)).toBeNull();
  });

  it('reports active row/column/dimensions', () => {
    const state = createEditorState(
      document(table([
        ['a', 'b'],
        ['c', 'd'],
      ])),
      textSelection(textPoint([0, 1, 0, 0], 1)),
    );
    expect(getActiveTable(state)).toEqual({
      path: [0],
      rowIndex: 1,
      columnIndex: 0,
      rows: 2,
      columns: 2,
    });
  });

  it('rejects invalid insertion dimensions', () => {
    const state = createEditorState(document(paragraph('x')), textSelection(textPoint([0], 0)));
    for (const options of [
      { rows: 0, columns: 2 },
      { rows: 2, columns: 0 },
      { rows: 51, columns: 2 },
      { rows: 2.5, columns: 2 },
    ]) {
      expect(() => insertTable(state, options)).toThrowError(TableCommandError);
    }
  });

  it('refuses merged-cell editing in the v0.1 command layer', () => {
    const merged: ARTTableNode = {
      type: 'table',
      content: [{
        type: 'tableRow',
        content: [{
          type: 'tableCell',
          colspan: 2,
          content: [paragraph('merged')],
        }],
      }],
    };
    const state = createEditorState(
      document(merged),
      textSelection(textPoint([0, 0, 0, 0], 1)),
    );

    expect(() => getActiveTable(state)).toThrowError(expect.objectContaining({ code: 'merged-cells' }));
    expect(() => addTableRow(state)).toThrowError(expect.objectContaining({ code: 'merged-cells' }));
    expect(() => addTableColumn(state)).toThrowError(expect.objectContaining({ code: 'merged-cells' }));
  });

  it('table insertion and edits are undoable engine history steps', () => {
    const initial = createEditorState(document(paragraph('hello')), textSelection(textPoint([0], 2)));
    const engine = new EditorEngine(initial);
    engine.dispatch(insertTable(engine.state, { rows: 1, columns: 1 })!);
    expect(engine.state.document.content[1]?.type).toBe('table');
    expect(engine.undo()?.state).toEqual(initial);
  });
});

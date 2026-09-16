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
  getTableCellActions,
  getTableRowActions,
  mergeTableCellRight,
  mergeTableCellBelow,
  splitTableCell,
  insertTable,
  removeCurrentTable,
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

  it('reports logical dimensions and permits column edits with horizontal spans', () => {
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

    expect(getActiveTable(state)?.columns).toBe(2);
    expect(addTableRow(state)).not.toBeNull();
    expect(addTableColumn(state)).not.toBeNull();
  });

  it('table insertion and edits are undoable engine history steps', () => {
    const initial = createEditorState(document(paragraph('hello')), textSelection(textPoint([0], 2)));
    const engine = new EditorEngine(initial);
    engine.dispatch(insertTable(engine.state, { rows: 1, columns: 1 })!);
    expect(engine.state.document.content[1]?.type).toBe('table');
    expect(engine.undo()?.state).toEqual(initial);
  });
});

describe('removeCurrentTable', () => {
  it('removes a one-cell table, preserves surrounding text, and restores it with Undo', () => {
    const doc = document(paragraph('before'), table([['keep me']]), paragraph('after'));
    const engine = new EditorEngine(createEditorState(doc, textSelection(textPoint([1, 0, 0, 0], 3))));
    const command = removeCurrentTable(engine.state)!;
    const anchor = createAnchoredRange(doc, textSelection(textPoint([1, 0, 0, 0], 0), textPoint([1, 0, 0, 0], 4)));
    expect(mapAnchoredRangeThroughTransaction(doc, anchor, command).status).toBe('orphaned');
    engine.dispatch(command);
    expect(engine.state.document).toEqual(document(paragraph('before'), paragraph(''), paragraph('after')));
    expect(engine.state.selection).toEqual(textSelection(textPoint([1], 0)));
    engine.undo();
    expect(engine.state.document).toEqual(doc);
    engine.redo();
    expect(engine.state.document.content[1]).toEqual(paragraph(''));
  });

  it('supports nested tables with imported spans without grid validation', () => {
    const merged = table([['wide'], ['left', 'right']]);
    merged.content[0]!.content[0]!.colspan = 2;
    const doc = document({ type: 'blockquote', content: [merged, paragraph('quote')] });
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0, 0], 0)));
    const result = applyTransaction(state, removeCurrentTable(state)!).state;
    expect(result.document).toEqual(document({ type: 'blockquote', content: [paragraph(''), paragraph('quote')] }));
    expect(result.selection).toEqual(textSelection(textPoint([0, 0], 0)));
  });

  it('does not remove tables from outside or across a multi-block selection', () => {
    const doc = document(paragraph('outside'), table([['left', 'right']]));
    expect(removeCurrentTable(createEditorState(doc))).toBeNull();
    expect(removeCurrentTable(createEditorState(doc, textSelection(textPoint([0], 0))))).toBeNull();
    expect(removeCurrentTable(createEditorState(doc, textSelection(textPoint([1, 0, 0, 0], 0), textPoint([1, 0, 1, 0], 1))))).toBeNull();
  });
});


describe('horizontal cell authoring', () => {
  it('merges all content, maps right-cell review anchors, and undoes exactly', () => {
    const doc = document(table([['a', 'b', 'c'], ['d', 'e', 'f']]));
    const engine = new EditorEngine(createEditorState(doc, textSelection(textPoint([0, 0, 0, 0], 1))));
    const anchor = createAnchoredRange(doc, textSelection(textPoint([0, 0, 1, 0], 0), textPoint([0, 0, 1, 0], 1)));
    const command = mergeTableCellRight(engine.state)!;
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, command);
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') expect(mapped.range.start.blockPath).toEqual([0, 0, 0, 1]);
    engine.dispatch(command);
    const merged = engine.state.document.content[0] as ARTTableNode;
    expect(merged.content[0]!.content[0]).toEqual({ type: 'tableCell', colspan: 2, content: [paragraph('a'), paragraph('b')] });
    expect(merged.content[0]!.content[1]).toEqual(cell('c'));
    expect(merged.content[1]).toEqual((doc.content[0] as ARTTableNode).content[1]);
    expect(getTableCellActions(engine.state)).toEqual({ canMergeRight: true, canMergeBelow: false, canSplit: true });
    engine.undo(); expect(engine.state.document).toEqual(doc);
    engine.redo();
    engine.dispatch(mergeTableCellRight(engine.state)!);
    expect((engine.state.document.content[0] as ARTTableNode).content[0]!.content[0]!.colspan).toBe(3);
    expect(getTableCellActions(engine.state).canMergeRight).toBe(false);
  });

  it('merges adjacent rowspans right while mapping content and shifted anchors', () => {
    const grid = table([['left', 'right', 'next'], [], ['a', 'b', 'c']]);
    for (const cell of grid.content[0]!.content) cell.rowspan = 2;
    const doc = document({ type: 'blockquote', content: [grid] });
    const selection = textSelection(textPoint([0, 0, 0, 0, 0], 2));
    const engine = new EditorEngine(createEditorState(doc, selection));
    const command = mergeTableCellRight(engine.state)!;
    for (const [from, to] of [[[0, 0, 0, 1, 0], [0, 0, 0, 0, 1]], [[0, 0, 0, 2, 0], [0, 0, 0, 1, 0]]]) {
      const anchor = createAnchoredRange(doc, textSelection(textPoint(from!, 0), textPoint(from!, 1)));
      const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, command);
      expect(mapped.status).toBe('mapped');
      if (mapped.status !== 'orphaned') expect(mapped.range.start.blockPath).toEqual(to);
    }
    engine.dispatch(command);
    const expected = structuredClone(grid);
    expected.content[0]!.content[0]!.colspan = 2;
    expected.content[0]!.content[0]!.content.push(paragraph('right'));
    expected.content[0]!.content.splice(1, 1);
    expect(engine.state.document).toEqual(document({ type: 'blockquote', content: [expected] }));
    expect(engine.state.selection).toEqual(selection);
    engine.dispatch(mergeTableCellRight(engine.state)!);
    expect(getTableCellActions(engine.state).canMergeRight).toBe(false);
    engine.undo(); engine.undo(); expect(engine.state.document).toEqual(doc);
    engine.redo(); expect(engine.state.document).toEqual(document({ type: 'blockquote', content: [expected] }));
  });

  it('does not merge across a column occupied by a carried rowspan', () => {
    const grid = table([['a', 'barrier', 'b'], ['left', 'right']]);
    grid.content[0]!.content[1]!.rowspan = 2;
    const state = createEditorState(document(grid), textSelection(textPoint([0, 1, 0, 0], 0)));
    expect(getTableCellActions(state).canMergeRight).toBe(false);
    expect(mergeTableCellRight(state)).toBeNull();
  });

  it('allows horizontal merging alongside an unrelated vertical span', () => {
    const grid = table([['vertical', 'left', 'right'], ['a', 'b']]);
    grid.content[0]!.content[0]!.rowspan = 2;
    const state = createEditorState(document(grid), textSelection(textPoint([0, 0, 1, 0], 0)));
    const expected = structuredClone(grid);
    expected.content[0]!.content[1]!.colspan = 2;
    expected.content[0]!.content[1]!.content.push(paragraph('right'));
    expected.content[0]!.content.pop();
    expect(applyTransaction(state, mergeTableCellRight(state)!).state.document).toEqual(document(expected));
  });

  it('merges matching spans below, maps moved and shifted anchors, and undoes', () => {
    const grid = table([['top', 'side'], ['bottom', 'next'], ['last', 'end']]);
    for (const row of grid.content) row.content[0]!.colspan = 2;
    const doc = document({ type: 'blockquote', content: [grid] });
    const engine = new EditorEngine(createEditorState(doc, textSelection(textPoint([0, 0, 0, 0, 0], 1))));
    const command = mergeTableCellBelow(engine.state)!;
    for (const [from, to] of [[[0, 0, 1, 0, 0], [0, 0, 0, 0, 1]], [[0, 0, 1, 1, 0], [0, 0, 1, 0, 0]]]) {
      const anchor = createAnchoredRange(doc, textSelection(textPoint(from!, 0), textPoint(from!, 1)));
      const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, command);
      expect(mapped.status).toBe('mapped');
      if (mapped.status !== 'orphaned') expect(mapped.range.start.blockPath).toEqual(to);
    }
    engine.dispatch(command);
    const expected = structuredClone(grid);
    expected.content[0]!.content[0]!.rowspan = 2;
    expected.content[0]!.content[0]!.content.push(paragraph('bottom'));
    expected.content[1]!.content.shift();
    expect(engine.state.document).toEqual(document({ type: 'blockquote', content: [expected] }));
    expect(engine.state.selection?.anchor).toEqual(textPoint([0, 0, 0, 0, 0], 1));
    engine.dispatch(mergeTableCellBelow(engine.state)!);
    expect(getTableCellActions(engine.state).canMergeBelow).toBe(false);
    engine.undo(); engine.undo(); expect(engine.state.document).toEqual(doc);
  });

  it('merges existing rowspans and preserves fully covered rows', () => {
    const grid = table([['top'], [], ['bottom'], []]);
    grid.content[0]!.content[0]!.rowspan = 2;
    grid.content[2]!.content[0]!.rowspan = 2;
    const state = createEditorState(document(grid), textSelection(textPoint([0, 0, 0, 0], 0)));
    const expected = structuredClone(grid);
    expected.content[0]!.content[0]!.rowspan = 4;
    expected.content[0]!.content[0]!.content.push(paragraph('bottom'));
    expected.content[2]!.content = [];
    expect(applyTransaction(state, mergeTableCellBelow(state)!).state.document).toEqual(document(expected));
  });

  it('rejects mismatched lower widths, bottom edges and cross-cell selections', () => {
    const grid = table([['wide'], ['a', 'b']]);
    grid.content[0]!.content[0]!.colspan = 2;
    for (const selection of [textSelection(textPoint([0, 0, 0, 0], 0)), textSelection(textPoint([0, 1, 0, 0], 0)), textSelection(textPoint([0, 1, 0, 0], 0), textPoint([0, 1, 1, 0], 1))]) {
      const state = createEditorState(document(grid), selection);
      expect(mergeTableCellBelow(state)).toBeNull();
      expect(getTableCellActions(state).canMergeBelow).toBe(false);
    }
  });

  it('splits a span while retaining all content on the left and mapping following cells', () => {
    const merged = table([['left', 'next'], ['a', 'b', 'c']]);
    merged.content[0]!.content[0]!.colspan = 2;
    merged.content[0]!.content[0]!.content.push(paragraph('more'));
    const doc = document({ type: 'blockquote', content: [merged] });
    const engine = new EditorEngine(createEditorState(doc, textSelection(textPoint([0, 0, 0, 0, 1], 2))));
    const anchor = createAnchoredRange(doc, textSelection(textPoint([0, 0, 0, 1, 0], 0), textPoint([0, 0, 0, 1, 0], 1)));
    const command = splitTableCell(engine.state)!;
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, command);
    if (mapped.status !== 'orphaned') expect(mapped.range.start.blockPath).toEqual([0, 0, 0, 2, 0]);
    expect(mapped.status).toBe('mapped');
    engine.dispatch(command);
    expect(engine.state.selection?.anchor).toEqual(textPoint([0, 0, 0, 0, 1], 2));
    const expected = structuredClone(merged);
    delete expected.content[0]!.content[0]!.colspan;
    expected.content[0]!.content.splice(1, 0, cell(''));
    expect(engine.state.document).toEqual(document({ type: 'blockquote', content: [expected] }));
    expect(getTableCellActions(engine.state).canSplit).toBe(false);
    engine.undo(); expect(engine.state.document).toEqual(doc);
  });

  it('splits combined spans across covered rows, maps shifted anchors and undoes exactly', () => {
    const grid = table([['left', 'shared', 'right'], ['below-left', 'below-right'], ['bottom']]);
    grid.content[0]!.content[1]!.colspan = 2;
    grid.content[0]!.content[1]!.rowspan = 2;
    grid.content[0]!.content[1]!.content.push(paragraph('more'));
    grid.content[2]!.content[0]!.colspan = 4;
    const doc = document({ type: 'blockquote', content: [grid] });
    const engine = new EditorEngine(createEditorState(doc, textSelection(textPoint([0, 0, 0, 1, 1], 2))));
    const anchor = createAnchoredRange(doc, textSelection(textPoint([0, 0, 1, 1, 0], 0), textPoint([0, 0, 1, 1, 0], 2)));
    const command = splitTableCell(engine.state)!;
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, command);
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') expect(mapped.range.start.blockPath).toEqual([0, 0, 1, 3, 0]);
    engine.dispatch(command);
    const expected = table([['left', 'shared', '', 'right'], ['below-left', '', '', 'below-right'], ['bottom']]);
    expected.content[0]!.content[1]!.content.push(paragraph('more'));
    expected.content[2]!.content[0]!.colspan = 4;
    expect(engine.state.document).toEqual(document({ type: 'blockquote', content: [expected] }));
    expect(engine.state.selection?.anchor).toEqual(textPoint([0, 0, 0, 1, 1], 2));
    engine.undo(); expect(engine.state.document).toEqual(doc);
    engine.redo(); expect(engine.state.document).toEqual(document({ type: 'blockquote', content: [expected] }));
  });

  it('fills fully covered rows without changing other vertical spans', () => {
    const grid = table([['shared', 'other'], [], ['a', 'b']]);
    grid.content[0]!.content[0]!.rowspan = 2;
    grid.content[0]!.content[1]!.rowspan = 2;
    const state = createEditorState(document(grid), textSelection(textPoint([0, 0, 0, 0], 1)));
    const result = applyTransaction(state, splitTableCell(state)!).state.document;
    const expected = table([['shared', 'other'], [''], ['a', 'b']]);
    expected.content[0]!.content[1]!.rowspan = 2;
    expect(result).toEqual(document(expected));
  });

  it('allows vertical splitting while rejecting unsupported merge contexts', () => {
    const grid = table([['a', 'b'], ['below']]);
    grid.content[0]!.content[0]!.rowspan = 2;
    const state = createEditorState(document(grid), textSelection(textPoint([0, 0, 0, 0], 0)));
    expect(mergeTableCellRight(state)).toBeNull(); expect(splitTableCell(state)).not.toBeNull();
    delete grid.content[0]!.content[0]!.rowspan;
    grid.content.pop();
    grid.content[0]!.content[0]!.colspan = 50;
    expect(mergeTableCellRight(createEditorState(document(grid), state.selection))).toBeNull();
    expect(splitTableCell(createEditorState(document(grid), state.selection))).toBeNull();
    expect(getTableCellActions(createEditorState(document(paragraph('text')), textSelection(textPoint([0], 0))))).toEqual({ canMergeRight: false, canMergeBelow: false, canSplit: false });
    expect(mergeTableCellRight(createEditorState(document(table([['a', 'b']])), textSelection(textPoint([0, 0, 0, 0], 0), textPoint([0, 0, 1, 0], 1))))).toBeNull();
  });
});


describe('row editing with horizontal spans', () => {
  it('inserts a full-width row and maps surviving merged-cell anchors', () => {
    const merged = table([['wide'], ['a', 'b']]);
    merged.content[0]!.content[0]!.colspan = 2;
    const doc = document(merged);
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0], 1)));
    const anchor = createAnchoredRange(doc, textSelection(textPoint([0, 1, 1, 0], 0), textPoint([0, 1, 1, 0], 1)));
    const command = addTableRow(state)!;
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, command);
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') expect(mapped.range.start.blockPath).toEqual([0, 2, 1, 0]);
    const engine = new EditorEngine(state);
    engine.dispatch(command);
    const result = engine.state.document.content[0] as ARTTableNode;
    expect(result.content[0]).toEqual(merged.content[0]);
    expect(result.content[1]!.content).toEqual([cell(''), cell('')]);
    expect(result.content[2]).toEqual(merged.content[1]);
    expect(engine.state.selection?.anchor.blockPath).toEqual([0, 1, 0, 0]);
    engine.undo(); expect(engine.state.document).toEqual(doc);
  });

  it('removes a row and clamps focus to a surviving physical cell', () => {
    const merged = table([['wide'], ['a', 'b']]);
    merged.content[0]!.content[0]!.colspan = 2;
    const doc = document(merged);
    const engine = new EditorEngine(createEditorState(doc, textSelection(textPoint([0, 1, 1, 0], 0))));
    engine.dispatch(removeCurrentTableRow(engine.state)!);
    expect(engine.state.selection?.anchor.blockPath).toEqual([0, 0, 0, 0]);
    expect((engine.state.document.content[0] as ARTTableNode).content).toEqual([merged.content[0]]);
    expect(getTableRowActions(engine.state)).toEqual({ canAddRow: true, canRemoveRow: false });
    engine.undo(); expect(engine.state.document).toEqual(doc);
  });

  it('suppresses row actions for vertical spans and honors the row limit', () => {
    const vertical = table([['a'], []]); vertical.content[0]!.content[0]!.rowspan = 2;
    const state = createEditorState(document(vertical), textSelection(textPoint([0, 0, 0, 0], 0)));
    expect(getTableRowActions(state)).toEqual({ canAddRow: false, canRemoveRow: false });
    expect(() => addTableRow(state)).toThrow(/Vertical/);
    const full = createEditorState(document(table(Array.from({ length: 50 }, () => ['a']))), state.selection);
    expect(getTableRowActions(full)).toEqual({ canAddRow: false, canRemoveRow: true });
    expect(() => addTableRow(full)).toThrow(/limited/);
  });
});

describe('column editing with horizontal spans', () => {
  it.each(['before', 'after'] as const)('inserts %s the active cell and widens a crossing span', position => {
    const grid = table([['a', 'b', 'c'], ['wide']]); grid.content[1]!.content[0]!.colspan = 3;
    const doc = document(grid);
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 1, 0], 0)));
    const anchor = createAnchoredRange(doc, textSelection(textPoint([0, 1, 0, 0], 0), textPoint([0, 1, 0, 0], 4)));
    const command = addTableColumn(state, position)!;
    const mapped = mapAnchoredRangeThroughTransaction(doc, anchor, command);
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') expect(mapped.range.start.blockPath).toEqual([0, 1, 0, 0]);
    const engine = new EditorEngine(state); engine.dispatch(command);
    const result = engine.state.document.content[0] as ARTTableNode;
    expect(result.content[1]!.content[0]).toEqual({ ...cell('wide'), colspan: 4 });
    expect(result.content[0]!.content).toEqual(position === 'before' ? [cell('a'), cell(''), cell('b'), cell('c')] : [cell('a'), cell('b'), cell(''), cell('c')]);
    expect(engine.state.selection?.anchor.blockPath).toEqual([0, 0, position === 'before' ? 1 : 2, 0]);
    engine.undo(); expect(engine.state.document).toEqual(doc);
  });

  it('inserts after the full active span and shifts following physical cells', () => {
    const grid = table([['wide', 'next'], ['a', 'b', 'c']]); grid.content[0]!.content[0]!.colspan = 2;
    const doc = document(grid); const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0], 0)));
    const result = applyTransaction(state, addTableColumn(state)!).state.document.content[0] as ARTTableNode;
    expect(result.content[0]!.content).toEqual([{ ...cell('wide'), colspan: 2 }, cell(''), cell('next')]);
    expect(result.content[1]!.content).toEqual([cell('a'), cell('b'), cell(''), cell('c')]);
  });

  it('shrinks spans, deletes unit cells, maps surviving anchors and undoes exactly', () => {
    const grid = table([['wide', 'next'], ['a', 'b', 'c']]); grid.content[0]!.content[0]!.colspan = 2;
    const doc = document(grid); const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 0], 0)));
    const command = removeCurrentTableColumn(state)!;
    const removed = createAnchoredRange(doc, textSelection(textPoint([0, 1, 0, 0], 0), textPoint([0, 1, 0, 0], 1)));
    expect(mapAnchoredRangeThroughTransaction(doc, removed, command).status).toBe('orphaned');
    const retained = createAnchoredRange(doc, textSelection(textPoint([0, 0, 0, 0], 0), textPoint([0, 0, 0, 0], 4)));
    expect(mapAnchoredRangeThroughTransaction(doc, retained, command).status).toBe('mapped');
    const engine = new EditorEngine(state); engine.dispatch(command);
    const result = engine.state.document.content[0] as ARTTableNode;
    expect(result.content[0]!.content).toEqual([cell('wide'), cell('next')]);
    expect(result.content[1]!.content).toEqual([cell('b'), cell('c')]);
    expect(engine.state.selection?.anchor.blockPath).toEqual([0, 0, 0, 0]);
    engine.undo(); expect(engine.state.document).toEqual(doc);
  });

  it('uses logical rather than physical columns and rejects vertical spans', () => {
    const grid = table([['wide', 'next'], ['a', 'b', 'c']]); grid.content[0]!.content[0]!.colspan = 2;
    const state = createEditorState(document(grid), textSelection(textPoint([0, 0, 1, 0], 0)));
    const result = applyTransaction(state, removeCurrentTableColumn(state)!).state.document.content[0] as ARTTableNode;
    expect(result.content[0]!.content).toEqual([{ ...cell('wide'), colspan: 2 }]);
    expect(result.content[1]!.content).toEqual([cell('a'), cell('b')]);
    grid.content[0]!.content[0]!.rowspan = 2;
    grid.content[1]!.content = [cell('remaining')];
    const vertical = createEditorState(document(grid), state.selection);
    expect(() => addTableColumn(vertical)).toThrow(/Vertical/);
    expect(() => removeCurrentTableColumn(vertical)).toThrow(/Vertical/);
  });
});

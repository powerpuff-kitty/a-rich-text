// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { fromHTML } from '../../html/src/index.js';
import { EditorEngine, createEditorState, textPoint, textSelection } from '../../engine/src/index.js';
import { moveTableCell } from '../src/index.js';

it('navigates in row order without adding an undo step, and returns null at edges', () => {
  const engine = new EditorEngine(createEditorState(fromHTML('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>'), textSelection(textPoint([0, 0, 0, 0], 1))));
  expect(moveTableCell(engine.state, 'previous')).toBeNull();
  for (const path of [[0, 0, 1, 0], [0, 1, 0, 0], [0, 1, 1, 0]]) {
    engine.dispatch(moveTableCell(engine.state)!);
    expect(engine.state.selection?.anchor).toEqual(textPoint(path, 0));
  }
  expect(moveTableCell(engine.state)).toBeNull();
  expect(engine.canUndo).toBe(false);
});

it('rejects merged cells explicitly without changing the source document', () => {
  const state = createEditorState(fromHTML('<table><tr><td colspan="2">a</td></tr></table>'), textSelection(textPoint([0, 0, 0, 0], 0)));
  expect(() => moveTableCell(state)).toThrow(/Merged-cell/);
  expect(state.document.content[0]).toMatchObject({ content: [{ content: [{ colspan: 2 }] }] });
});

// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { fromHTML, toHTML } from '../../html/src/index.js';
import { createEditorState, applyTransaction, textPoint, textSelection } from '../../engine/src/index.js';
import { createAnchoredRange, mapAnchoredRangeThroughTransaction } from '../../annotations/src/index.js';
import { indentListItem, outdentListItem } from '../src/index.js';

it('indents and lifts with selection and review anchors preserved', () => {
  const state = createEditorState(fromHTML('<ul><li>one</li><li>two</li><li>three</li></ul>'), textSelection(textPoint([0, 1, 0], 2)));
  const anchor = createAnchoredRange(state.document, textSelection(textPoint([0, 2, 0], 1), textPoint([0, 2, 0], 4)));
  const command = indentListItem(state)!;
  const result = applyTransaction(state, command);
  expect(toHTML(result.state.document)).toBe('<ul><li><p>one</p><ul><li><p>two</p></li></ul></li><li><p>three</p></li></ul>');
  expect(result.state.selection?.anchor).toEqual(textPoint([0, 0, 1, 0, 0], 2));
  expect(mapAnchoredRangeThroughTransaction(state.document, anchor, command).status).toBe('mapped');
  const lifted = applyTransaction(result.state, outdentListItem(result.state)!);
  expect(lifted.state.document).toEqual(state.document);
  expect(lifted.state.selection).toEqual(state.selection);
});

it('keeps trailing nested siblings under a lifted item and maps later content', () => {
  const state = createEditorState(fromHTML('<ul><li><p>parent</p><ul><li>a</li><li>b</li><li>c</li></ul><p>tail</p></li><li>last</li></ul>'), textSelection(textPoint([0, 0, 1, 1, 0], 1)));
  const result = applyTransaction(state, outdentListItem(state)!);
  expect(toHTML(result.state.document)).toBe('<ul><li><p>parent</p><ul><li><p>a</p></li></ul><p>tail</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li><li><p>last</p></li></ul>');
  expect(result.state.selection?.anchor).toEqual(textPoint([0, 1, 0], 1));
});

it('lifts just the current outer item, preserving numbering and blocks', () => {
  const state = createEditorState(fromHTML('<ol start="4"><li>a</li><li><p>b</p><p>tail</p></li><li>c</li></ol>'), textSelection(textPoint([0, 1, 1], 2)));
  const result = applyTransaction(state, outdentListItem(state)!);
  expect(toHTML(result.state.document)).toBe('<ol start="4"><li><p>a</p></li></ol><p>b</p><p>tail</p><ol start="6"><li><p>c</p></li></ol>');
  expect(result.state.selection?.anchor).toEqual(textPoint([2], 2));
});

import { describe, expect, it } from 'vitest';
import { type ARTDocument, type ARTExtensionInlineNode, toPlainText } from '../../core/src/index.js';
import { EditorEngine, createEditorState, textPoint, textSelection, applyTransaction } from '../src/index.js';
import { insertInlineNode, deleteBackward, deleteForward, insertParagraph, toggleSelectionMark } from '../src/commands.js';
const atom: ARTExtensionInlineNode = { type: 'extensionInline', name: 'acme:mention', attrs: { id: '42' }, fallbackText: '@Alice' };
const doc: ARTDocument = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, atom, { type: 'text', text: 'b' }] }] };
const stateAt = (offset: number) => createEditorState(doc, textSelection(textPoint([0], offset)));
describe('atomic inline editing', () => {
  it.each([[deleteBackward, 2], [deleteForward, 1]] as const)('deletes the entire atom in one history step', (command, offset) => {
    const engine = new EditorEngine(stateAt(offset));
    engine.dispatch(command(engine.state)!);
    expect(toPlainText(engine.state.document)).toBe('ab');
    expect(engine.state.selection?.anchor.offset).toBe(1);
    engine.undo(); expect(engine.state.document).toEqual(doc);
    engine.redo(); expect(toPlainText(engine.state.document)).toBe('ab');
  });
  it('inserts detached data with one logical position and undo', () => {
    const initial = createEditorState({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ab' }] }] }, textSelection(textPoint([0], 1)));
    const engine = new EditorEngine(initial);
    engine.dispatch(insertInlineNode(initial, atom)!);
    expect(engine.state.document).toEqual(doc);
    expect(engine.state.selection?.anchor.offset).toBe(2);
    engine.undo(); expect(engine.state).toEqual(initial);
  });
  it('splits beside an atom without splitting its label or losing attributes', () => {
    const state = stateAt(2);
    const result = applyTransaction(state, insertParagraph(state)!).state;
    expect(result.document.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, atom] }, { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }]);
  });
  it('formats text around an atom without adding marks to the atom', () => {
    const state = createEditorState(doc, textSelection(textPoint([0], 0), textPoint([0], 3)));
    const result = applyTransaction(state, toggleSelectionMark(state, { type: 'bold' })!).state;
    expect(result.document.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }, atom, { type: 'text', text: 'b', marks: [{ type: 'bold' }] }] });
  });
});

it('keeps combining marks adjacent to atoms separate during deletion', () => {
  const document: ARTDocument = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [atom, { type: 'text', text: '\u0301x' }] }] };
  const state = createEditorState(document, textSelection(textPoint([0], 0)));
  expect(toPlainText(applyTransaction(state, deleteForward(state)!).state.document)).toBe('\u0301x');
});

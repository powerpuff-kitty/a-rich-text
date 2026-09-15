import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import {
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
} from '../src/index.js';
import {
  deleteSelection,
  insertText,
  setCurrentHeading,
  toggleSelectionMark,
} from '../src/commands.js';

const document: ARTDocument = {
  type: 'doc',
  version: ART_DOCUMENT_VERSION,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
};

describe('@arichtext/engine/commands', () => {
  it('creates an insertion transaction from the current selection', () => {
    const state = createEditorState(document, textSelection(textPoint([0], 5)));
    const command = insertText(state, '!');
    expect(command).not.toBeNull();

    const result = applyTransaction(state, command!);
    expect(result.state.document.content[0]).toMatchObject({
      content: [{ text: 'hello!' }],
    });
    expect(result.meta).toEqual({ command: 'insertText' });
  });

  it('returns null for selection-dependent commands when there is no selection', () => {
    const state = createEditorState(document);
    expect(insertText(state, '!')).toBeNull();
    expect(toggleSelectionMark(state, { type: 'bold' })).toBeNull();
    expect(setCurrentHeading(state, 2)).toBeNull();
  });

  it('does not create a delete command for a collapsed selection', () => {
    const state = createEditorState(document, textSelection(textPoint([0], 2)));
    expect(deleteSelection(state)).toBeNull();
  });

  it('builds formatting and block commands from the active selection', () => {
    const state = createEditorState(
      document,
      textSelection(textPoint([0], 0), textPoint([0], 5)),
    );
    const bold = toggleSelectionMark(state, { type: 'bold' });
    const boldResult = applyTransaction(state, bold!);
    expect(boldResult.state.document.content[0]).toMatchObject({
      content: [{ text: 'hello', marks: [{ type: 'bold' }] }],
    });

    const heading = setCurrentHeading(boldResult.state, 2);
    const headingResult = applyTransaction(boldResult.state, heading!);
    expect(headingResult.state.document.content[0]).toMatchObject({ type: 'heading', level: 2 });
  });
});

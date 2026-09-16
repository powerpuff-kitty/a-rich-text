import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import {
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
} from '../src/index.js';
import {
  clearSelectionFormatting,
  insertHorizontalRule,
  toggleBlockquote,
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


describe('authoring commands', () => {
  it('wraps and unwraps quotes preserving reversed selections and sibling blocks', () => {
    const initial = createEditorState(document, textSelection(textPoint([0], 4), textPoint([0], 1)));
    const wrapped = applyTransaction(initial, toggleBlockquote(initial)!).state;
    expect(wrapped.selection).toEqual(textSelection(textPoint([0, 0], 4), textPoint([0, 0], 1)));
    expect(wrapped.document.content[0]?.type).toBe('blockquote');
    const unwrapped = applyTransaction(wrapped, toggleBlockquote(wrapped)!).state;
    expect(unwrapped).toEqual(initial);
  });

  it('unwraps multi-block quotes nested in list items with complete text mappings', () => {
    const doc: ARTDocument = { type: 'doc', version: 1, content: [{ type: 'list', style: 'bullet', content: [{ type: 'listItem', content: [
      { type: 'blockquote', content: [...document.content, ...document.content] }, ...document.content,
    ] }] }] };
    const state = createEditorState(doc, textSelection(textPoint([0, 0, 0, 1], 3)));
    const command = toggleBlockquote(state)!;
    const result = applyTransaction(state, command);
    expect(result.state.selection?.anchor.blockPath).toEqual([0, 0, 1]);
    expect(command.operations[0]).toMatchObject({ pathMappings: [
      { from: [0, 0, 0, 0], to: [0, 0, 0] }, { from: [0, 0, 0, 1], to: [0, 0, 1] },
    ] });
  });

  it('inserts a rule between split paragraphs with a usable trailing caret', () => {
    const state = createEditorState(document, textSelection(textPoint([0], 2)));
    const result = applyTransaction(state, insertHorizontalRule(state)!);
    expect(result.state.document.content.map(block => block.type)).toEqual(['paragraph', 'horizontalRule', 'paragraph']);
    expect(result.state.selection?.anchor).toEqual(textPoint([2], 0));
  });

  it('clears marks only in the selected range and retains block structure', () => {
    const doc: ARTDocument = { type: 'doc', version: 1, content: [{ type: 'heading', level: 2, content: [{ type: 'text', text: 'hello', marks: [{ type: 'bold' }, { type: 'link', href: 'https://example.com' }] }] }] };
    const state = createEditorState(doc, textSelection(textPoint([0], 1), textPoint([0], 4)));
    const result = applyTransaction(state, clearSelectionFormatting(state)!);
    expect(result.state.document.content[0]).toEqual({ type: 'heading', level: 2, content: [
      { type: 'text', text: 'h', marks: [{ type: 'bold' }, { type: 'link', href: 'https://example.com' }] },
      { type: 'text', text: 'ell' },
      { type: 'text', text: 'o', marks: [{ type: 'bold' }, { type: 'link', href: 'https://example.com' }] },
    ] });
  });
});

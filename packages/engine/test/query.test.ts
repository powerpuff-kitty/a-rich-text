import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import {
  createEditorState,
  getActiveBlock,
  getActiveMarks,
  isMarkActive,
  textPoint,
  textSelection,
} from '../src/index.js';

describe('engine selection queries', () => {
  const document: ARTDocument = {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: [
      {
        type: 'heading',
        level: 2,
        content: [
          { type: 'text', text: 'ab', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: 'cd', marks: [{ type: 'bold' }] },
        ],
      },
    ],
  };

  it('returns marks at a collapsed caret', () => {
    const state = createEditorState(document, textSelection(textPoint([0], 1)));
    expect(getActiveMarks(state)).toEqual([{ type: 'bold' }, { type: 'italic' }]);
    expect(isMarkActive(state, 'bold')).toBe(true);
    expect(isMarkActive(state, 'underline')).toBe(false);
  });

  it('returns only marks common to an expanded selection', () => {
    const state = createEditorState(
      document,
      textSelection(textPoint([0], 0), textPoint([0], 4)),
    );
    expect(getActiveMarks(state)).toEqual([{ type: 'bold' }]);
  });

  it('reports the active heading level', () => {
    const state = createEditorState(document, textSelection(textPoint([0], 2)));
    expect(getActiveBlock(state)).toEqual({ type: 'heading', level: 2 });
  });
});

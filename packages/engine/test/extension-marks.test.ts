import { describe, expect, it } from 'vitest';
import type { ARTDocument } from '@arichtext/core';
import { applyTransaction, createEditorState, textPoint, transaction } from '../src/index.js';

const document: ARTDocument = {
  type: 'doc',
  version: 1,
  content: [{
    type: 'paragraph',
    content: [{
      type: 'text',
      text: 'hello',
      marks: [
        { type: 'extensionMark', name: 'acme:mention', attrs: { id: 'u1' } },
        { type: 'extensionMark', name: 'other:annotation', attrs: { kind: 'review' } },
      ],
    }],
  }],
};

describe('extension mark identity', () => {
  it('toggles only the targeted namespaced extension mark', () => {
    const state = createEditorState(document);
    const result = applyTransaction(state, transaction()
      .toggleMark(textPoint([0], 0), textPoint([0], 5), {
        type: 'extensionMark',
        name: 'acme:mention',
        attrs: { id: 'u1' },
      })
      .build());

    const marks = result.state.document.content[0]?.type === 'paragraph'
      ? result.state.document.content[0].content?.[0]?.marks
      : undefined;
    expect(marks).toEqual([
      { type: 'extensionMark', name: 'other:annotation', attrs: { kind: 'review' } },
    ]);
  });

  it('keeps separate extension mark namespaces on add', () => {
    const state = createEditorState({
      type: 'doc', version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    });

    const first = applyTransaction(state, transaction()
      .addMark(textPoint([0], 0), textPoint([0], 5), { type: 'extensionMark', name: 'acme:mention' })
      .build());
    const second = applyTransaction(first.state, transaction()
      .addMark(textPoint([0], 0), textPoint([0], 5), { type: 'extensionMark', name: 'other:annotation' })
      .build());

    const marks = second.state.document.content[0]?.type === 'paragraph'
      ? second.state.document.content[0].content?.[0]?.marks
      : undefined;
    expect(marks?.map((mark) => mark.type === 'extensionMark' ? mark.name : mark.type)).toEqual([
      'acme:mention',
      'other:annotation',
    ]);
  });
});

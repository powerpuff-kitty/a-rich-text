import { expect, it } from 'vitest';
import { createEditorState, textSelection, textPoint, applyTransaction } from '../../engine/src/index.js';
import { insertAutoLinkBoundary } from '../src/index.js';
import { captureTextQuote } from '../../annotations/src/index.js';
it('keeps URL and annotation offsets logical after an atom', () => {
  const atom = { type: 'extensionInline' as const, name: 'acme:mention', fallbackText: '@Long name' };
  const state = createEditorState({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [atom, { type: 'text', text: 'https://example.com' }] }] }, textSelection(textPoint([0], 20)));
  const command = insertAutoLinkBoundary(state, ' ');
  expect(command).not.toBeNull();
  const result = applyTransaction(state, command!).state;
  expect(result.document.content[0]).toEqual({ type: 'paragraph', content: [atom, { type: 'text', text: 'https://example.com', marks: [{ type: 'link', href: 'https://example.com' }] }, { type: 'text', text: ' ' }] });
  expect(captureTextQuote(state.document, textPoint([0], 0), textPoint([0], 1)).text).toBe('\uFFFC');
});

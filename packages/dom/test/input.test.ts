// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { classifyBeforeInput } from '../src/index.js';

function input(inputType: string, data: string | null = null, isComposing = false): InputEvent {
  return new InputEvent('beforeinput', { inputType, data, isComposing });
}

describe('@arichtext/dom beforeinput classification', () => {
  it('intercepts deterministic text and format intents', () => {
    expect(classifyBeforeInput(input('insertText', 'A'))).toEqual({
      kind: 'insertText',
      text: 'A',
      intercept: true,
    });
    expect(classifyBeforeInput(input('insertLineBreak'))).toEqual({
      kind: 'insertLineBreak',
      text: '\n',
      intercept: true,
    });
    expect(classifyBeforeInput(input('formatBold'))).toEqual({
      kind: 'toggleMark',
      mark: { type: 'bold' },
      intercept: true,
    });
  });

  it('does not intercept composition or structural browser edits yet', () => {
    expect(classifyBeforeInput(input('insertCompositionText', 'あ', true))).toEqual({
      kind: 'composition',
      inputType: 'insertCompositionText',
      intercept: false,
    });
    expect(classifyBeforeInput(input('insertParagraph'))).toEqual({
      kind: 'structural',
      inputType: 'insertParagraph',
      intercept: false,
    });
    expect(classifyBeforeInput(input('deleteContentBackward'))).toEqual({
      kind: 'deleteBackward',
      intercept: false,
    });
  });

  it('routes paste/drop to their dedicated data handlers', () => {
    expect(classifyBeforeInput(input('insertFromPaste'))).toEqual({
      kind: 'paste',
      inputType: 'insertFromPaste',
      intercept: false,
    });
  });
});

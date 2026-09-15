import type { ARTTextMark } from '@arichtext/core';

export type BeforeInputIntent =
  | { kind: 'insertText'; text: string; intercept: true }
  | { kind: 'insertLineBreak'; text: '\n'; intercept: true }
  | { kind: 'insertParagraph'; intercept: true }
  | { kind: 'deleteSelection'; intercept: true }
  | { kind: 'deleteBackward'; intercept: true }
  | { kind: 'deleteForward'; intercept: true }
  | { kind: 'historyUndo'; intercept: true }
  | { kind: 'historyRedo'; intercept: true }
  | { kind: 'toggleMark'; mark: ARTTextMark; intercept: true }
  | { kind: 'composition'; inputType: string; intercept: false }
  | { kind: 'paste'; inputType: string; intercept: false }
  | { kind: 'structural'; inputType: string; intercept: false }
  | { kind: 'granularDelete'; inputType: string; intercept: false }
  | { kind: 'unknown'; inputType: string; intercept: false };

/**
 * Convert `beforeinput` into an explicit editor intent.
 *
 * `intercept: true` means the engine has a deterministic operation for the
 * intent. The host still decides whether the current selection/container is
 * supported before calling `preventDefault()`.
 */
export function classifyBeforeInput(event: InputEvent): BeforeInputIntent {
  const inputType = event.inputType || '';

  if (event.isComposing || inputType.includes('Composition')) {
    return { kind: 'composition', inputType, intercept: false };
  }

  switch (inputType) {
    case 'insertText':
    case 'insertReplacementText':
      return { kind: 'insertText', text: event.data ?? '', intercept: true };
    case 'insertLineBreak':
      return { kind: 'insertLineBreak', text: '\n', intercept: true };
    case 'insertParagraph':
      return { kind: 'insertParagraph', intercept: true };
    case 'deleteByCut':
    case 'deleteByDrag':
      return { kind: 'deleteSelection', intercept: true };
    case 'deleteContentBackward':
      return { kind: 'deleteBackward', intercept: true };
    case 'deleteContentForward':
      return { kind: 'deleteForward', intercept: true };
    case 'deleteWordBackward':
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
    case 'deleteWordForward':
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      return { kind: 'granularDelete', inputType, intercept: false };
    case 'historyUndo':
      return { kind: 'historyUndo', intercept: true };
    case 'historyRedo':
      return { kind: 'historyRedo', intercept: true };
    case 'formatBold':
      return { kind: 'toggleMark', mark: { type: 'bold' }, intercept: true };
    case 'formatItalic':
      return { kind: 'toggleMark', mark: { type: 'italic' }, intercept: true };
    case 'formatUnderline':
      return { kind: 'toggleMark', mark: { type: 'underline' }, intercept: true };
    case 'formatStrikeThrough':
      return { kind: 'toggleMark', mark: { type: 'strike' }, intercept: true };
    case 'insertFromPaste':
    case 'insertFromPasteAsQuotation':
    case 'insertFromDrop':
      return { kind: 'paste', inputType, intercept: false };
    case 'insertOrderedList':
    case 'insertUnorderedList':
    case 'formatBlock':
    case 'indent':
    case 'outdent':
      return { kind: 'structural', inputType, intercept: false };
    default:
      return { kind: 'unknown', inputType, intercept: false };
  }
}

import type { ARTTextMark } from '@arichtext/core';

export type BeforeInputIntent =
  | { kind: 'insertText'; text: string; intercept: true }
  | { kind: 'insertLineBreak'; text: '\n'; intercept: true }
  | { kind: 'deleteSelection'; intercept: true }
  | { kind: 'deleteBackward'; intercept: false }
  | { kind: 'deleteForward'; intercept: false }
  | { kind: 'historyUndo'; intercept: true }
  | { kind: 'historyRedo'; intercept: true }
  | { kind: 'toggleMark'; mark: ARTTextMark; intercept: true }
  | { kind: 'composition'; inputType: string; intercept: false }
  | { kind: 'paste'; inputType: string; intercept: false }
  | { kind: 'structural'; inputType: string; intercept: false }
  | { kind: 'unknown'; inputType: string; intercept: false };

/**
 * Convert `beforeinput` into an explicit editor intent.
 *
 * `intercept` means the current engine already has deterministic semantics for
 * the intent. False means the DOM adapter must use a dedicated/native fallback
 * rather than blindly calling `preventDefault()`.
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
    case 'deleteByCut':
    case 'deleteByDrag':
      return { kind: 'deleteSelection', intercept: true };
    case 'deleteContentBackward':
    case 'deleteWordBackward':
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      return { kind: 'deleteBackward', intercept: false };
    case 'deleteContentForward':
    case 'deleteWordForward':
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      return { kind: 'deleteForward', intercept: false };
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
    case 'insertParagraph':
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

import { readDOMSelection } from '@arichtext/dom';
import { getActiveList, insertListParagraph, indentListItem, outdentListItem } from '@arichtext/lists';
import type { ARichTextElement } from '@arichtext/web-component';

export interface ListEditingController {
  /** Remove keyboard/composition listeners. Safe to call more than once. */
  destroy(): void;
}

const controllers = new WeakMap<ARichTextElement, ListEditingController>();

/** Install optional list Enter behavior without adding it to the base bundle. */
export function enableListEditing(editor: ARichTextElement): ListEditingController {
  const existing = controllers.get(editor);
  if (existing) return existing;
  const surface = editor.shadowRoot?.querySelector<HTMLElement>('[part="editor"]');
  if (!surface) throw new TypeError('List editing requires an initialized <a-rich-text>');
  let composing = false;
  const startComposition = (): void => { composing = true; };
  const endComposition = (): void => { composing = false; };
  const beforeInput = (event: InputEvent): void => {
    if (event.defaultPrevented || !event.cancelable || composing || event.isComposing
      || editor.disabled || editor.readOnly) return;
    if (event.inputType !== 'insertParagraph' && event.inputType !== 'deleteContentBackward') return;
    const state = {
      document: editor.getJSON(),
      selection: readDOMSelection(surface) ?? editor.getSelection(),
    };
    const active = getActiveList(state);
    if (!active) return;
    const boundary = event.inputType === 'deleteContentBackward';
    if (boundary && (!state.selection || state.selection.anchor.offset !== 0 || state.selection.head.offset !== 0
      || String(state.selection.anchor.blockPath) !== String(state.selection.head.blockPath)
      || state.selection.anchor.blockPath.length !== active.path.length + 2
      || state.selection.anchor.blockPath.at(-1) !== 0)) return;
    // Unsupported list structures remain untouched, including their native DOM.
    event.preventDefault();
    const command = boundary ? outdentListItem(state) : insertListParagraph(state);
    if (command) editor.dispatch(command);
    else editor.dispatchEvent(new CustomEvent('list-editing-unsupported', {
      bubbles: true, composed: true, detail: { inputType: event.inputType },
    }));
  };
  const keyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || !event.cancelable || composing || event.isComposing
      || editor.disabled || editor.readOnly || event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    const state = { document: editor.getJSON(), selection: readDOMSelection(surface) ?? editor.getSelection() };
    if (!getActiveList(state)) return;
    const command = event.shiftKey ? outdentListItem(state) : indentListItem(state);
    if (!command) return; // Keep Tab available to leave the first item.
    event.preventDefault();
    editor.dispatch(command);
  };
  surface.addEventListener('keydown', keyDown, true);
  surface.addEventListener('beforeinput', beforeInput, true);
  surface.addEventListener('compositionstart', startComposition);
  surface.addEventListener('compositionend', endComposition);
  const controller: ListEditingController = {
    destroy() {
      surface.removeEventListener('beforeinput', beforeInput, true);
      surface.removeEventListener('keydown', keyDown, true);
      surface.removeEventListener('compositionstart', startComposition);
      surface.removeEventListener('compositionend', endComposition);
      if (controllers.get(editor) === controller) controllers.delete(editor);
    },
  };
  controllers.set(editor, controller);
  return controller;
}

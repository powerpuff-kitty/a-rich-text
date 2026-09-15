import { readDOMSelection } from '@arichtext/dom';
import { getActiveList, insertListParagraph } from '@arichtext/lists';
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
      || editor.disabled || editor.readOnly || event.inputType !== 'insertParagraph') return;
    const state = {
      document: editor.getJSON(),
      selection: readDOMSelection(surface) ?? editor.getSelection(),
    };
    if (!getActiveList(state)) return;
    // Unsupported list structures remain untouched, including their native DOM.
    event.preventDefault();
    const command = insertListParagraph(state);
    if (command) editor.dispatch(command);
    else editor.dispatchEvent(new CustomEvent('list-editing-unsupported', {
      bubbles: true, composed: true, detail: { inputType: event.inputType },
    }));
  };
  surface.addEventListener('beforeinput', beforeInput, true);
  surface.addEventListener('compositionstart', startComposition);
  surface.addEventListener('compositionend', endComposition);
  const controller: ListEditingController = {
    destroy() {
      surface.removeEventListener('beforeinput', beforeInput, true);
      surface.removeEventListener('compositionstart', startComposition);
      surface.removeEventListener('compositionend', endComposition);
      if (controllers.get(editor) === controller) controllers.delete(editor);
    },
  };
  controllers.set(editor, controller);
  return controller;
}

import { readDOMSelection } from '@arichtext/dom';
import { enableListEditing } from '@arichtext/lists-editor';
import { createLinkMark } from '@arichtext/links';
import { toggleList, setTaskItemChecked, type ListStyle } from '@arichtext/lists';
import { insertTable, moveTableCell, type InsertTableOptions } from '@arichtext/tables';
import type { ARichTextElement } from '@arichtext/web-component';
export * from '@arichtext/web-component';
export * from '@arichtext/ui';

export interface StandardEditingController {
  setLink(href: string): boolean;
  removeLink(): boolean;
  toggleList(style: ListStyle): boolean;
  setTaskChecked(checked: boolean): boolean;
  insertTable(options?: InsertTableOptions): boolean;
  destroy(): void;
}
const controllers = new WeakMap<ARichTextElement, StandardEditingController>();

/** Enable the standard optional keyboard behaviors. Install once per editor. */
export function enableStandardEditing(editor: ARichTextElement): StandardEditingController {
  const existing = controllers.get(editor);
  if (existing) return existing;
  const surface = editor.shadowRoot?.querySelector<HTMLElement>('[part="editor"]');
  if (!surface) throw new TypeError('Standard editing requires an initialized <a-rich-text>');
  const lists = enableListEditing(editor);
  let destroyed = false;
  let composing = false;
  const startComposition = () => { composing = true; };
  const endComposition = () => { composing = false; };
  const state = () => ({ document: editor.getJSON(), selection: editor.getSelection() });
  const editable = () => !destroyed && !editor.disabled && !editor.readOnly;
  const apply = (command: ReturnType<typeof insertTable>): boolean => {
    if (!editable() || !command) return false;
    editor.dispatch(command);
    return true;
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || !event.cancelable || composing || event.isComposing || editor.disabled || editor.readOnly
      || event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    try {
      const command = moveTableCell({ document: editor.getJSON(), selection: readDOMSelection(surface) ?? editor.getSelection() },
        event.shiftKey ? 'previous' : 'next');
      if (!command) return;
      event.preventDefault();
      editor.dispatch(command);
    } catch (error) {
      editor.dispatchEvent(new CustomEvent('error', {
        bubbles: true, composed: true, detail: { context: 'table-navigation', error },
      }));
    }
  };
  surface.addEventListener('keydown', keydown);
  surface.addEventListener('compositionstart', startComposition);
  surface.addEventListener('compositionend', endComposition);
  const controller = {
    setLink(href: string) { return editable() && editor.setMark(createLinkMark(href)); },
    removeLink() { return editable() && editor.removeMark('link'); },
    toggleList(style: ListStyle) { return editable() && apply(toggleList(state(), style)); },
    setTaskChecked(checked: boolean) { return editable() && apply(setTaskItemChecked(state(), checked)); },
    insertTable(options?: InsertTableOptions) { return editable() && apply(insertTable(state(), options)); },
    destroy() {
      destroyed = true;
      lists.destroy();
      surface.removeEventListener('keydown', keydown);
      surface.removeEventListener('compositionstart', startComposition);
      surface.removeEventListener('compositionend', endComposition);
      if (controllers.get(editor) === controller) controllers.delete(editor);
    },
  };
  controllers.set(editor, controller);
  return controller;
}

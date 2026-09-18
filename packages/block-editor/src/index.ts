import { readDOMSelection, decodeARTPath } from '@arichtext/dom';
import { deleteBlock, duplicateBlock, moveBlock } from '@arichtext/engine/blocks';
import type { ARichTextElement } from '@arichtext/web-component';

export interface BlockEditingController { destroy(): void; }
const installed = new WeakMap<ARichTextElement, BlockEditingController>();

/** Install optional keyboard-first block controls without changing ART itself. */
export function enableBlockEditing(editor: ARichTextElement): BlockEditingController {
  const previous = installed.get(editor); if (previous) return previous;
  const root = editor.shadowRoot; const surface = root?.querySelector<HTMLElement>('[part="editor"]');
  if (!root || !surface) throw new TypeError('Block editing requires an initialized editor');
  const menu = editor.ownerDocument.createElement('div');
  menu.setAttribute('part', 'block-menu'); menu.setAttribute('role', 'menu'); menu.hidden = true;
  menu.innerHTML = '<button type="button" data-action="move-up">Move up</button><button type="button" data-action="move-down">Move down</button><button type="button" data-action="duplicate">Duplicate</button><button type="button" data-action="delete">Delete</button>';
  root.append(menu);
  const selectedBlock = (): number | null => {
    const selection = readDOMSelection(surface) ?? editor.getSelection(); const index = selection?.anchor.blockPath[0];
    return index === undefined ? null : index;
  };
  const run = (action: string): void => {
    const index = selectedBlock(); if (index === null) return;
    const state = { document: editor.getJSON(), selection: editor.getSelection() };
    const command = action === 'duplicate' ? duplicateBlock(state, index) : action === 'delete' ? deleteBlock(state, index) : moveBlock(state, index, action === 'move-up' ? index - 1 : index + 1);
    if (command) { editor.dispatch(command); editor.focus(); }
    menu.hidden = true;
  };
  const keydown = (event: KeyboardEvent): void => {
    if (editor.disabled || editor.readOnly || event.defaultPrevented) return;
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); menu.hidden = true; surface.focus(); return; }
    if (event.key === 'F2') { event.preventDefault(); menu.hidden = false; menu.focus(); return; }
    if (!menu.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); run(event.key === 'ArrowUp' ? 'move-up' : 'move-down'); }
  };
  const click = (event: Event): void => { const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action; if (action) run(action); };
  surface.addEventListener('keydown', keydown); menu.addEventListener('click', click);
  const controller = { destroy() { surface.removeEventListener('keydown', keydown); menu.removeEventListener('click', click); menu.remove(); installed.delete(editor); } };
  installed.set(editor, controller); return controller;
}

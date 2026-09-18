import { readDOMSelection, decodeARTPath } from '@arichtext/dom';
import { deleteBlock, duplicateBlock, moveBlock } from '@arichtext/engine/blocks';
import { insertText } from '@arichtext/engine/commands';
import { transaction } from '@arichtext/engine';
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
  const handles = editor.ownerDocument.createElement('div');
  handles.setAttribute('part', 'block-handles'); handles.setAttribute('aria-label', 'Block controls');
  root.append(handles);
  let dragFrom: number | null = null;
  let dragged = false;
  const finishDrag = (): void => {
    if (dragFrom === null) return;
    const from = dragFrom; dragFrom = null;
    if (dragged) {
      const state = { document: editor.getJSON(), selection: editor.getSelection() };
      const blocks = [...surface.querySelectorAll<HTMLElement>('[data-art-text-block]')];
      const y = lastPointerY ?? 0;
      const target = blocks.find(block => { const rect = block.getBoundingClientRect(); return rect.top <= y && y <= rect.bottom; });
      const to = target?.getAttribute('data-art-block-path'); const index = to ? decodeARTPath(to)[0] : undefined;
      if (index !== undefined && index !== from) { const command = moveBlock(state, from, index); if (command) editor.dispatch(command); }
    }
    dragged = false; renderHandles();
  };
  let lastPointerY: number | null = null;
  const pointerMove = (event: PointerEvent): void => { if (dragFrom === null) return; dragged = true; lastPointerY = event.clientY; };
  const pointerUp = (): void => finishDrag();
  editor.ownerDocument.addEventListener('pointermove', pointerMove, true);
  editor.ownerDocument.addEventListener('pointerup', pointerUp, true);
  const renderHandles = (): void => {
    handles.replaceChildren();
    if (editor.disabled || editor.readOnly) return;
    for (const block of surface.querySelectorAll<HTMLElement>('[data-art-text-block]')) {
      const encoded = block.getAttribute('data-art-block-path'); if (!encoded) continue;
      const button = editor.ownerDocument.createElement('button');
      button.type = 'button'; button.textContent = '⋮'; button.setAttribute('aria-label', 'Block actions');
      button.dataset.blockPath = encoded; button.style.position = 'fixed';
      const rect = block.getBoundingClientRect(); button.style.left = `${Math.max(2, rect.left - 28)}px`; button.style.top = `${rect.top}px`;
      button.addEventListener('pointerdown', event => { if (event.button !== 0) return; dragFrom = decodeARTPath(encoded)[0] ?? null; lastPointerY = event.clientY; dragged = false; event.preventDefault(); });
      button.addEventListener('click', () => {
        if (dragged) return;
        const path = decodeARTPath(encoded); const point = { blockPath: path, offset: 0 };
        editor.dispatch({ operations: [], selection: { anchor: point, head: point } }); menu.hidden = false; menu.focus();
      });
      handles.append(button);
    }
  };
  const observer = new MutationObserver(renderHandles); observer.observe(surface, { childList: true, subtree: true });
  editor.ownerDocument.defaultView?.addEventListener('resize', renderHandles);
  editor.ownerDocument.addEventListener('scroll', renderHandles, true);
  renderHandles();
  let slashOpen = false;
  const openSlash = (): void => {
    slashOpen = true; menu.hidden = false; menu.innerHTML = '<button type="button" data-action="slash-paragraph">Paragraph</button><button type="button" data-action="slash-heading">Heading 1</button>'; menu.focus();
  };
  const closeSlash = (literal: boolean): void => {
    if (!slashOpen) return; slashOpen = false; menu.hidden = true;
    if (literal) { const state = { document: editor.getJSON(), selection: editor.getSelection() }; const command = insertText(state, '/'); if (command) editor.dispatch(command); }
    surface.focus();
  };
  const selectedBlock = (): number | null => {
    const selection = readDOMSelection(surface) ?? editor.getSelection(); const index = selection?.anchor.blockPath[0];
    return index === undefined ? null : index;
  };
  const run = (action: string): void => {
    if (action.startsWith('slash-')) {
      const selection = editor.getSelection(); const path = selection?.anchor.blockPath;
      if (path) {
        const command = transaction().setBlockType(path, action === 'slash-heading' ? 'heading' : 'paragraph', action === 'slash-heading' ? 1 : undefined).setMeta('command', 'slashInsert').build();
        editor.dispatch(command);
      }
      slashOpen = false; menu.hidden = true; editor.focus(); return;
    }
    const index = selectedBlock(); if (index === null) return;
    const state = { document: editor.getJSON(), selection: editor.getSelection() };
    const command = action === 'duplicate' ? duplicateBlock(state, index) : action === 'delete' ? deleteBlock(state, index) : moveBlock(state, index, action === 'move-up' ? index - 1 : index + 1);
    if (command) { editor.dispatch(command); editor.focus(); }
    menu.hidden = true;
  };
  const keydown = (event: KeyboardEvent): void => {
    if (editor.disabled || editor.readOnly || event.defaultPrevented) return;
    if (event.key === 'Escape' && slashOpen) { event.preventDefault(); closeSlash(true); return; }
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); menu.hidden = true; surface.focus(); return; }
    if (event.key === '/' && !slashOpen) {
      const selection = editor.getSelection(); const point = selection?.anchor;
      const node = point ? editor.getJSON().content[point.blockPath[0]!] : undefined;
      if (selection && point && selection.head.offset === 0 && node?.type === 'paragraph' && (!node.content || node.content.length === 0)) { event.preventDefault(); openSlash(); return; }
    }
    if (event.key === 'F2') { event.preventDefault(); menu.hidden = false; menu.focus(); return; }
    if (!menu.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); run(event.key === 'ArrowUp' ? 'move-up' : 'move-down'); }
  };
  const click = (event: Event): void => { const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action; if (action) run(action); };
  surface.addEventListener('keydown', keydown); menu.addEventListener('click', click);
  const controller = { destroy() { surface.removeEventListener('keydown', keydown); menu.removeEventListener('click', click); observer.disconnect(); editor.ownerDocument.defaultView?.removeEventListener('resize', renderHandles); editor.ownerDocument.removeEventListener('scroll', renderHandles, true); editor.ownerDocument.removeEventListener('pointermove', pointerMove, true); editor.ownerDocument.removeEventListener('pointerup', pointerUp, true); handles.remove(); menu.remove(); installed.delete(editor); } };
  installed.set(editor, controller); return controller;
}

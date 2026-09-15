// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ARTListNode } from '../../core/src/index.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import { enableListEditing } from '../src/index.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

function setup() {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setHTML('<ul><li>hello</li></ul>');
  editor.dispatch(transaction().setSelection(textSelection(textPoint([0, 0, 0], 2))).build());
  const controller = enableListEditing(editor);
  const surface = editor.shadowRoot!.querySelector<HTMLElement>('[part="editor"]')!;
  return { editor, controller, surface };
}

function enter(surface: HTMLElement, options: InputEventInit = {}) {
  const event = new InputEvent('beforeinput', {
    inputType: 'insertParagraph', bubbles: true, composed: true, cancelable: true, ...options,
  });
  surface.dispatchEvent(event);
  return event;
}

describe('optional list keyboard adapter', () => {
  it('splits once, preserves selection, and undoes/redoes as one edit', () => {
    const { editor, surface } = setup();
    const before = editor.getJSON();
    expect(enter(surface).defaultPrevented).toBe(true);
    expect((editor.getJSON().content[0] as ARTListNode).content).toHaveLength(2);
    expect(editor.getSelection()).toEqual(textSelection(textPoint([0, 1, 0], 0)));
    const after = editor.getJSON();
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(editor.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(after);
  });

  it.each(['readOnly', 'disabled'] as const)('does not edit a %s editor', (property) => {
    const { editor, surface } = setup();
    const before = editor.getJSON();
    editor[property] = true;
    enter(surface);
    expect(editor.getJSON()).toEqual(before);
  });

  it('leaves already handled input and IME input alone', () => {
    const { editor, surface } = setup();
    const before = editor.getJSON();
    const event = new InputEvent('beforeinput', { inputType: 'insertParagraph', cancelable: true });
    event.preventDefault();
    surface.dispatchEvent(event);
    enter(surface, { isComposing: true });
    enter(surface, { cancelable: false });
    surface.dispatchEvent(new CompositionEvent('compositionstart'));
    enter(surface);
    expect(editor.getJSON()).toEqual(before);
  });

  it('leaves complex list items unchanged and reports unsupported input', () => {
    const { editor, surface } = setup();
    editor.setHTML('<ul><li><p>one</p><p>two</p></li></ul>');
    editor.dispatch(transaction().setSelection(textSelection(textPoint([0, 0, 0], 1))).build());
    const before = editor.getJSON();
    let unsupported = 0;
    editor.addEventListener('list-editing-unsupported', () => unsupported++);
    expect(enter(surface).defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(unsupported).toBe(1);
  });

  it('installs once and removes listeners when destroyed', () => {
    const { editor, surface, controller } = setup();
    expect(enableListEditing(editor)).toBe(controller);
    controller.destroy();
    controller.destroy();
    enter(surface);
    // The base editor splits paragraphs inside the same item without the adapter.
    const list = editor.getJSON().content[0] as ARTListNode;
    expect(list.content).toHaveLength(1);
    expect(list.content[0]!.content).toHaveLength(2);
    expect(enableListEditing(editor)).not.toBe(controller);
  });
});

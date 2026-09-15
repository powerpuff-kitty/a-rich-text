// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { ARichTextElement } from '../src/index.js';

function createEditor(): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  return editor;
}

function surface(editor: ARichTextElement): HTMLDivElement {
  return editor.shadowRoot!.querySelector<HTMLDivElement>('[part="editor"]')!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<a-rich-text> accessibility semantics', () => {
  it('forwards host labelling/description/validity semantics to the focusable textbox', () => {
    const editor = document.createElement('a-rich-text') as ARichTextElement;
    editor.setAttribute('aria-label', 'Article body');
    editor.setAttribute('aria-labelledby', 'body-label');
    editor.setAttribute('aria-describedby', 'body-help');
    editor.setAttribute('aria-required', 'true');
    editor.setAttribute('aria-invalid', 'grammar');
    editor.setAttribute('placeholder', 'Write something…');
    document.body.append(editor);

    const editable = surface(editor);
    expect(editable.getAttribute('role')).toBe('textbox');
    expect(editable.getAttribute('aria-multiline')).toBe('true');
    expect(editable.getAttribute('aria-label')).toBe('Article body');
    expect(editable.getAttribute('aria-labelledby')).toBe('body-label');
    expect(editable.getAttribute('aria-describedby')).toBe('body-help');
    expect(editable.getAttribute('aria-required')).toBe('true');
    expect(editable.getAttribute('aria-invalid')).toBe('grammar');
    expect(editable.getAttribute('aria-placeholder')).toBe('Write something…');
  });

  it('keeps forwarded ARIA attributes synchronized dynamically', () => {
    const editor = createEditor();
    const editable = surface(editor);

    editor.setAttribute('aria-label', 'First');
    editor.setAttribute('aria-required', 'true');
    expect(editable.getAttribute('aria-label')).toBe('First');
    expect(editable.getAttribute('aria-required')).toBe('true');

    editor.setAttribute('aria-label', 'Second');
    editor.removeAttribute('aria-required');
    editor.setAttribute('aria-invalid', 'true');
    expect(editable.getAttribute('aria-label')).toBe('Second');
    expect(editable.hasAttribute('aria-required')).toBe(false);
    expect(editable.getAttribute('aria-invalid')).toBe('true');

    editor.removeAttribute('aria-label');
    editor.removeAttribute('aria-invalid');
    expect(editable.hasAttribute('aria-label')).toBe(false);
    expect(editable.hasAttribute('aria-invalid')).toBe(false);
  });

  it('mirrors readonly/disabled and placeholder state without making disabled content editable', () => {
    const editor = createEditor();
    const editable = surface(editor);

    editor.setAttribute('placeholder', 'Describe the result');
    expect(editable.dataset.placeholder).toBe('Describe the result');
    expect(editable.getAttribute('aria-placeholder')).toBe('Describe the result');

    editor.readOnly = true;
    expect(editable.contentEditable).toBe('false');
    expect(editable.getAttribute('aria-readonly')).toBe('true');
    expect(editable.getAttribute('aria-disabled')).toBe('false');

    editor.readOnly = false;
    editor.disabled = true;
    expect(editable.contentEditable).toBe('false');
    expect(editable.getAttribute('aria-disabled')).toBe('true');

    editor.disabled = false;
    expect(editable.contentEditable).toBe('true');
    expect(editable.getAttribute('aria-disabled')).toBe('false');
  });

  it('removes aria-placeholder when placeholder is removed', () => {
    const editor = createEditor();
    const editable = surface(editor);
    editor.setAttribute('placeholder', 'Temporary');
    expect(editable.getAttribute('aria-placeholder')).toBe('Temporary');

    editor.removeAttribute('placeholder');
    expect(editable.hasAttribute('aria-placeholder')).toBe(false);
    expect(editable.dataset.placeholder).toBe('');
  });
});

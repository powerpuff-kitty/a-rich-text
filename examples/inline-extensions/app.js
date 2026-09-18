import '../a-rich-text.js';
import { createExtensionRegistry } from '@arichtext/extensions';
import { insertInlineNode } from '@arichtext/engine/commands';
const editor = document.querySelector('#editor');
const status = document.querySelector('#status');
const registry = createExtensionRegistry([{ name: 'demo:people', inlines: [{
  name: 'demo:mention', validate: node => typeof node.attrs?.personId === 'string',
  renderDOM(node, { document }) {
    const label = document.createElement('strong'); label.textContent = node.fallbackText; return label;
  },
}] }]);
editor.extensions = registry;
editor.setText('Hello ');
document.querySelector('#insert').addEventListener('pointerdown', event => event.preventDefault());
document.querySelector('#insert').addEventListener('click', () => {
  const command = insertInlineNode({ document: editor.getJSON(), selection: editor.getSelection() }, { type: 'extensionInline', name: 'demo:mention', attrs: { personId: 'alice' }, fallbackText: '@Alice' });
  if (!command) { status.textContent = 'Place the caret in a paragraph first.'; return; }
  editor.dispatch(command); editor.focus(); status.textContent = 'Mention inserted.';
});
document.querySelector('#runtime').addEventListener('click', () => {
  editor.extensions = undefined; status.textContent = 'Portable mention data is preserved; the fallback label is displayed.';
});

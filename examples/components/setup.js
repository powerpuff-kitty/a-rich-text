import { enableStandardEditing } from '../a-rich-text.js';

const name = document.body.dataset.example;
const embedded = window.self !== window.top;
const editor = document.querySelector('a-rich-text, art-editor');
const toolbar = document.querySelector('a-rich-text-toolbar, art-toolbar');
const surface = editor.shadowRoot.querySelector('[part="editor"]');
enableStandardEditing(editor);
const normal = '<h2>A better place to write</h2><p>Write <strong>clearly</strong>, share ideas, and keep your content portable.</p><p>One document. <em>Your interface.</em> <a href="https://example.com/docs">Your workflow.</a></p><ul data-art-list="task"><li><input type="checkbox" checked><p>Choose your tools</p></li><li><input type="checkbox"><p>Make it your own</p></li></ul>';
editor.setHTML(normal);
if (name === 'inline-editor') toolbar.setAttribute('mode', 'inline');
if (name === 'code-highlighting') {
  editor.setHTML('<h2>Optional code highlighting</h2><pre><code class="language-javascript">// View-only decoration\nconst editor = document.querySelector("a-rich-text");\nconst data = editor.getJSON();</code></pre>');
  const { enableCodeHighlighting } = await import('../highlight.js');
  enableCodeHighlighting(editor);
}
if (name.startsWith('preset-')) { editor.preset = name.slice(7); editor.views = ''; }
if (name === 'vertical-spans') editor.setHTML('<h2>Shared milestones</h2><table><tr><td rowspan="2"><p><strong>Design</strong></p></td><td><p>Research</p></td></tr><tr><td><p>Prototype</p></td></tr><tr><td><p>Build</p></td><td><p>Deliver</p></td></tr></table>');
if (name === 'base-editor') toolbar.remove();
if (name === 'table-controls') editor.setHTML('<h2>Release checklist</h2><p>Plan the next release together.</p><table><tr><th><p>Task</p></th><th><p>Owner</p></th><th><p>Status</p></th></tr><tr><td><p>Review the draft</p></td><td><p>Alex</p></td><td><p>Ready</p></td></tr><tr><td><p>Publish the guide</p></td><td><p>Sam</p></td><td><p>In progress</p></td></tr></table>');
if (name === 'merged-cells') editor.setHTML('<h2>Project overview</h2><table><tr><td colspan="2"><p><strong>Research and design</strong></p><p>Two workstreams, one shared direction.</p></td><td><p>Build</p></td></tr><tr><td><p>Discover</p></td><td><p>Prototype</p></td><td><p>Deliver</p></td></tr></table>');
if (name.startsWith('source-')) editor.setHTML('<h2>Portable content</h2><p>Keep <strong>one document</strong> in the format your app needs.</p>');
const path = name === 'code-highlighting' ? [0] : name === 'table-controls' ? [2, 1, 0, 0] : ['merged-cells', 'vertical-spans'].includes(name) ? [1, 0, 0, 0] : [1];
const selection = { anchor: { blockPath: path, offset: 0 }, head: { blockPath: path, offset: 0 } };
function selectExample() {
  surface.focus({ preventScroll: true });
  if (name === 'inline-editor') selection.head.offset = 13;
  editor.dispatch({ operations: [], selection });
}
if (!embedded) selectExample();
if (name.startsWith('preset-')) surface.blur();
if (name === 'dropdown') {
  const component = document.querySelector('#component');
  component.style.minHeight = '240px';
  component.style.width = 'min(100%,250px)';
  component.replaceChildren();
  const select = document.createElement('a-rich-text-select');
  select.setAttribute('label', 'Text style');
  select.innerHTML = '<option value="paragraph">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>';
  component.append(select); if (!embedded) select.open();
}
if (name.startsWith('source-')) {
  editor.view = name.slice(7);
  const source = editor.shadowRoot.querySelector('[part="source"]');
  source.value += '\n';
  source.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}
function openExample() {
selectExample();
if (name === 'link-editor') {
  toolbar.shadowRoot.querySelector('[data-action="link"]').click();
  toolbar.shadowRoot.querySelector('[data-role="link-input"]').value = 'https://example.com/guide';
}
if (name === 'find-replace') {
  editor.openFindReplace('your');
  editor.shadowRoot.querySelector('[data-find="replacement"]').value = 'our';
}
if (name === 'code-editor') {
  editor.openCodeEditor();
  editor.shadowRoot.querySelector('[data-code-language]').value = 'typescript';
  editor.shadowRoot.querySelector('[data-code-text]').value = "const editor = document.querySelector('a-rich-text, art-editor');\neditor.setHTML('<p>Hello, world!</p>');";
}
if (name === 'image-editor') {
  editor.openImageEditor();
  for (const [key, value] of Object.entries({ src: '/images/team-workshop.jpg', alt: 'Team members reviewing a draft at a workshop', width: '960', height: '640' })) {
    editor.shadowRoot.querySelector(`[data-image="${key}"]`).value = value;
  }
}
if (name === 'focus-mode') editor.toggleFocusMode(true);
}
const previews = { 'inline-editor': 'Show inline toolbar', 'link-editor': 'Open link editor', 'find-replace': 'Open find and replace', 'code-editor': 'Open code editor', 'image-editor': 'Open image editor', 'focus-mode': 'Enter focus mode' };
if (embedded && previews[name]) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = previews[name];
  button.style.cssText = 'font:inherit;margin-bottom:12px;padding:6px 12px;cursor:pointer';
  button.addEventListener('click', openExample);
  document.querySelector('#component').prepend(button);
} else if (!embedded && previews[name]) openExample();
document.body.dataset.ready = 'true';

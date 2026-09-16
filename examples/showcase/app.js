import { enableStandardEditing, detectInputFormat } from './a-rich-text.js';
import { quillDeltaProfile } from './quill-delta.js';
const editor = document.querySelector('#editor');
const toolbar = document.querySelector('a-rich-text-toolbar');
editor.registerFormatProfile(quillDeltaProfile);
editor.profiles = editor.formatProfiles.filter(profile => profile.canExport).map(profile => profile.id);
const outputSelect = document.querySelector('#output-format');
for (const profile of editor.formatProfiles.filter(profile => profile.canExport)) {
 const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.label;
 outputSelect.append(option);
}
enableStandardEditing(editor);
const notes = { default: 'Default: a framed editor with a tinted toolbar and comfortable spacing.', minimal: 'Minimal: an open, compact writing surface with only a bottom rule.', document: 'Document: a paper surface with serif text, generous margins and a soft shadow, at the same width.' };
const toolsets = { basic: 'paragraph heading bold italic link bullet-list ordered-list undo redo', review: 'bold italic strike link find-replace undo redo' };
const samples = {
 empty: '<p></p>',
 writing: '<h2>A better place to write</h2><p>Write <strong>clearly</strong>, share ideas, and keep your content portable.</p><p>Select a few words to try the inline toolbar.</p><ul data-art-list="task"><li><input type="checkbox" checked><p>Choose your tools</p></li><li><input type="checkbox"><p>Make it your own</p></li></ul>',
 table: '<h2>Release checklist</h2><table><tr><th><p>Task</p></th><th><p>Owner</p></th><th><p>Status</p></th></tr><tr><td><p>Review the draft</p></td><td><p>Alex</p></td><td><p>Ready</p></td></tr><tr><td><p>Publish the guide</p></td><td><p>Sam</p></td><td><p>In progress</p></td></tr></table>',
 code: '<h2>A small, optional highlighter</h2><p>Enable highlighting above. The addon decorates code without changing exported content.</p><pre><code class="language-javascript">// Keep your content portable\nconst editor = document.querySelector("a-rich-text");\nconst documentData = editor.getJSON();</code></pre>'
};
function snippet() { document.querySelector('#integration').textContent = `<a-rich-text-shell>\n  <a-rich-text-toolbar for="editor" mode="${toolbar.getAttribute('mode') || 'traditional'}"></a-rich-text-toolbar>\n  <a-rich-text id="editor" preset="${editor.preset}"${editor.hasAttribute('tools') ? `\n    tools="${editor.getAttribute('tools')}"` : ''}\n    name="body" format="${editor.format}" profile="${editor.profile || `art:${editor.format}-v1`}"
    profiles="${editor.profiles.join(' ')}" profile-loss="${editor.getAttribute('profile-loss') || 'reject'}"
    views="visual html markdown json text" source-update="${editor.sourceUpdate}"\n    aria-label="Document">\n  </a-rich-text>\n</a-rich-text-shell>

<script type="module">
import { enableStandardEditing } from './a-rich-text.js';
import { quillDeltaProfile } from './quill-delta.js';
const editor = document.querySelector('#editor');
editor.registerFormatProfile(quillDeltaProfile);
enableStandardEditing(editor);
</script>`; }
document.querySelector('#appearance').addEventListener('change', event => { editor.preset = event.target.value; document.querySelector('#preset-note').textContent = notes[editor.preset]; snippet(); });
document.querySelector('#mode').addEventListener('change', event => { toolbar.setAttribute('mode', event.target.value); snippet(); });
document.querySelector('#tools').addEventListener('change', event => { if (event.target.value === 'all') editor.removeAttribute('tools'); else editor.tools = toolsets[event.target.value]; snippet(); });
document.querySelector('#sample').addEventListener('change', event => { editor.setHTML(samples[event.target.value]); editor.focus(); });
let highlighting;
document.querySelector('#highlight').addEventListener('change', async event => { const input = event.target; if (input.checked) { const { enableCodeHighlighting } = await import('./highlight.js'); if (input.checked && !highlighting) highlighting = enableCodeHighlighting(editor); } else { highlighting?.destroy(); highlighting = undefined; } });
document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); document.querySelector('#submitted').value = new FormData(event.target).get('body'); });
snippet();

document.querySelector('#source-update').addEventListener('change', event => { editor.sourceUpdate = event.target.value; snippet(); });
document.querySelector('#formatting').addEventListener('change', async event => {
  const input = event.target;
  if (!input.checked) { editor.sourceFormatter = undefined; return; }
  try { const { formatSource } = await import('./format.js'); if (input.checked) editor.sourceFormatter = formatSource; }
  catch { input.checked = false; document.querySelector('#detected').textContent = 'The optional formatter could not be loaded. Try again.'; }
});
document.querySelector('#detect-input').addEventListener('input', event => {
  const result = detectInputFormat(event.target.value);
  document.querySelector('#detected').textContent = `${result.format} · ${result.profile} · ${result.confidence}. ${result.supported ? 'Supported by the built-in converter.' : 'No compatible built-in converter.'}${result.alternatives.length ? ` Alternatives: ${result.alternatives.join(', ')}.` : ''}`;
});

function outputNote() {
 const id = outputSelect.value;
 const profile = editor.formatProfiles.find(profile => profile.id === id);
 const result = editor.exportProfile(id);
 const notes = result.diagnostics.map(note => note.message).join(' ');
 document.querySelector('#output-note').textContent = `Submit output: ${profile?.label || id}.${notes ? ' ' + notes : ''}`;
}
outputSelect.addEventListener('change', () => {
 const profile = editor.formatProfiles.find(profile => profile.id === outputSelect.value);
 if (!profile) return;
 editor.removeAttribute('profile'); editor.format = profile.family; editor.profile = profile.id;
 document.querySelector('#submitted').value = '';
 outputNote(); snippet();
});
document.querySelector('#output-loss').addEventListener('change', event => {
 editor.setAttribute('profile-loss', event.target.checked ? 'allow' : 'reject'); outputNote(); snippet();
});
editor.addEventListener('input', outputNote);
editor.addEventListener('change', outputNote);
document.querySelector('#sample').addEventListener('change', outputNote);
outputNote();

# Use A Rich Text locally

The standard editor includes the Web Component, toolbar, and optional list/table
keyboard behavior. It runs entirely in the browser. This development snapshot is
ready for local integration and evaluation; it has not been published to npm.

## Try the standalone component

From this repository:

```sh
pnpm install --frozen-lockfile
pnpm build:distribution
python3 -m http.server 8080 --directory dist/browser
```

Open `http://localhost:8080`. The demo has a working form, toolbar and serialized
output. Copy `dist/browser/a-rich-text.js` and `LICENSE` into your application's
static assets; no import map, framework or runtime dependencies are needed.

```html
<form>
  <span id="body-label">Body</span>
  <a-rich-text-toolbar for="body"></a-rich-text-toolbar>
  <a-rich-text id="body" name="body" format="html"
    aria-labelledby="body-label" required></a-rich-text>
  <button>Save</button>
</form>
<script type="module">
  import { enableStandardEditing } from './a-rich-text.js';
  const editor = document.querySelector('#body');
  const controller = enableStandardEditing(editor);
  editor.setHTML('<p>Hello <strong>world</strong></p>');
  editor.addEventListener('input', () => console.log(editor.getJSON()));
  // Call controller.destroy() when permanently disposing this integration.
</script>
```

## Install packages into another application

```sh
# In this repository: builds, checks and creates dist/packages/*.tgz
pnpm verify:local

# In your application, replace the absolute path:
npm install /absolute/path/a-rich-text/dist/packages/*.tgz
```

Install the full local tarball set together so unpublished workspace dependencies
resolve locally. Then use your application's bundler:

```ts
import { enableStandardEditing, type ARichTextElement } from '@arichtext/editor';
const editor = document.querySelector<ARichTextElement>('a-rich-text')!;
const controller = enableStandardEditing(editor);
controller.setLink('https://example.com'); // Selection or subsequent caret typing
controller.toggleList('bullet');
controller.insertTable({ rows: 2, columns: 3 });
```

These controller commands return `false` when no valid selection is available,
editing is locked, or the controller is destroyed. Invalid link URLs/table
dimensions throw. `removeLink()` and `setTaskChecked(boolean)` are also available.

Importing registers `<a-rich-text>` and `<a-rich-text-toolbar>` in a browser.
Module imports are safe during server rendering; construct elements and install
controllers on the client. For smaller integrations, use `@arichtext/web-component`
and opt into individual adapters. Styles are encapsulated in Shadow DOM and can
be customized with the documented CSS properties and `::part(editor)`.

## Editing contract

- Bold/italic/underline: Ctrl or Command+B/I/U. Undo: Ctrl or Command+Z;
  redo: Shift+Ctrl or Command+Z (also Ctrl+Y).
- Link: select text or place the caret, then Ctrl or Command+K. At a caret,
  Apply/Remove affects subsequent typing; select existing linked text to edit it.
- Lists: Enter splits an item, including trailing blocks. Enter in an empty
  single-block item exits. Tab nests under the previous sibling, Shift+Tab lifts;
  Backspace at the first block's start lifts the item without deleting its text.
  Tab at the first item can leave the editor.
- Tables: toolbar controls insert and resize rectangular tables. Tab/Shift+Tab
  move through cells; at the edges they leave the editor. Merged cells are read
  and rendered but are not supported by these editing commands.
- `setMark(mark)` and `removeMark(type)` act on selected text or subsequent caret
  typing. `disabled`/`readOnly` block user actions. Explicit setters and
  `dispatch()` remain application-controlled APIs, including while locked.
- Save canonical `getJSON()` for lossless persistence. `getHTML()`, `getMarkdown()`
  and `getText()` provide interchange formats; conversion can lose unsupported
  features. `value` follows `format`; it does not change the canonical model.

## Current limits

Version `0.0.0` is an unstable development snapshot. Paste replacement currently
requires a selection in one text block. Multi-block list selections, merged-cell
editing, code-block authoring controls, and physical-device/real-IME validation
remain outside the verified integration surface. Native composition fallback
reconciles the document and resets undo history. Mobile browser emulation is not
physical-device evidence. See [quality gates](quality.md) before production use.

No account, API key, telemetry or mandatory network request is required. Images
or links loaded by your own document may naturally access their URLs.

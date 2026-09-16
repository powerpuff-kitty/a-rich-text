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
output. Copy `dist/browser/a-rich-text.js`, `LICENSE` and `THIRD_PARTY_NOTICES.txt` into your application's
static assets; no import map, framework or runtime dependencies are needed.

```html
<form>
  <span id="body-label">Body</span>
  <a-rich-text-shell>
  <a-rich-text-toolbar for="body"></a-rich-text-toolbar>
  <a-rich-text id="body" name="body" format="html"
    views="visual html markdown json"
    aria-labelledby="body-label" required></a-rich-text>
  </a-rich-text-shell>
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

Importing registers `<a-rich-text>`, `<a-rich-text-toolbar>`,
`<a-rich-text-shell>` and `<a-rich-text-select>` in a browser.
Module imports are safe during server rendering; construct elements and install
controllers on the client. For smaller integrations, use `@arichtext/web-component`
and opt into individual adapters. Styles are encapsulated in Shadow DOM and can
be customized with [CSS properties, parts, custom buttons and Vue/Tailwind examples](customization.md).

## Editing contract

Use [`tools`, `views` and `view` attributes](editor-configuration.md) to configure
the toolbar and source editors. `format` continues to control form serialization.

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

See the [remaining-work summary](remaining-work.md) for tracked follow-ups.

## Current limits

Version `0.0.0` is an unstable development snapshot. Paste replacement currently
requires a selection in one text block. Multi-block list selections, merged-cell
editing and physical-device/real-IME validation
remain outside the verified integration surface. Native composition fallback
reconciles the document and resets undo history. Mobile browser emulation is not
physical-device evidence. See [quality gates](quality.md) before production use.

No account, API key, telemetry or mandatory network request is required. Images
or links loaded by your own document may naturally access their URLs.

## Short tag aliases

The same imports also register concise tag names. Both naming styles can be used
together; attributes, properties, events, CSS variables, Shadow Parts, native
forms and controller APIs are identical.

| Existing tag | Short alias | Package |
| --- | --- | --- |
| `a-rich-text` | `art-editor` | `@arichtext/web-component` |
| `a-rich-text-select` | `art-select` | `@arichtext/web-component` |
| `a-rich-text-toolbar` | `art-toolbar` | `@arichtext/ui` |
| `a-rich-text-shell` | `art-shell` | `@arichtext/ui` |

`@arichtext/editor` includes both packages and registers all eight names.

```html
<art-shell>
  <art-toolbar for="body"></art-toolbar>
  <art-editor id="body" name="body" aria-label="Document"
    views="html markdown json text" source-update="auto"></art-editor>
</art-shell>
```

Continue calling `enableStandardEditing(editor)` when using the standard list/table
keyboard controller. In plain HTML custom elements need closing tags; `<art-editor />`
is not a self-closing HTML element. Vue SFC templates can use their normal component
syntax, provided the compiler recognizes the tags as custom elements.

The short names are aliases, not a separate smaller editor build. Existing class
exports such as `ARichTextElement` remain valid, including `instanceof`; TypeScript
also infers the element type from `document.createElement('art-editor')`. A short
alias has its own registered subclass because the browser does not allow a single
constructor to be registered under two names. Registration is idempotent and does
not overwrite an occupied custom-element name.

Update application CSS selectors and Vue's `isCustomElement` allowlist when using
the short tags. Built-in shell styles handle both naming styles. For example:

```js
isCustomElement: tag => tag.startsWith('a-rich-text') ||
  ['art-editor', 'art-toolbar', 'art-shell', 'art-select'].includes(tag)
```

Try [the short-tag example](http://localhost:8080/components/short-tags.html).

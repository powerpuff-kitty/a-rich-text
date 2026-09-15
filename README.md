# a rich text

**A browser-first rich-text editor that behaves like a native HTML control.**

The primary integration surface is `<a-rich-text>`. The open client runtime is designed to work without an account, API key, framework runtime, mandatory server, or mandatory network request. Optional paid products focus on managed infrastructure rather than locking ordinary editor features behind a subscription.

> Status: early development. The repository is not ready for production use yet.

## Direction

- native Web Component first
- framework-independent TypeScript engine
- canonical versioned ART JSON document model
- deterministic client-side HTML / Markdown / plain-text conversion
- format-selectable native form values
- local-first drafts and history
- explicit browser selection/input adapter
- pluggable extensions, persistence, uploads, collaboration and AI
- accessibility, IME correctness, security and performance as release gates

Core architecture docs:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/engine.md`](docs/engine.md)
- [`docs/dom-adapter.md`](docs/dom-adapter.md)
- [`docs/web-component-runtime.md`](docs/web-component-runtime.md)
- [`docs/extensions.md`](docs/extensions.md)
- [`docs/conversion.md`](docs/conversion.md)
- [`docs/forms.md`](docs/forms.md)
- [`docs/local-first.md`](docs/local-first.md)
- [`docs/clipboard.md`](docs/clipboard.md)
- [`docs/media.md`](docs/media.md)
- [`docs/media-editor.md`](docs/media-editor.md)

## Workspace

```text
packages/core                   @arichtext/core
packages/engine                 @arichtext/engine
packages/dom                    @arichtext/dom
packages/extensions             @arichtext/extensions
packages/html                   @arichtext/html
packages/markdown               @arichtext/markdown
packages/clipboard              @arichtext/clipboard
packages/persistence-indexeddb  @arichtext/persistence-indexeddb
packages/media                  @arichtext/media
packages/media-editor           @arichtext/media-editor
packages/ui                     @arichtext/ui
packages/web-component          @arichtext/web-component
```

All editor packages are prepared for public npm publication. The GitHub repository can remain private during early development; the long-term direction is to open-source the client/editor monorepo while keeping optional managed cloud infrastructure separate.

## Web Component

```html
<form method="post">
  <a-rich-text
    name="body"
    format="markdown"
    placeholder="Write something…"
  ></a-rich-text>
  <button>Submit</button>
</form>

<script type="module">
  import '@arichtext/web-component'
</script>
```

`format` controls the serialized native form value:

```text
html      rich HTML (default)
json      serialized ART JSON
markdown  Markdown
text      plain text
```

The semantic document remains ART regardless of the selected form format.

The Web Component package is safe to **import during SSR**. It only auto-registers when `customElements` exists; constructing an editor instance still requires a real browser DOM.

## Canonical editing state

Normal supported editing runs through `@arichtext/engine`, not through HTML parsing:

```ts
import { textPoint, textSelection, transaction } from '@arichtext/engine';

editor.dispatch(
  transaction()
    .setSelection(textSelection(textPoint([0], 0), textPoint([0], 5)))
    .toggleMark(textPoint([0], 0), textPoint([0], 5), { type: 'bold' })
    .build(),
);

editor.undo();
editor.redo();
```

The engine currently handles ordinary text input, inline formatting, paragraph splitting, grapheme-aware Backspace/Delete, compatible sibling joins and ART fragment insertion. The DOM adapter maps logical block-relative selections to/from browser selections. IME composition and unsupported native browser mutations use an explicit sanitized reconciliation path rather than silently becoming canonical state.

## Extensions

Custom application blocks and marks live in portable ART envelopes while behavior stays in installed code:

```ts
import { createExtensionRegistry } from '@arichtext/extensions';

const extensions = createExtensionRegistry([
  {
    name: 'acme:properties',
    blocks: [{
      name: 'acme:property-card',
      renderDOM(node, { document }) {
        const element = document.createElement('article');
        element.textContent = node.fallbackText ?? 'Property';
        return element;
      },
    }],
  },
]);

editor.extensions = extensions;
```

If the registry is unavailable, the custom ART data remains valid/serializable and falls back to portable text or nested ART content. See [`docs/extensions.md`](docs/extensions.md).

## Conversion API

```ts
editor.getJSON();
editor.setJSON(document);
editor.serializeJSON();

editor.getHTML();
editor.setHTML(html);

editor.getMarkdown();
editor.setMarkdown(markdown);

editor.getText();
editor.setText(text);
```

HTML import is allowlist-based: executable/embed nodes and unsafe URL protocols are discarded when content is converted into ART. Installed extensions can optionally provide safe semantic HTML parsers/serializers; generic A Rich Text extension envelopes remain the portable fallback.

## Optional UI

The base editor stays usable without a toolbar. `@arichtext/ui` supplies an optional framework-independent toolbar:

```html
<a-rich-text-toolbar for="editor"></a-rich-text-toolbar>
<a-rich-text id="editor"></a-rich-text>
```

Formatting/history actions use engine commands rather than `document.execCommand`.

## Local-first drafts

```ts
import {
  createAutosave,
  IndexedDBPersistence,
} from '@arichtext/persistence-indexeddb';

const persistence = new IndexedDBPersistence();
const autosave = createAutosave(persistence, {
  documentId: 'article-123',
  getDocument: () => editor.getJSON(),
});

editor.addEventListener('input', () => autosave.schedule());
```

Documents, snapshots and autosave stay entirely in the browser unless the integrating application chooses to sync them elsewhere.

## Media

Browser image validation/resizing/re-encoding lives in the optional `@arichtext/media` package. Applications provide their own upload provider. `@arichtext/media-editor` connects file paste/drop/picker flows to the editor without adding media processing code to the base Web Component bundle.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

The regression suite covers ART validation, conversion/sanitization, SSR imports, format interoperability, local persistence, engine transactions/history, safe DOM rendering, selection mapping, clipboard behavior, extension registries and engine-backed Web Component behavior.

## Business model principle

**Free software, paid infrastructure.**

Features that can reasonably execute on the user's device should stay client-side. Future managed services may include realtime relay/sync, durable storage, high-fidelity document conversion, managed AI routing, backups, enterprise audit/SSO and support.

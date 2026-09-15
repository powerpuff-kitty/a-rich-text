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
- pluggable persistence, uploads, collaboration and AI
- accessibility, IME correctness, security and performance as release gates

Core architecture docs:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/engine.md`](docs/engine.md)
- [`docs/dom-adapter.md`](docs/dom-adapter.md)
- [`docs/web-component-runtime.md`](docs/web-component-runtime.md)
- [`docs/conversion.md`](docs/conversion.md)
- [`docs/forms.md`](docs/forms.md)
- [`docs/local-first.md`](docs/local-first.md)

## Workspace

```text
packages/core                   @arichtext/core
packages/engine                 @arichtext/engine
packages/dom                    @arichtext/dom
packages/html                   @arichtext/html
packages/markdown               @arichtext/markdown
packages/persistence-indexeddb  @arichtext/persistence-indexeddb
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

The DOM adapter maps logical block-relative selections to/from browser selections. Browser behaviors not yet implemented as deterministic ART operations—such as IME composition and structural editing—use an explicit sanitized reconciliation path rather than silently becoming canonical state.

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

HTML import is allowlist-based: executable/embed nodes and unsafe URL protocols are discarded when content is converted into ART.

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

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

The regression suite covers ART validation, conversion/sanitization, SSR imports, format interoperability, local persistence, engine transactions/history, safe DOM rendering, selection mapping and engine-backed Web Component behavior.

## Business model principle

**Free software, paid infrastructure.**

Features that can reasonably execute on the user's device should stay client-side. Future managed services may include realtime relay/sync, durable storage, high-fidelity document conversion, managed AI routing, backups, enterprise audit/SSO and support.

# a rich text

**A browser-first rich-text editor that behaves like a native HTML control.**

The primary integration surface is `<a-rich-text>`. The open client runtime is designed to work without an account, API key, framework runtime, mandatory server, or mandatory network request. Optional paid products focus on managed infrastructure rather than locking ordinary editor features behind a subscription.

> Status: locally installable development snapshot. Start with the [integration guide](docs/getting-started.md). Production release gates still require physical-device, screen-reader and real-IME evidence.

## Screenshots

![Standard rich-text editor with formatting toolbar, source views and task list](docs/screenshots/standard-editor.png)

[View every component and editing surface](docs/component-gallery.md), including
Default, Minimal and Document presets, source formats, dialogs, focus mode, mobile
and custom Vue/Tailwind controls. Choose an appearance with `preset="document"`;
see [preset configuration](docs/customization.md#appearance-presets).

## Try it

```sh
pnpm install --frozen-lockfile
pnpm build:distribution
python3 -m http.server 8080 --directory dist/browser
```

Open `http://localhost:8080` for the standalone editor and working form. The
distribution also contains a single ES module you can copy into an application.
Run `pnpm verify:local` to validate code, browsers and installable package tarballs
locally. GitHub Actions is disabled.

## Direction

- native Web Component first
- framework-independent TypeScript engine
- canonical versioned ART JSON document model
- deterministic client-side HTML / Markdown / plain-text conversion
- format-selectable native form values
- local-first drafts and history
- explicit browser selection/input adapter
- pluggable extensions, persistence, uploads, collaboration, review and AI
- accessibility, IME correctness, security and performance as release gates

Component examples: `/components/` links to a dedicated live example for every
visual surface in the [gallery](docs/component-gallery.md). Screenshots contain
only the component, without example-page labels or form actions.

Integration examples: `/custom-toolbar.html` (plain HTML/CSS) and `/vue.html`
(Vue + Tailwind) in the same local preview.

Core architecture docs:

- [`docs/component-gallery.md`](docs/component-gallery.md) — screenshots and local capture instructions

- [`docs/customization.md`](docs/customization.md) — CSS parts, Tailwind, custom buttons and optional Vue wrapper
- [`docs/remaining-work.md`](docs/remaining-work.md) — core, release and optional follow-ups
- [`docs/image-authoring.md`](docs/image-authoring.md) — image editing, previews and host-provided uploads
- [`docs/editor-configuration.md`](docs/editor-configuration.md) — available tools, source views and format fidelity
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
- [`docs/collaboration.md`](docs/collaboration.md)
- [`docs/ai.md`](docs/ai.md)
- [`docs/annotations.md`](docs/annotations.md)
- [`docs/comments.md`](docs/comments.md)
- [`docs/suggestions.md`](docs/suggestions.md)
- [`docs/editing-primitives.md`](docs/editing-primitives.md)
- [`docs/quality.md`](docs/quality.md)

## Workspace

```text
packages/core                   @arichtext/core
packages/editor                 @arichtext/editor
packages/engine                 @arichtext/engine
packages/links                  @arichtext/links
packages/lists                  @arichtext/lists
packages/lists-editor           @arichtext/lists-editor
packages/tables                 @arichtext/tables
packages/dom                    @arichtext/dom
packages/extensions             @arichtext/extensions
packages/html                   @arichtext/html
packages/markdown               @arichtext/markdown
packages/clipboard              @arichtext/clipboard
packages/persistence-indexeddb  @arichtext/persistence-indexeddb
packages/media                  @arichtext/media
packages/media-editor           @arichtext/media-editor
packages/collaboration          @arichtext/collaboration
packages/collaboration-editor   @arichtext/collaboration-editor
packages/ai                     @arichtext/ai
packages/ai-editor              @arichtext/ai-editor
packages/annotations            @arichtext/annotations
packages/comments               @arichtext/comments
packages/comments-editor        @arichtext/comments-editor
packages/suggestions            @arichtext/suggestions
packages/suggestions-editor     @arichtext/suggestions-editor
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

The engine handles ordinary text input, inline formatting, paragraph splitting, grapheme-aware Backspace/Delete, compatible sibling joins and ART fragment insertion. The DOM adapter maps logical block-relative selections to/from browser selections. IME composition and unsupported native browser mutations use an explicit sanitized reconciliation path rather than silently becoming canonical state.

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

If the registry is unavailable, custom ART data remains valid/serializable and falls back to portable text or nested ART content.

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
<a-rich-text-shell>
  <a-rich-text-toolbar for="editor"></a-rich-text-toolbar>
  <a-rich-text id="editor" aria-label="Document"></a-rich-text>
</a-rich-text-shell>
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

Browser image validation/resizing/re-encoding lives in optional `@arichtext/media`. Applications provide their own upload provider. `@arichtext/media-editor` connects file paste/drop/picker flows without adding media processing code to the base Web Component bundle.

## Collaboration

Collaboration is provider-based and optional:

```ts
import { createMemoryCollaborationProvider } from '@arichtext/collaboration/memory';
import { connectCollaboration } from '@arichtext/collaboration-editor';

const provider = createMemoryCollaborationProvider();
const collaboration = await connectCollaboration(editor, provider, {
  documentId: 'article-123',
  clientId: crypto.randomUUID(),
});
```

Providers explicitly advertise `merge: 'snapshot'` or `merge: 'concurrent'`; snapshot synchronization is never presented as CRDT-safe multi-writer collaboration. The in-memory provider is a reference/test implementation. Yjs and hosted realtime adapters remain optional follow-up packages.

## BYO AI

AI editing is proposal-first and provider-neutral:

```ts
import { createAIProposal, applyAIProposal } from '@arichtext/ai-editor';

const task = createAIProposal(editor, myProvider, {
  task: 'rewrite',
});

const proposal = await task.promise;
// Present proposal.replacementText for review.
applyAIProposal(editor, proposal);
```

Model output is plain text, never trusted HTML. Streaming is preview-only, application is explicit/undoable, and any canonical document change makes an older proposal stale. Hosted-provider secret credentials belong behind application-owned infrastructure; browser-local models can implement the same provider interface directly.

## Comments and review anchors

Review state stays outside ART. `@arichtext/annotations` maps stable logical ranges through engine operations; `@arichtext/comments` defines provider-neutral comment threads; `@arichtext/comments-editor` binds them to the editor.

```ts
import { createMemoryCommentsProvider } from '@arichtext/comments/memory';
import { connectComments } from '@arichtext/comments-editor';

const comments = await connectComments(
  editor,
  createMemoryCommentsProvider(),
  {
    documentId: 'article-123',
    clientId: crypto.randomUUID(),
    author: { id: currentUser.id },
  },
);

await comments.createThread('Can we verify this claim?');
```

Comments/replies/reactions/resolution never alter `editor.serializeJSON()`. Anchors map through typing, split/join, paste and undo/redo; ambiguous structural native reconciliation fails closed as `orphaned` rather than guessing.

## Tracked suggestions

Suggestions reuse the same anchored-range foundation but remain separate review records until explicitly accepted:

```ts
import { createMemorySuggestionsProvider } from '@arichtext/suggestions/memory';
import { connectSuggestions } from '@arichtext/suggestions-editor';

const suggestions = await connectSuggestions(
  editor,
  createMemorySuggestionsProvider(),
  {
    documentId: 'article-123',
    clientId: crypto.randomUUID(),
    author: { id: currentUser.id },
  },
);

const suggestion = await suggestions.createSuggestion('replacement text');
await suggestions.accept(suggestion.id, { id: reviewer.id });
```

Insert/delete/replace suggestions do not modify ART while pending. Unrelated edits remap their anchors; overlapping source edits become explicit `conflicted` records rather than being silently rebased. Acceptance is a normal undoable engine transaction; rejection changes review metadata only.

## Development

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm verify:local
```

Validation runs locally and does not require GitHub Actions. `pnpm verify` runs package policy, build, typecheck, unit tests and bundle budgets; `pnpm test:browser` runs the browser matrix against the built packages. See [quality and verification](docs/quality.md) for evidence and release limits.

The regression suite covers ART validation, conversion/sanitization, SSR imports, format interoperability, local persistence, engine transactions/history, safe DOM rendering, selection mapping, clipboard behavior, extension registries, collaboration contracts, reviewable AI proposals, transaction-mapped annotations, comments and tracked suggestions.

## Business model principle

**Free software, paid infrastructure.**

Features that can reasonably execute on the user's device should stay client-side. Future managed services may include realtime relay/sync, durable storage, high-fidelity document conversion, managed AI routing, backups, enterprise audit/SSO and support.

### Explore the editor

The [local showcase](http://127.0.0.1:8080/) lets you switch appearance, traditional/inline toolbars, tool sets and sample documents. See [editor modes and upcoming tools](docs/editor-modes.md) for the shared shell, reusable dropdown and optional lightweight code highlighter.

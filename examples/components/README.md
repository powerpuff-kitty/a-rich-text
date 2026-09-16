# Component examples

Every visual surface in the screenshot gallery has a runnable example. Build and
serve locally:

```sh
pnpm build:distribution
python3 -m http.server 8080 --directory dist/browser
```

Open [the example index](http://localhost:8080/components/).

| Example | Local path |
| --- | --- |
| Standard editor | `/components/standard-editor.html` |
| Base Web Component without toolbar | `/components/base-editor.html` |
| Formatting toolbar, with an editor to operate on | `/components/toolbar.html` |
| Table and contextual controls | `/components/table-controls.html` |
| Link editor | `/components/link-editor.html` |
| HTML source | `/components/source-html.html` |
| Markdown source | `/components/source-markdown.html` |
| ART JSON source | `/components/source-json.html` |
| Plain-text source | `/components/source-text.html` |
| Find and replace | `/components/find-replace.html` |
| Code dialog | `/components/code-editor.html` |
| Image dialog | `/components/image-editor.html` |
| Focus mode | `/components/focus-mode.html` |
| Responsive editor (resize the browser) | `/components/mobile-editor.html` |
| Custom HTML/CSS buttons and styling | `/custom-toolbar.html` |
| Vue toolbar slot and Tailwind styling | `/vue.html` |

[Catalog](catalog.mjs) lists the dedicated pages; [setup](setup.js) initializes
real editor content and opens the relevant controls. The
[builder](../../scripts/build-component-examples.mjs) generates each HTML page
under `dist/browser/components/`. The custom integrations have their own source
in [custom-toolbar](../custom-toolbar/index.html) and [Vue](../vue/App.vue).
The examples have accessible editor names without visible form labels or submit
buttons. Dialog examples open immediately and can be closed and reopened normally.
Source examples start with an unapplied whitespace change to expose Apply/Discard.
The image URL is illustrative; it is not loaded unless Preview is clicked.

`pnpm docs:screenshots` captures these same pages. The capture region excludes
headers/navigation and crops custom integrations to their toolbar and editor.
API-only packages do not have built-in visual widgets; see their package READMEs.

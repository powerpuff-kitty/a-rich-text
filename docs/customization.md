# Styling, custom buttons, Tailwind and Vue

[Browse screenshots of these components](component-gallery.md).

The Web Component is the editor. A framework wrapper is optional: use one for
application conventions such as `v-model`, slots and lifecycle cleanup, rather
than implementing another editing engine.

After `pnpm build:distribution`, the local preview includes:

- `/custom-toolbar.html`: plain HTML, custom buttons, CSS parts and native forms.
- `/vue.html`: Vue 3 + compiled Tailwind 4, a toolbar slot and `v-model`.

Sources: [plain HTML example](../examples/custom-toolbar/index.html),
[Vue wrapper](../examples/vue/RichText.vue),
[Vue application](../examples/vue/App.vue) and
[Tailwind stylesheet](../examples/vue/styles.css).

## Appearance presets

Set `preset="default"`, `preset="minimal"` or `preset="document"` on the editor.
The optional linked toolbar follows it automatically, including live changes.
No framework wrapper, extra stylesheet or runtime dependency is required.

```html
<a-rich-text-shell>
<a-rich-text-toolbar for="notes"></a-rich-text-toolbar>
<a-rich-text id="notes" preset="document" aria-label="Notes"
  tools="paragraph heading bold italic link undo redo"
  views="html json"></a-rich-text>
</a-rich-text-shell>
```

| Preset | Appearance |
| --- | --- |
| `default` | One rounded frame, tinted toolbar and comfortable sans-serif content |
| `minimal` | Open surface with a bottom rule, transparent toolbar and compact spacing |
| `document` | Centered paper frame and shadow, serif font, 52rem maximum width, 18px text at a 16px root size, 1.8 line height, responsive padding and a taller writing area |

Presets change appearance only. They do not select tools, enable formats, create
content, alter exports, reset history or discard source drafts. The toolbar remains
optional. Omitted and unknown preset values use `default`; names are case-sensitive.
The typed `editor.preset` property reads the effective preset and accepts the same
three names. No preset attribute is added when it is omitted.

CSS variables on the host and `::part()` rules override preset defaults. Existing
Tailwind utilities and custom buttons work with every preset. For example:

```css
a-rich-text {
  --art-max-width: 60rem;
  --art-font-size: 1rem;
  --art-editor-padding: 1rem;
  --art-paragraph-spacing: 0.8em;
}
a-rich-text-toolbar {
  --art-toolbar-max-width: 60rem;
  --art-toolbar-padding: 0.4rem;
  --art-toolbar-gap: 0.25rem;
}
```

Use `--art-shell-max-width` on the shared shell to align toolbar and content.
The content has no default border; set `--art-shell-border`, `--art-shell-radius`,
`--art-shell-background` and `--art-shell-shadow` on the shell to customize its frame.
The `--_art-*` properties are private implementation details. See the
[three preset examples and screenshots](component-gallery.md#appearance-presets).

## Choose the customization surface

| Need | Integration |
| --- | --- |
| Width, layout, margin, responsive visibility | Classes/styles on the host element |
| Fonts, colors, padding and shared appearance | CSS custom properties on the host |
| Style editor content, fields and existing buttons | Exposed `::part(...)` selectors |
| Your icons, buttons, menus and framework templates | Omit `<a-rich-text-toolbar>` and call editor/controller methods |
| Vue `v-model` and toolbar slots | Optional thin wrapper provided in the example |
| Application-specific document nodes/behavior | [Extension API](extensions.md), not arbitrary DOM injection |

The editor and bundled toolbar use Shadow DOM. Ordinary descendant selectors,
Tailwind's `prose` class and a Vue `:deep()` selector do not style arbitrary nodes
inside that boundary. `::part()` targets explicitly exposed elements; it cannot
be followed by a descendant selector to reach additional internals. See
[CSS shadow parts](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Shadow_parts).

## CSS variables and parts

```css
a-rich-text {
  --art-font-family: Inter, system-ui, sans-serif;
  --art-font-size: 1rem;
  --art-line-height: 1.7;
  --art-color: #172554;
  --art-background: white;
  --art-border-color: #cbd5e1;
  --art-radius: 0.75rem;
  --art-editor-min-height: 16rem;
  --art-editor-padding: 1rem;
}
a-rich-text-shell { --art-shell-border: 2px solid #6366f1; }
a-rich-text::part(blockquote) {
  border-inline-start: 3px solid #6366f1;
  padding-inline-start: 1rem;
}
a-rich-text::part(link) { color: #4338ca; }
a-rich-text-toolbar::part(button) { min-height: 2.5rem; }
a-rich-text-toolbar::part(bold-button) { font-weight: 700; }
```

`--art-editor-padding` accepts one length applied on all sides; the placeholder
uses the same value so the caret and placeholder stay aligned. Use the exposed
parts for other style changes. Prefer these hooks to querying and mutating the
shadow tree: the editor recreates content DOM during transactions.

| Editor surface | Parts |
| --- | --- |
| Find and replace | `find-panel`, `find-input`, `find-case`, `find-whole-word`, `find-replacement`, `find-status`, `find-note`, `find-highlight` |
| Find actions | `find-previous-button`, `find-next-button`, `find-close-button`, `find-replace-button`, `find-replace-all-button` |
| Focus mode | `focus-dialog`, `focus-header`, `focus-exit-button`, `focus-toolbar`, `focus-content` |
| Editable area | `editor` |
| Text blocks | `paragraph`, `heading`, `heading-1` through `heading-6`, `blockquote` |
| Marks | `bold`, `italic`, `underline`, `strike`, `inline-code`, `link` |
| Lists | `list`, `bullet-list`, `ordered-list`, `task-list`, `list-item`, `task-checkbox` |
| Table | `table`, `table-body`, `table-row`, `table-cell` |
| Other blocks | `code-block`, `code-content`, `horizontal-rule`, `image`, `extension-block` |
| Source views | `view-switcher`, `view-trigger`, `view-menu`, `source-panel`, `source`, `source-actions`, `source-apply-button`, `source-discard-button`, `source-note`, `source-error` |
| Image dialog | `image-dialog`, `image-form`, `image-source`, `image-alt`, `image-decorative`, `image-title`, `image-width`, `image-height`, `image-preview`, `image-error` |
| Image actions and uploads | `image-container`, `image-edit-button`, `image-file`, `image-progress`, `image-upload-button`, `image-upload-cancel-button`, `image-preview-button`, `image-apply-button`, `image-remove-button`, `image-cancel-button` |
| Code dialog | `code-dialog`, `code-form`, `code-language`, `code-input`, `code-error`, `code-edit-button`, `code-apply-button`, `code-remove-button`, `code-cancel-button` |

The toolbar exposes `toolbar`, `button`, `separator`, `block-select`, per-mark
parts such as `bold-button`, and `link-editor`, `link-input`, `link-error`.
Its variables are `--art-toolbar-font`, `--art-toolbar-background`,
`--art-toolbar-color`, `--art-toolbar-active` and
`--art-toolbar-radius`, `--art-toolbar-padding`, `--art-toolbar-gap` and
`--art-toolbar-max-width`. Presets synchronize automatically; explicit color and
spacing overrides belong on the corresponding editor or toolbar host.
Part names are styling hooks; they do not appear in canonical HTML/JSON exports.

## Tailwind

Use utilities directly on light-DOM custom buttons. On the editor host, use
layout utilities, custom properties and arbitrary `::part` variants:

```html
<a-rich-text
  class="w-full [--art-radius:0.75rem] [&::part(editor)]:border-indigo-500"
></a-rich-text>
```

For repeated rules, a stylesheet in the application's Tailwind build is simpler:

```css
@import "tailwindcss";
a-rich-text { --art-color: var(--color-slate-900); }
a-rich-text::part(editor) { @apply border-2 rounded-xl shadow-sm; }
a-rich-text::part(blockquote) { @apply border-l-4 border-indigo-500 pl-4; }
```

The runnable example compiles Tailwind 4 locally. Include your templates in
Tailwind's source detection; keep arbitrary classes literal rather than building
them dynamically. No CDN or Tailwind runtime is injected into the editor. The example distribution
includes `VUE_LICENSE` and `TAILWIND_LICENSE`; retain these when redistributing
the example assets.
See Tailwind's [custom styles](https://tailwindcss.com/docs/adding-custom-styles)
and [state/variant syntax](https://tailwindcss.com/docs/hover-focus-and-other-states).

## Custom buttons and menus

```js
import { enableStandardEditing } from '@arichtext/editor';
const editor = document.querySelector('a-rich-text');
const controls = enableStandardEditing(editor);

boldButton.addEventListener('pointerdown', event => event.preventDefault());
boldButton.addEventListener('click', () => {
  if (editor.isToolEnabled('bold') && editor.view === 'visual'
      && editor.toggleMark('bold')) editor.focus({ preventScroll: true });
});
```

Use native `button type="button"` elements. Preventing pointer-down focus changes
preserves the text selection; keyboard activation uses the retained logical
selection. Restore editor focus after ordinary formatting. Dialog-opening APIs,
such as `openCodeEditor()`, manage their own focus.

Read `getSelection()`, `getActiveMarks()`, `canUndo`, `canRedo`, `disabled`,
`readOnly` and `view` to set button visibility/state. Subscribe to
`selection-change`, `format-state-change`, `transaction`, `view-change` and
`input`; observe configuration attribute changes if your app changes them.
Custom controls own their availability rules and should consult `isToolEnabled()`.
Programmatic commands are not a content-security policy.

`editor.toggleMark()`, `setHeading()`, `toggleBlockquote()`,
`insertHorizontalRule()`, `clearFormatting()`, `undo()` and `redo()` are available
directly. The standard controller supplies link/list/table operations. More
specialized commands can be dispatched from their optional packages. For custom
menus, retain the selection before opening, validate that the document/location
is still current on apply, and return focus on cancel.

On component disposal, remove application listeners/observers and call
`controls.destroy()`. The framework wrapper demonstrates this lifecycle.

## Vue integration

Vue can use the custom elements directly. Tell its template compiler they are
native custom elements. In a Vite/Vue application:

```ts
import vue from '@vitejs/plugin-vue';
export default {
  plugins: [vue({ template: { compilerOptions: {
    isCustomElement: tag => tag.startsWith('a-rich-text') ||
      ['art-editor', 'art-toolbar', 'art-shell', 'art-select'].includes(tag),
  } } })],
};
```

Import `@arichtext/editor`, obtain a template ref on mount, install
`enableStandardEditing(ref)`, and destroy the controller before unmounting.
Native editor `input` events are not Vue `update:modelValue` events: bridge the
value explicitly or copy the provided wrapper. This follows Vue's
[custom-element integration guidance](https://vuejs.org/guide/extras/web-components).

```vue
<RichText id="body" v-model="html" label="Body" name="body"
  views="visual html markdown json"
  class="w-full [--art-radius:0.75rem]">
  <template #toolbar="{ state, run }">
    <button v-if="state.hasSelection && !state.locked && state.tools.includes('bold')"
      type="button" @pointerdown.prevent
      @click="run(editor => editor.toggleMark('bold'))">Bold</button>
  </template>
</RichText>
```

Without the slot, the wrapper renders the standard toolbar. Its `v-model` is a
string serialized according to `format` (`html` by default); use `format="json"`
with serialized ART JSON when lossless persistence is needed. The wrapper checks
whether incoming values already equal the editor value, preventing input echoes
from resetting selection/history. A genuinely new external value uses the
normal import contract and resets undo history. The slot exposes the element,
standard controller, derived state and an ordinary-command `run` helper.

The example includes custom-element declarations for strict Vue template
checking. Its build uses Vue 3.5 and Tailwind 4. The local `vue-tsc` checker needs
TypeScript's JavaScript compiler API, so `typecheck:examples` supplies the
TypeScript 6 compatibility package; editor packages still build with TypeScript 7.
These are development/example dependencies, not editor runtime dependencies.

The example is client-mounted. In SSR/Nuxt, initialize the editor on the client;
server-safe package imports do not provide server-rendered editor hydration.

## Custom toolbar in focus mode

Keep custom buttons in light DOM so Tailwind and application styles still apply:

```ts
const unregister = editor.registerFocusToolbar(customToolbar);
// Custom expand button:
expandButton.addEventListener('click', () => editor.toggleFocusMode());
// During application/component disposal:
// unregister();
```

The toolbar returns to its original position on exit. For controls exclusive to
focus mode, put a child with `slot="focus-toolbar"` inside `<a-rich-text>`. The
standard toolbar registers automatically. Vue wrappers may register their toolbar
container on mount and unregister before unmount; do not render a second editor.
See [focus-mode behavior](editor-configuration.md#focus-mode).

Find highlights use `--art-find-highlight` (translucent fill) and
`--art-find-outline`. The nonmodal panel and buttons also expose CSS parts; custom
find interfaces can use the engine search APIs described in
[configuration](editor-configuration.md#find-and-replace).

## Toolbar modes and dropdowns

See [editor modes, dropdown API, optional highlighting and roadmap](editor-modes.md).
Source views now use a toolbar dropdown. The old `view-button` and
`active-view-button` parts have been replaced by `view-trigger` and `view-menu`.
Without a registered toolbar, the editor exposes the same menu above its content.

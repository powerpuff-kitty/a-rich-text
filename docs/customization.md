# Styling, custom buttons, Tailwind and Vue

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
a-rich-text::part(editor) { border-width: 2px; }
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
| Focus mode | `focus-dialog`, `focus-header`, `focus-exit-button`, `focus-toolbar`, `focus-content` |
| Editable area | `editor` |
| Text blocks | `paragraph`, `heading`, `heading-1` through `heading-6`, `blockquote` |
| Marks | `bold`, `italic`, `underline`, `strike`, `inline-code`, `link` |
| Lists | `list`, `bullet-list`, `ordered-list`, `task-list`, `list-item`, `task-checkbox` |
| Table | `table`, `table-body`, `table-row`, `table-cell` |
| Other blocks | `code-block`, `code-content`, `horizontal-rule`, `image`, `extension-block` |
| Source views | `view-switcher`, `view-button`, `active-view-button`, `source-panel`, `source`, `source-actions`, `source-apply-button`, `source-discard-button`, `source-note`, `source-error` |
| Image dialog | `image-dialog`, `image-form`, `image-source`, `image-alt`, `image-decorative`, `image-title`, `image-width`, `image-height`, `image-preview`, `image-error` |
| Image actions and uploads | `image-container`, `image-edit-button`, `image-file`, `image-progress`, `image-upload-button`, `image-upload-cancel-button`, `image-preview-button`, `image-apply-button`, `image-remove-button`, `image-cancel-button` |
| Code dialog | `code-dialog`, `code-form`, `code-language`, `code-input`, `code-error`, `code-edit-button`, `code-apply-button`, `code-remove-button`, `code-cancel-button` |

The toolbar exposes `toolbar`, `button`, `separator`, `block-select`, per-mark
parts such as `bold-button`, and `link-editor`, `link-input`, `link-error`.
Its variables are `--art-toolbar-font`, `--art-toolbar-background`,
`--art-toolbar-color`, `--art-toolbar-border`, `--art-toolbar-active` and
`--art-toolbar-radius`. Host/editor and toolbar themes are configured separately.
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
    isCustomElement: tag => tag === 'a-rich-text' || tag === 'a-rich-text-toolbar',
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

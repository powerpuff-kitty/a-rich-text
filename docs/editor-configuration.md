# Tools and document views

Configure the Web Component itself; an attached `<a-rich-text-toolbar>` reads its
configuration and updates when attributes change.

```html
<a-rich-text-toolbar for="body"></a-rich-text-toolbar>
<a-rich-text
  id="body"
  name="body"
  aria-label="Body"
  format="html"
  views="visual html markdown json"
  tools="paragraph heading bold italic underline code link bullet-list ordered-list task-list indent outdent insert-table add-row remove-row add-column remove-column undo redo"
  placeholder="Write something…"
></a-rich-text>
```

Import `@arichtext/editor` and call `enableStandardEditing(editor)` to enable the
optional list/task and table keyboard behaviors. Format switching itself belongs
to the base Web Component and needs no optional adapter.

## Attributes and properties

| Attribute | Purpose | Default |
| --- | --- | --- |
| `format` | Serialization used by `value` and native form submission | `html` |
| `views` | Allowed user-selectable views, separated by spaces or commas | `visual` only |
| `view` | Requested active view; unavailable values fall back to the visual editor | `visual` |
| `tools` | Allowlist of toolbar actions and their built-in formatting shortcuts | All supported tools |

`views` supports `visual`, `html`, `markdown` (alias `md`), `json` and `text`.
The visual editor is always retained as a recovery view. Duplicate and unknown
tokens are ignored. `tools=""` hides all toolbar tools; omitting `tools` enables
the full supported set. Attributes update live. The `tools` and `views` properties
accept an array or a string and return normalized arrays.

Tool configuration controls the UI and its formatting shortcuts; it is **not a
content/security schema**. Existing content, imported documents, explicit command
APIs and source editing can still contain structures whose toolbar tools are
hidden. Standard list Enter/Backspace and table navigation keep existing content
editable even when its creation tools are hidden. Indent/outdent shortcuts and
task checkbox editing honor their corresponding tool switches.

## Supported tools

| Tools | Visibility / behavior |
| --- | --- |
| `paragraph`, `heading` | Text-style selector at a single paragraph/heading selection; heading levels 1–3 |
| `bold`, `italic`, `underline`, `strike`, `code` | Apply marks to selected text or subsequent caret typing |
| `link` | Link entry/removal and Ctrl/Command+K |
| `bullet-list`, `ordered-list`, `task-list` | Toggle or convert the current list at a single-block selection |
| `code-block` | Insert a code block at a single text-block selection; existing code blocks expose an Edit code block button |
| `blockquote` | Wrap the selected paragraph/heading; toggle again to unwrap its immediate quote container, preserving all child blocks |
| `horizontal-rule` | Insert a rule at a single text-block selection; continue typing in the following paragraph |
| `clear-formatting` | Remove all inline marks from selected text, or clear marks for subsequent typing at a caret; retain headings/lists |
| `indent`, `outdent` | Only inside a list; indentation needs a preceding sibling |
| `insert-table` | Single text-block selection outside a table |
| `add-row`, `remove-row`, `add-column`, `remove-column` | Only inside a supported rectangular table; unavailable dimensions are hidden |
| `undo`, `redo` | Only while the corresponding history step exists |

Unavailable controls and empty separators are hidden. Formatting controls are
hidden in source views and while disabled/readonly. Task-list checkboxes remain
visible, with checked state preserved, but become disabled when appropriate.
An empty, unfocused editor has no selection yet; its toolbar becomes available
when a text selection/caret exists.

The element also exposes `toggleBlockquote()`, `insertHorizontalRule()` and
`clearFormatting()`, returning whether the operation was handled. These methods
respect disabled/readonly state. Quote and rule commands require a single-block
selection. Structural edits and selected-text clearing are undoable; clearing
caret marks only changes subsequent typing. Use the quote button again to leave
a quote; Enter currently adds another paragraph inside it.

Toolbar graphics are selected, bundled **Font Awesome Free 7.3.1** SVG paths;
there is no font download, CDN, kit or runtime icon framework. Controls retain
accessible names and native tooltips. Icons are decorative to assistive
technology. Provenance and licensing ship in the UI package and standalone
distribution as `THIRD_PARTY_NOTICES.txt`.

## Code blocks

`code` applies an inline mark. `code-block` enables the toolbar insertion button
and the **Edit code block** button on existing blocks, including imported blocks
inside quotes, lists and tables. The base element exposes
`openCodeEditor(path?: readonly number[] | null): boolean`: omit the path to
insert at the current single-block selection, or provide an ART block path to
edit an existing code block.

The dialog edits code as plain text and accepts an optional language identifier
such as `javascript`, `c++` or `c#`. It does not execute code or provide syntax
highlighting. Apply creates one undoable transaction and preserves existing
undo history. Remove replaces the code block with an editable paragraph. Cancel
or Escape discards the draft; Escape restores focus to the edit button when it
still exists. Tab follows normal dialog focus navigation.

Code is an atomic block in the visual editor; edit its text through this dialog
or a configured source view. Draft typing does not emit canonical editor input
or alter form data. A concurrent document update prevents Apply/Remove and
retains the draft for copying. Disabling the element, enabling readonly,
removing `code-block`, switching view, resetting the form or disconnecting the
element closes the dialog and discards its draft. Programmatic document updates
otherwise retain the draft with conflict protection.

Code and language round-trip through ART JSON and supported HTML/Markdown code
blocks. Editor buttons are excluded from exported content and native DOM
reconciliation. Language metadata survives reconciliation.

## Source editing and recovery

Switching views serializes the current canonical ART document and does not
reimport it. Merely looking at Markdown/plain text therefore cannot strip marks
or annotations. `format` stays independent of the active `view`.

Source drafts are held separately until **Apply changes**. Successful application
parses/validates the source, sanitizes HTML, replaces the document, clears undo
history (the same contract as `setHTML`/`setJSON`) and emits one editor `input`.
Draft input does not bubble as canonical editor input. `sourceDirty` reports a
pending draft; `applySource()` returns success/failure and `discardSource()`
restores the latest canonical representation.

Invalid JSON retains the draft and exposes an inline error. Pending drafts block
native form validation and view changes until applied/discarded, preventing stale
submission or silent draft loss. If an application updates the document while a
draft is pending, Apply refuses to overwrite that newer document; discard the
draft to reload it. Form reset clears the draft. Readonly views remain inspectable
but cannot apply changes. Disabled controls cannot edit or switch views.

Applications that construct `FormData` and submit it themselves must run native
form validation (`form.reportValidity()`) first; constructing `FormData` alone
does not validate any HTML control. `view-change` emits `{ view }` when the active
view changes.

## Format compatibility

- **ART JSON**: canonical, validated, lossless representation of supported ART.
- **HTML**: import/export for the supported block/mark model; unsafe or unsupported
  markup is removed or unwrapped.
- **Markdown**: deterministic supported subset; underline uses `<u>`, and table
  spans cannot be represented faithfully.
- **Text**: deliberately drops formatting and structure when applied.

See [conversion contracts](conversion.md) for fidelity. Source view availability
is configurable because not every application should expose lossy editing paths.

## Tools still missing from the bundled toolbar

The model/converters support images, but a dedicated standard image authoring
control is still missing. Media/upload,
comments, suggestions and AI have optional packages but no bundled toolbar UI.
Find/replace, fullscreen/focus mode, and table merge/split are
also absent. Text alignment, font/color/highlight choices would require extending
the current schema or defining extensions; hiding/showing toolbar tools does not
add those capabilities. These are follow-up features, not advertised controls.

# Tools and document views

[Browse screenshots of these components](component-gallery.md).

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
optional list/task and table keyboard behaviors and automatic linking. Format switching itself belongs
to the base Web Component and needs no optional adapter.

See [appearance presets](customization.md#appearance-presets) for styling defaults and overrides.

## Attributes and properties

| Attribute | Purpose | Default |
| --- | --- | --- |
| `preset` | Appearance: `default`, `minimal` or `document`; linked toolbar follows live | `default` |
| `format` | Serialization used by `value` and native form submission | `html` |
| `views` | Allowed user-selectable views, separated by spaces or commas | `visual` only |
| `view` | Requested active view; unavailable values fall back to the visual editor | `visual` |
| `autolink` | Standard-editing URL/email detection on typed spaces; `false` disables it | Enabled with standard editing |
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
| `paragraph`, `heading` | Text-style selector for selected paragraphs/headings; heading levels 1–6 and mixed-style indication |
| `bold`, `italic`, `underline`, `strike`, `code` | Apply marks to selected text or subsequent caret typing |
| `link` | Link entry/removal and Ctrl/Command+K |
| `bullet-list`, `ordered-list`, `task-list` | Toggle or convert the current list at a single-block selection |
| `image` | Insert at a single text-block selection; existing images expose Edit image; upload controls require `imageUploader` |
| `code-block` | Insert a code block at a single text-block selection; existing code blocks expose an Edit code block button |
| `blockquote` | Wrap the selected paragraph/heading; toggle again to unwrap its immediate quote container, preserving all child blocks |
| `horizontal-rule` | Insert a rule at a single text-block selection; continue typing in the following paragraph |
| `clear-formatting` | Remove all inline marks from selected text, or clear marks for subsequent typing at a caret; retain headings/lists |
| `indent`, `outdent` | Only inside a list; indentation needs a preceding sibling |
| `insert-table` | Single text-block selection outside a table |
| `merge-cell-right` | Merge touching cells with matching row boundaries, including rowspans; retain all content |
| `merge-cell-below` | Merge with the cell immediately below when both have the same logical column extent |
| `split-cell` | Expand a horizontal, vertical or combined span into unit cells; keep content in the top-left cell |
| `remove-table` | Remove the containing table at a single text-block selection, including imported merged tables; leaves an editable paragraph and supports Undo |
| `add-row`, `remove-row` | Inside supported tables, including horizontal and vertical spans; unavailable dimensions are hidden |
| `add-column`, `remove-column` | Inside supported tables, including horizontal spans; unavailable dimensions are hidden |
| `find-replace` | Search and navigate visual body text without a selection; replacement is hidden in readonly mode |
| `focus-mode` | Expand the editor into a modal writing area; available without a text selection, including source views and readonly inspection |
| `undo`, `redo` | Only while the corresponding history step exists |

Unavailable controls and empty separators are hidden. Formatting controls are
hidden in source views and while disabled/readonly. Focus mode remains available
in source views and readonly mode; disabled editors cannot enter it. Find remains
available in readonly visual mode, with replacement hidden. Task-list checkboxes remain
visible, with checked state preserved, but become disabled when appropriate.
An empty, unfocused editor has no selection yet; formatting tools become available
when a text selection/caret exists. Focus mode and find do not need a selection.

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

## Find and replace

The `find-replace` tool opens a nonmodal panel in the visual editor. Ctrl/Command+F
opens it while the editor or panel has keyboard focus; elsewhere, browser find
retains its usual behavior. Custom buttons can call `openFindReplace(query?)` and
`closeFindReplace()`. `findReplaceOpen` reports state; `find-replace-change` emits
`{ open }`. The opening method returns whether entry was possible.

Search is literal, case-insensitive by default, with **Match case** and **Whole
words** options. Matches may span differently formatted runs within one paragraph
or heading, including nested lists, quotes and table cells. They do not cross
block boundaries or search code blocks, image metadata or extension fallbacks.
Whole-word boundaries use Unicode letters, numbers, combining marks and underscore;
they are not locale-specific dictionary segmentation. No regular expressions or
Unicode normalization are applied to the user's query.

The panel reports the match count and highlights the current match without adding
content to exports or form values. Next/Previous wrap at the ends. Enter in Find
moves forward; Shift+Enter moves backward. Escape closes the panel and focuses the
selected match; another Escape can then exit focus mode. Image/code subdialogs
close before the find panel. The panel stays usable while editing; document
changes refresh matches and replacement always searches the latest canonical text.

**Replace match** replaces the current match and advances beyond the inserted
text; **Replace all** replaces the current non-overlapping match set once, in one
undo step. New matches inside replacement text are not recursively replaced.
Replacement inherits the first matched character's marks; other text and block
structure remain intact. An empty replacement deletes the match. Replacing text
with identical text preserves its original formatting and creates no history step.
Enter in Replace with replaces the current match. Query/options/navigation do not
change form values or create undo steps.

Readonly permits finding but prevents replacement. Disabled state, removing the
tool or switching to a source view closes the panel. Form reset/disconnection also
clear the query and replacement. Composition temporarily suppresses highlights
and replacement. The panel supports focus mode and exposes [CSS parts](customization.md).
The engine exports `findText(document, query, options)` and
`replaceSearchMatches(state, query, replacement, options, index?)` for custom UIs;
these low-level APIs do not enforce component tool/readonly configuration.

## Focus mode

The `focus-mode` tool shows an expand button in the standard toolbar. Call
`editor.toggleFocusMode()` from a custom button, or pass `true`/`false` to request
entry/exit. The method returns whether the request was handled. `editor.focusMode`
reports active state; `focus-mode-change` emits `{ active }`.

Focus mode uses a native modal dialog sized to the viewport. It keeps the
form-associated host in place and moves its existing controls, preserving content,
selection, undo history, form ownership and pending source drafts. The background
is inert while open. Exit through the visible button or Escape. An image/code
subdialog dismisses first; Escape in the link field cancels that draft first.
Focus returns to the initiating control when it still exists.

The standard toolbar travels into focus mode and returns to its original position.
For a custom light-DOM toolbar, call `editor.registerFocusToolbar(toolbarElement)`
and call the returned cleanup function when disposing the integration. Its global
CSS classes remain usable; selectors depending on its original ancestors may no
longer match while it is inside the editor. Alternatively, supply a direct child
with `slot="focus-toolbar"` for controls shown only in focus mode. Custom toolbar
inputs should stop their draft `input`/`change` events from bubbling as editor
content events; the standard toolbar already does this.

Disabling the editor (including a disabled fieldset), removing the `focus-mode`
tool, resetting the form or disconnecting the host exits focus mode. Readonly and
source-view changes retain it for inspection. Exiting does not apply/discard a
source draft. Entry is rejected while an image/code dialog is already open.
Multiple editor instances maintain independent state. This is an expanded writing
view; it does not invoke the browser Fullscreen API or hide browser chrome.

See [styling hooks](customization.md) for focus-mode parts. The host must be
connected and the browser must support native modal dialogs.

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

Image insertion, editing and optional uploads are available through the
[image dialog](image-authoring.md). Comments, suggestions and AI have optional
packages but no bundled toolbar UI.
Column editing in vertical grids is still absent. Text alignment, font/color/highlight choices would require extending
the current schema or defining extensions; hiding/showing toolbar tools does not
add those capabilities. These are follow-up features, not advertised controls.

## Automatic links

`enableStandardEditing(editor)` turns a completed `http://`, `https://`, `www.`
URL or email token into a link when a space is typed at a collapsed caret.
The link and whitespace are one undoable change; the whitespace stays outside
that new link. Detection preserves other marks and supports nested paragraph and
heading blocks, including lists, quotes and table cells. It skips existing links,
inline code, composition input, readonly/disabled editors and source views.

Set `autolink="false"` or omit `link` from an explicit `tools` allowlist to disable
it; both are read live. No toolbar button is added. The base component alone does
not install this behavior. Enter, paste, imports and programmatic changes do not
automatically create links; these remain explicit authoring paths.

Custom adapters can use `insertAutoLinkBoundary(state, whitespace, marks?)` from
`@arichtext/links`. It returns a transaction or `null`; the host enforces editing
locks and tool configuration. `detectLinks(text)` remains a non-mutating detector.

Paragraph/heading commands apply to all selected text blocks in one Undo step,
including nested list, quote and table text. A selection ending at offset zero
of a following block excludes that block. Text, inline marks, containers and
selection direction are retained; atomic code/image blocks are unchanged.
`getSelectedBlockStyle()` returns the common style, `"mixed"`, or `null`.

## Merged cells

Select text within one table cell and use **Merge with right cell**. The command
adds the column spans and appends the right cell's content blocks to the left;
it preserves inline formatting and maps review anchors to the moved content.
The cells must share their top/bottom boundaries and touch in the logical grid.
Matching rowspans are supported; a carried span between physical neighbors or
mismatched row heights makes the action unavailable.
**Split cell** expands horizontal, vertical or combined spans into individual
cells, retaining all content in the top-left cell and filling the rest of the
selected rectangle with empty cells. Other spans remain unchanged. It does not guess
how to redistribute content; Undo restores the exact previous arrangement.
Both commands are a single history step. Tab/Shift+Tab navigate physical cells
in row order, including horizontal and vertical spans.

**Merge with cell below** appends the cell immediately below the active span
when both cells have the same logical left/right boundaries. Existing rowspans
are added together, so repeated merges are supported. Different widths or a
bottom edge expose no merge-below action. Content stays in document order;
review anchors from the lower cell move into the upper cell. Undo restores both.

`merge-cell-right`, `merge-cell-below` and `split-cell` control their contextual buttons.
The standard controller exposes `mergeCellRight()`, `mergeCellBelow()` and `splitCell()`; custom
adapters can call `mergeTableCellRight(state)`, `mergeTableCellBelow(state)`, `splitTableCell(state)` and
`getTableCellActions(state)` from `@arichtext/tables`.

Grids larger than 50×50 and selections across text blocks expose neither action.
Vertical grids support splitting, merging below matching cells, merging right
across matching row boundaries, and row insertion/removal. Column editing remains
restricted to horizontal grids.

Row insertion happens before or after the active cell's full vertical extent.
Other spans crossing that boundary grow; uncovered columns receive empty cells.
The caret moves to the first new cell. Row removal deletes the active cell's
starting row: crossing spans shrink, and spans originating in that row move into
the next row with their content intact. Unit-height cells in the deleted row are
removed. Surviving review anchors are mapped; anchors in deleted cells become
orphaned. The caret moves to a surviving cell covering the same logical column.
Each change is one Undo step; the final row cannot be removed (use Remove table).
`getTableRowActions(state)` reports contextual row-control availability.
HTML and ART JSON preserve horizontal and vertical spans; Markdown/plain text do not preserve
merged-cell structure. Use HTML or JSON when this structure matters.

Column insertion uses the boundary before/after the entire active cell; the
standard toolbar inserts after it. Other rows get an empty cell at that boundary,
or widen an existing span if it crosses the boundary. Column removal deletes the
active cell's leftmost logical column: single-column cells in that column are
removed, while wider cells shrink and keep their content. The final logical
column cannot be removed. Each change is one Undo step and maps surviving review
anchors. `getActiveTable()` reports logical table width while `columnIndex` remains
the physical cell index within its row.

# Block controls (#74)

Design mode: extend. This implements the owner-selected block authoring scope
inside the existing editor surface, using its tool allowlist, dropdown positioning,
focus-mode containment and undoable transaction APIs.

## Interaction contract

Block mode is opt-in and independent of appearance and source-view configuration.
It exposes controls for top-level document blocks: a list, table, quote or extension
block moves as one unit. Editing text inside those containers remains unchanged.
A visible handle identifies its block and opens actions. Keyboard users can focus
handles and use the same menu; move actions also have documented shortcuts.
Pointer reordering uses the same canonical move command as the keyboard actions.

Typing `/` at the start of an empty paragraph opens a searchable insertion menu.
Escape closes it and retains the literal slash. Choosing an allowed item removes
the slash and replaces that paragraph in one undo step. The menu contains only
features permitted by the editor's tool allowlist. Empty results are announced.
Host-supplied items provide typed labels/icons and commands, never injected editor
HTML. The shared viewport-clamped positioning keeps menus usable in narrow and
modal focus-mode surfaces.

Move preserves the selected text point relative to its block and moves review
anchors with their content. Duplicate copies content, not review threads or IDs;
the original's anchors stay attached to the original. Delete invalidates anchors
inside removed content using explicit operation mapping and shifts later paths.
Deleting the final block leaves an empty paragraph so keyboard entry remains
possible. Undo restores document, selection and the normal review history mapping.
A non-text block can be targeted through its handle without inventing a text offset
inside an image or widget. After removal, focus returns to the nearest available
text position; all actions leave an operable editor or handle.

Disabled, read-only and source views hide/disable editing controls, dismiss open
menus and cancel a pending drag. Outside pointer input and Escape dismiss menus;
focus returns to the invoking handle or text caret. Disconnect removes listeners
and overlays. Dynamic allowlist changes cannot leave forbidden actions enabled.

## Implementation and verification

1. Add a canonical top-level block-move operation and validated block commands.
   Verify path permutations, selection, delete/duplicate and history, plus
   annotation/suggestion mapping and malformed-operation rejection.
2. Add the optional block controller, reusing the existing dropdown primitive.
   Verify host customization, tool restrictions and lifecycle without depending on
   document-injected DOM or a hosted service.
3. Build a public-package consumer. Test slash insertion, Escape, keyboard actions,
   pointer reorder, undo, review anchors, narrow viewports and modal focus mode on
   all five local browser profiles. Measure optional bundle impact.
4. Update public docs and #74 with integrated verification evidence. Removing the
   optional controller restores the existing editor UI without rewriting ART.

Physical device, screen-reader and IME claims remain part of #11/#46 and require
actual recorded manual evidence; automated browser profiles do not substitute.

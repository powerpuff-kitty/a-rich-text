# Web Component runtime

`<a-rich-text>` uses ART + `EditorEngine` as its canonical runtime state. The editable DOM is a browser interaction surface, not the source of truth.

## Supported engine-first input

For input types that have deterministic engine semantics, the component handles `beforeinput`, prevents the browser mutation and dispatches an ART transaction instead.

Current engine-first intents:

- plain/replacement text insertion
- inline line breaks
- delete-by-cut/drag selection
- undo / redo
- bold / italic / underline / strike formatting on a selection
- collapsed-caret formatting through temporary stored marks

After a document-changing transaction the ART document is rendered back through `@arichtext/dom`, the logical selection is restored, the native form value is refreshed and the component emits an `input` event.

## Native fallback / reconciliation

Some browser editing behavior is deliberately not intercepted yet:

- IME/composition
- paste/drop payloads
- paragraph/list structural editing
- collapsed backwards/forwards/word deletion
- unknown `beforeinput` types

For these cases the browser can mutate the editing surface and the component converts the resulting DOM through the allowlisted HTML importer back into ART.

Composition is special: reconciliation never runs while composition is active. The DOM is reconciled once after `compositionend` so the editor does not destroy the native IME session with a mid-composition re-render.

This fallback is transitional. Dedicated ART structural operations should replace native reconciliation feature by feature.

## Public events

### `transaction`

Emitted after explicit engine transactions, including public `dispatch()`, typing/formatting intents and undo/redo.

```ts
editor.addEventListener('transaction', (event) => {
  console.log(event.detail.result);
});
```

### `selection-change`

Emitted when the logical engine selection changes.

### `reconcile`

Emitted after a native DOM fallback has been normalized into a new canonical ART document.

The detail reports `source: 'native-input' | 'composition'`.

### `error`

Emitted when a recoverable browser/import reconciliation fails. On failure the component re-renders the last known engine document rather than accepting invalid DOM as canonical state.

## Programmatic API

The existing format API remains engine-backed:

```ts
editor.getJSON();
editor.setJSON(document);
editor.getHTML();
editor.setHTML(html);
editor.getMarkdown();
editor.setMarkdown(markdown);
editor.getText();
editor.setText(text);
```

Additional engine-facing API:

```ts
editor.dispatch(transaction);
editor.undo();
editor.redo();
```

Programmatic `set*()` calls replace the editor document and start a fresh history instance. User editing transactions are undoable inside the active engine history.

## Security boundary

Native fallback DOM is never copied directly into ART. It passes through `@arichtext/html`, which drops executable/embed nodes and unsafe URL protocols before the result becomes canonical editor state.

# ADR 0001: ART-first editing engine

- Status: Accepted
- Date: 2026-09-15

## Context

`contenteditable` is the browser editing surface, but browser DOM mutations are not a stable document model. A Rich Text also needs deterministic HTML/Markdown/JSON conversion, collaboration, undo/redo, AI edits and reproducible behavior across frameworks.

Using deprecated `document.execCommand` as the canonical formatting layer would make behavior browser-dependent and difficult to test outside a DOM.

## Decision

A Rich Text uses a DOM-independent editing engine whose canonical state is ART JSON.

The first engine model uses:

- immutable `EditorState`
- ART document + optional selection
- block-path + character-offset text points
- atomic transactions composed from explicit operations
- pure text/mark/block transformations
- bounded undo/redo history
- optional selection-oriented command helpers

Selections point to paragraph/heading blocks rather than individual text runs. This keeps a selection stable when inline formatting splits or merges ART text nodes.

## Transaction semantics

Transactions clone the input state and apply operations to the clone. If any operation is invalid, the transaction throws and the original state remains unchanged.

Initial text replacement across multiple blocks deliberately preserves block structure: text is removed from the affected blocks, but paragraphs/headings are not implicitly joined. Structural block joining/splitting is a separate command so it can be tested and reasoned about explicitly.

## DOM boundary

The Web Component will translate DOM selections/input events into engine selections/transactions and render engine state back to the editing surface.

The DOM layer must not make browser HTML the source of truth once engine integration is complete.

IME/composition and `beforeinput` handling belong to that DOM adapter layer, not to the pure engine.

## Consequences

### Benefits

- engine is testable in Node without a browser
- commands are deterministic and framework-independent
- undo/redo can restore document and selection together
- collaboration and AI can operate on explicit transactions
- formatting does not depend on deprecated browser commands

### Costs

- selection mapping and DOM reconciliation must be implemented carefully
- native browser editing mutations cannot simply be accepted blindly
- structural editing needs explicit operations rather than implicit DOM behavior

## Non-goals for this ADR

This does not select a CRDT implementation, collaboration transport, toolbar design or final DOM reconciliation strategy.

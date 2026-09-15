# Tracked suggestions

A Rich Text suggestions are review metadata stored **outside ART**.

The first suggestion layer supports explicit text insertion, deletion and replacement proposals within one paragraph/heading block. A pending suggestion follows document edits through `@arichtext/annotations`, but is never silently rebased when its proposed source text changes.

## Packages

```text
@arichtext/suggestions          provider/session + review data model
@arichtext/suggestions/memory   in-memory reference provider
@arichtext/suggestions-editor   optional <a-rich-text> binding
```

The base editor does not depend on suggestions.

## Model

```ts
{
  id,
  documentId,
  anchor,
  kind: 'insert' | 'delete' | 'replace',
  originalText,
  replacementText,
  author,
  status: 'pending' | 'accepted' | 'rejected' | 'conflicted',
  revision,
  createdAt,
  updatedAt,
  resolvedAt?,
  resolvedBy?,
  conflictReason?,
  metadata?,
}
```

A suggestion where `originalText === replacementText` is rejected as a no-op.

## Create from the editor

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

// Current selection contains "old text".
const suggestion = await suggestions.createSuggestion('new text');
```

Creating the record does not mutate ART.

The kind is derived automatically:

```text
empty original + replacement   insert
original + empty replacement   delete
original + replacement         replace
```

## Anchor mapping

Pending suggestions own transaction-mapped anchored ranges.

An unrelated edit before/after a suggestion can move its anchor while keeping the proposal pending.

After every deterministic map, the adapter re-reads the source text at the mapped range. If it no longer exactly equals `originalText`, the suggestion becomes `conflicted`.

This is intentional:

> Position can be rebased mechanically. Meaning cannot.

The implementation never assumes that an overlapping user edit should be merged into the review proposal.

## Conflicts

A conflict persists:

- `status: 'conflicted'`;
- the latest deterministic mapped/orphaned anchor;
- a human-readable conflict reason;
- resolution timestamp.

The provider writes the anchor and conflict state in the same optimistic revision.

Common reasons include:

```text
source text changed
anchor became orphaned
document structure changed ambiguously
provider suggestion did not match current document
```

Once a suggestion becomes conflicted it is terminal in this first API. Undoing the edit that caused the conflict does not automatically reopen it. A review system should create/reopen a proposal explicitly rather than coupling business review state to editor undo history.

## Native/programmatic reconciliation

Like comments, suggestions use `inferSimpleReconcileOperations()` for browser-native or remote document replacements.

If one existing text block changed deterministically, the adapter maps the suggestion through the inferred `replaceText` operation and revalidates source text.

Ambiguous structural replacement fails closed as conflict/orphaning.

After application-owned setters:

```ts
editor.setJSON(next);
suggestions.reconcileNow();
```

## Accept

Acceptance is explicit:

```ts
const accepted = await suggestions.accept(
  suggestion.id,
  { id: reviewer.id },
);
```

Before changing the document the adapter verifies:

1. editor is writable;
2. queued anchor persistence has settled;
3. provider record is still pending;
4. anchor is still resolvable;
5. current source text exactly equals `originalText`.

If source text changed, the provider record is first persisted as conflicted and acceptance is refused.

Successful acceptance dispatches a normal engine `replaceText` transaction with suggestion metadata. The document edit is therefore ordinary undoable ART history.

Undoing the accepted edit does not reopen the accepted review record.

## Reject

```ts
await suggestions.reject(suggestion.id, { id: reviewer.id });
```

Rejecting updates review metadata only. It never changes the ART document.

## External provider consistency boundary

For arbitrary external storage there is no universal distributed transaction spanning:

```text
editor engine transaction + provider database commit
```

A Rich Text therefore uses the following order for acceptance:

1. preflight provider revision and source text;
2. apply the normal editor transaction;
3. immediately persist `accepted` review metadata.

If step 3 fails after step 2 succeeded, `SuggestionsEditorError` uses:

```text
code: persistence-failed
```

and includes the already-applied `TransactionResult` plus suggestion data.

The host can then retry/reconcile explicitly. The adapter does not silently undo user-visible document state or pretend persistence succeeded.

A managed/provider-specific implementation may offer stronger atomic semantics where its infrastructure allows it.

## Optimistic revisions

Every provider mutation can use `expectedRevision`.

The editor serializes local anchor updates and retries revision conflicts against the latest still-pending record.

Provider events are cloned before exposing them to consumers.

## Provider reference implementation

```ts
import { createMemorySuggestionsProvider } from '@arichtext/suggestions/memory';
```

The memory provider demonstrates:

- document-scoped rooms;
- multi-client events;
- optimistic revisions;
- strict pending → accepted/rejected/conflicted transitions;
- anchor updates;
- JSON-safe metadata validation;
- clone isolation;
- abort/close lifecycle.

It is a test/example provider, not durable production storage.

## Events

The editor binding emits composed events:

```text
suggestion-event
suggestion-conflict
suggestion-applied
suggestions-error
```

The UI layer remains application-controlled.

## Review data stays outside ART

Pending/rejected/conflicted suggestion records never affect:

```ts
editor.serializeJSON()
editor.getHTML()
editor.getMarkdown()
```

Only accepting a suggestion creates the explicit ART transaction.

## AI integration

`@arichtext/ai` proposals and tracked suggestions are deliberately separate layers.

An AI proposal is ephemeral generation/review data. A tracked suggestion is persistent review workflow state. A follow-up adapter can convert an `AITextProposal` into a tracked suggestion instead of applying it directly.

## Current boundaries

The first release deliberately limits suggestions to:

- one paragraph/heading block;
- plain-text insert/delete/replace proposals;
- explicit accept/reject;
- no automatic semantic rebasing;
- no accept-all/reject-all;
- no inline tracked-change rendering UI yet;
- no CRDT-relative positions yet;
- no structured multi-block replacement proposals yet.

These limitations keep the initial review semantics deterministic and portable.

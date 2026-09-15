# Comments

A Rich Text comments are **review metadata**, not document content.

A comment thread is stored separately from ART and references the document through a transaction-mapped anchored range from `@arichtext/annotations`.

This separation keeps:

- exported ART free of review-only records;
- HTML/Markdown output free of comment spans;
- providers independently self-hostable;
- comments usable with or without realtime collaboration;
- comments able to survive ordinary editor transactions.

## Packages

```text
@arichtext/comments
    thread/message/reaction model
    provider/session interface
    validation/cloning
    in-memory reference provider

@arichtext/comments-editor
    optional <a-rich-text> binding
    anchor mapping
    undo/redo anchor restoration
    native-reconcile handling
    provider anchor persistence
```

The base editor has no comments dependency.

## Thread model

A thread contains:

```ts
{
  id,
  documentId,
  anchor,
  messages,
  status,
  revision,
  createdAt,
  updatedAt,
  resolvedAt?,
  resolvedBy?,
}
```

`anchor` is one of:

```text
mapped
collapsed
orphaned
```

### Mapped

The thread still refers to a non-empty logical ART range.

### Collapsed

The original anchored content was deleted or otherwise mapped to one logical point.

The thread remains a valid review record. Product UI can show it as detached/collapsed and offer re-anchoring or resolution.

### Orphaned

The editor cannot justify a deterministic location after a structural change.

The record is retained with a reason rather than silently moved or deleted.

## Messages

A thread's first message is the root comment. Later messages are replies.

```ts
{
  id,
  author: {
    id,
    data?,
  },
  body,
  mentions?,
  reactions,
  createdAt,
  updatedAt,
  deletedAt?,
}
```

Author metadata must be finite JSON-safe data.

Mentions are explicit user ids. Rendering `@Alice` or resolving ids to profiles is an application concern.

## Message deletion

Deleted messages are tombstoned rather than removed:

```ts
{
  body: '',
  deletedAt: 123,
  ...
}
```

This preserves:

- reply order;
- audit/reference continuity;
- stable message ids;
- thread history semantics.

## Reactions

Reactions are stored as:

```ts
{
  key: '👍',
  userId: 'user-1',
  createdAt,
}
```

The core model does not impose an emoji catalogue. Applications can use emoji, symbolic ids or a controlled reaction vocabulary.

## Resolve and reopen

```ts
await session.resolveThread(threadId, author);
await session.reopenThread(threadId);
```

Resolution records resolver identity/time and does not remove the thread or anchor.

## Provider contract

```ts
import type { CommentsProvider } from '@arichtext/comments';

const session = await provider.connect({
  documentId: 'article-123',
  clientId: 'client-a',
});
```

A session supports:

```ts
session.listThreads();
session.getThread(id);

session.createThread(...);
session.reply(...);
session.editMessage(...);
session.deleteMessage(...);
session.resolveThread(...);
session.reopenThread(...);
session.addReaction(...);
session.removeReaction(...);
session.updateAnchor(...);

session.subscribe(listener);
session.close();
```

Provider state is scoped by document id.

## Optimistic revisions

Every thread has an opaque revision string.

Mutations can supply:

```ts
{
  expectedRevision: thread.revision,
}
```

The in-memory reference provider rejects stale writes with `revision-conflict`.

Real providers should use equivalent optimistic concurrency or stronger server-side conflict semantics.

## In-memory provider

```ts
import {
  createMemoryCommentsProvider,
} from '@arichtext/comments/memory';

const provider = createMemoryCommentsProvider();
```

This provider is for tests/examples and same-runtime prototypes. It requires no network and clones all stored/emitted payloads.

It is not persistent storage.

## Bind comments to `<a-rich-text>`

```ts
import {
  connectComments,
} from '@arichtext/comments-editor';

const comments = await connectComments(editor, provider, {
  documentId: 'article-123',
  clientId: crypto.randomUUID(),
  author: {
    id: currentUser.id,
    data: {
      name: currentUser.name,
    },
  },
});
```

Create a thread from the current logical editor selection:

```ts
const thread = await comments.createThread(
  'Can we verify this claim?',
  undefined,
  ['reviewer-user-id'],
);
```

Quote context is captured by default for diagnostics/recovery UX.

## Anchor mapping

The editor controller listens to canonical `transaction` events.

For every document-changing engine transaction it:

1. maps each thread's anchor through the transaction;
2. updates local thread state immediately;
3. restores exact annotation snapshots during editor undo/redo;
4. serializes anchor persistence through the comments provider;
5. emits `comments-anchor`.

Selection-only transactions do not change comment anchors.

## Provider acknowledgements do not rewind typing

Anchor updates are persisted asynchronously.

If a provider acknowledgment for an older mapped anchor arrives after another local editor transaction already moved the comment again, the controller updates the provider revision/message metadata but retains the newer local anchor.

This prevents rapid typing from making comment highlights jump backward while network/provider writes catch up.

## Native reconciliation

Not every browser change is currently an engine transaction. IME composition is the main example.

For a native reconcile the comments editor compares previous and new canonical ART.

If:

- document structure is unchanged; and
- at most one paragraph/heading text value changed;

`@arichtext/annotations` infers one deterministic `replaceText` operation using common prefix/suffix boundaries and maps comments through it.

If the change is structural or ambiguous, affected non-orphaned anchors become:

```ts
{
  status: 'orphaned',
  range: null,
  reason: '...without deterministic anchor mapping',
}
```

The system does not guess.

## Collaboration document replacements

When `@arichtext/collaboration-editor` applies a remote document, it emits `collaboration-remote-document`.

The comments binding performs the same deterministic reconcile attempt against the prior local ART.

A future CRDT comments adapter can map provider-native relative positions more precisely, but the public comments model remains ART-relative.

## Programmatic document replacement

`editor.setJSON()`, `setHTML()`, `setMarkdown()` and `setText()` intentionally do not pretend to be user transactions.

If an application changes the document programmatically while comments are connected:

```ts
editor.setJSON(nextDocument);
comments.reconcileNow();
```

This applies the same deterministic reconcile/orphan policy.

## Events

The comments editor emits composed events:

```text
comments-thread
comments-anchor
comments-error
```

Callbacks are also available in `connectComments()` options.

## Comments do not modify ART

Creating, replying, reacting, resolving or moving a comment never changes:

```ts
editor.serializeJSON()
editor.getHTML()
editor.getMarkdown()
```

This is a deliberate portability boundary.

## Permissions

The core provider interface does not implement user authorization by itself.

Production providers must enforce permissions server-side for operations such as:

- creating threads;
- editing another user's message;
- deleting comments;
- resolving/reopening;
- moderation;
- access to private documents.

Client-side author ids are metadata, not an authorization boundary.

## Current limits

- no built-in comments sidebar/popover UI yet;
- no notification delivery;
- no server permission model;
- no quote-based fuzzy automatic reattachment;
- cross-client anchor mapping is operation/document based, not CRDT relative-position based;
- thread deletion is not part of the first contract;
- tracked suggestions are a separate review record type.

These are explicit follow-up layers, not hidden server features.

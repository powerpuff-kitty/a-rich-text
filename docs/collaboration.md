# Collaboration

A Rich Text collaboration is optional infrastructure. The editor does not require an A Rich Text server, WebSocket service or specific CRDT library.

The collaboration architecture is split into two packages:

```text
@arichtext/collaboration
    provider/session contracts
    document validation
    presence
    reference in-memory provider

@arichtext/collaboration-editor
    optional <a-rich-text> binding
    local publish queue
    remote application
    presence wiring
    host events
```

The base `@arichtext/web-component` package has no collaboration dependency.

## Merge capability is explicit

Every provider advertises one of two document merge modes:

```ts
provider.capabilities.merge === 'snapshot'
provider.capabilities.merge === 'concurrent'
```

### `snapshot`

The provider synchronizes complete canonical ART documents. It may use revision tokens to reject stale writes, but it does **not** claim to merge simultaneous edits.

This is useful for:

- prototypes;
- single-writer synchronization;
- autosave/session handoff;
- providers that implement application-specific locking;
- testing the public collaboration contract.

It must not be marketed as Google-Docs-style conflict-free collaboration.

### `concurrent`

The provider actually implements concurrent multi-writer merge semantics, for example through a CRDT adapter.

The planned Yjs adapter will advertise this mode.

The capability flag is intentionally part of the public API so a simple WebSocket transport cannot silently pretend that last-write-wins snapshots are CRDT collaboration.

## Provider contract

```ts
import type {
  CollaborationProvider,
  CollaborationSession,
} from '@arichtext/collaboration';
```

A provider connects to one logical document:

```ts
const session = await provider.connect({
  documentId: 'article-123',
  clientId: 'client-a',
  initialDocument: editor.getJSON(),
});
```

A session exposes:

```ts
session.getDocument();
session.publishDocument(document);
session.subscribeDocument(listener);

session.updatePresence({ selection, data });
session.getPresence();
session.subscribePresence(listener);

session.subscribeStatus(listener);
session.close();
```

All document payloads are validated ART before use.

## Snapshot revisions

Snapshot providers can support optimistic revision checks:

```ts
const current = session.getDocument();

await session.publishDocument(editor.getJSON(), {
  baseRevision: current?.revision,
});
```

A stale revision raises a structured `revision-conflict` error rather than silently overwriting a newer snapshot.

The editor adapter also protects queued local snapshots: if a remote document arrives before a queued local snapshot is published, that queued stale snapshot is rejected.

## Presence

Presence is deliberately separate from persistent ART.

```ts
await session.updatePresence({
  selection: editor.getSelection(),
  data: {
    name: 'Alice',
    avatar: '/avatars/alice.png',
    color: 'orange',
  },
});
```

Presence metadata must be JSON-safe.

A presence record may contain:

- client id;
- logical ART selection;
- application-defined JSON metadata;
- timestamp.

Selection ranges are validated against the provider's current document before they are broadcast.

Presence does **not** become part of the ART JSON document, document history or exported HTML/Markdown.

## In-memory reference provider

`@arichtext/collaboration/memory` supplies a zero-network reference implementation:

```ts
import {
  createMemoryCollaborationProvider,
} from '@arichtext/collaboration/memory';

const provider = createMemoryCollaborationProvider();
```

It synchronizes editors inside the same JavaScript runtime and is useful for:

- tests;
- examples;
- validating custom editor integrations;
- learning the provider interface.

It advertises:

```ts
{
  merge: 'snapshot',
  presence: true,
}
```

It is **not** a production realtime backend and is not a CRDT.

## Bind a provider to `<a-rich-text>`

```ts
import {
  connectCollaboration,
} from '@arichtext/collaboration-editor';

const controller = await connectCollaboration(editor, provider, {
  documentId: 'article-123',
  clientId: crypto.randomUUID(),
  presenceData: {
    name: 'Alice',
  },
});
```

The binding listens to canonical editor events rather than observing mutated HTML.

### Local document changes

Document-changing engine transactions and native reconciliation events are published to the provider.

Selection-only transactions do not publish a document revision.

### Remote document changes

Remote ART is validated again at the editor boundary before application.

Applying a remote document through `editor.setJSON()` does not emit a local transaction, preventing automatic echo loops.

The adapter also tracks change identifiers to ignore duplicate remote deliveries.

### Presence changes

`selection-change` updates presence separately from document publication.

```ts
await controller.setPresenceData({
  name: 'Alice',
  status: 'editing',
});
```

## Initial document policy

When a provider already contains a document, the default behavior is:

```ts
initialDocumentPolicy: 'provider'
```

The joining editor adopts provider state.

An application can explicitly choose:

```ts
initialDocumentPolicy: 'editor'
```

which publishes the joining editor state instead. Snapshot providers use the current provider revision as the optimistic base.

This choice is explicit because silently deciding which side is authoritative can destroy content.

## Events

The editor binding emits composed events on `<a-rich-text>`:

```text
collaboration-status
collaboration-remote-document
collaboration-presence
collaboration-error
```

Callbacks are also available in `connectCollaboration()` options.

## Manual publication

Programmatic `editor.setJSON()` deliberately does not masquerade as a user transaction. If an application changes document state programmatically and wants to sync it immediately:

```ts
await controller.publishNow();
```

## Disconnect

```ts
await controller.disconnect();
```

Disconnect removes editor/provider listeners, waits for already queued local work to settle, and closes the collaboration session.

## Provider implementation guidance

A custom provider should:

1. Validate configuration and credentials before resolving `connect()`.
2. Return only valid ART documents.
3. Generate stable unique change ids.
4. Identify the originating client for every document update.
5. Declare honest merge capabilities.
6. Treat presence as ephemeral.
7. Surface transport/auth/conflict failures instead of swallowing them.
8. Support explicit close/cleanup.

For `snapshot` mode, revision tokens are strongly recommended.

For `concurrent` mode, the provider owns the mapping between ART edits and its merge data structure. The public session still exposes canonical ART state to consumers, but the implementation must not reduce concurrent edits to last-write-wins snapshots.

## Planned adapters

The provider contract is designed for later adapters such as:

- Yjs;
- Hocuspocus;
- WebRTC/Yjs providers;
- Liveblocks;
- PartyKit/custom WebSocket services;
- A Rich Text Cloud realtime.

Those packages remain optional and independently publishable.

## Comments and suggestions

Comments, tracked suggestions and review workflows are not hidden inside the transport layer.

They require stable range/annotation semantics that survive document edits, so they will be built as their own collaboration data models on top of this provider foundation rather than stored as ad-hoc presence or arbitrary DOM markers.

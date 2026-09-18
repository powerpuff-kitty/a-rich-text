# ADR 0004: Keep persistence optional and host-controlled

- Status: Accepted
- Date: 2026-09-18
- Records the implemented persistence boundary; no new storage backend is selected.

## Context

The browser editor must work without an account, backend, API key or network
request. Applications also need to retain ownership of their authoritative data,
retention policy and recovery UX.

## Decision

Keep durable storage outside the base editor in the optional
`@arichtext/persistence-indexeddb` package. Use native IndexedDB for local drafts
and named snapshots. Validate ART before writes and after reads; return independent
document values. Hosts choose document identifiers and control loading, restoring,
deleting and persisting editor state.

Autosave is explicit, debounced and flushable. Serialize writes to prevent older
flushes from overtaking newer ones. Surface storage failures to the host and allow
later retries. Deleting a document removes its snapshots by default, with an
explicit retention override. Apply no implicit schema migration on read/write.

Local draft persistence is not cloud synchronization, a CRDT, encryption, a backup
guarantee or an offline application-shell cache. Hosts own quota/error UI, storage
retention, secure deployment and any service worker needed to reload their app
without a network. Managed cloud storage remains an optional adapter boundary.

## Alternatives and consequences

Mandatory cloud storage conflicts with zero-account/network initialization. Storage
inside core couples document editing to browser APIs. The optional native adapter
keeps the base runtime independent and allows replacement, while requiring hosts
to manage lifecycle, failures and recovery deliberately. Browser eviction and user
clearing of site data remain possible; local storage is not a durable remote backup.

## Evidence and remaining validation

- [Persistence implementation](../../packages/persistence-indexeddb/src/index.ts)
- [Integration and autosave contract](../local-first.md)
- [Persistence tests](../../packages/persistence-indexeddb/test/persistence.test.ts)
- [#7](https://github.com/powerpuff-kitty/a-rich-text/issues/7) retains snapshot comparison and real-browser offline/quota/recovery verification.

This decision records architecture; it does not claim those remaining acceptance
checks have passed.

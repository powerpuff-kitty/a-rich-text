# @arichtext/persistence-indexeddb

Browser-local IndexedDB persistence and snapshots for A Rich Text

ES modules with TypeScript declarations. MIT licensed. No mandatory hosted service.

This package is part of [A Rich Text](https://github.com/powerpuff-kitty/a-rich-text).
See the repository's [integration guide](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md) for local installation and the standard editor.
Exported API declarations are included in `dist/`. Version 0.0.0 is a development snapshot; it is not a stable public release.

See [local-first persistence](../../docs/local-first.md) for autosave, snapshot
comparison, failure recovery and the opt-in offline example. `compareSnapshots`
returns detached structural differences without applying a restore or changing
the current draft.

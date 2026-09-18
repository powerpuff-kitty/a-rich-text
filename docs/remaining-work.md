# Remaining work

Snapshot: 2026-09-18. GitHub issues and Project 19 remain the task tracker; this
page groups the outstanding work so basic integration is distinguishable from
optional platform features. The editor is locally installable at version 0.0.0;
there is no public npm release yet.

## Core editor and integration

Automatic source updates, optional source formatting and non-mutating format
detection are implemented. See [source editing](editor-configuration.md#automatic-source-updates-and-formatting)
and the [editor format catalogue](editor-formats.md).

- [Block interaction #74](https://github.com/powerpuff-kitty/a-rich-text/issues/74): slash insertion, block menus, keyboard movement and drag handles. Contextual inline formatting is implemented separately.
- [Additional formatting #75](https://github.com/powerpuff-kitty/a-rich-text/issues/75): color/background, font/size, sub/superscript, alignment/direction, formula/video contracts and an optional full-grammar highlighting adapter. See [reference review and current modes](editor-modes.md).

- [Authoring #4](https://github.com/powerpuff-kitty/a-rich-text/issues/4): broader selection editing beyond paragraph/heading formatting. Block-style commands now
  apply across selections in one Undo step. The toolbar and API/model support H1–H6. Standard editing detects URL/email tokens on typed spaces;
  Enter/paste/import do not trigger detection. Image, quote, rule, code-block and
  clear-formatting controls, focus mode and find/replace are implemented. Whole-table
  removal is undoable, including for imported merged tables. Horizontal cell merge/split
  and Tab navigation through horizontal and vertical spans are implemented.
  Vertical-grid validation and HTML/JSON round-tripping include fully covered rows. Column insertion/removal supports all spans. Row insertion/removal
  supports all spans, preserving surviving cell content and review mappings. Split cell now supports horizontal, vertical
  and combined spans, with Undo and preserved review-anchor mappings. Merge below
  supports vertically adjacent cells with matching column boundaries, including
  existing rowspans. Merge right supports matching row boundaries and correctly
  rejects gaps occupied by carried spans.
- [Media #8](https://github.com/powerpuff-kitty/a-rich-text/issues/8): physical-browser image/orientation checks around
  the optional media adapters. The image dialog now supports local previews,
  host-provided uploads, progress, retry and cancellation.
- [Extensions #6](https://github.com/powerpuff-kitty/a-rich-text/issues/6):
  custom inline atomic nodes and public API stability guarantees. The component
  now includes Default, Minimal and Document appearance presets; these are
  independent of extension feature bundles and tool allowlists.
- [Format profiles #77](https://github.com/powerpuff-kitty/a-rich-text/issues/77): the registry, developer-selected defaults/allowlists and diagnostic review are implemented; see [the contract](format-profiles.md). An optional [Quill text-block adapter](quill-delta.md) is implemented. Other adapters and broader Quill fidelity remain open; detection hints do not implement converters.
- [Schema #2](https://github.com/powerpuff-kitty/a-rich-text/issues/2) and
  [foundation #1](https://github.com/powerpuff-kitty/a-rich-text/issues/1): broader [CommonMark 0.31.2 compatibility](markdown-compatibility.md), foreign-editor adapters, versioning/persistence decisions and stability policy. The
  [ART v1 JSON Schema artifact](json-schema.md), structural parity checks and
  [explicit migration API](migrations.md) are implemented. No historical migrations are bundled.

Customization no longer requires shadow-tree mutation: use the
[CSS parts, custom-toolbar and Vue/Tailwind examples](customization.md). A
separate Vue editing engine is unnecessary; the wrapper is optional.

## Production release gates

The [latest full local run](verification/2026-09-16-surfaces.md) passed 648 unit
tests, all 470 browser cases without retries/skips, and 27 package installation
checks. It covers the latest format converters, source/output showcase controls,
and shared editor surfaces. The manual and release prerequisites below remain.

The [newer empty-blockquote increment](verification/2026-09-18-blockquotes.md)
passed 1,103 unit tests, 160 targeted browser cases and 27 package checks. It covers
thematic-break/list boundaries, safe URI/email links and emphasis delimiter runs,
including mixed-formatting export round trips, Unicode paragraph preservation,
GFM pipe-table cell semantics and empty-quote preservation across HTML/Markdown;
it does not
replace the full browser baseline or complete #2's interoperability scope.

- [Quality #11](https://github.com/powerpuff-kitty/a-rich-text/issues/11) and
  [local gates #46](https://github.com/powerpuff-kitty/a-rich-text/issues/46): real
  iPhone/Android, IME/mobile keyboard, screen-reader, RTL/reduced-motion,
  performance and broader fuzz/clipboard validation. Browser emulation and
  synthetic paste are not substitutes for those checks. Composition/native
  reconciliation and source import currently reset history.
- [Distribution #13](https://github.com/powerpuff-kitty/a-rich-text/issues/13):
  release/version policy, npm scope/ownership, publication and public governance
  prerequisites. The 27 local package tarballs and standalone bundle already
  have reproducible verification. GitHub Actions remains disabled by request.

## Optional capabilities

These do not need to block an ordinary embedded rich-text field:

- [Local-first #7](https://github.com/powerpuff-kitty/a-rich-text/issues/7): browser
  offline recovery/quota evidence and snapshot comparison.
- [Collaboration #9](https://github.com/powerpuff-kitty/a-rich-text/issues/9):
  concurrent/Yjs providers, diff primitives and production review UI. Existing
  snapshot synchronization is not concurrent conflict-free collaboration.
- [AI #10](https://github.com/powerpuff-kitty/a-rich-text/issues/10): structured
  edits, suggestion integration and browser-local model examples.
- [Roadmap #14](https://github.com/powerpuff-kitty/a-rich-text/issues/14): manually
  verify Project auto-add filters and saved views not exposed by the public API.

Website and cloud work lives in separate repositories on the same project; it
is not a dependency of the browser component. The next practical editor work is
broader table/selection authoring and production checks.

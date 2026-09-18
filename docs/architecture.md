# A Rich Text architecture

## Product boundary

A Rich Text is a browser-first rich-text editor whose primary integration surface is the native `<a-rich-text>` custom element.

The open client runtime must not require an account, API key, framework runtime, network request, hosted storage, hosted collaboration service, or A Rich Text backend.

Paid products should be optional managed infrastructure: realtime relay, durable sync/storage, high-fidelity conversion, managed AI gateway, backups, audit/enterprise services and support.

## Package direction

```text
@arichtext/core
      ↑
@arichtext/web-component
      ↑
framework adapters (later)
```

Core must remain DOM-light and framework-independent. Browser-specific rendering and Custom Elements APIs live in `@arichtext/web-component`.

The implemented package layers refine this initial direction:

- `core` owns document validation, serialization, profile contracts and explicit migrations.
- `engine` owns immutable state/transactions; `dom` translates browser editing and selection.
- `html`, `markdown` and `clipboard` provide conversion and paste boundaries; `extensions` supplies optional trusted hooks and composition presets.
- `web-component` exposes the browser control; `ui` and `editor` compose its toolbar and distribution surface.
- Lists, links, tables, media, annotations, comments, suggestions, persistence, collaboration and AI remain feature/provider packages with optional editor adapters.
- Framework examples/adapters consume these contracts; core does not depend on a framework runtime. Optional hosted services live outside the editor runtime.

Package manifests are the executable dependency graph. The
[dependency policy](../quality/dependency-policy.json) and local package-policy
verification enforce framework and optional-provider boundaries. Provider-driven
features may use host-supplied network services; base initialization/editing does
not require them.

## Stability and recorded decisions

The [public API stability policy](api-stability.md) defines the exported and
documented surface, the unpublished `0.0.0` boundary and compatibility obligations.
The decision index records [ART-first editing](adr/0001-editing-engine.md),
[table-grid validation](adr/0002-table-grid-validation.md),
[document versioning](adr/0003-document-versioning.md) and
[optional local persistence](adr/0004-optional-local-persistence.md).
These architecture decisions do not complete the separate implementation and
physical-device/release gates tracked by their feature tickets.

## Canonical data

ART JSON is the canonical persisted document representation. HTML, Markdown and plain text are conversion formats. ART documents are versioned so future migrations can be explicit and testable.

## Runtime principles

1. Local execution first.
2. Explicit host-application boundaries for persistence, uploads, collaboration and AI.
3. Deterministic serialization.
4. Tree-shakeable features and presets.
5. Accessibility and IME correctness are release gates.
6. Security boundaries are explicit for untrusted HTML, URLs, embeds and files.

## Initial performance targets

Targets are budgets until measured and published from reproducible benchmarks:

- zero mandatory network requests to initialize or edit;
- zero framework runtime dependency;
- minimal editor target below 50 KB gzip;
- normal typing work should stay below one animation frame and target <8 ms p95 processing time on reference hardware.

## Initial roadmap

1. ART schema and editor state.
2. `<a-rich-text>` native control.
3. Core formatting and blocks.
4. HTML/Markdown conversion.
5. Extension API and presets.
6. IndexedDB/local history.
7. Media/upload providers.
8. Collaboration providers.
9. BYO AI adapters.
10. Optional paid managed services.

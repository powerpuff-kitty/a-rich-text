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

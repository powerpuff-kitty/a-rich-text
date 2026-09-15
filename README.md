# a rich text

**A browser-first rich-text editor that behaves like a native HTML control.**

The primary integration surface is `<a-rich-text>`. The open client runtime is designed to work without an account, API key, framework runtime, mandatory server, or mandatory network request. Optional paid products will focus on managed infrastructure rather than locking ordinary editor features behind a subscription.

> Status: early foundation. The repository is not ready for production use yet.

## Direction

- native Web Component first
- framework-independent TypeScript core
- canonical versioned ART JSON document model
- HTML / Markdown / plain-text conversion in the browser
- local-first drafts and history
- pluggable persistence, uploads, collaboration and AI
- accessibility, IME correctness, security and performance as release gates

See [`docs/architecture.md`](docs/architecture.md).

## Workspace

```text
packages/core           @arichtext/core
packages/web-component  @arichtext/web-component
```

## Intended API

```html
<form>
  <a-rich-text
    name="body"
    placeholder="Write something…"
  ></a-rich-text>
  <button>Submit</button>
</form>

<script type="module">
  import '@arichtext/web-component'
</script>
```

The initial element already exposes plain-text value handling, form association, readonly/disabled state, ART JSON serialization and CSS customization hooks. Formatting, structured DOM mapping, Markdown/HTML conversion and extension packages are tracked in the roadmap issues.

## Development

```bash
pnpm install
pnpm build
```

## Business model principle

**Free software, paid infrastructure.**

Features that can reasonably execute on the user's device should stay client-side. Future managed services may include realtime relay/sync, durable storage, high-fidelity document conversion, managed AI routing, backups, enterprise audit/SSO and support.

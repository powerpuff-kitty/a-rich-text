# Format profiles: local verification

Runtime/test revision: `ea0fbbe066abcd32008b565e00e6fa8c3589f6f5`. All checks ran locally; GitHub Actions remains disabled.

- Workspace build, TypeScript/Vue checks, package policy and **453 unit tests** across 71 files passed.
- **420 browser cases** passed across five profiles (84 each), with zero failures, retries or skips. Four workers, 30-second test deadline and default five-second assertions. Gallery frame initialization uses the normal test deadline before its scroll/focus assertions.
- **26 tarballs** passed offline inspection, SSR imports for all exports and isolated TypeScript consumer checks, including `@arichtext/core/profiles`.
- **25 component-only screenshots** refreshed without script errors.
- Bundle ceilings passed: minimal **38,215 gzip bytes**, standard **57,077**.

The new coverage exercises custom source and output profiles, native forms, malformed drafts, explicit loss confirmation, late registration, configuration validation, disposal, export-only views, attribute ordering, empty IDs, and the standalone Article JSON example. Existing editing, media, tables, aliases, source tools and gallery checks remain covered by the full run.

Earlier development runs exposed initialization/configuration defects and overly strict gallery setup/position assertions. Those were corrected before this fixed-build run. Runs interrupted by rebuild-triggered Vite reloads or development failures are not used as passing evidence.

See [machine-readable results](2026-09-16-format-profiles.json) for counts and the raw Playwright report hash.

## Limits

Custom converters must report their own losses. Built-in converters retain their documented fidelity limits and do not provide exhaustive loss diagnostics. No foreign-editor adapter, ART JSON Schema artifact or migration API is included. Real-device/IME/screen-reader and release/governance gates remain open under #11/#46/#13. This is a locally verified development snapshot, not a public npm release.

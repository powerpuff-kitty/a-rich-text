# Document migration API: local verification

- `pnpm exec vitest run packages/core/test/migrations.test.ts`: 26 passed.
- `pnpm verify`: 526 tests across 73 files, package builds, TypeScript/Vue checks, package policy and bundle ceilings passed.
- `pnpm verify:distribution`: 26 offline tarballs passed all-export SSR imports and isolated TypeScript consumer checks. The installed migration entry point validates a current ART document; the TypeScript consumer checks its typed result.
- Minimal/standard bundles remain 38,215/57,077 gzip bytes. No new dependency.
- Migration source SHA-256: `3f6dc9a80c54257967f4bb918f6955a9a8276a4686f3a91d31b99780fcba9c2d`.

Coverage includes current ART validation, host-supplied legacy conversion, synthetic multi-step/direct paths, full-path preflight, registration/disposal, path snapshots, malformed/versioned inputs, output version checks, callback/validator failures, result isolation and failure without partial documents.

The separate optional subpath does not change existing browser runtime or UI. Browser tests/screenshots were not rerun; [PR #85](2026-09-16-format-profiles.md) remains the latest full browser baseline. All verification was local, without GitHub CI.

No historical ART migration, downgrade, storage update or loss-review UI is provided. ART still defines only v1. Synthetic test versions demonstrate registry behavior, not new supported ART formats.

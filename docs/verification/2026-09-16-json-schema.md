# ART JSON Schema local verification

- `pnpm exec vitest run packages/core/test/schema.test.ts`: 47 passed, covering structural parity and explicit runtime-only semantic checks.
- `pnpm verify`: 500 unit tests across 72 files, builds, TypeScript/Vue checks, package policy and bundle ceilings passed.
- `pnpm verify:distribution`: 26 tarballs passed offline inspection, all-export SSR imports and the isolated TypeScript consumer. The installed JSON schema is imported with a JSON import attribute and its version is checked.
- Gzip sizes unchanged: minimal 38,215 bytes; standard 57,077 bytes. Ajv is test-only.
- Schema SHA-256: `1b7a5bc56ceda21c5becb5fc116bb72030db2ee31a093bbdb3df1646c8cfe5be`.

No editor runtime or UI changed. Browser tests/screenshots were not rerun for this static artifact increment; the [PR #85 baseline](2026-09-16-format-profiles.md) remains the latest full browser evidence. All verification was local; no GitHub CI was used.

The initial schema's recursive alternatives caused excessive work on the deep-nesting fixture. Block validation now selects constraints by node type, and that fixture passes in the completed run.

The schema artifact is packaged, not deployed to a hosted schema URL or released on public npm. Runtime validation remains required for table semantics and nesting limits. Migration support remains outstanding in #2.

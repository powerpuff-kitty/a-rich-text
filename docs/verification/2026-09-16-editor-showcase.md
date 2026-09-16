# Full local verification: editor shell, dropdowns and showcase

All gates passed on source revision `9c08f48cde1c5d2cb4b176d7337cc0d9662cddc0`. The following evidence
commit updates documentation, compatibility metadata and four final screenshots;
it does not change runtime behavior or test configuration.

Commands: `pnpm verify`, `node scripts/build-distribution.mjs`,
`node scripts/capture-docs.mjs`, `pnpm test:browser` and `pnpm verify:distribution`.
Everything ran locally. GitHub Actions remains disabled.

| Gate | Result |
| --- | --- |
| Package policy, builds, TypeScript and Vue examples | Passed |
| Unit tests | 406 passed across 66 files; four workers |
| Full browser matrix | 330 passed, 66 per profile; zero failures/retries/skips |
| Browser timing | Default 30s tests / 5s assertions; four workers; 263.8 seconds |
| Distribution | 26 tarballs inspected; every export imported without a DOM; isolated TypeScript consumer passed |
| Minimal bundle | 34,130 gzip bytes / 51,200 ceiling |
| Standard bundle | 51,461 gzip bytes / 66,560 ceiling |
| Optional highlighter | 1,702 minified bytes / 933 gzip bytes; separate import |
| Gallery | 24 component-only captures, no browser script errors |

Profiles: Chromium desktop, Firefox desktop, WebKit desktop, Pixel 7 Chromium
emulation and iPhone 15 WebKit emulation. Installed browser versions remain
Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6.

New browser coverage checks shared borders and distinct presets, showcase tool
configuration, viewport-edge flipping, keyboard dropdown selection/dismissal,
inline selection positioning and formatting, source-format access, modal focus
mode and optional highlighting without export changes. Existing editing, source
drafts, native forms, tables, custom buttons and Vue remount coverage also passed.
Unit coverage includes safe highlighting, unknown/oversized language fallbacks,
canonical export/history preservation and teardown.

Visual review covered desktop/mobile showcase, three presets, contextual toolbar,
code highlighting and dropdown captures. Preset screenshots omit focus outlines
so their actual frame differences remain visible. Local Markdown file links and
`git diff --check` passed.

An earlier unit run exceeded startup/test timeouts under machine load. Unit
parallelism is now bounded at four workers; no test/assertion timeouts were
increased. The final full sequence above passed on that configuration.

[Machine-readable summary](2026-09-16-editor-showcase.json) includes per-profile counts and the raw
browser report SHA-256. Local logs: `/tmp/art-complete-*.log`; the replaceable,
ignored raw report is `test-results/playwright-results.json`.

## Limits and next work

Inline mode is contextual formatting, not Notion-style block editing. Block
controls/slash insertion are tracked in #74; additional formats/embeds in #75.
Highlighting is a basic lexer, not a full grammar engine. Physical-device, real
IME, screen-reader, broad RTL/reduced-motion, performance and public-release
gates remain open; browser emulation does not replace those checks.

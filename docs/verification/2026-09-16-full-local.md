# Full local verification — 2026-09-16

`pnpm verify:local` passed end to end on clean revision
`fd126f9c51ba3defaf85d9ce8cf4031bb492919b` (PR #65 integration). No runtime fixes, retries,
timeout changes or worker overrides were needed. The subsequent evidence commit
changes documentation and compatibility metadata only.

## Results

| Gate | Result |
| --- | --- |
| Package/dependency policy, builds, TypeScript and Vue examples | Passed |
| Unit tests | 361 passed across 63 files |
| Full browser matrix | 260 passed, 52 per profile, zero failures/retries/skips |
| Browser timing | Default 30s test / 5s assertion limits; 4 default workers; 163.4s total |
| Package installation | All 26 tarballs passed isolated consumer checks |
| Minimal bundle | 31,120 gzip bytes / 51,200 ceiling |
| Standard bundle | 45,763 gzip bytes / 66,560 ceiling |

Profiles: Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6,
Pixel 7 Chromium emulation and iPhone 15 WebKit emulation. Environment:
Darwin x86_64, Node 26.8.1, pnpm 10.17.1. Browser run started at
`2026-09-16T09:11:51.371Z`.

This full run covers the current formatting, source views, native forms,
customization, image/code dialogs, find/replace, focus mode, automatic links,
multi-block styles and table-authoring regressions. It supersedes the earlier
qualified full-run evidence for the automated targets at this revision.

## Evidence and limits

[Machine-readable summary](2026-09-16-full-local.json) records per-profile counts,
versions and the SHA-256 of the raw Playwright report. Local raw artifacts:
`/tmp/art-full-local.log` and `test-results/playwright-results.json` (ignored).
The committed summary is durable; local raw artifacts may be replaced by a later
run. [Compatibility matrix](../../quality/compatibility-matrix.json) points to
this evidence; manual statuses remain unchanged.

This is automated local verification, not physical-device, operating-system
clipboard, real-IME, screen-reader, RTL/reduced-motion or performance
certification. Those gates and publication prerequisites remain open. GitHub
Actions remained disabled; no hosted CI ran.

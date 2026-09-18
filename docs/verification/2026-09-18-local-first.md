# Local-first completion verification

Runtime/test revision: `aa70d6ab158b4b64845ec7456515bb49caf00edd`.

- `pnpm verify`: 1,243 unit tests in 91 files; package boundaries, builds, TypeScript/Vue checks and bundle budgets passed.
- `pnpm verify:distribution`: 27 tarballs inspected, DOM-free exports and isolated TypeScript consumer passed, including `@arichtext/core/diff`.
- Targeted `tests/browser/local-first.spec.ts`: 25 cases passed, five per Chromium, Firefox, WebKit, mobile Chromium and mobile WebKit profile; one worker, zero retries/failures/skips. A temporary config disabled the unrelated development web server; each test serves the built artifacts from its own static loopback server.
- Minimal/standard bundle gzip is unchanged at 40,881/59,819 bytes. Persistence and structural diff stay optional.

Browser cases use keyboard input and native IndexedDB. They cover committed-draft
recovery after reload and page replacement; offline edits; snapshot comparison
without changing the draft; explicit restore; quota-error retry; actual transaction
abort and preservation of the last successful draft; and incompatible stored data
that is rejected without replacement. Unit cases additionally cover corrupt
snapshots, missing/cross-document comparison, detached diff values, aborted reads,
external database deletion/reopening and refusing a newer database version without
deleting its contents.

For the offline case, the origin server is stopped and an uncached Node fetch must
fail. Navigation must report a service-worker response. Chromium and Firefox also
use Playwright offline emulation. WebKit offline emulation initially failed with an
internal error, matching [upstream #42775](https://github.com/microsoft/playwright/issues/42775);
its final tests use origin unavailability without that flag. These are explicitly
different test conditions. A development-server attempt was replaced by static
artifact serving to remove injected HMR requests. Application-set edits passed,
then tests were strengthened to use keyboard events after WebKit's `fill()` path
did not trigger the expected input. The final counts above are from the committed
keyboard-input suite with no retries.

Quota errors are injected at the native write boundary; no claim is made that
physical storage was exhausted on each device. Replacing the page verifies recovery
of committed data, not lossless recovery of uncommitted input or an operating-system
crash. Mobile profiles are emulation. No hosted service, credential, public npm
publication or GitHub Actions run is involved.

The separate 585-case full-stack baseline is recorded in
[integration evidence](2026-09-18-integrated-stack.md). This targeted run does not
claim to be a new full 610-case run. [Machine-readable result](2026-09-18-local-first.json)
· [Persistence contract](../local-first.md).

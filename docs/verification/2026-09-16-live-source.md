# Local verification: live source tools and short component aliases

All gates passed on source revision `dcf1e7fded102ae08a979f98d25bd7ed2648e887`. The following evidence
commit updates documentation, compatibility metadata and screenshots without
changing runtime code or test configuration.

All checks ran locally. GitHub Actions remains disabled.

| Gate | Result |
| --- | --- |
| Package policy, workspace builds, TypeScript and Vue examples | Passed |
| Unit tests | 428 passed across 69 files; four workers |
| Full browser matrix | 365 passed, 73 per profile; zero failures/retries/skips |
| Browser settings | Four workers, default 30s tests / 5s assertions; 204.8 seconds |
| Distribution | 26 tarballs inspected; every export imported without a DOM; isolated TypeScript consumer passed |
| Optional formatter consumer | Installed and executed offline from local packages |
| Minimal bundle | 35,472 gzip bytes / 51,200 ceiling |
| Standard bundle | 54,190 gzip bytes / 66,560 ceiling |
| Gallery | 25 component-only captures; no browser script errors |

Profiles: Chromium desktop, Firefox desktop, WebKit desktop, Pixel 7 Chromium
emulation and iPhone 15 WebKit emulation. Browser versions remain Chromium
153.0.8010.12, Firefox 155.0 and WebKit 26.6.

New coverage includes short/long tag interoperability, native forms and
focus-mode reparenting through aliases, late sibling toolbar binding, contextual
source-toolbar actions and hover/focus/touch code-edit icons. It also covers automatic updates in every supported source family,
debounce/caret/raw-source preservation, synthetic composition, invalid JSON
recovery, external-update conflicts, reset/disconnection/locks, async formatter
staleness, strict JSON formatting and detection ambiguity. Browser tests exercise
automatic native-form submission, blocked invalid JSON, locally loaded formatter
chunks and foreign-profile detection. Existing manual source workflows remain
covered explicitly. Changed Markdown file links and `git diff --check` passed.

Prettier is optional and larger than the basic highlighter. The browser build
splits its standalone runtime and HTML, Markdown, Babel and Estree parsers;
JSON loads Babel + Estree, HTML/Markdown load their respective parser. None enter
the normal editor entry. Exact chunk sizes and the browser-report hash are in the
[machine-readable evidence](2026-09-16-live-source.json). Formatting, validation,
sanitization and conversion are separate operations.

Earlier checks exposed a mobile Submit layout shift, an async formatter race,
toolbar binding before an editor sibling connected, and a Chromium focus loss
from temporarily hiding the focus-mode button during refresh. These were corrected.
The offline consumer verifier also needed the locked local Prettier package
instead of npm's separate registry cache, and support for npm's object-shaped
pack output. The final runs above supersede interrupted/development runs.
Logs: `/tmp/art-ready-verify.log`, `/tmp/art-ready-browser.log`,
`/tmp/art-ready-pack.log`, `/tmp/art-ready-capture.log`.
The replaceable raw browser report is `test-results/playwright-results.json`.

## Limits

Foreign JSON profiles remain reference/detection hints, not import adapters.
Markdown remains the ART subset. Applying changed source clears visual undo
history; automatic updates preserve the raw textarea value and caret. Manual
physical-device, real-IME, screen-reader, broad RTL/performance and public-release
gates remain open. See [remaining work](../remaining-work.md).

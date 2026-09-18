# Compatibility contract

A Rich Text separates **targets** from **verified support**.

A browser/device appearing in the test matrix means the project intends to test it. It is not a support claim until current evidence exists.

The machine-readable source is:

```text
quality/compatibility-matrix.json
```

## Automated targets

The Playwright configuration currently targets:

| Target | Evidence source | Current status |
|---|---|---|
| Chromium desktop | `chromium` Playwright project | verified locally, 2026-09-18 |
| Firefox desktop | `firefox` Playwright project | verified locally, 2026-09-18 |
| WebKit desktop | `webkit` Playwright project | verified locally, 2026-09-18 |
| Pixel 7 Chromium emulation | `mobile-chromium` | verified locally, 2026-09-18 |
| iPhone 15 WebKit emulation | `mobile-webkit` | verified locally, 2026-09-18 |

See [local verification evidence](verification/2026-09-18-integrated-stack.md) for versions, commands and scope. These results cover the full 585-case automated suite on the tested runtime revision; they do not establish physical-device, screen-reader or IME support. Validation runs locally without requiring GitHub Actions.

## Browser smoke contract

For a browser target to become automatically verified, the current suite must pass at least:

```text
custom-element registration
accessible textbox semantics
contenteditable text input
engine-backed undo
form-associated serialization
optional toolbar formatting/focus
readonly protection
portable extension fallback rendering
list Enter/exit and atomic undo
table row/column editing and undo
```

Additional regression suites cover conversion/security independently of Playwright.

## Physical-device contract

Browser emulation is not physical-device evidence.

Before the first production-ready release, manually verify at least:

```text
Safari on a physical iPhone
Chrome on a physical Android device
mobile selection handles
virtual-keyboard open/close and viewport scrolling
floating/selection toolbar behavior where enabled
paste from native applications
orientation/zoom behavior
```

Record exact OS/browser versions with the release evidence.

## IME/composition

Rich-text editing must not claim broad international input support solely because Latin keyboard typing passes.

Manual/automated coverage should include:

```text
Japanese IME
Simplified/Traditional Chinese IME
Korean IME
composition cancellation/replacement
browser spellcheck/autocorrect
dictation where relevant
```

The editor deliberately lets native composition remain native until `compositionend`, then reconciles canonical ART. This behavior still needs real browser/IME evidence before a production compatibility claim.

## RTL and bidirectional content

Verify:

```text
Arabic
Hebrew
mixed RTL/LTR paragraphs
links/numbers inside RTL text
selection movement
toolbar positioning
copy/paste
```

The base component should inherit document direction rather than impose LTR styling.

## Accessibility evidence

Automated DOM/ARIA tests are required but not sufficient.

Manual release evidence should include at least one screen-reader/browser pairing, and ideally:

```text
VoiceOver + Safari
NVDA + Firefox or Chrome
JAWS + Chrome/Edge
```

Verify:

```text
textbox name/description
readonly/disabled/required/invalid state
keyboard-only formatting
selection announcements
toolbar button pressed/disabled state
focus order
undo/redo
errors/status messaging in integrating UI
```

## Version policy

Compatibility records should use exact versions, for example:

```text
Safari 26.0 / iOS 26.0
Firefox 155
Chromium 145
```

Do not publish evergreen statements such as “works in all modern browsers” without a defined version window and recent evidence.

A practical public support policy after evidence exists can use:

- current and previous major versions for Chromium/Firefox;
- current major Safari/WebKit generation;
- current iOS Safari generation;
- explicit known limitations outside that window.

That policy is not considered active until the first evidence-backed release.

## Evidence lifecycle

For each release candidate:

1. run `pnpm verify`;
2. run the Playwright matrix from a clean build;
3. retain the local browser JSON/traces with the tested revision and lockfile;
4. perform required physical-device/assistive-technology checks;
5. update the compatibility evidence/status;
6. document any failing target or workaround before release.

A failed target is a known limitation, not something to hide by removing it from the matrix.

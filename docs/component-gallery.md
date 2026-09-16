# Component gallery

Captured from the working local distribution in Chromium. These are real browser
screenshots, not mockups. The standard capture fixture only styles the outer page
(font, margins and label spacing); component shadow styles remain unchanged.
The custom examples demonstrate their own documented styling.

## Standard editor

The standard editor combines the optional toolbar with the native-form Web Component. The sample includes formatted text, a link and interactive task checkboxes.

![Standard editor — The standard editor combines the optional toolbar with the native-form Web Component](screenshots/standard-editor.png)

## Base Web Component

The same document without the optional toolbar. Source-view buttons are enabled by the fixture’s `views` attribute.

![Base Web Component — The same document without the optional toolbar](screenshots/base-editor.png)

## Formatting toolbar

Font Awesome controls adapt to the selection and enabled tools. Table row/column controls appear only within a table.

![Formatting toolbar — Font Awesome controls adapt to the selection and enabled tools](screenshots/toolbar.png)

## Table controls

Selecting a table cell exposes row and column operations.

![Table controls — Selecting a table cell exposes row and column operations.](screenshots/table-controls.png)

## Link editor

Inline URL entry with Apply, Remove and Cancel controls.

![Link editor — Inline URL entry with Apply, Remove and Cancel controls.](screenshots/link-editor.png)

## HTML view

Editable HTML source with explicit Apply/Discard.

![HTML view — Editable HTML source with explicit Apply/Discard.](screenshots/source-html.png)

## Markdown view

Markdown source for the same document.

![Markdown view — Markdown source for the same document.](screenshots/source-markdown.png)

## JSON view

Canonical ART JSON source.

![JSON view — Canonical ART JSON source.](screenshots/source-json.png)

## Plain-text view

Plain text omits rich formatting by design.

![Plain-text view — Plain text omits rich formatting by design.](screenshots/source-text.png)

## Find and replace

Search options, result navigation, replacement and highlighted matches.

![Find and replace — Search options, result navigation, replacement and highlighted matches.](screenshots/find-replace.png)

## Code editor

Code text and optional language metadata in a modal editor.

![Code editor — Code text and optional language metadata in a modal editor.](screenshots/code-editor.png)

## Image editor

URL, alternative text, dimensions and preview controls. The example URL is illustrative; no image is fetched. Upload controls appear only when a host supplies an uploader.

![Image editor — URL, alternative text, dimensions and preview controls](screenshots/image-editor.png)

## Focus mode

The editor and toolbar expand into the built-in focus dialog.

![Focus mode — The editor and toolbar expand into the built-in focus dialog.](screenshots/focus-mode.png)

## Mobile layout

The same editor at a 390px-wide viewport. This is Chromium viewport resizing, not physical-device certification.

![Mobile layout — The same editor at a 390px-wide viewport](screenshots/mobile-editor.png)

## Custom HTML/CSS toolbar

The shipped plain-HTML example uses custom buttons, CSS variables and CSS parts.

![Custom HTML/CSS toolbar — The shipped plain-HTML example uses custom buttons, CSS variables and CSS parts.](screenshots/custom-toolbar.png)

## Vue and Tailwind

The shipped optional Vue wrapper uses a toolbar slot, two-way binding and compiled Tailwind styles.

![Vue and Tailwind — The shipped optional Vue wrapper uses a toolbar slot, two-way binding and compiled Tailwind styles.](screenshots/vue-tailwind.png)

## Packages without built-in visual components

Core, engine, HTML/Markdown conversion, clipboard, persistence, extensions,
links/lists/tables commands, media processing, collaboration, AI, annotations,
comments and suggestions expose data APIs or editor adapters. They do not each
ship a standalone visual widget. Their host-owned interfaces therefore have no
built-in component screenshot; see the corresponding package documentation.

## Refresh the screenshots

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm docs:screenshots
```

The command builds the current distribution and examples, starts a temporary
loopback-only server, captures all surfaces and closes the browser/server.
Images live in `docs/screenshots/`; `manifest.json` records browser/version,
viewport and capture names. Review images before committing. Rendering can vary
with OS fonts and browser versions; this is a documentation capture tool, not a
pixel-diff test. No GitHub CI, credentials or external services are needed.

Integration: [configuration](editor-configuration.md) ·
[customization](customization.md) · [image authoring](image-authoring.md).

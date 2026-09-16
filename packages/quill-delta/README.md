# @arichtext/quill-delta

Optional, DOM-free Quill document Delta profile for A Rich Text. MIT licensed.
Depends only on `@arichtext/core`; no Quill runtime or network service is required.

```ts
import { quillDeltaProfile } from '@arichtext/quill-delta';
editor.registerFormatProfile(quillDeltaProfile);
editor.views = ['visual', 'json'];
editor.profiles = ['art:json-v1', 'quill:delta-v2'];
editor.sourceProfile = 'quill:delta-v2';
```

Also exports `importQuillDelta(source)` and `exportQuillDelta(document)` returning
`{ value, diagnostics }` previews. Direct invalid input throws; the profile
registry returns structured failures. Inspect loss diagnostics before applying.

Supports text/marks, headings, flat lists/tasks, paragraph-only quotes and code
blocks. Rejects change operations and imported embeds. Unsupported formatting
reports loss; unsupported ART blocks export as plain-text fallbacks with loss.
This is a subset adapter, not full Quill compatibility. Read the
[mapping and limits](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/quill-delta.md).

ES modules and TypeScript declarations ship in `dist/`. Version 0.0.0 is a local
development snapshot, not a stable public release.

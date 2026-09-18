# @arichtext/editor-js

Optional, diagnostic Editor.js OutputData adapter. It supports paragraph, header,
quote, code, delimiter and list blocks. Checklist lists preserve Editor.js
`{ text, checked }` item objects as ART task items and round-trip them on export.
Unsupported tools are reported as losses; Editor.js plugin-specific data is not
silently treated as ART.

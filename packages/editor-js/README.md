# @arichtext/editor-js

Optional, diagnostic Editor.js OutputData adapter. It supports paragraph, header,
quote, code, delimiter, image, embed, table, warning and list blocks. Image blocks use the common
`data.file.url` shape and map captions to ART alt text. Checklist lists preserve Editor.js
`{ text, checked }` item objects as ART task items and round-trip them on export.
Unsupported tools are reported as losses; Editor.js plugin-specific data is not
silently treated as ART.

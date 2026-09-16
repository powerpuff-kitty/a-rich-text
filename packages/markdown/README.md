# @arichtext/markdown

Dependency-light Markdown conversion for A Rich Text ART documents

ES modules with TypeScript declarations. MIT licensed. No mandatory hosted service.

This package is part of [A Rich Text](https://github.com/powerpuff-kitty/a-rich-text).
See the repository's [integration guide](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/getting-started.md) for local installation and the standard editor.
Exported API declarations are included in `dist/`. Version 0.0.0 is a development snapshot; it is not a stable public release.

The converter implements a supported Markdown subset, including tables and tasks.
It is not a fully conforming CommonMark/GFM parser. See the repository
[conversion contract](../../docs/conversion.md#standards-and-interoperability) for fidelity limits.

## Scoped CommonMark checks

The reference target is CommonMark 0.31.2, with 20 code-span examples verified
and two documented unsupported interactions. The full dialect is not implemented.
See [compatibility scope and fixtures](https://github.com/powerpuff-kitty/a-rich-text/blob/main/docs/markdown-compatibility.md).

# Extensions

A Rich Text extensions add application-specific behavior without placing executable code inside ART documents.

The extension system has two independent layers:

1. **Portable document envelopes** in `@arichtext/core`.
2. **Runtime behavior** in `@arichtext/extensions`.

A document therefore remains valid JSON even when the extension that normally renders it is unavailable.

## Namespaces

Every extension resource uses a lowercase namespaced identifier:

```text
acme:properties
acme:property-card
acme:mention
acme:insert-property
```

Unqualified names such as `property-card` are rejected. This lets independently published packages coexist without a global naming authority.

## Portable custom block

```ts
import type { ARTDocument } from '@arichtext/core';

const document: ARTDocument = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'extensionBlock',
      name: 'acme:property-card',
      attrs: {
        propertyId: 'p-123',
        price: 450000,
      },
      fallbackText: 'Property p-123',
    },
  ],
};
```

`attrs` may only contain finite JSON-safe data. Functions, class instances, `NaN`, `Infinity`, DOM nodes and other runtime objects are not valid ART.

An extension block may also contain ordinary nested ART blocks:

```ts
{
  type: 'extensionBlock',
  name: 'acme:callout',
  attrs: { tone: 'warning' },
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Check this carefully.' }],
    },
  ],
}
```

## Portable custom mark

```ts
{
  type: 'text',
  text: 'Alice',
  marks: [
    {
      type: 'extensionMark',
      name: 'acme:mention',
      attrs: { userId: 'u-1' },
    },
  ],
}
```

Marks remain part of the normal ART text runs, so the editor transaction/selection model does not need a separate sidecar annotation store.

## Define an extension

```ts
import { createExtensionRegistry } from '@arichtext/extensions';

const propertyExtension = {
  name: 'acme:properties',
  version: '1.0.0',

  blocks: [
    {
      name: 'acme:property-card',

      validate(node) {
        return typeof node.attrs?.propertyId === 'string';
      },

      renderDOM(node, { document }) {
        const element = document.createElement('article');
        element.className = 'property-card';
        element.textContent = node.fallbackText ?? 'Property';
        return element;
      },

      toHTML(node) {
        return {
          tagName: 'article',
          attributes: {
            'data-property-id': String(node.attrs?.propertyId ?? ''),
          },
        };
      },

      fromHTML(element) {
        if (element.tagName !== 'ARTICLE') return null;
        const propertyId = element.getAttribute('data-property-id');
        if (!propertyId) return null;
        return {
          type: 'extensionBlock',
          name: 'acme:property-card',
          attrs: { propertyId },
          fallbackText: element.textContent ?? '',
        };
      },

      toMarkdown(node) {
        return node.fallbackText ?? '';
      },
    },
  ],

  commands: [
    {
      name: 'acme:insert-property',
      run({ host }, args) {
        // Host is supplied explicitly by the application/editor integration.
      },
    },
  ],

  keybindings: [
    {
      key: 'Mod-Shift-P',
      command: 'acme:insert-property',
    },
  ],
};

const extensions = createExtensionRegistry([propertyExtension]);
```

## Bind to `<a-rich-text>`

The Web Component accepts a registry structurally; the base package does not require `@arichtext/extensions` at runtime.

```ts
const editor = document.querySelector('a-rich-text');
editor.extensions = extensions;
```

Installed hooks then participate in:

- DOM rendering of `extensionBlock` and `extensionMark`.
- semantic HTML import/export.
- explicit extension commands.
- extension keyboard bindings.

Without a registry, extension data remains portable and renders through fallback content.

## Safe rendering contract

Document data never contains renderer functions or raw trusted HTML.

DOM hooks receive a `Document` and return DOM nodes constructed by installed extension code:

```ts
renderDOM(node, { document }) {
  const output = document.createElement('span');
  output.textContent = String(node.attrs?.label ?? '');
  return output;
}
```

For HTML export, extensions return a descriptor rather than an HTML string:

```ts
{
  tagName: 'span',
  attributes: {
    'data-example': 'value',
  },
}
```

The registry and HTML host reject executable tags, event-handler attributes and unsafe URL protocols.

Installed extension code is still application code and must be treated with the same trust level as any npm dependency. The safety boundary prevents untrusted **document payloads** from turning into arbitrary executable HTML; it cannot make malicious installed JavaScript safe.

## Generic HTML envelope

If no semantic HTML hook is installed, A Rich Text uses its own portable representation:

```html
<div
  data-art-extension-block="acme:property-card"
  data-art-extension-attrs='{"propertyId":"p-123"}'
  data-art-extension-fallback="Property p-123"
>
  Property p-123
</div>
```

Custom marks use the corresponding `data-art-extension-mark` attribute.

The DOM renderer carries the same envelope metadata so native composition/reconciliation cannot silently erase custom attributes.

## Registry behavior

The registry guarantees:

- deterministic installation order;
- duplicate extension rejection;
- duplicate block/mark/command/keybinding rejection;
- rollback when `onInstall` fails;
- owned-resource cleanup even when `onUninstall` throws;
- JSON-safe metadata, command arguments and keybinding arguments;
- validation before custom render/serialization hooks are invoked.

## Presets

`@arichtext/extensions` exposes composable presets:

```ts
import {
  headlessPreset,
  minimalPreset,
  standardPreset,
  documentPreset,
  extendPreset,
} from '@arichtext/extensions';
```

Presets are arrays of capabilities/extensions. They do not fork the editor runtime.

```ts
const myPreset = extendPreset(
  standardPreset,
  propertyExtension,
);
```

This means applications can import only the capabilities they use and bundlers can remove unused extension packages.

## Versioning guidance

Extension authors should treat the combination of `name` + payload shape as persistent document data.

Recommended rules:

- never reuse an existing namespaced node name for incompatible semantics;
- make new attributes optional when possible;
- add explicit extension-side migration functions before changing stored payload shape;
- preserve `fallbackText` for content that should remain readable without the extension;
- do not store derived UI state in ART attributes.

The [explicit document migration API](migrations.md) can coordinate root-version changes. Extension-local compatibility, including payload changes within the same ART version, remains the responsibility of the extension package.

## Current boundaries

The first extension foundation deliberately does **not** claim that every format can preserve every custom semantic.

- ART JSON preserves extension blocks, inline atoms and marks exactly.
- A Rich Text generic HTML envelopes preserve extension data without a registry.
- Registered semantic HTML hooks can map extension data to application-specific safe HTML.
- Markdown currently falls back to block fallback/nested text and strips unknown custom-mark semantics. Registry Markdown hooks exist at the registry layer, but direct `@arichtext/markdown` hook integration remains follow-up work.
- Rich clipboard paste uses the safe HTML importer. Generic A Rich Text extension envelopes round-trip; registered semantic HTML hooks also participate in rich paste.
- Custom inline atomic nodes use one logical caret position; custom marks remain editable text annotations.

## Atomic inline content

Use `extensionInline` for indivisible mentions, references or inline widgets. Unlike
an extension mark, it has its own position in the document:

```ts
import { insertInlineNode } from '@arichtext/engine/commands';
const command = insertInlineNode({ document: editor.getJSON(), selection: editor.getSelection() }, {
  type: 'extensionInline', name: 'acme:mention',
  attrs: { personId: 'alice' }, fallbackText: '@Alice',
});
if (command) editor.dispatch(command);
```

An atom occupies one logical offset, represented as U+FFFC in engine and annotation
text. Its required nonempty fallback label is used for plain-text/Markdown/Quill
export. Those exports lose the atom's identity and attributes; the Quill profile
reports that loss. ART JSON and portable HTML preserve the envelope even without
an installed runtime. Atoms cannot contain editable children, text or marks.
Formatting ranges affect surrounding text only. Deletion, insertion, splitting,
fragment paste and history preserve whole nodes; attributes must be finite JSON.
Text-only AI proposals reject blocks containing atoms rather than reinterpret
logical offsets as positions inside the label.

Register an `inlines` definition with a namespaced `name` and optional `validate`,
`renderDOM`, `toHTML` and `fromHTML` hooks. Custom DOM renderers are trusted installed
code. The editor wraps their output in a noneditable span with the fallback label
as its accessible label. HTML hooks use safe descriptors, never executable document
data. Removing the runtime restores fallback rendering without changing the ART
payload. Block and inline resource names cannot collide.

The [consumer example](../examples/inline-extensions/index.html) is bundled by
`pnpm build:distribution` at `/dist/browser/inline-extensions/`. It imports public
package entry points and supports insertion and runtime removal. This adds a new
inline variant to unpublished ART v1; older snapshots reject it. See
[ADR 0005](adr/0005-atomic-inline-extensions.md) before sharing documents with older
consumers.

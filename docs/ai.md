# AI

A Rich Text AI is **provider-neutral and review-first**.

The editor does not require an A Rich Text inference service, API key or account. Applications decide where inference runs:

- their own backend;
- OpenAI / Anthropic / Gemini / other hosted providers through application-owned infrastructure;
- a managed A Rich Text Cloud gateway in the future;
- a browser-local WebGPU/WASM model;
- a completely custom local or remote provider.

The first AI API deliberately produces **plain-text edit proposals**. Model output never becomes trusted HTML and is never applied automatically.

## Packages

```text
@arichtext/ai
    provider contract
    request building
    streaming collection
    text proposals
    stale-safe transaction conversion

@arichtext/ai-editor
    optional <a-rich-text> adapter
    cancellation
    progress/events
    explicit proposal application
```

The base editor has no AI/model dependency.

## Provider contract

```ts
import type { AITextProvider } from '@arichtext/ai';

const provider: AITextProvider = {
  name: 'my-provider',

  async generateText(request, { signal } = {}) {
    const response = await myApplicationAPI('/ai/rewrite', {
      request,
      signal,
    });

    return response.text;
  },
};
```

`generateText()` may return either:

```ts
string
```

or:

```ts
AsyncIterable<string>
```

for streaming providers.

No OpenAI/Anthropic/etc. SDK is a dependency of `@arichtext/ai`.

## Do not ship secret provider keys in browser code

Browser-first does not mean exposing server API secrets.

For hosted providers that require a private credential, the application should normally implement the A Rich Text provider interface against its **own authenticated backend/gateway**.

Browser-local models or providers designed around safe ephemeral/client credentials can run directly on the device.

This split keeps editor CPU/storage work client-side where practical without turning private model credentials into public JavaScript.

## Tasks

The first contract supports:

```text
rewrite
shorten
expand
summarize
translate
tone
grammar
continue
custom
```

The task is descriptive provider input rather than a hard-coded prompt owned by A Rich Text.

Applications/providers choose their own system prompts, models, temperatures, policy layers and billing.

## Generate a proposal from ART

```ts
import {
  generateTextProposal,
} from '@arichtext/ai';

const proposal = await generateTextProposal(
  editor.getJSON(),
  editor.getSelection(),
  provider,
  {
    task: 'rewrite',
    instructions: 'Make this concise.',
  },
);
```

For the first release the selection must be inside one paragraph or heading.

The provider receives:

```ts
{
  task,
  text,     // selected text
  before,   // text before selection in same block
  after,    // text after selection in same block
  documentContext?,
  instructions?,
  language?,
  tone?,
  metadata?,
}
```

Full-document context is **opt-in**:

```ts
{
  includeDocumentContext: true,
  maxDocumentContextChars: 6000,
}
```

This avoids sending an entire document to an inference provider merely because a small selection is being edited.

Applications handling sensitive documents should make an explicit privacy decision before enabling document context or any remote provider.

## Proposal data

A generated proposal is data only:

```ts
{
  id,
  provider,
  task,
  selection,
  originalText,
  replacementText,
  baseDocument,
  createdAt,
  instructions?,
  metadata?,
}
```

`baseDocument` is deterministic serialized ART from the moment generation began.

This intentionally makes proposals conservative: **any canonical document change makes the proposal stale**.

That is stricter than trying to guess whether an old selection still points to the same logical content.

## Streaming

```ts
const proposal = await generateTextProposal(
  editor.getJSON(),
  editor.getSelection(),
  provider,
  {
    task: 'expand',
    onDelta(delta, accumulated) {
      preview.textContent = accumulated;
    },
  },
);
```

Streaming deltas are preview data only. Partial model output does not mutate ART.

## Apply explicitly

Core API:

```ts
import { proposalToTransaction } from '@arichtext/ai';

editor.dispatch(
  proposalToTransaction(editor.getJSON(), proposal),
);
```

The transaction is rejected with `stale-proposal` if current canonical ART differs from the proposal base.

A successful application is an ordinary engine `replaceText` transaction, so it participates in normal history:

```ts
editor.undo();
```

## Optional editor adapter

```ts
import {
  createAIProposal,
  applyAIProposal,
} from '@arichtext/ai-editor';

const task = createAIProposal(editor, provider, {
  task: 'translate',
  language: 'French',
});

const proposal = await task.promise;

// Show proposal.replacementText to the user.
// Nothing has changed yet.

applyAIProposal(editor, proposal);
```

The adapter refuses generation/application when the editor is disabled or readonly.

## Cancellation

```ts
const task = createAIProposal(editor, provider, {
  task: 'rewrite',
});

task.cancel();
```

or pass an external signal:

```ts
createAIProposal(editor, provider, {
  task: 'rewrite',
  signal: controller.signal,
});
```

Providers receive the `AbortSignal` and should cancel network/model work where possible.

## Events

The optional editor adapter emits composed events:

```text
ai-proposal-start
ai-proposal-delta
ai-proposal-ready
ai-proposal-error
ai-proposal-applied
```

Typical flow:

```text
start
  ↓
delta ... delta
  ↓
ready
  ↓
application UI shows diff/review
  ↓
user explicitly accepts
  ↓
applied
```

There is intentionally no `autoApply: true` option in the first API.

## Provider metadata

JSON-safe metadata can be supplied to a provider/proposal:

```ts
{
  metadata: {
    feature: 'listing-description',
    locale: 'en-BE',
  },
}
```

Do not put secrets into proposal metadata. Proposal objects may be logged, inspected or persisted by an integrating application.

## Plain text only in the first release

Provider text output is always treated as literal text.

If a model returns:

```text
<script>alert(1)</script>
```

it becomes text, not executable markup.

This first layer does not ask a model to emit HTML or arbitrary ART JSON.

## Why structured AI edits are separate

Multi-block AI changes require stronger semantics:

- block insertion/deletion/movement;
- schema-aware validation;
- extension nodes;
- comments/suggestions;
- concurrent collaboration;
- partial accept/reject;
- provenance.

Those should be represented as explicit validated ART operations rather than accepting a blob of model-generated document JSON.

A future structured-proposal layer can build on normal engine transactions and tracked suggestions.

## Local/browser AI

The provider interface is intentionally compatible with a local implementation:

```ts
const localProvider = {
  name: 'local-webgpu',
  async generateText(request, { signal }) {
    return localModel.generate(request.text, { signal });
  },
};
```

Future examples can use WebGPU/WASM/model runtimes without changing the editor's AI API.

## Future A Rich Text Cloud AI gateway

A managed gateway can eventually implement the same provider contract while adding optional convenience such as:

- provider credential storage;
- model routing;
- quotas/usage analytics;
- audit controls;
- organization policies;
- regional routing;
- managed observability.

It remains optional. BYO provider is the baseline product contract.

## Current limits

- proposals target one paragraph/heading block;
- only plain-text replacement is proposed;
- full-document context is plain text and opt-in;
- no automatic apply;
- no tracked-change UI yet;
- no multi-user proposal anchoring/rebasing yet;
- any canonical document edit makes a proposal stale.

These constraints are deliberate release-safety boundaries, not hidden best-effort behavior.

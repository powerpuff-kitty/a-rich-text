import { describe, expect, it } from 'vitest';
import { createAnchoredRange } from '../../annotations/src/index.js';
import { createTextDocument } from '../../core/src/index.js';
import { textPoint, textSelection } from '../../engine/src/index.js';
import { createMemorySuggestionsProvider } from '../src/memory.js';

function anchor(from = 6, to = 11) {
  const document = createTextDocument('hello world');
  const range = createAnchoredRange(
    document,
    textSelection(textPoint([0], from), textPoint([0], to)),
  );
  return from === to
    ? { status: 'collapsed' as const, range }
    : { status: 'mapped' as const, range };
}

describe('@arichtext/suggestions conflict invariants', () => {
  it('rejects suggestions that do not change text', async () => {
    const provider = createMemorySuggestionsProvider();
    const session = await provider.connect({ documentId: 'doc-noop', clientId: 'a' });

    await expect(session.createSuggestion({
      anchor: anchor(),
      originalText: 'world',
      replacementText: 'world',
      author: { id: 'alice' },
    })).rejects.toMatchObject({ code: 'invalid-suggestion' });
  });

  it('persists latest anchor atomically when marking a suggestion conflicted', async () => {
    const provider = createMemorySuggestionsProvider();
    const session = await provider.connect({ documentId: 'doc-conflict', clientId: 'a' });
    const created = await session.createSuggestion({
      id: 's-conflict',
      anchor: anchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
    });
    const latestAnchor = anchor(5, 10);

    const conflicted = await session.markConflicted(created.id, {
      reason: 'Source changed',
      anchor: latestAnchor,
      expectedRevision: created.revision,
    });

    expect(conflicted).toMatchObject({
      status: 'conflicted',
      revision: '2',
      conflictReason: 'Source changed',
    });
    expect(conflicted.anchor).toEqual(latestAnchor);
    expect(session.getSuggestion(created.id)?.anchor).toEqual(latestAnchor);
  });
});

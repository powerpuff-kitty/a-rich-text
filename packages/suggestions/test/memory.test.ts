import { describe, expect, it, vi } from 'vitest';
import { createAnchoredRange } from '../../annotations/src/index.js';
import { createTextDocument } from '../../core/src/index.js';
import { textPoint, textSelection } from '../../engine/src/index.js';
import { createMemorySuggestionsProvider } from '../src/memory.js';

function mappedAnchor(from = 6, to = 11) {
  const document = createTextDocument('hello world');
  const range = createAnchoredRange(
    document,
    textSelection(textPoint([0], from), textPoint([0], to)),
    { captureQuote: true },
  );
  return from === to
    ? { status: 'collapsed' as const, range }
    : { status: 'mapped' as const, range };
}

describe('@arichtext/suggestions memory provider', () => {
  it('derives insert/delete/replace kinds and broadcasts cloned events', async () => {
    const provider = createMemorySuggestionsProvider();
    const a = await provider.connect({ documentId: 'doc-1', clientId: 'a' });
    const b = await provider.connect({ documentId: 'doc-1', clientId: 'b' });
    const events = vi.fn();
    b.subscribe(events);

    const replacement = await a.createSuggestion({
      id: 'replace-1',
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice', data: { name: 'Alice' } },
    });
    const insertion = await a.createSuggestion({
      id: 'insert-1',
      anchor: mappedAnchor(6, 6),
      originalText: '',
      replacementText: 'big ',
      author: { id: 'alice' },
    });
    const deletion = await a.createSuggestion({
      id: 'delete-1',
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: '',
      author: { id: 'alice' },
    });

    expect(replacement.kind).toBe('replace');
    expect(insertion.kind).toBe('insert');
    expect(deletion.kind).toBe('delete');
    expect(events).toHaveBeenCalledTimes(3);

    replacement.replacementText = 'mutated';
    expect(b.getSuggestion('replace-1')?.replacementText).toBe('earth');
  });

  it('accepts/rejects/conflicts only pending suggestions with optimistic revisions', async () => {
    const provider = createMemorySuggestionsProvider();
    const session = await provider.connect({ documentId: 'doc-2', clientId: 'a' });

    const acceptedBase = await session.createSuggestion({
      id: 'accepted',
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
    });
    const accepted = await session.acceptSuggestion('accepted', {
      reviewer: { id: 'reviewer' },
      expectedRevision: acceptedBase.revision,
    });
    expect(accepted).toMatchObject({
      status: 'accepted',
      revision: '2',
      resolvedBy: { id: 'reviewer' },
      resolvedAt: expect.any(Number),
    });
    await expect(session.rejectSuggestion('accepted', {
      reviewer: { id: 'reviewer' },
      expectedRevision: accepted.revision,
    })).rejects.toMatchObject({ code: 'invalid-transition' });

    const rejectedBase = await session.createSuggestion({
      id: 'rejected',
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
    });
    const rejected = await session.rejectSuggestion('rejected', {
      reviewer: { id: 'reviewer' },
      expectedRevision: rejectedBase.revision,
    });
    expect(rejected.status).toBe('rejected');

    const conflictedBase = await session.createSuggestion({
      id: 'conflicted',
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
    });
    const conflicted = await session.markConflicted('conflicted', {
      reason: 'Source text changed',
      expectedRevision: conflictedBase.revision,
    });
    expect(conflicted).toMatchObject({
      status: 'conflicted',
      conflictReason: 'Source text changed',
    });
  });

  it('rejects stale revisions and keeps identical anchor updates revision-stable', async () => {
    const provider = createMemorySuggestionsProvider();
    const session = await provider.connect({ documentId: 'doc-3', clientId: 'a' });
    const suggestion = await session.createSuggestion({
      id: 's-1',
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
    });

    const same = await session.updateAnchor('s-1', suggestion.anchor, {
      expectedRevision: suggestion.revision,
    });
    expect(same.revision).toBe(suggestion.revision);

    const movedAnchor = mappedAnchor(5, 10);
    const moved = await session.updateAnchor('s-1', movedAnchor, {
      expectedRevision: same.revision,
    });
    expect(moved.revision).toBe('2');

    await expect(session.updateAnchor('s-1', mappedAnchor(), {
      expectedRevision: '1',
    })).rejects.toMatchObject({ code: 'revision-conflict' });
  });

  it('rejects orphaned creation, empty operations and invalid JSON metadata', async () => {
    const provider = createMemorySuggestionsProvider();
    const session = await provider.connect({ documentId: 'doc-4', clientId: 'a' });

    await expect(session.createSuggestion({
      anchor: { status: 'orphaned', range: null, reason: 'missing' },
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
    })).rejects.toMatchObject({ code: 'invalid-anchor' });

    await expect(session.createSuggestion({
      anchor: mappedAnchor(6, 6),
      originalText: '',
      replacementText: '',
      author: { id: 'alice' },
    })).rejects.toMatchObject({ code: 'invalid-suggestion' });

    await expect(session.createSuggestion({
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
      metadata: { bad: Number.NaN } as never,
    })).rejects.toMatchObject({ code: 'invalid-suggestion' });
  });

  it('separates rooms and rejects access after close', async () => {
    const provider = createMemorySuggestionsProvider();
    const a = await provider.connect({ documentId: 'a', clientId: 'a' });
    const b = await provider.connect({ documentId: 'b', clientId: 'b' });
    await a.createSuggestion({
      id: 'only-a',
      anchor: mappedAnchor(),
      originalText: 'world',
      replacementText: 'earth',
      author: { id: 'alice' },
    });
    expect(b.listSuggestions()).toEqual([]);
    await a.close();
    expect(() => a.listSuggestions()).toThrowError(expect.objectContaining({ code: 'closed' }));
  });
});

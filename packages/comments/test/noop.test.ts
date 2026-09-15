import { describe, expect, it, vi } from 'vitest';
import { createAnchoredRange } from '../../annotations/src/index.js';
import { createTextDocument } from '../../core/src/index.js';
import { textPoint, textSelection } from '../../engine/src/index.js';
import { createMemoryCommentsProvider } from '../src/memory.js';

function anchor() {
  const document = createTextDocument('hello world');
  const range = createAnchoredRange(
    document,
    textSelection(textPoint([0], 6), textPoint([0], 11)),
  );
  return { status: 'mapped' as const, range };
}

describe('@arichtext/comments no-op mutations', () => {
  it('keeps revisions stable and emits no update for idempotent mutations', async () => {
    const provider = createMemoryCommentsProvider();
    const a = await provider.connect({ documentId: 'doc-noop', clientId: 'a' });
    const b = await provider.connect({ documentId: 'doc-noop', clientId: 'b' });
    const events = vi.fn();
    b.subscribe(events);

    let thread = await a.createThread({
      id: 'thread-noop',
      anchor: anchor(),
      body: 'Root',
      author: { id: 'u1' },
    });
    events.mockClear();

    const rootId = thread.messages[0]!.id;
    thread = await a.addReaction('thread-noop', rootId, '👍', 'u2', {
      expectedRevision: thread.revision,
    });
    const reactionRevision = thread.revision;
    expect(events).toHaveBeenCalledTimes(1);
    events.mockClear();

    const duplicateReaction = await a.addReaction('thread-noop', rootId, '👍', 'u2', {
      expectedRevision: reactionRevision,
    });
    expect(duplicateReaction.revision).toBe(reactionRevision);
    expect(events).not.toHaveBeenCalled();

    const sameAnchor = await a.updateAnchor('thread-noop', duplicateReaction.anchor, {
      expectedRevision: duplicateReaction.revision,
    });
    expect(sameAnchor.revision).toBe(reactionRevision);
    expect(events).not.toHaveBeenCalled();

    const openAgain = await a.reopenThread('thread-noop', {
      expectedRevision: sameAnchor.revision,
    });
    expect(openAgain.revision).toBe(reactionRevision);
    expect(events).not.toHaveBeenCalled();
  });
});

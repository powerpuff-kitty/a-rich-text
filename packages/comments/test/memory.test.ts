import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnchoredRange } from '../../annotations/src/index.js';
import { createTextDocument } from '../../core/src/index.js';
import { textPoint, textSelection } from '../../engine/src/index.js';
import { createMemoryCommentsProvider } from '../src/memory.js';

function mappedAnchor() {
  const document = createTextDocument('hello world');
  const range = createAnchoredRange(
    document,
    textSelection(textPoint([0], 6), textPoint([0], 11)),
    { captureQuote: true },
  );
  return { status: 'mapped' as const, range };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('@arichtext/comments memory provider', () => {
  it('creates a thread and broadcasts cloned provider events to all sessions', async () => {
    const provider = createMemoryCommentsProvider();
    const a = await provider.connect({ documentId: 'doc-1', clientId: 'a' });
    const b = await provider.connect({ documentId: 'doc-1', clientId: 'b' });
    const events = vi.fn();
    b.subscribe(events);

    const thread = await a.createThread({
      id: 'thread-1',
      anchor: mappedAnchor(),
      body: 'Check this word',
      author: { id: 'user-a', data: { name: 'Alice' } },
      mentions: ['user-b', 'user-b'],
    });

    expect(thread.status).toBe('open');
    expect(thread.revision).toBe('1');
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]?.mentions).toEqual(['user-b']);
    expect(events).toHaveBeenCalledTimes(1);
    expect(events.mock.calls[0]![0]).toMatchObject({
      type: 'created',
      originClientId: 'a',
      thread: { id: 'thread-1' },
    });

    thread.messages[0]!.body = 'mutated locally';
    expect(b.getThread('thread-1')?.messages[0]?.body).toBe('Check this word');
  });

  it('supports replies and optimistic thread revision checks', async () => {
    const provider = createMemoryCommentsProvider();
    const session = await provider.connect({ documentId: 'doc-2', clientId: 'a' });
    const created = await session.createThread({
      id: 'thread-2',
      anchor: mappedAnchor(),
      body: 'Root',
      author: { id: 'u1' },
    });

    const replied = await session.reply('thread-2', {
      id: 'reply-1',
      body: 'Reply',
      author: { id: 'u2' },
    }, { expectedRevision: created.revision });

    expect(replied.revision).toBe('2');
    expect(replied.messages.map((message) => message.id)).toEqual([created.messages[0]!.id, 'reply-1']);

    await expect(session.reply('thread-2', {
      body: 'stale',
      author: { id: 'u3' },
    }, { expectedRevision: '1' })).rejects.toMatchObject({ code: 'revision-conflict' });
  });

  it('edits and tombstones messages without removing reply history', async () => {
    const provider = createMemoryCommentsProvider();
    const session = await provider.connect({ documentId: 'doc-3', clientId: 'a' });
    const created = await session.createThread({
      id: 'thread-3',
      anchor: mappedAnchor(),
      body: 'Root',
      author: { id: 'u1' },
    });
    const rootId = created.messages[0]!.id;
    const edited = await session.editMessage('thread-3', rootId, {
      body: 'Edited root',
      mentions: ['u2'],
      expectedRevision: created.revision,
    });
    expect(edited.messages[0]).toMatchObject({ body: 'Edited root', mentions: ['u2'] });

    const withReply = await session.reply('thread-3', {
      id: 'reply-3',
      body: 'Reply survives',
      author: { id: 'u2' },
    }, { expectedRevision: edited.revision });
    const deleted = await session.deleteMessage('thread-3', rootId, { expectedRevision: withReply.revision });

    expect(deleted.messages).toHaveLength(2);
    expect(deleted.messages[0]).toMatchObject({ body: '', deletedAt: expect.any(Number) });
    expect(deleted.messages[1]?.body).toBe('Reply survives');
  });

  it('adds/removes reactions and resolves/reopens threads', async () => {
    const provider = createMemoryCommentsProvider();
    const session = await provider.connect({ documentId: 'doc-4', clientId: 'a' });
    let thread = await session.createThread({
      id: 'thread-4',
      anchor: mappedAnchor(),
      body: 'Root',
      author: { id: 'u1' },
    });
    const messageId = thread.messages[0]!.id;

    thread = await session.addReaction('thread-4', messageId, '👍', 'u2', { expectedRevision: thread.revision });
    expect(thread.messages[0]?.reactions).toEqual([
      expect.objectContaining({ key: '👍', userId: 'u2' }),
    ]);

    thread = await session.removeReaction('thread-4', messageId, '👍', 'u2', { expectedRevision: thread.revision });
    expect(thread.messages[0]?.reactions).toEqual([]);

    thread = await session.resolveThread('thread-4', { id: 'moderator', data: { name: 'Mod' } }, { expectedRevision: thread.revision });
    expect(thread).toMatchObject({
      status: 'resolved',
      resolvedAt: expect.any(Number),
      resolvedBy: { id: 'moderator', data: { name: 'Mod' } },
    });

    thread = await session.reopenThread('thread-4', { expectedRevision: thread.revision });
    expect(thread.status).toBe('open');
    expect(thread.resolvedAt).toBeUndefined();
    expect(thread.resolvedBy).toBeUndefined();
  });

  it('persists mapped, collapsed and orphaned anchor states independently of ART', async () => {
    const provider = createMemoryCommentsProvider();
    const session = await provider.connect({ documentId: 'doc-5', clientId: 'a' });
    let thread = await session.createThread({
      id: 'thread-5',
      anchor: mappedAnchor(),
      body: 'Root',
      author: { id: 'u1' },
    });

    const collapsedRange = {
      ...thread.anchor,
      status: 'collapsed' as const,
      range: thread.anchor.status === 'orphaned'
        ? null as never
        : {
            ...thread.anchor.range,
            end: { ...thread.anchor.range.start },
          },
    };
    thread = await session.updateAnchor('thread-5', collapsedRange, { expectedRevision: thread.revision });
    expect(thread.anchor.status).toBe('collapsed');

    thread = await session.updateAnchor('thread-5', {
      status: 'orphaned',
      range: null,
      reason: 'Target block was removed',
    }, { expectedRevision: thread.revision });
    expect(thread.anchor).toEqual({
      status: 'orphaned',
      range: null,
      reason: 'Target block was removed',
    });
  });

  it('rejects invalid author metadata and empty comment bodies', async () => {
    const provider = createMemoryCommentsProvider();
    const session = await provider.connect({ documentId: 'doc-6', clientId: 'a' });

    await expect(session.createThread({
      anchor: mappedAnchor(),
      body: '   ',
      author: { id: 'u1' },
    })).rejects.toMatchObject({ code: 'invalid-message' });

    await expect(session.createThread({
      anchor: mappedAnchor(),
      body: 'Valid',
      author: { id: 'u1', data: { invalid: Number.NaN } as never },
    })).rejects.toMatchObject({ code: 'invalid-message' });
  });

  it('separates rooms by document and rejects use after close', async () => {
    const provider = createMemoryCommentsProvider();
    const a = await provider.connect({ documentId: 'doc-a', clientId: 'a' });
    const b = await provider.connect({ documentId: 'doc-b', clientId: 'b' });
    await a.createThread({ id: 'only-a', anchor: mappedAnchor(), body: 'A', author: { id: 'u1' } });

    expect(b.listThreads()).toEqual([]);
    await a.close();
    expect(() => a.listThreads()).toThrowError(expect.objectContaining({ code: 'closed' }));
  });
});

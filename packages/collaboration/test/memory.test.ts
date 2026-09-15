import { describe, expect, it, vi } from 'vitest';
import { createTextDocument } from '../../core/src/index.js';
import { textPoint, textSelection } from '../../engine/src/index.js';
import { createMemoryCollaborationProvider } from '../src/memory.js';

describe('@arichtext/collaboration memory provider', () => {
  it('shares canonical document state between sessions without claiming concurrent merge', async () => {
    const provider = createMemoryCollaborationProvider();
    expect(provider.capabilities.merge).toBe('snapshot');

    const a = await provider.connect({
      documentId: 'doc-1',
      clientId: 'a',
      initialDocument: createTextDocument('initial'),
    });
    const b = await provider.connect({ documentId: 'doc-1', clientId: 'b' });
    expect(b.getDocument()?.document).toEqual(createTextDocument('initial'));

    const remote = vi.fn();
    b.subscribeDocument(remote);
    const published = await a.publishDocument(createTextDocument('updated'));

    expect(published.origin.clientId).toBe('a');
    expect(published.revision).toBe('1');
    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote.mock.calls[0]![0].document).toEqual(createTextDocument('updated'));
    expect(b.getDocument()?.document).toEqual(createTextDocument('updated'));
  });

  it('supports optimistic revision checks for snapshot providers', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = await provider.connect({ documentId: 'doc-2', clientId: 'a' });

    const first = await a.publishDocument(createTextDocument('one'));
    await expect(a.publishDocument(createTextDocument('stale'), { baseRevision: '0' }))
      .rejects.toMatchObject({ code: 'revision-conflict' });
    await expect(a.publishDocument(createTextDocument('two'), { baseRevision: first.revision }))
      .resolves.toMatchObject({ revision: '2' });
  });

  it('exchanges ephemeral logical selection and JSON-safe presence independently', async () => {
    const provider = createMemoryCollaborationProvider();
    const document = createTextDocument('hello');
    const a = await provider.connect({ documentId: 'doc-3', clientId: 'a', initialDocument: document });
    const b = await provider.connect({ documentId: 'doc-3', clientId: 'b' });
    const events = vi.fn();
    b.subscribePresence(events);

    const selection = textSelection(textPoint([0], 1), textPoint([0], 4));
    const presence = await a.updatePresence({
      selection,
      data: { name: 'Alice', color: 'orange' },
    });

    expect(presence.selection).toEqual(selection);
    expect(events).toHaveBeenCalledWith({
      type: 'upsert',
      presence: expect.objectContaining({
        clientId: 'a',
        selection,
        data: { name: 'Alice', color: 'orange' },
      }),
    });
    expect(b.getPresence()).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: 'a' }),
    ]));
  });

  it('rejects invalid presence selections and non-JSON presence metadata', async () => {
    const provider = createMemoryCollaborationProvider();
    const session = await provider.connect({
      documentId: 'doc-4',
      clientId: 'a',
      initialDocument: createTextDocument('hi'),
    });

    await expect(session.updatePresence({
      selection: textSelection(textPoint([0], 99)),
    })).rejects.toMatchObject({ code: 'invalid-presence' });

    await expect(session.updatePresence({
      data: { bad: Number.NaN } as never,
    })).rejects.toMatchObject({ code: 'invalid-presence' });
  });

  it('announces presence removal and prevents writes after close', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = await provider.connect({
      documentId: 'doc-5',
      clientId: 'a',
      initialDocument: createTextDocument('hello'),
    });
    const b = await provider.connect({ documentId: 'doc-5', clientId: 'b' });
    await a.updatePresence({ data: { name: 'Alice' } });

    const presence = vi.fn();
    b.subscribePresence(presence);
    await a.close();

    expect(presence).toHaveBeenCalledWith(expect.objectContaining({ type: 'remove', clientId: 'a' }));
    expect(a.status).toBe('closed');
    await expect(a.publishDocument(createTextDocument('late'))).rejects.toMatchObject({ code: 'closed' });
  });

  it('clones provider payloads so caller mutation cannot corrupt room state', async () => {
    const provider = createMemoryCollaborationProvider();
    const source = createTextDocument('safe');
    const a = await provider.connect({ documentId: 'doc-6', clientId: 'a' });
    const b = await provider.connect({ documentId: 'doc-6', clientId: 'b' });

    const update = await a.publishDocument(source);
    source.content[0] = { type: 'paragraph', content: [{ type: 'text', text: 'mutated' }] };
    update.document.content[0] = { type: 'paragraph', content: [{ type: 'text', text: 'also mutated' }] };

    expect(b.getDocument()?.document).toEqual(createTextDocument('safe'));
  });
});

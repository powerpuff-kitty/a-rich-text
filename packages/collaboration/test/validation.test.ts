import { describe, expect, it } from 'vitest';
import { createTextDocument } from '../../core/src/index.js';
import { cloneARTDocument, clonePresenceData } from '../src/index.js';
import { createMemoryCollaborationProvider } from '../src/memory.js';

describe('@arichtext/collaboration validation', () => {
  it('rejects malformed ART before provider publication', async () => {
    const provider = createMemoryCollaborationProvider();
    const session = await provider.connect({ documentId: 'invalid', clientId: 'a' });

    await expect(session.publishDocument({ type: 'doc', version: 1, content: [{ type: 'unknown' }] } as never))
      .rejects.toMatchObject({ code: 'invalid-document' });
    expect(session.getDocument()).toBeNull();
  });

  it('returns independent validated ART clones', () => {
    const source = createTextDocument('safe');
    const copy = cloneARTDocument(source);
    copy.content[0] = { type: 'paragraph', content: [{ type: 'text', text: 'changed' }] };
    expect(source).toEqual(createTextDocument('safe'));
  });

  it('rejects non-finite/non-JSON presence data', () => {
    expect(() => clonePresenceData({ count: Number.POSITIVE_INFINITY } as never))
      .toThrow(expect.objectContaining({ code: 'invalid-presence' }));
    expect(() => clonePresenceData({ value: undefined } as never))
      .toThrow(expect.objectContaining({ code: 'invalid-presence' }));
  });
});

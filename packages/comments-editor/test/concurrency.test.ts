// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryCommentsProvider } from '../../comments/src/memory.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import { connectComments } from '../src/index.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

function createEditor(): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setText('hello world');
  editor.dispatch(
    transaction()
      .setSelection(textSelection(textPoint([0], 6), textPoint([0], 11)))
      .build(),
  );
  return editor;
}

async function settle(iterations = 12): Promise<void> {
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
}

describe('@arichtext/comments-editor concurrency', () => {
  it('does not let a remote reply rewind a locally pending mapped anchor', async () => {
    const provider = createMemoryCommentsProvider();
    const editorA = createEditor();
    const editorB = createEditor();
    const a = await connectComments(editorA, provider, {
      documentId: 'doc-race',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    const b = await connectComments(editorB, provider, {
      documentId: 'doc-race',
      clientId: 'client-b',
      author: { id: 'bob' },
    });
    const thread = await a.createThread('Root');
    await settle();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const session = a.session as typeof a.session & {
      updateAnchor: typeof a.session.updateAnchor;
    };
    const originalUpdateAnchor = session.updateAnchor.bind(session);
    session.updateAnchor = async (...args) => {
      await gate;
      return originalUpdateAnchor(...args);
    };

    editorA.dispatch(
      transaction()
        .replaceText(textPoint([0], 6), textPoint([0], 6), 'big ')
        .build(),
    );

    const locallyMapped = a.getThread(thread.id)!;
    expect(locallyMapped.anchor.status).toBe('mapped');
    if (locallyMapped.anchor.status !== 'orphaned') {
      expect(locallyMapped.anchor.range.start.offset).toBe(10);
      expect(locallyMapped.anchor.range.end.offset).toBe(15);
    }

    await b.reply(thread.id, 'Remote reply');
    await settle();

    const afterRemoteReply = a.getThread(thread.id)!;
    expect(afterRemoteReply.messages).toHaveLength(2);
    expect(afterRemoteReply.anchor).toEqual(locallyMapped.anchor);

    release();
    await settle(24);

    const persisted = a.session.getThread(thread.id)!;
    expect(persisted.anchor).toEqual(a.getThread(thread.id)!.anchor);
    expect(persisted.messages).toHaveLength(2);

    await a.disconnect();
    await b.disconnect();
  });
});

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryCommentsProvider } from '../../comments/src/memory.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import { connectComments } from '../src/index.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

function createEditor(text = 'hello world'): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setText(text);
  editor.dispatch(
    transaction()
      .setSelection(textSelection(textPoint([0], 6), textPoint([0], 11)))
      .build(),
  );
  return editor;
}

async function settle(iterations = 10): Promise<void> {
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
}

describe('@arichtext/comments-editor', () => {
  it('creates a quoted anchored thread from the current logical selection', async () => {
    const provider = createMemoryCommentsProvider();
    const editor = createEditor();
    const controller = await connectComments(editor, provider, {
      documentId: 'doc-1',
      clientId: 'client-a',
      author: { id: 'alice', data: { name: 'Alice' } },
    });

    const thread = await controller.createThread('Review this');

    expect(thread.anchor.status).toBe('mapped');
    if (thread.anchor.status !== 'orphaned') {
      expect(thread.anchor.range.start.offset).toBe(6);
      expect(thread.anchor.range.end.offset).toBe(11);
      expect(thread.anchor.range.quote?.text).toBe('world');
    }
    expect(editor.serializeJSON()).not.toContain('Review this');
    await controller.disconnect();
  });

  it('maps anchors through local typing and persists the mapped range', async () => {
    const provider = createMemoryCommentsProvider();
    const editor = createEditor();
    const controller = await connectComments(editor, provider, {
      documentId: 'doc-2',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    const thread = await controller.createThread('Thread');

    editor.dispatch(
      transaction()
        .replaceText(textPoint([0], 6), textPoint([0], 6), 'big ')
        .build(),
    );
    await settle();

    const mapped = controller.getThread(thread.id)!;
    expect(mapped.anchor.status).toBe('mapped');
    if (mapped.anchor.status !== 'orphaned') {
      expect(mapped.anchor.range.start.offset).toBe(10);
      expect(mapped.anchor.range.end.offset).toBe(15);
    }
    expect(controller.session.getThread(thread.id)?.anchor).toEqual(mapped.anchor);
    await controller.disconnect();
  });

  it('restores a collapsed comment anchor when the editor undo restores deleted text', async () => {
    const provider = createMemoryCommentsProvider();
    const editor = createEditor();
    const controller = await connectComments(editor, provider, {
      documentId: 'doc-3',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    const thread = await controller.createThread('Thread');

    editor.dispatch(
      transaction()
        .replaceText(textPoint([0], 6), textPoint([0], 11), '')
        .build(),
    );
    expect(controller.getThread(thread.id)?.anchor.status).toBe('collapsed');

    editor.undo();
    const restored = controller.getThread(thread.id)!;
    expect(restored.anchor.status).toBe('mapped');
    if (restored.anchor.status !== 'orphaned') {
      expect(restored.anchor.range.start.offset).toBe(6);
      expect(restored.anchor.range.end.offset).toBe(11);
    }
    await settle();
    await controller.disconnect();
  });

  it('infers a deterministic one-block native reconcile instead of orphaning the anchor', async () => {
    const provider = createMemoryCommentsProvider();
    const editor = createEditor();
    const controller = await connectComments(editor, provider, {
      documentId: 'doc-4',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    const thread = await controller.createThread('Thread');

    const surface = editor.shadowRoot!.querySelector<HTMLElement>('[part="editor"]')!;
    surface.innerHTML = '<p>hello brave world</p>';
    surface.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertCompositionText' }));
    await settle();

    expect(editor.getText()).toBe('hello brave world');
    const mapped = controller.getThread(thread.id)!;
    expect(mapped.anchor.status).toBe('mapped');
    if (mapped.anchor.status !== 'orphaned') {
      expect(mapped.anchor.range.start.offset).toBe(12);
      expect(mapped.anchor.range.end.offset).toBe(17);
    }
    await controller.disconnect();
  });

  it('orphans anchors when native reconciliation changes structure ambiguously', async () => {
    const provider = createMemoryCommentsProvider();
    const editor = createEditor();
    const controller = await connectComments(editor, provider, {
      documentId: 'doc-5',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    const thread = await controller.createThread('Thread');

    const surface = editor.shadowRoot!.querySelector<HTMLElement>('[part="editor"]')!;
    surface.innerHTML = '<p>hello</p><p>world</p>';
    surface.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertParagraph' }));
    await settle();

    expect(controller.getThread(thread.id)?.anchor).toMatchObject({
      status: 'orphaned',
      reason: expect.stringContaining('without deterministic anchor mapping'),
    });
    await controller.disconnect();
  });

  it('remote comment replies do not create editor document transactions', async () => {
    const provider = createMemoryCommentsProvider();
    const editorA = createEditor();
    const editorB = createEditor();
    const controllerA = await connectComments(editorA, provider, {
      documentId: 'doc-6',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    const controllerB = await connectComments(editorB, provider, {
      documentId: 'doc-6',
      clientId: 'client-b',
      author: { id: 'bob' },
    });
    const thread = await controllerA.createThread('Root');
    await settle();
    const transactions = vi.fn();
    editorA.addEventListener('transaction', transactions);

    await controllerB.reply(thread.id, 'Remote reply');
    await settle();

    expect(controllerA.getThread(thread.id)?.messages).toHaveLength(2);
    expect(editorA.getText()).toBe('hello world');
    expect(transactions).not.toHaveBeenCalled();
    await controllerA.disconnect();
    await controllerB.disconnect();
  });

  it('supports resolve/reopen/reactions through the controller without embedding review state in ART', async () => {
    const provider = createMemoryCommentsProvider();
    const editor = createEditor();
    const controller = await connectComments(editor, provider, {
      documentId: 'doc-7',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    let thread = await controller.createThread('Root');
    const messageId = thread.messages[0]!.id;

    thread = await controller.addReaction(thread.id, messageId, '✅', 'alice');
    expect(thread.messages[0]?.reactions).toHaveLength(1);
    thread = await controller.resolve(thread.id);
    expect(thread.status).toBe('resolved');
    thread = await controller.reopen(thread.id);
    expect(thread.status).toBe('open');
    expect(editor.serializeJSON()).not.toContain('✅');

    await controller.disconnect();
  });

  it('can reconcile after a programmatic document setter explicitly', async () => {
    const provider = createMemoryCommentsProvider();
    const editor = createEditor();
    const controller = await connectComments(editor, provider, {
      documentId: 'doc-8',
      clientId: 'client-a',
      author: { id: 'alice' },
    });
    const thread = await controller.createThread('Thread');

    editor.setText('hello big world');
    controller.reconcileNow();
    await settle();

    const mapped = controller.getThread(thread.id)!;
    expect(mapped.anchor.status).toBe('mapped');
    if (mapped.anchor.status !== 'orphaned') {
      expect(mapped.anchor.range.start.offset).toBe(10);
      expect(mapped.anchor.range.end.offset).toBe(15);
    }
    await controller.disconnect();
  });
});

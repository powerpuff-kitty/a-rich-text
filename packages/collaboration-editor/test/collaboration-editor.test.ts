// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryCollaborationProvider } from '../../collaboration/src/memory.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import { ARichTextElement } from '../../web-component/src/index.js';
import { connectCollaboration } from '../src/index.js';

function createEditor(text: string): ARichTextElement {
  const editor = document.createElement('a-rich-text') as ARichTextElement;
  document.body.append(editor);
  editor.setText(text);
  return editor;
}

async function settle(iterations = 8): Promise<void> {
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

describe('@arichtext/collaboration-editor', () => {
  it('initializes from provider state and synchronizes local engine transactions without echo loops', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = createEditor('one');
    const b = createEditor('local-b');

    const aController = await connectCollaboration(a, provider, {
      documentId: 'shared-1',
      clientId: 'a',
    });
    const bController = await connectCollaboration(b, provider, {
      documentId: 'shared-1',
      clientId: 'b',
    });

    expect(b.getText()).toBe('one');

    a.dispatch(
      transaction()
        .replaceText(textPoint([0], 0), textPoint([0], 3), 'two')
        .build(),
    );
    await settle();

    expect(b.getText()).toBe('two');
    expect(aController.session.getDocument()?.revision).toBe('1');
    expect(bController.session.getDocument()?.revision).toBe('1');

    await settle();
    expect(aController.session.getDocument()?.revision).toBe('1');

    await aController.disconnect();
    await bController.disconnect();
  });

  it('can explicitly prefer the joining editor document during initial sync', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = createEditor('provider');
    const b = createEditor('editor');

    const aController = await connectCollaboration(a, provider, {
      documentId: 'shared-2',
      clientId: 'a',
    });
    const bController = await connectCollaboration(b, provider, {
      documentId: 'shared-2',
      clientId: 'b',
      initialDocumentPolicy: 'editor',
    });
    await settle();

    expect(a.getText()).toBe('editor');
    expect(b.getText()).toBe('editor');
    expect(aController.session.getDocument()?.revision).toBe('1');

    await aController.disconnect();
    await bController.disconnect();
  });

  it('publishes logical presence independently from document revisions', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = createEditor('hello');
    const b = createEditor('');
    const aController = await connectCollaboration(a, provider, {
      documentId: 'shared-3',
      clientId: 'a',
      presenceData: { name: 'Alice' },
    });
    const bController = await connectCollaboration(b, provider, {
      documentId: 'shared-3',
      clientId: 'b',
    });
    const presence = vi.fn();
    b.addEventListener('collaboration-presence', presence);

    const selection = textSelection(textPoint([0], 1), textPoint([0], 4));
    a.dispatch(transaction().setSelection(selection).build());
    await settle();

    expect(presence).toHaveBeenCalled();
    expect(bController.presence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientId: 'a',
        selection,
        data: { name: 'Alice' },
      }),
    ]));
    expect(aController.session.getDocument()?.revision).toBe('0');

    await aController.disconnect();
    await bController.disconnect();
  });

  it('surfaces a conflict instead of overwriting a remote update with a queued stale snapshot', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = createEditor('base');
    const b = createEditor('');
    const aController = await connectCollaboration(a, provider, {
      documentId: 'shared-4',
      clientId: 'a',
    });
    const errors = vi.fn();
    const bController = await connectCollaboration(b, provider, {
      documentId: 'shared-4',
      clientId: 'b',
      onError: errors,
    });

    a.dispatch(transaction().replaceText(textPoint([0], 0), textPoint([0], 4), 'from-a').build());
    b.dispatch(transaction().replaceText(textPoint([0], 0), textPoint([0], 4), 'from-b').build());
    await settle(16);

    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ code: 'revision-conflict' }));
    expect(aController.session.getDocument()?.document).toEqual(a.getJSON());
    expect(b.getText()).toBe('from-a');

    await aController.disconnect();
    await bController.disconnect();
  });

  it('does not publish selection-only changes as document updates', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = createEditor('hello');
    const controller = await connectCollaboration(a, provider, {
      documentId: 'shared-5',
      clientId: 'a',
    });

    a.dispatch(transaction().setSelection(textSelection(textPoint([0], 2))).build());
    await settle();

    expect(controller.session.getDocument()?.revision).toBe('0');
    await controller.disconnect();
  });

  it('stops automatic publishing after disconnect', async () => {
    const provider = createMemoryCollaborationProvider();
    const a = createEditor('one');
    const b = createEditor('');
    const aController = await connectCollaboration(a, provider, {
      documentId: 'shared-6',
      clientId: 'a',
    });
    const bController = await connectCollaboration(b, provider, {
      documentId: 'shared-6',
      clientId: 'b',
    });

    await aController.disconnect();
    a.dispatch(transaction().replaceText(textPoint([0], 0), textPoint([0], 3), 'late').build());
    await settle();

    expect(b.getText()).toBe('one');
    await bController.disconnect();
  });
});

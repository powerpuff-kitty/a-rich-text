import { describe, expect, it, vi } from 'vitest';
import { createTextDocument } from '../../core/src/index.js';
import {
  EditorEngine,
  createEditorState,
  textPoint,
  textSelection,
} from '../../engine/src/index.js';
import {
  AIError,
  collectTextGeneration,
  generateTextProposal,
  proposalToTransaction,
  type AITextProvider,
} from '../src/index.js';

function provider(generateText: AITextProvider['generateText'], name = 'test'): AITextProvider {
  return { name, generateText };
}

describe('@arichtext/ai text proposals', () => {
  it('builds a rewrite request from the selected text and applies it as an undoable engine transaction', async () => {
    const document = createTextDocument('Hello world!');
    const selection = textSelection(textPoint([0], 6), textPoint([0], 11));
    const generate = vi.fn(() => 'earth');

    const proposal = await generateTextProposal(
      document,
      selection,
      provider(generate, 'local'),
      { task: 'rewrite', instructions: 'Use a synonym' },
    );

    expect(generate).toHaveBeenCalledWith({
      task: 'rewrite',
      text: 'world',
      before: 'Hello ',
      after: '!',
      instructions: 'Use a synonym',
    }, { signal: undefined });
    expect(proposal.provider).toBe('local');
    expect(proposal.originalText).toBe('world');
    expect(proposal.replacementText).toBe('earth');

    const engine = new EditorEngine(createEditorState(document, selection));
    engine.dispatch(proposalToTransaction(engine.state.document, proposal));
    expect(engine.state.document).toEqual(createTextDocument('Hello earth!'));

    engine.undo();
    expect(engine.state.document).toEqual(document);
    expect(engine.state.selection).toEqual(selection);
  });

  it('supports collapsed continuation proposals', async () => {
    const document = createTextDocument('Once upon a time');
    const selection = textSelection(textPoint([0], 16));
    const generate = vi.fn((request) => {
      expect(request.text).toBe('');
      expect(request.before).toBe('Once upon a time');
      expect(request.after).toBe('');
      return ', there was a cat.';
    });

    const proposal = await generateTextProposal(document, selection, provider(generate), { task: 'continue' });
    const engine = new EditorEngine(createEditorState(document, selection));
    engine.dispatch(proposalToTransaction(engine.state.document, proposal));

    expect(engine.state.document).toEqual(createTextDocument('Once upon a time, there was a cat.'));
  });

  it('rejects empty selections for tasks that require source text', async () => {
    const document = createTextDocument('hello');
    const selection = textSelection(textPoint([0], 2));

    await expect(generateTextProposal(document, selection, provider(() => 'x'), { task: 'shorten' }))
      .rejects.toMatchObject({ code: 'empty-selection' });
  });

  it('collects streaming output and emits accumulated deltas', async () => {
    async function* stream() {
      yield 'Hel';
      yield 'lo';
      yield '!';
    }
    const deltas: Array<[string, string]> = [];

    const output = await collectTextGeneration(stream(), {
      onDelta: (delta, accumulated) => deltas.push([delta, accumulated]),
    });

    expect(output).toBe('Hello!');
    expect(deltas).toEqual([
      ['Hel', 'Hel'],
      ['lo', 'Hello'],
      ['!', 'Hello!'],
    ]);
  });

  it('supports streamed provider proposals', async () => {
    async function* stream() {
      yield 'small';
      yield 'er';
    }
    const onDelta = vi.fn();
    const proposal = await generateTextProposal(
      createTextDocument('make this shorter'),
      textSelection(textPoint([0], 0), textPoint([0], 17)),
      provider(() => stream(), 'streaming'),
      { task: 'shorten', onDelta },
    );

    expect(proposal.replacementText).toBe('smaller');
    expect(onDelta).toHaveBeenLastCalledWith('er', 'smaller');
  });

  it('rejects non-string streamed deltas', async () => {
    async function* badStream() {
      yield 'valid';
      yield 42 as never;
    }

    await expect(collectTextGeneration(badStream())).rejects.toMatchObject({
      code: 'invalid-provider-result',
    });
  });

  it('surfaces provider failures with provider context', async () => {
    const failing = provider(() => {
      throw new Error('model down');
    }, 'failing-model');

    await expect(generateTextProposal(
      createTextDocument('hello'),
      textSelection(textPoint([0], 0), textPoint([0], 5)),
      failing,
      { task: 'grammar' },
    )).rejects.toMatchObject({
      code: 'provider-error',
      message: 'AI provider failing-model failed',
    });
  });

  it('honors AbortSignal during streamed generation', async () => {
    const controller = new AbortController();
    async function* stream() {
      yield 'first';
      controller.abort('stop');
      yield 'second';
    }

    await expect(generateTextProposal(
      createTextDocument('hello'),
      textSelection(textPoint([0], 0), textPoint([0], 5)),
      provider(() => stream()),
      { task: 'rewrite', signal: controller.signal },
    )).rejects.toMatchObject({ code: 'aborted' });
  });

  it('rejects stale proposals when canonical ART changed after generation', async () => {
    const original = createTextDocument('hello world');
    const selection = textSelection(textPoint([0], 6), textPoint([0], 11));
    const proposal = await generateTextProposal(original, selection, provider(() => 'earth'), { task: 'rewrite' });

    expect(() => proposalToTransaction(createTextDocument('hello changed'), proposal))
      .toThrowError(expect.objectContaining({ code: 'stale-proposal' }));
  });

  it('includes bounded document context only when explicitly requested', async () => {
    const generate = vi.fn(() => 'done');
    const document = {
      type: 'doc' as const,
      version: 1 as const,
      content: [
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: '12345' }] },
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: '67890' }] },
      ],
    };

    await generateTextProposal(
      document,
      textSelection(textPoint([0], 0), textPoint([0], 5)),
      provider(generate),
      { task: 'summarize', includeDocumentContext: true, maxDocumentContextChars: 8 },
    );

    expect(generate.mock.calls[0]![0].documentContext).toHaveLength(8);
    expect(generate.mock.calls[0]![0].documentContext?.endsWith('…')).toBe(true);
  });

  it('rejects selections that span different text blocks', async () => {
    const document = {
      type: 'doc' as const,
      version: 1 as const,
      content: [
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'one' }] },
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'two' }] },
      ],
    };

    await expect(generateTextProposal(
      document,
      textSelection(textPoint([0], 0), textPoint([1], 3)),
      provider(() => 'x'),
      { task: 'rewrite' },
    )).rejects.toBeInstanceOf(AIError);
  });
});

it('rejects text proposals across inline atoms before invoking the provider', async () => {
  const document = createTextDocument('');
  document.content = [{ type: 'paragraph', content: [{ type: 'extensionInline', name: 'acme:mention', fallbackText: '@Alice' }] }];
  const generate = vi.fn(() => 'replacement');
  await expect(generateTextProposal(document, textSelection(textPoint([0], 0), textPoint([0], 1)), provider(generate), { task: 'rewrite' })).rejects.toMatchObject({ code: 'invalid-selection' });
  expect(generate).not.toHaveBeenCalled();
});

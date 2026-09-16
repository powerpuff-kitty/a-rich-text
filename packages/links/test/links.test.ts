import { describe, expect, it } from 'vitest';
import { createTextDocument } from '../../core/src/index.js';
import {
  applyTransaction,
  transaction,
  createEditorState,
  textPoint,
  textSelection,
} from '../../engine/src/index.js';
import {
  createLinkMark,
  insertAutoLinkBoundary,
  detectLinks,
  getActiveLinkHref,
  normalizeLinkHref,
  removeSelectionLink,
  setSelectionLink,
} from '../src/index.js';

describe('@arichtext/links', () => {
  it('normalizes safe absolute, relative, www and email hrefs', () => {
    expect(normalizeLinkHref('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeLinkHref('/docs')).toBe('/docs');
    expect(normalizeLinkHref('../docs')).toBe('../docs');
    expect(normalizeLinkHref('#section')).toBe('#section');
    expect(normalizeLinkHref('www.example.com')).toBe('https://www.example.com');
    expect(normalizeLinkHref('person@example.com')).toBe('mailto:person@example.com');
    expect(normalizeLinkHref('mailto:person@example.com')).toBe('mailto:person@example.com');
    expect(createLinkMark('tel:+3212345678')).toEqual({ type: 'link', href: 'tel:+3212345678' });
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>x</script>',
    'vbscript:msgbox(1)',
    '',
    '   ',
  ])('rejects unsafe/empty href %s', (href) => {
    expect(() => normalizeLinkHref(href)).toThrow();
  });

  it('adds, queries, updates and removes a selection link through engine marks', () => {
    let state = createEditorState(
      createTextDocument('hello world'),
      textSelection(textPoint([0], 6), textPoint([0], 11)),
    );

    state = applyTransaction(state, setSelectionLink(state, 'https://example.com')!).state;
    expect(getActiveLinkHref(state)).toBe('https://example.com');
    expect(state.document.content[0]).toMatchObject({
      content: [
        { text: 'hello ' },
        { text: 'world', marks: [{ type: 'link', href: 'https://example.com' }] },
      ],
    });

    state = applyTransaction(state, setSelectionLink(state, 'https://example.org')!).state;
    expect(getActiveLinkHref(state)).toBe('https://example.org');

    state = applyTransaction(state, removeSelectionLink(state)!).state;
    expect(getActiveLinkHref(state)).toBeNull();
    expect(state.document.content[0]).toMatchObject({
      content: [{ text: 'hello world' }],
    });
  });

  it('refuses selection commands at a collapsed caret', () => {
    const state = createEditorState(
      createTextDocument('hello'),
      textSelection(textPoint([0], 2)),
    );
    expect(setSelectionLink(state, 'https://example.com')).toBeNull();
    expect(removeSelectionLink(state)).toBeNull();
  });

  it('returns null for a mixed linked/unlinked selection', () => {
    const state = createEditorState({
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'one', marks: [{ type: 'link', href: 'https://one.test' }] },
          { type: 'text', text: ' two' },
        ],
      }],
    }, textSelection(textPoint([0], 0), textPoint([0], 7)));
    expect(getActiveLinkHref(state)).toBeNull();
  });

  it('detects obvious URLs/emails and trims sentence punctuation', () => {
    expect(detectLinks('See https://example.com/docs, www.example.org and person@example.com.')).toEqual([
      {
        from: 4,
        to: 28,
        text: 'https://example.com/docs',
        href: 'https://example.com/docs',
      },
      {
        from: 30,
        to: 45,
        text: 'www.example.org',
        href: 'https://www.example.org',
      },
      {
        from: 50,
        to: 68,
        text: 'person@example.com',
        href: 'mailto:person@example.com',
      },
    ]);
  });

  it('keeps balanced URL parentheses but trims unmatched closing punctuation', () => {
    const detected = detectLinks('See https://example.com/a_(b)).');
    expect(detected).toHaveLength(1);
    expect(detected[0]?.text).toBe('https://example.com/a_(b)');
  });
});

describe('automatic link boundaries', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['www.example.com.', 'https://www.example.com'],
    ['person@example.com', 'mailto:person@example.com'],
    ['(https://example.com/a(b))', 'https://example.com/a(b)'],
  ])('links %s and inserts an unlinked space in one transaction', (text, href) => {
    const state = createEditorState(createTextDocument(text), textSelection(textPoint([0], text.length)));
    const command = insertAutoLinkBoundary(state, ' ')!;
    expect(command.operations).toHaveLength(2);
    const result = applyTransaction(state, command).state;
    const block = result.document.content[0] as { content: { text: string; marks?: unknown[] }[] };
    expect(block.content.some(run => run.marks?.some(mark => JSON.stringify(mark) === JSON.stringify({ type: 'link', href })))).toBe(true);
    expect(block.content.at(-1)?.marks ?? []).toEqual([]);
    expect(result.selection?.anchor.offset).toBe(text.length + 1);
  });

  it.each(['prefixhttps://example.com', 'javascript:www.example.com', 'just-text'])('ignores non-token or unsupported text %s', text => {
    const state = createEditorState(createTextDocument(text), textSelection(textPoint([0], text.length)));
    expect(insertAutoLinkBoundary(state, ' ')).toBeNull();
  });

  it('preserves formatting and skips code, existing links and non-collapsed selections', () => {
    const text = 'https://example.com';
    let state = createEditorState(createTextDocument(text), textSelection(textPoint([0], text.length)));
    state = applyTransaction(state, transaction().addMark(textPoint([0], 0), textPoint([0], text.length), { type: 'bold' }).build()).state;
    const result = applyTransaction(state, insertAutoLinkBoundary(state, ' ')!).state;
    expect((result.document.content[0] as { content: { marks?: unknown[] }[] }).content[0]?.marks).toContainEqual({ type: 'bold' });
    for (const mark of [{ type: 'code' } as const, createLinkMark('/existing')]) {
      const marked = applyTransaction(state, transaction().addMark(textPoint([0], 0), textPoint([0], 3), mark).build()).state;
      expect(insertAutoLinkBoundary(marked, ' ')).toBeNull();
    }
    expect(insertAutoLinkBoundary({ ...state, selection: textSelection(textPoint([0], 0), textPoint([0], text.length)) }, ' ')).toBeNull();
    expect(insertAutoLinkBoundary(state, 'x')).toBeNull();
  });
});

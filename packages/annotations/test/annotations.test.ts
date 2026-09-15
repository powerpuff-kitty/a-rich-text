import { describe, expect, it } from 'vitest';
import {
  applyTransaction,
  createEditorState,
  textPoint,
  textSelection,
  transaction,
} from '../../engine/src/index.js';
import {
  createAnchoredRange,
  mapAnchoredRangeThroughOperation,
  mapAnchoredRangeThroughOperations,
  mapAnchoredRangeThroughResult,
  validateAnchoredRange,
} from '../src/index.js';

function paragraph(text: string) {
  return { type: 'paragraph' as const, content: text ? [{ type: 'text' as const, text }] : [] };
}

function document(...texts: string[]) {
  return { type: 'doc' as const, version: 1 as const, content: texts.map(paragraph) };
}

describe('@arichtext/annotations anchored ranges', () => {
  it('normalizes backwards selections and captures an immutable quote/context snapshot', () => {
    const doc = document('hello world');
    const range = createAnchoredRange(
      doc,
      textSelection(textPoint([0], 11), textPoint([0], 6)),
      { captureQuote: true, quoteContextChars: 3 },
    );

    expect(range.start).toEqual({ blockPath: [0], offset: 6, affinity: 'after' });
    expect(range.end).toEqual({ blockPath: [0], offset: 11, affinity: 'before' });
    expect(range.quote).toEqual({ text: 'world', prefix: 'lo ' });
    expect(() => validateAnchoredRange(doc, range)).not.toThrow();
  });

  it('uses affinity to keep inserted text outside an existing comment selection', () => {
    const doc = document('hello world');
    const range = createAnchoredRange(
      doc,
      textSelection(textPoint([0], 6), textPoint([0], 11)),
    );

    const insertedAtStart = mapAnchoredRangeThroughOperation(
      doc,
      range,
      { type: 'replaceText', from: textPoint([0], 6), to: textPoint([0], 6), text: 'big ' },
    );
    expect(insertedAtStart.status).toBe('mapped');
    if (insertedAtStart.status !== 'orphaned') {
      expect(insertedAtStart.range.start.offset).toBe(10);
      expect(insertedAtStart.range.end.offset).toBe(15);
    }

    const insertedAtEnd = mapAnchoredRangeThroughOperation(
      doc,
      range,
      { type: 'replaceText', from: textPoint([0], 11), to: textPoint([0], 11), text: '!' },
    );
    expect(insertedAtEnd.status).toBe('mapped');
    if (insertedAtEnd.status !== 'orphaned') {
      expect(insertedAtEnd.range.start.offset).toBe(6);
      expect(insertedAtEnd.range.end.offset).toBe(11);
    }
  });

  it('maps a range covering replaced text onto the replacement and collapses after deletion', () => {
    const doc = document('hello world');
    const range = createAnchoredRange(doc, textSelection(textPoint([0], 6), textPoint([0], 11)));

    const replaced = mapAnchoredRangeThroughOperation(
      doc,
      range,
      { type: 'replaceText', from: textPoint([0], 6), to: textPoint([0], 11), text: 'earth' },
    );
    expect(replaced.status).toBe('mapped');
    if (replaced.status !== 'orphaned') {
      expect(replaced.range.start.offset).toBe(6);
      expect(replaced.range.end.offset).toBe(11);
    }

    const deleted = mapAnchoredRangeThroughOperation(
      doc,
      range,
      { type: 'replaceText', from: textPoint([0], 6), to: textPoint([0], 11), text: '' },
    );
    expect(deleted.status).toBe('collapsed');
    if (deleted.status !== 'orphaned') {
      expect(deleted.range.start.offset).toBe(6);
      expect(deleted.range.end.offset).toBe(6);
    }
  });

  it('maps cross-block text deletion according to the engine current semantics', () => {
    const doc = document('abc', 'def', 'ghi');
    const range = createAnchoredRange(doc, textSelection(textPoint([0], 1), textPoint([2], 2)));
    const mapped = mapAnchoredRangeThroughOperation(
      doc,
      range,
      { type: 'replaceText', from: textPoint([0], 1), to: textPoint([2], 2), text: 'X' },
    );

    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start).toMatchObject({ blockPath: [0], offset: 1 });
      expect(mapped.range.end).toMatchObject({ blockPath: [2], offset: 0 });
    }
  });

  it('maps ranges through paragraph splitting including sibling path shifts', () => {
    const doc = document('abcdef', 'later');
    const inside = createAnchoredRange(doc, textSelection(textPoint([0], 4), textPoint([0], 6)));
    const later = createAnchoredRange(doc, textSelection(textPoint([1], 0), textPoint([1], 5)));
    const split = { type: 'splitBlock' as const, point: textPoint([0], 3) };

    const mappedInside = mapAnchoredRangeThroughOperation(doc, inside, split);
    expect(mappedInside.status).toBe('mapped');
    if (mappedInside.status !== 'orphaned') {
      expect(mappedInside.range.start).toMatchObject({ blockPath: [1], offset: 1 });
      expect(mappedInside.range.end).toMatchObject({ blockPath: [1], offset: 3 });
    }

    const mappedLater = mapAnchoredRangeThroughOperation(doc, later, split);
    expect(mappedLater.status).toBe('mapped');
    if (mappedLater.status !== 'orphaned') {
      expect(mappedLater.range.start.blockPath).toEqual([2]);
      expect(mappedLater.range.end.blockPath).toEqual([2]);
    }
  });

  it('maps nested list siblings through split operations', () => {
    const doc = {
      type: 'doc' as const,
      version: 1 as const,
      content: [{
        type: 'list' as const,
        style: 'bullet' as const,
        content: [{
          type: 'listItem' as const,
          content: [paragraph('first'), paragraph('second')],
        }],
      }],
    };
    const range = createAnchoredRange(doc, textSelection(textPoint([0, 0, 1], 0), textPoint([0, 0, 1], 6)));
    const mapped = mapAnchoredRangeThroughOperation(
      doc,
      range,
      { type: 'splitBlock', point: textPoint([0, 0, 0], 2) },
    );

    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start.blockPath).toEqual([0, 0, 2]);
      expect(mapped.range.end.blockPath).toEqual([0, 0, 2]);
    }
  });

  it('maps right-block ranges into the left block when siblings join', () => {
    const doc = document('abc', 'def', 'later');
    const range = createAnchoredRange(doc, textSelection(textPoint([1], 1), textPoint([1], 3)));
    const mapped = mapAnchoredRangeThroughOperation(
      doc,
      range,
      { type: 'joinBlocks', leftPath: [0], rightPath: [1] },
    );

    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start).toMatchObject({ blockPath: [0], offset: 4 });
      expect(mapped.range.end).toMatchObject({ blockPath: [0], offset: 6 });
    }
  });

  it('maps preserved trailing text through multi-block fragment insertion', () => {
    const doc = document('abcdef', 'later');
    const trailing = createAnchoredRange(doc, textSelection(textPoint([0], 4), textPoint([0], 6)));
    const later = createAnchoredRange(doc, textSelection(textPoint([1], 0), textPoint([1], 5)));
    const operation = {
      type: 'replaceFragment' as const,
      from: textPoint([0], 3),
      to: textPoint([0], 3),
      content: [paragraph('one'), { type: 'horizontalRule' as const }, paragraph('two')],
    };

    const mappedTrailing = mapAnchoredRangeThroughOperation(doc, trailing, operation);
    expect(mappedTrailing.status).toBe('mapped');
    if (mappedTrailing.status !== 'orphaned') {
      expect(mappedTrailing.range.start).toMatchObject({ blockPath: [2], offset: 4 });
      expect(mappedTrailing.range.end).toMatchObject({ blockPath: [2], offset: 6 });
    }

    const mappedLater = mapAnchoredRangeThroughOperation(doc, later, operation);
    expect(mappedLater.status).toBe('mapped');
    if (mappedLater.status !== 'orphaned') {
      expect(mappedLater.range.start.blockPath).toEqual([3]);
      expect(mappedLater.range.end.blockPath).toEqual([3]);
    }
  });

  it('maps through a full sequence in the same order the engine applies operations', () => {
    const doc = document('hello');
    const range = createAnchoredRange(doc, textSelection(textPoint([0], 1), textPoint([0], 4)));
    const operations = [
      { type: 'replaceText' as const, from: textPoint([0], 0), to: textPoint([0], 0), text: 'X' },
      { type: 'splitBlock' as const, point: textPoint([0], 3) },
    ];

    const mapped = mapAnchoredRangeThroughOperations(doc, range, operations);
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start).toMatchObject({ blockPath: [0], offset: 2 });
      expect(mapped.range.end).toMatchObject({ blockPath: [1], offset: 2 });
    }
  });

  it('verifies a TransactionResult can be reconstructed from reported operations', () => {
    const doc = document('hello');
    const range = createAnchoredRange(doc, textSelection(textPoint([0], 1), textPoint([0], 4)));
    const tx = transaction().replaceText(textPoint([0], 0), textPoint([0], 0), 'X').build();
    const result = applyTransaction(createEditorState(doc), tx);

    expect(mapAnchoredRangeThroughResult(doc, range, result).status).toBe('mapped');

    const inconsistent = {
      ...result,
      operations: [],
    };
    expect(mapAnchoredRangeThroughResult(doc, range, inconsistent)).toEqual({
      status: 'orphaned',
      range: null,
      reason: 'Transaction result cannot be reconstructed from its reported operations',
    });
  });

  it('does not move positions for formatting-only operations', () => {
    const doc = document('hello');
    const range = createAnchoredRange(doc, textSelection(textPoint([0], 1), textPoint([0], 4)));
    const mapped = mapAnchoredRangeThroughOperation(doc, range, {
      type: 'addMark',
      from: textPoint([0], 0),
      to: textPoint([0], 5),
      mark: { type: 'bold' },
    });

    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start.offset).toBe(1);
      expect(mapped.range.end.offset).toBe(4);
    }
  });
});

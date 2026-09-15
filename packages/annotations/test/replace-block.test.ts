import { describe, expect, it } from 'vitest';
import { type ARTBlockNode, type ARTDocument } from '../../core/src/index.js';
import { textPoint, textSelection, transaction } from '../../engine/src/index.js';
import {
  createAnchoredRange,
  mapAnchoredRangeThroughOperation,
  mapAnchoredRangeThroughTransaction,
} from '../src/index.js';

function paragraph(text: string): ARTBlockNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function document(...content: ARTBlockNode[]): ARTDocument {
  return { type: 'doc', version: 1, content };
}

describe('replaceBlock annotation mapping', () => {
  it('maps an anchor into a wrapped list text block while preserving offsets', () => {
    const doc = document(paragraph('hello'), paragraph('later'));
    const range = createAnchoredRange(
      doc,
      textSelection(textPoint([0], 1), textPoint([0], 4)),
    );
    const operation = {
      type: 'replaceBlock' as const,
      path: [0],
      content: [{
        type: 'list' as const,
        style: 'bullet' as const,
        content: [{
          type: 'listItem' as const,
          content: [paragraph('hello')],
        }],
      }],
      pathMappings: [{ from: [0], to: [0, 0, 0] }],
    };

    const mapped = mapAnchoredRangeThroughOperation(doc, range, operation);
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start).toMatchObject({ blockPath: [0, 0, 0], offset: 1 });
      expect(mapped.range.end).toMatchObject({ blockPath: [0, 0, 0], offset: 4 });
    }
  });

  it('shifts later sibling paths when one block expands to multiple blocks', () => {
    const doc = document(paragraph('one'), paragraph('later'));
    const later = createAnchoredRange(
      doc,
      textSelection(textPoint([1], 1), textPoint([1], 4)),
    );
    const operation = {
      type: 'replaceBlock' as const,
      path: [0],
      content: [paragraph('one'), { type: 'horizontalRule' as const }],
      pathMappings: [{ from: [0], to: [0] }],
    };

    const mapped = mapAnchoredRangeThroughOperation(doc, later, operation);
    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start.blockPath).toEqual([2]);
      expect(mapped.range.end.blockPath).toEqual([2]);
    }
  });

  it('orphanes content inside the replaced subtree when no continuity mapping exists', () => {
    const doc = document({
      type: 'blockquote',
      content: [paragraph('inside')],
    });
    const range = createAnchoredRange(
      doc,
      textSelection(textPoint([0, 0], 1), textPoint([0, 0], 5)),
    );

    const mapped = mapAnchoredRangeThroughOperation(doc, range, {
      type: 'replaceBlock',
      path: [0],
      content: [{ type: 'horizontalRule' }],
    });

    expect(mapped.status).toBe('orphaned');
  });

  it('maps multiple preserved text paths through a list-style transform', () => {
    const doc = document({
      type: 'list',
      style: 'bullet',
      content: [
        { type: 'listItem', content: [paragraph('one')] },
        { type: 'listItem', content: [paragraph('two')] },
      ],
    });
    const range = createAnchoredRange(
      doc,
      textSelection(textPoint([0, 1, 0], 0), textPoint([0, 1, 0], 3)),
    );
    const replacement: ARTBlockNode = {
      type: 'list',
      style: 'ordered',
      content: [
        { type: 'listItem', content: [paragraph('one')] },
        { type: 'listItem', content: [paragraph('two')] },
      ],
    };

    const mapped = mapAnchoredRangeThroughTransaction(
      doc,
      range,
      transaction()
        .replaceBlock([0], [replacement], [
          { from: [0, 0, 0], to: [0, 0, 0] },
          { from: [0, 1, 0], to: [0, 1, 0] },
        ])
        .build(),
    );

    expect(mapped.status).toBe('mapped');
    if (mapped.status !== 'orphaned') {
      expect(mapped.range.start.blockPath).toEqual([0, 1, 0]);
      expect(mapped.range.end.blockPath).toEqual([0, 1, 0]);
    }
  });
});

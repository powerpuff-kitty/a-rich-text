import { describe, expect, it } from 'vitest';
import {
  ART_DOCUMENT_VERSION,
  isARTDocument,
  parseDocument,
  serializeDocument,
  toPlainText,
  type ARTDocument,
} from '../src/index.js';

describe('ART document core', () => {
  it('validates, serializes and parses structured documents deterministically', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [
        {
          type: 'heading',
          level: 2,
          content: [{ type: 'text', text: 'A rich ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'text' }],
        },
        {
          type: 'list',
          style: 'task',
          content: [
            {
              type: 'listItem',
              checked: true,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship it' }] }],
            },
          ],
        },
      ],
    };

    expect(isARTDocument(document)).toBe(true);
    const serialized = serializeDocument(document);
    expect(parseDocument(serialized)).toEqual(document);
    expect(serializeDocument(parseDocument(serialized))).toBe(serialized);
    expect(toPlainText(document)).toBe('A rich text\nShip it');
  });

  it('rejects task items without a checked state', () => {
    expect(isARTDocument({
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'list',
        style: 'task',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }],
      }],
    })).toBe(false);
  });

  it('rejects tables whose effective row widths differ', () => {
    expect(isARTDocument({
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableCell', content: [] }] },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [] },
              { type: 'tableCell', content: [] },
            ],
          },
        ],
      }],
    })).toBe(false);
  });
});

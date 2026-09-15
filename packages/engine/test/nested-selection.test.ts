import { describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import {
  applyTransaction,
  createEditorState,
  textPoint,
  transaction,
} from '../src/index.js';

describe('nested engine selections', () => {
  it('addresses inline blocks inside list items by stable block paths', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'list',
        style: 'bullet',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }],
        }],
      }],
    };

    const result = applyTransaction(
      createEditorState(document),
      transaction().addMark(textPoint([0, 0, 0], 0), textPoint([0, 0, 0], 6), { type: 'italic' }).build(),
    );

    expect(result.state.document.content[0]).toMatchObject({
      type: 'list',
      content: [{
        content: [{
          type: 'paragraph',
          content: [{ text: 'nested', marks: [{ type: 'italic' }] }],
        }],
      }],
    });
  });

  it('addresses inline blocks nested inside table cells', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }],
          }],
        }],
      }],
    };

    const result = applyTransaction(
      createEditorState(document),
      transaction().replaceText(textPoint([0, 0, 0, 0], 1), textPoint([0, 0, 0, 0], 3), 'X').build(),
    );

    expect(result.state.document.content[0]).toMatchObject({
      content: [{ content: [{ content: [{ content: [{ text: 'cXl' }] }] }] }],
    });
  });

  it('normalizes backwards selections before applying operations', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
      ],
    };

    const result = applyTransaction(
      createEditorState(document),
      transaction().addMark(textPoint([1], 3), textPoint([0], 2), { type: 'bold' }).build(),
    );

    expect(result.state.document.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'fi' },
          { type: 'text', text: 'rst', marks: [{ type: 'bold' }] },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'sec', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'ond' },
        ],
      },
    ]);
  });
});

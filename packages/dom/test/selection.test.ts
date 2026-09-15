// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { ART_DOCUMENT_VERSION, type ARTDocument } from '../../core/src/index.js';
import { textPoint, textSelection } from '../../engine/src/index.js';
import { readDOMSelection, renderARTDocument, writeDOMSelection } from '../src/index.js';

interface CapturedSelection {
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
  setBaseAndExtent(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number): void;
}

function captureSelection(): CapturedSelection {
  return {
    anchorNode: null,
    anchorOffset: 0,
    focusNode: null,
    focusOffset: 0,
    setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset) {
      this.anchorNode = anchorNode;
      this.anchorOffset = anchorOffset;
      this.focusNode = focusNode;
      this.focusOffset = focusOffset;
    },
  };
}

let root: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.querySelector<HTMLDivElement>('#root')!;
});

describe('@arichtext/dom selection mapping', () => {
  it('round-trips logical offsets across marks and line breaks', () => {
    const art: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'ab' },
          { type: 'text', text: 'cd', marks: [{ type: 'bold' }] },
          { type: 'text', text: '\nef', marks: [{ type: 'italic' }] },
        ],
      }],
    };
    renderARTDocument(root, art);

    const logical = textSelection(textPoint([0], 1), textPoint([0], 6));
    const captured = captureSelection();
    expect(writeDOMSelection(root, logical, captured as unknown as Selection)).toBe(true);

    const roundTrip = readDOMSelection(root, captured as unknown as Selection);
    expect(roundTrip).toEqual(logical);
  });

  it('preserves backwards anchor/focus direction', () => {
    const art: ARTDocument = {
      type: 'doc',
      version: ART_DOCUMENT_VERSION,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcdef' }] }],
    };
    renderARTDocument(root, art);

    const backwards = textSelection(textPoint([0], 5), textPoint([0], 2));
    const captured = captureSelection();
    expect(writeDOMSelection(root, backwards, captured as unknown as Selection)).toBe(true);
    expect(readDOMSelection(root, captured as unknown as Selection)).toEqual(backwards);
  });

  it('round-trips selections in nested list blocks', () => {
    const art: ARTDocument = {
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
    renderARTDocument(root, art);

    const logical = textSelection(textPoint([0, 0, 0], 2), textPoint([0, 0, 0], 5));
    const captured = captureSelection();
    expect(writeDOMSelection(root, logical, captured as unknown as Selection)).toBe(true);
    expect(readDOMSelection(root, captured as unknown as Selection)).toEqual(logical);
  });

  it('returns null when the browser selection is outside the editor root', () => {
    const outside = document.createTextNode('outside');
    document.body.append(outside);
    const fake = {
      anchorNode: outside,
      anchorOffset: 0,
      focusNode: outside,
      focusOffset: 1,
    } as unknown as Selection;

    expect(readDOMSelection(root, fake)).toBeNull();
  });
});

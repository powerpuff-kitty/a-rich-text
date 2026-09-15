import { textSelection } from '@arichtext/engine';
import type { ARTSelection, ARTTextPoint } from '@arichtext/engine';
import {
  ART_BLOCK_PATH_ATTRIBUTE,
  ART_TEXT_BLOCK_ATTRIBUTE,
  decodeARTPath,
  encodeARTPath,
} from './renderer.js';

interface DOMPoint {
  node: Node;
  offset: number;
}

export function readDOMSelection(
  root: HTMLElement,
  domSelection: Selection | null = selectionForRoot(root),
): ARTSelection | null {
  if (!domSelection?.anchorNode || !domSelection.focusNode) return null;
  if (!isInside(root, domSelection.anchorNode) || !isInside(root, domSelection.focusNode)) {
    const scope = root.getRootNode();
    if (!(scope instanceof ShadowRoot) || typeof domSelection.getComposedRanges !== 'function') return null;
    const range = domSelection.getComposedRanges({ shadowRoots: [scope] })[0];
    if (!range || !isInside(root, range.startContainer) || !isInside(root, range.endContainer)) return null;
    const start = readDOMPoint(root, range.startContainer, range.startOffset);
    const end = readDOMPoint(root, range.endContainer, range.endOffset);
    if (!start || !end) return null;
    return domSelection.direction === 'backward' ? textSelection(end, start) : textSelection(start, end);
  }

  const anchor = readDOMPoint(root, domSelection.anchorNode, domSelection.anchorOffset);
  const head = readDOMPoint(root, domSelection.focusNode, domSelection.focusOffset);
  if (!anchor || !head) return null;
  return textSelection(anchor, head);
}

export function writeDOMSelection(
  root: HTMLElement,
  selection: ARTSelection,
  domSelection: Selection | null = selectionForRoot(root),
): boolean {
  if (!domSelection) return false;

  const anchorBlock = findBlockByPath(root, selection.anchor.blockPath);
  const headBlock = findBlockByPath(root, selection.head.blockPath);
  if (!anchorBlock || !headBlock) return false;

  const anchor = findDOMPoint(anchorBlock, selection.anchor.offset);
  const head = findDOMPoint(headBlock, selection.head.offset);
  if (!anchor || !head) return false;

  try {
    if (typeof domSelection.setBaseAndExtent === 'function') {
      domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
      return true;
    }

    domSelection.removeAllRanges();
    const range = root.ownerDocument.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.collapse(true);
    domSelection.addRange(range);
    if (typeof domSelection.extend === 'function') {
      domSelection.extend(head.node, head.offset);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function getLogicalTextLength(block: HTMLElement): number {
  return logicalLength(block);
}

function selectionForRoot(root: HTMLElement): Selection | null {
  const scope = root.getRootNode() as Node & { getSelection?: () => Selection | null };
  return scope.getSelection?.() ?? root.ownerDocument.getSelection();
}

function readDOMPoint(root: HTMLElement, node: Node, offset: number): ARTTextPoint | null {
  const block = findTextBlock(root, node);
  if (!block) {
    // Empty editors and select-all can place endpoints on a container boundary.
    if (node.nodeType !== 1 || !isInside(root, node) || offset < 0 || offset > node.childNodes.length) return null;
    const blocksIn = (child: Node): HTMLElement[] => child.nodeType === 1
      ? [(child as HTMLElement), ...Array.from((child as Element).querySelectorAll<HTMLElement>(`[${ART_TEXT_BLOCK_ATTRIBUTE}]`))]
        .filter((element) => element.hasAttribute(ART_TEXT_BLOCK_ATTRIBUTE))
      : [];
    for (let index = offset; index < node.childNodes.length; index += 1) {
      const next = blocksIn(node.childNodes[index]!)[0];
      if (next) return readDOMPoint(root, next, 0);
    }
    for (let index = offset - 1; index >= 0; index -= 1) {
      const previous = blocksIn(node.childNodes[index]!).at(-1);
      if (previous) return readDOMPoint(root, previous, previous.childNodes.length);
    }
    return null;
  }
  const encodedPath = block.getAttribute(ART_BLOCK_PATH_ATTRIBUTE);
  if (!encodedPath) return null;

  let logicalOffset: number;
  try {
    logicalOffset = offsetWithinBlock(block, node, offset);
  } catch {
    return null;
  }

  return {
    blockPath: decodeARTPath(encodedPath),
    offset: logicalOffset,
  };
}

function findTextBlock(root: HTMLElement, node: Node): HTMLElement | null {
  let current: Node | null = node.nodeType === 1 ? node : node.parentNode;
  while (current && current !== root) {
    if (current.nodeType === 1) {
      const element = current as HTMLElement;
      if (element.hasAttribute(ART_TEXT_BLOCK_ATTRIBUTE)) return element;
    }
    current = current.parentNode;
  }
  return root.hasAttribute(ART_TEXT_BLOCK_ATTRIBUTE) ? root : null;
}

function findBlockByPath(root: HTMLElement, path: readonly number[]): HTMLElement | null {
  const encoded = encodeARTPath(path);
  for (const element of root.querySelectorAll<HTMLElement>(`[${ART_TEXT_BLOCK_ATTRIBUTE}]`)) {
    if (element.getAttribute(ART_BLOCK_PATH_ATTRIBUTE) === encoded) return element;
  }
  return root.hasAttribute(ART_TEXT_BLOCK_ATTRIBUTE)
    && root.getAttribute(ART_BLOCK_PATH_ATTRIBUTE) === encoded
    ? root
    : null;
}

function offsetWithinBlock(block: HTMLElement, node: Node, offset: number): number {
  if (!isInside(block, node)) throw new RangeError('DOM point is outside its ART text block');

  let total = localOffsetLength(node, offset);
  let current: Node = node;

  while (current !== block) {
    const parent = current.parentNode;
    if (!parent) throw new RangeError('DOM point is detached');
    for (const sibling of Array.from(parent.childNodes)) {
      if (sibling === current) break;
      total += logicalLength(sibling);
    }
    current = parent;
  }

  if (total > logicalLength(block)) throw new RangeError('DOM point exceeds ART text block length');
  return total;
}

function localOffsetLength(node: Node, offset: number): number {
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError('DOM offsets must be non-negative integers');

  if (node.nodeType === 3) {
    const text = node.nodeValue ?? '';
    if (offset > text.length) throw new RangeError('Text node offset is out of bounds');
    return offset;
  }

  if (offset > node.childNodes.length) throw new RangeError('Element child offset is out of bounds');
  let total = 0;
  for (let index = 0; index < offset; index += 1) {
    total += logicalLength(node.childNodes[index]!);
  }
  return total;
}

function findDOMPoint(block: HTMLElement, targetOffset: number): DOMPoint | null {
  const total = logicalLength(block);
  if (!Number.isInteger(targetOffset) || targetOffset < 0 || targetOffset > total) return null;
  if (block.childNodes.length === 0) return targetOffset === 0 ? { node: block, offset: 0 } : null;

  let cursor = 0;
  const tokens = collectLogicalTokens(block);
  for (const token of tokens) {
    if (token.node.nodeType === 3) {
      const length = token.node.nodeValue?.length ?? 0;
      if (targetOffset <= cursor + length) {
        return { node: token.node, offset: targetOffset - cursor };
      }
      cursor += length;
      continue;
    }

    if (targetOffset === cursor) return boundaryBefore(token.node);
    cursor += 1;
    if (targetOffset === cursor) return boundaryAfter(token.node);
  }

  return targetOffset === total ? { node: block, offset: block.childNodes.length } : null;
}

function collectLogicalTokens(root: Node): Array<{ node: Node }> {
  const tokens: Array<{ node: Node }> = [];
  const visit = (node: Node): void => {
    if (isPlaceholder(node)) return;
    if (node.nodeType === 3) {
      tokens.push({ node });
      return;
    }
    if (isBreak(node)) {
      tokens.push({ node });
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  for (const child of Array.from(root.childNodes)) visit(child);
  return tokens;
}

function logicalLength(node: Node): number {
  if (isPlaceholder(node)) return 0;
  if (node.nodeType === 3) return node.nodeValue?.length ?? 0;
  if (isBreak(node)) return 1;
  let total = 0;
  for (const child of Array.from(node.childNodes)) total += logicalLength(child);
  return total;
}

function isBreak(node: Node): boolean {
  return node.nodeType === 1 && (node as Element).tagName === 'BR';
}

function isPlaceholder(node: Node): boolean {
  return node.nodeType === 1 && (node as Element).hasAttribute('data-art-placeholder');
}

function boundaryBefore(node: Node): DOMPoint {
  const parent = node.parentNode;
  if (!parent) return { node, offset: 0 };
  return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, node) };
}

function boundaryAfter(node: Node): DOMPoint {
  const before = boundaryBefore(node);
  return { node: before.node, offset: before.offset + 1 };
}

function isInside(root: HTMLElement, node: Node): boolean {
  return node === root || root.contains(node);
}

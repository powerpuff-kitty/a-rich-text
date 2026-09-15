import { serializeDocument, type ARTDocument } from '@arichtext/core';
import { textPoint, type EditorOperation } from '@arichtext/engine';
import { listInlineBlocks, samePath } from './range.js';

/**
 * Infer a deterministic text-only reconcile when document structure is
 * unchanged and at most one paragraph/heading text value changed.
 *
 * `[]` means no anchor-relevant text/structure change.
 * `null` means the change cannot be represented safely as one text operation.
 */
export function inferSimpleReconcileOperations(
  before: ARTDocument,
  after: ARTDocument,
): EditorOperation[] | null {
  if (serializeDocument(textNeutralSkeleton(before)) !== serializeDocument(textNeutralSkeleton(after))) {
    return null;
  }

  const beforeBlocks = listInlineBlocks(before);
  const afterBlocks = listInlineBlocks(after);
  if (beforeBlocks.length !== afterBlocks.length) return null;

  const changed: Array<{ path: number[]; before: string; after: string }> = [];
  for (let index = 0; index < beforeBlocks.length; index += 1) {
    const left = beforeBlocks[index]!;
    const right = afterBlocks[index]!;
    if (!samePath(left.path, right.path)) return null;
    if (left.text !== right.text) changed.push({ path: [...left.path], before: left.text, after: right.text });
    if (changed.length > 1) return null;
  }

  if (changed.length === 0) return [];
  const change = changed[0]!;
  const prefix = commonPrefixLength(change.before, change.after);
  const suffix = commonSuffixLength(change.before, change.after, prefix);
  const beforeEnd = change.before.length - suffix;
  const afterEnd = change.after.length - suffix;

  return [{
    type: 'replaceText',
    from: textPoint(change.path, prefix),
    to: textPoint(change.path, beforeEnd),
    text: change.after.slice(prefix, afterEnd),
  }];
}

function textNeutralSkeleton(document: ARTDocument): ARTDocument {
  return mapNode(document) as ARTDocument;
}

function mapNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapNode);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.type === 'paragraph' || record.type === 'heading') {
    return {
      ...record,
      content: [],
    };
  }
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, mapNode(child)]));
}

function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string, prefix: number): number {
  const max = Math.min(left.length, right.length) - prefix;
  let count = 0;
  while (
    count < max
    && left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
}

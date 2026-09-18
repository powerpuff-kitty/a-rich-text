import { inlineNodeText } from '@arichtext/core';
import type { ARTDocument } from '@arichtext/core';
import { listInlineBlocks, marksAtOffset } from './tree.js';
import { transaction } from './transaction.js';
import type { ARTSelection, EditorState, EditorTransaction } from './types.js';

export interface ARTSearchOptions { matchCase?: boolean; wholeWord?: boolean }
export interface ARTSearchMatch { selection: ARTSelection; text: string }

/** Literal, non-overlapping matches within editable text blocks; offsets remain UTF-16. */
export function findText(document: ARTDocument, query: string, options: ARTSearchOptions = {}): ARTSearchMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.matchCase ? 'gu' : 'giu');
  const matches: ARTSearchMatch[] = [];
  for (const { path, block } of listInlineBlocks(document)) {
    const text = (block.content ?? []).map(inlineNodeText).join('');
    for (const match of text.matchAll(pattern)) {
      const start = match.index; const end = start + match[0].length;
      if (options.wholeWord && (/[\p{L}\p{N}\p{M}_]$/u.test(text.slice(Math.max(0, start - 2), start))
        || /^[\p{L}\p{N}\p{M}_]/u.test(text.slice(end, end + 2)))) continue;
      matches.push({ text: match[0], selection: {
        anchor: { blockPath: [...path], offset: start }, head: { blockPath: [...path], offset: end },
      } });
    }
  }
  return matches;
}

/** Recompute against current state, replacing one indexed match or all matches atomically. */
export function replaceSearchMatches(
  state: EditorState, query: string, replacement: string, options: ARTSearchOptions = {}, index?: number,
): EditorTransaction | null {
  const matches = findText(state.document, query, options);
  if (index !== undefined && (!Number.isSafeInteger(index) || index < 0 || index >= matches.length)) return null;
  const selected = index === undefined ? matches : [matches[index]!];
  const blocks = new Map(listInlineBlocks(state.document).map(entry => [entry.path.join('.'), entry.block]));
  const tx = transaction();
  let changed = false;
  for (const match of [...selected].reverse()) {
    if (match.text === replacement) continue;
    const { anchor, head } = match.selection;
    const marks = marksAtOffset(blocks.get(anchor.blockPath.join('.'))!, anchor.offset + 1);
    tx.replaceText(anchor, head, replacement, marks); changed = true;
  }
  return changed ? tx.setMeta('command', index === undefined ? 'replaceAllMatches' : 'replaceMatch').build() : null;
}

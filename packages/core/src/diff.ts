import { isARTDocument, type ARTDocument, type ARTJSONValue } from './index.js';

/** A descriptive structural difference, not an executable patch or CRDT operation. */
export type ARTDocumentDifference =
  | { kind: 'add'; path: (string | number)[]; after: ARTJSONValue }
  | { kind: 'remove'; path: (string | number)[]; before: ARTJSONValue }
  | { kind: 'replace'; path: (string | number)[]; before: ARTJSONValue; after: ARTJSONValue };

/** Compare JSON values by object key and array position. Text changes replace the
 * whole string; moves and semantic equivalence are deliberately not inferred.
 * Returned values are detached from both documents. Neither input is changed.
 */
export function diffDocuments(before: ARTDocument, after: ARTDocument): ARTDocumentDifference[] {
  if (!isARTDocument(before) || !isARTDocument(after)) throw new TypeError('Invalid ART document');
  const changes: ARTDocumentDifference[] = [];
  visit(JSON.parse(JSON.stringify(before)) as ARTJSONValue, JSON.parse(JSON.stringify(after)) as ARTJSONValue, []);
  return changes;

  function visit(left: ARTJSONValue, right: ARTJSONValue, path: (string | number)[]): void {
    if (left === right) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const child = [...path, i];
        if (i >= left.length) changes.push({ kind: 'add', path: child, after: right[i]! });
        else if (i >= right.length) changes.push({ kind: 'remove', path: child, before: left[i]! });
        else visit(left[i]!, right[i]!, child);
      }
    } else if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        const child = [...path, key];
        if (!Object.hasOwn(left, key)) changes.push({ kind: 'add', path: child, after: right[key]! });
        else if (!Object.hasOwn(right, key)) changes.push({ kind: 'remove', path: child, before: left[key]! });
        else visit(left[key]!, right[key]!, child);
      }
    } else changes.push({ kind: 'replace', path, before: left, after: right });
  }
}

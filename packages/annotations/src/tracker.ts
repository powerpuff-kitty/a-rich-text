import type { ARTDocument } from '@arichtext/core';
import type { TransactionResult } from '@arichtext/engine';
import { cloneAnchoredRange, validateAnchoredRange } from './range.js';
import { mapAnchoredRangeThroughResult } from './mapping.js';
import type {
  AnchoredRangeMappingResult,
  AnchoredTextRange,
} from './types.js';

export interface AnchoredRangeTrackerOptions {
  /** Should match the associated engine history depth when possible. */
  historyLimit?: number;
}

/**
 * Keeps one annotation anchor aligned with `EditorEngine` history semantics.
 *
 * Forward transactions map through reported operations. Engine undo/redo uses
 * state snapshots (`operations: []`), so the tracker restores its own matching
 * snapshot rather than attempting to invent inverse operations.
 */
export class AnchoredRangeTracker {
  #current: AnchoredRangeMappingResult;
  #past: AnchoredRangeMappingResult[] = [];
  #future: AnchoredRangeMappingResult[] = [];
  #historyLimit: number;

  constructor(
    document: ARTDocument,
    range: AnchoredTextRange,
    options: AnchoredRangeTrackerOptions = {},
  ) {
    validateAnchoredRange(document, range);
    this.#current = mappingResult(range);
    this.#historyLimit = Math.max(0, Math.floor(options.historyLimit ?? 100));
  }

  get current(): AnchoredRangeMappingResult {
    return cloneMappingResult(this.#current);
  }

  /**
   * Consume the same `TransactionResult` emitted by the associated engine.
   * `beforeDocument` must be the canonical document immediately before result.
   */
  handle(beforeDocument: ARTDocument, result: TransactionResult): AnchoredRangeMappingResult {
    const history = result.meta?.history;
    if (history === 'undo') return this.#undo(result.state.document);
    if (history === 'redo') return this.#redo(result.state.document);
    if (!result.documentChanged) return this.current;

    this.#pushPast(this.#current);
    this.#future = [];

    if (this.#current.status === 'orphaned') return this.current;
    this.#current = mapAnchoredRangeThroughResult(beforeDocument, this.#current.range, result);
    return this.current;
  }

  reset(document: ARTDocument, range: AnchoredTextRange): void {
    validateAnchoredRange(document, range);
    this.#current = mappingResult(range);
    this.#past = [];
    this.#future = [];
  }

  clearHistory(): void {
    this.#past = [];
    this.#future = [];
  }

  #undo(document: ARTDocument): AnchoredRangeMappingResult {
    const previous = this.#past.pop();
    if (!previous) {
      this.#current = orphan('Annotation history is unavailable for this engine undo');
      return this.current;
    }
    this.#future.push(cloneMappingResult(this.#current));
    this.#current = validateSnapshot(document, previous);
    return this.current;
  }

  #redo(document: ARTDocument): AnchoredRangeMappingResult {
    const next = this.#future.pop();
    if (!next) {
      this.#current = orphan('Annotation history is unavailable for this engine redo');
      return this.current;
    }
    this.#pushPast(this.#current);
    this.#current = validateSnapshot(document, next);
    return this.current;
  }

  #pushPast(value: AnchoredRangeMappingResult): void {
    if (this.#historyLimit <= 0) return;
    this.#past.push(cloneMappingResult(value));
    if (this.#past.length > this.#historyLimit) {
      this.#past.splice(0, this.#past.length - this.#historyLimit);
    }
  }
}

function validateSnapshot(
  document: ARTDocument,
  result: AnchoredRangeMappingResult,
): AnchoredRangeMappingResult {
  if (result.status === 'orphaned') return cloneMappingResult(result);
  try {
    validateAnchoredRange(document, result.range);
    return cloneMappingResult(result);
  } catch (error) {
    return orphan(error instanceof Error ? error.message : 'Stored annotation history is invalid');
  }
}

function mappingResult(range: AnchoredTextRange): AnchoredRangeMappingResult {
  const clone = cloneAnchoredRange(range);
  const collapsed = clone.start.offset === clone.end.offset
    && clone.start.blockPath.length === clone.end.blockPath.length
    && clone.start.blockPath.every((value, index) => value === clone.end.blockPath[index]);
  return { status: collapsed ? 'collapsed' : 'mapped', range: clone };
}

function orphan(reason: string): AnchoredRangeMappingResult {
  return { status: 'orphaned', range: null, reason };
}

function cloneMappingResult(result: AnchoredRangeMappingResult): AnchoredRangeMappingResult {
  if (result.status === 'orphaned') return { ...result };
  return {
    status: result.status,
    range: cloneAnchoredRange(result.range),
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}

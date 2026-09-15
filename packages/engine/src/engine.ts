import { createEditorState } from './model.js';
import { applyTransaction, TransactionBuilder } from './transaction.js';
import {
  cloneResult,
  cloneState,
  sameDocument,
  sameSelection,
} from './tree.js';
import type {
  EditorEngineListener,
  EditorEngineOptions,
  EditorState,
  EditorTransaction,
  TransactionResult,
} from './types.js';

export class EditorEngine {
  #state: EditorState;
  #past: EditorState[] = [];
  #future: EditorState[] = [];
  #historyLimit: number;
  #listeners = new Set<EditorEngineListener>();

  constructor(initialState: EditorState, options: EditorEngineOptions = {}) {
    this.#state = createEditorState(initialState.document, initialState.selection);
    this.#historyLimit = Math.max(0, Math.floor(options.historyLimit ?? 100));
  }

  get state(): EditorState {
    return cloneState(this.#state);
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  dispatch(transactionValue: EditorTransaction | TransactionBuilder): TransactionResult {
    const tx = transactionValue instanceof TransactionBuilder ? transactionValue.build() : transactionValue;
    const before = cloneState(this.#state);
    const result = applyTransaction(this.#state, tx);

    if (result.documentChanged && this.#historyLimit > 0) {
      this.#past.push(before);
      if (this.#past.length > this.#historyLimit) {
        this.#past.splice(0, this.#past.length - this.#historyLimit);
      }
      this.#future = [];
    }

    if (result.documentChanged || result.selectionChanged) {
      this.#state = cloneState(result.state);
      this.#emit(result);
    }

    return cloneResult(result);
  }

  undo(): TransactionResult | null {
    const previous = this.#past.pop();
    if (!previous) return null;

    const before = cloneState(this.#state);
    this.#future.push(before);
    this.#state = cloneState(previous);

    const result: TransactionResult = {
      state: cloneState(this.#state),
      documentChanged: !sameDocument(before.document, this.#state.document),
      selectionChanged: !sameSelection(before.selection, this.#state.selection),
      operations: [],
      meta: { history: 'undo' },
    };
    this.#emit(result);
    return cloneResult(result);
  }

  redo(): TransactionResult | null {
    const next = this.#future.pop();
    if (!next) return null;

    const before = cloneState(this.#state);
    this.#past.push(before);
    if (this.#past.length > this.#historyLimit) {
      this.#past.splice(0, this.#past.length - this.#historyLimit);
    }
    this.#state = cloneState(next);

    const result: TransactionResult = {
      state: cloneState(this.#state),
      documentChanged: !sameDocument(before.document, this.#state.document),
      selectionChanged: !sameSelection(before.selection, this.#state.selection),
      operations: [],
      meta: { history: 'redo' },
    };
    this.#emit(result);
    return cloneResult(result);
  }

  subscribe(listener: EditorEngineListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(result: TransactionResult): void {
    for (const listener of this.#listeners) {
      listener(cloneResult(result));
    }
  }
}

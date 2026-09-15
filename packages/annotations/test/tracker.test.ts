import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  createEditorState,
  textPoint,
  textSelection,
  transaction,
} from '../../engine/src/index.js';
import {
  AnchoredRangeTracker,
  createAnchoredRange,
} from '../src/index.js';

function document(text: string) {
  return {
    type: 'doc' as const,
    version: 1 as const,
    content: [{ type: 'paragraph' as const, content: text ? [{ type: 'text' as const, text }] : [] }],
  };
}

describe('AnchoredRangeTracker', () => {
  it('restores a range that collapsed after deletion when engine history undoes it', () => {
    const initial = document('hello world');
    const range = createAnchoredRange(
      initial,
      textSelection(textPoint([0], 6), textPoint([0], 11)),
    );
    const tracker = new AnchoredRangeTracker(initial, range);
    const engine = new EditorEngine(createEditorState(initial));

    const beforeDelete = engine.state.document;
    const deleted = engine.dispatch(
      transaction()
        .replaceText(textPoint([0], 6), textPoint([0], 11), '')
        .build(),
    );
    expect(tracker.handle(beforeDelete, deleted).status).toBe('collapsed');

    const beforeUndo = engine.state.document;
    const undone = engine.undo()!;
    const restored = tracker.handle(beforeUndo, undone);
    expect(restored.status).toBe('mapped');
    if (restored.status !== 'orphaned') {
      expect(restored.range.start.offset).toBe(6);
      expect(restored.range.end.offset).toBe(11);
    }

    const beforeRedo = engine.state.document;
    const redone = engine.redo()!;
    expect(tracker.handle(beforeRedo, redone).status).toBe('collapsed');
  });

  it('keeps multiple forward anchor snapshots aligned with multiple undo/redo steps', () => {
    const initial = document('abcdef');
    const range = createAnchoredRange(initial, textSelection(textPoint([0], 2), textPoint([0], 5)));
    const tracker = new AnchoredRangeTracker(initial, range);
    const engine = new EditorEngine(createEditorState(initial));

    let before = engine.state.document;
    let result = engine.dispatch(transaction().replaceText(textPoint([0], 0), textPoint([0], 0), 'X').build());
    tracker.handle(before, result);
    expect(tracker.current.status).toBe('mapped');
    if (tracker.current.status !== 'orphaned') expect(tracker.current.range.start.offset).toBe(3);

    before = engine.state.document;
    result = engine.dispatch(transaction().replaceText(textPoint([0], 6), textPoint([0], 7), '').build());
    tracker.handle(before, result);

    before = engine.state.document;
    tracker.handle(before, engine.undo()!);
    if (tracker.current.status !== 'orphaned') expect(tracker.current.range.end.offset).toBe(6);

    before = engine.state.document;
    tracker.handle(before, engine.undo()!);
    if (tracker.current.status !== 'orphaned') {
      expect(tracker.current.range.start.offset).toBe(2);
      expect(tracker.current.range.end.offset).toBe(5);
    }

    before = engine.state.document;
    tracker.handle(before, engine.redo()!);
    if (tracker.current.status !== 'orphaned') expect(tracker.current.range.start.offset).toBe(3);
  });

  it('fails closed when tracker history depth cannot satisfy an engine undo', () => {
    const initial = document('abc');
    const range = createAnchoredRange(initial, textSelection(textPoint([0], 0), textPoint([0], 1)));
    const tracker = new AnchoredRangeTracker(initial, range, { historyLimit: 0 });
    const engine = new EditorEngine(createEditorState(initial));

    const before = engine.state.document;
    tracker.handle(before, engine.dispatch(transaction().replaceText(textPoint([0], 0), textPoint([0], 0), 'X').build()));

    const beforeUndo = engine.state.document;
    const mapped = tracker.handle(beforeUndo, engine.undo()!);
    expect(mapped).toEqual({
      status: 'orphaned',
      range: null,
      reason: 'Annotation history is unavailable for this engine undo',
    });
  });

  it('does not add selection-only transactions to annotation history', () => {
    const initial = document('abc');
    const range = createAnchoredRange(initial, textSelection(textPoint([0], 0), textPoint([0], 1)));
    const tracker = new AnchoredRangeTracker(initial, range);
    const engine = new EditorEngine(createEditorState(initial));

    const before = engine.state.document;
    tracker.handle(before, engine.dispatch(transaction().setSelection(textSelection(textPoint([0], 2))).build()));
    expect(tracker.current.status).toBe('mapped');

    expect(engine.undo()).toBeNull();
  });
});

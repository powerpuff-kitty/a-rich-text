import type { ARTBlockNode, ARTDocument, ARTHeadingNode, ARTTextMark } from '@arichtext/core';

export type ARTPath = readonly number[];
export type ARTMarkType = ARTTextMark['type'];

export interface ARTTextPoint {
  /** Path to a paragraph or heading block, not to an individual text run. */
  blockPath: ARTPath;
  /** Character offset across the block's concatenated inline text. */
  offset: number;
}

export interface ARTSelection {
  anchor: ARTTextPoint;
  head: ARTTextPoint;
}

/**
 * Explicit path continuity for a structural block replacement.
 *
 * Paths are absolute and refer to the document immediately before/after the
 * operation. Review/annotation layers may use these mappings to preserve
 * locations through deterministic structural transforms. Unmapped content
 * inside the replaced subtree is intentionally considered structurally lost.
 */
export interface ARTPathMapping {
  from: ARTPath;
  to: ARTPath;
}

export interface EditorState {
  document: ARTDocument;
  selection: ARTSelection | null;
}

export type EditorOperation =
  | {
      type: 'replaceText';
      from: ARTTextPoint;
      to: ARTTextPoint;
      text: string;
      marks?: ARTTextMark[];
    }
  | {
      type: 'replaceFragment';
      from: ARTTextPoint;
      to: ARTTextPoint;
      content: ARTBlockNode[];
    }
  | {
      /**
       * Replace one block with zero or more validated ART blocks.
       * `pathMappings` describe only paths whose logical content survives.
       */
      type: 'replaceBlock';
      path: ARTPath;
      content: ARTBlockNode[];
      pathMappings?: ARTPathMapping[];
    }
  | {
      type: 'addMark';
      from: ARTTextPoint;
      to: ARTTextPoint;
      mark: ARTTextMark;
    }
  | {
      type: 'removeMark';
      from: ARTTextPoint;
      to: ARTTextPoint;
      markType: ARTMarkType;
    }
  | {
      type: 'toggleMark';
      from: ARTTextPoint;
      to: ARTTextPoint;
      mark: ARTTextMark;
    }
  | {
      type: 'setBlockType';
      path: ARTPath;
      blockType: 'paragraph' | 'heading';
      level?: ARTHeadingNode['level'];
    }
  | {
      /** Split a paragraph/heading. The right-hand block becomes a paragraph. */
      type: 'splitBlock';
      point: ARTTextPoint;
    }
  | {
      /** Join two adjacent paragraph/heading siblings, preserving the left block type. */
      type: 'joinBlocks';
      leftPath: ARTPath;
      rightPath: ARTPath;
    };

export interface EditorTransaction {
  operations: readonly EditorOperation[];
  selection?: ARTSelection | null;
  meta?: Readonly<Record<string, unknown>>;
}

export interface TransactionResult {
  state: EditorState;
  documentChanged: boolean;
  selectionChanged: boolean;
  operations: readonly EditorOperation[];
  meta?: Readonly<Record<string, unknown>>;
}

export interface EditorEngineOptions {
  historyLimit?: number;
}

export type EditorEngineListener = (result: TransactionResult) => void;

import type {
  ARTBlockNode,
  ARTDocument,
  ARTTableCellNode,
  ARTTableNode,
  ARTTableRowNode,
} from '@arichtext/core';
import {
  transaction,
  type ARTPath,
  type ARTPathMapping,
  type EditorState,
  type EditorTransaction,
} from '@arichtext/engine';

const MAX_TABLE_ROWS = 50;
const MAX_TABLE_COLUMNS = 50;

export type TablePosition = 'before' | 'after';

export interface InsertTableOptions {
  rows?: number;
  columns?: number;
}

export interface ActiveTable {
  path: number[];
  rowIndex: number;
  columnIndex: number;
  rows: number;
  columns: number;
}

export type TableCommandErrorCode = 'invalid-dimensions' | 'merged-cells';

export class TableCommandError extends Error {
  readonly code: TableCommandErrorCode;

  constructor(code: TableCommandErrorCode, message: string) {
    super(message);
    this.name = 'TableCommandError';
    this.code = code;
  }
}

export function getActiveTable(state: EditorState): ActiveTable | null {
  const selection = state.selection;
  if (!selection) return null;
  const active = findNearestTable(state.document, selection.anchor.blockPath);
  if (!active) return null;
  const columns = simpleColumnCount(active.node);
  return {
    path: [...active.path],
    rowIndex: active.rowIndex,
    columnIndex: active.columnIndex,
    rows: active.node.content.length,
    columns,
  };
}

/** Move through cells in row order. At either edge, return null so Tab can leave. */
export function moveTableCell(state: EditorState, direction: 'next' | 'previous' = 'next'): EditorTransaction | null {
  const active = tableLocation(state);
  if (!active) return null;
  const columns = simpleColumnCount(active.node);
  const index = active.rowIndex * columns + active.columnIndex + (direction === 'next' ? 1 : -1);
  if (index < 0 || index >= active.node.content.length * columns) return null;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const mappings: ARTPathMapping[] = [];
  const path = [...active.path, row, column];
  collectPreservedMappings(active.node.content[row]!.content[column], path, path, mappings);
  const target = direction === 'next' ? mappings[0] : mappings.at(-1);
  if (!target) return null;
  return transaction().setSelection(collapsedSelection([...target.to]))
    .setMeta('command', `moveTableCell:${direction}`).build();
}

/**
 * Insert a table at the current single-block selection.
 *
 * The existing fragment operation splits the surrounding paragraph/heading
 * around the table and preserves annotation mapping. The resulting selection
 * is placed in the first table cell.
 */
export function insertTable(
  state: EditorState,
  options: InsertTableOptions = {},
): EditorTransaction | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  const rows = boundedDimension(options.rows ?? 2, 'rows', MAX_TABLE_ROWS);
  const columns = boundedDimension(options.columns ?? 2, 'columns', MAX_TABLE_COLUMNS);
  const target = getNodeAtPath(state.document, selection.anchor.blockPath);
  if (!isInlineBlock(target)) return null;

  const table = createEmptyTable(rows, columns);
  const targetPath = selection.anchor.blockPath;
  const parentPath = targetPath.slice(0, -1);
  const targetIndex = targetPath.at(-1)!;
  const firstCellPath = [...parentPath, targetIndex + 1, 0, 0, 0];

  return transaction()
    .replaceFragment(selection.anchor, selection.head, [table])
    .setSelection({
      anchor: { blockPath: firstCellPath, offset: 0 },
      head: { blockPath: firstCellPath, offset: 0 },
    })
    .setMeta('command', `insertTable:${rows}x${columns}`)
    .build();
}

export function addTableRow(
  state: EditorState,
  position: TablePosition = 'after',
): EditorTransaction | null {
  const active = tableLocation(state);
  if (!active) return null;
  const columns = simpleColumnCount(active.node);
  if (active.node.content.length >= MAX_TABLE_ROWS) {
    throw new TableCommandError('invalid-dimensions', `Tables are limited to ${MAX_TABLE_ROWS} rows`);
  }

  const insertIndex = active.rowIndex + (position === 'after' ? 1 : 0);
  const next = cloneValue(active.node);
  next.content.splice(insertIndex, 0, createEmptyRow(columns));
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => ({
    row: row >= insertIndex ? row + 1 : row,
    column,
  }));
  const firstCellPath = [...active.path, insertIndex, 0, 0];

  return transaction()
    .replaceBlock(active.path, [next], mappings)
    .setSelection(collapsedSelection(firstCellPath))
    .setMeta('command', `addTableRow:${position}`)
    .build();
}

export function removeCurrentTableRow(state: EditorState): EditorTransaction | null {
  const active = tableLocation(state);
  if (!active || active.node.content.length <= 1) return null;
  const columns = simpleColumnCount(active.node);
  const next = cloneValue(active.node);
  next.content.splice(active.rowIndex, 1);
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => {
    if (row === active.rowIndex) return null;
    return { row: row > active.rowIndex ? row - 1 : row, column };
  });
  const targetRow = Math.min(active.rowIndex, next.content.length - 1);
  const targetColumn = Math.min(Math.max(0, active.columnIndex), columns - 1);
  const targetPath = [...active.path, targetRow, targetColumn, 0];

  return transaction()
    .replaceBlock(active.path, [next], mappings)
    .setSelection(collapsedSelection(targetPath))
    .setMeta('command', 'removeTableRow')
    .build();
}

export function addTableColumn(
  state: EditorState,
  position: TablePosition = 'after',
): EditorTransaction | null {
  const active = tableLocation(state);
  if (!active) return null;
  const columns = simpleColumnCount(active.node);
  if (columns >= MAX_TABLE_COLUMNS) {
    throw new TableCommandError('invalid-dimensions', `Tables are limited to ${MAX_TABLE_COLUMNS} columns`);
  }

  const insertIndex = active.columnIndex + (position === 'after' ? 1 : 0);
  const next = cloneValue(active.node);
  for (const row of next.content) row.content.splice(insertIndex, 0, createEmptyCell());
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => ({
    row,
    column: column >= insertIndex ? column + 1 : column,
  }));
  const targetPath = [...active.path, active.rowIndex, insertIndex, 0];

  return transaction()
    .replaceBlock(active.path, [next], mappings)
    .setSelection(collapsedSelection(targetPath))
    .setMeta('command', `addTableColumn:${position}`)
    .build();
}

export function removeCurrentTableColumn(state: EditorState): EditorTransaction | null {
  const active = tableLocation(state);
  if (!active) return null;
  const columns = simpleColumnCount(active.node);
  if (columns <= 1) return null;

  const next = cloneValue(active.node);
  for (const row of next.content) row.content.splice(active.columnIndex, 1);
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => {
    if (column === active.columnIndex) return null;
    return { row, column: column > active.columnIndex ? column - 1 : column };
  });
  const targetColumn = Math.min(active.columnIndex, columns - 2);
  const targetPath = [...active.path, active.rowIndex, targetColumn, 0];

  return transaction()
    .replaceBlock(active.path, [next], mappings)
    .setSelection(collapsedSelection(targetPath))
    .setMeta('command', 'removeTableColumn')
    .build();
}

function createEmptyTable(rows: number, columns: number): ARTTableNode {
  return {
    type: 'table',
    content: Array.from({ length: rows }, () => createEmptyRow(columns)),
  };
}

function createEmptyRow(columns: number): ARTTableRowNode {
  return {
    type: 'tableRow',
    content: Array.from({ length: columns }, () => createEmptyCell()),
  };
}

function createEmptyCell(): ARTTableCellNode {
  return {
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [] }],
  };
}

interface TableLocation {
  path: number[];
  node: ARTTableNode;
  rowIndex: number;
  columnIndex: number;
}

function tableLocation(state: EditorState): TableLocation | null {
  const selection = state.selection;
  if (!selection || !samePath(selection.anchor.blockPath, selection.head.blockPath)) return null;
  return findNearestTable(state.document, selection.anchor.blockPath);
}

function findNearestTable(document: ARTDocument, blockPath: ARTPath): TableLocation | null {
  let current: unknown = document;
  const currentPath: number[] = [];
  let active: TableLocation | null = null;

  for (const index of blockPath) {
    const content = getContent(current);
    if (!content || index < 0 || index >= content.length) return null;
    current = content[index];
    currentPath.push(index);

    if (isTable(current)) {
      active = { path: [...currentPath], node: current, rowIndex: -1, columnIndex: -1 };
      continue;
    }
    if (
      active
      && isRecord(current)
      && current.type === 'tableRow'
      && currentPath.length === active.path.length + 1
    ) {
      active.rowIndex = index;
      continue;
    }
    if (
      active
      && isRecord(current)
      && current.type === 'tableCell'
      && currentPath.length === active.path.length + 2
    ) {
      active.columnIndex = index;
    }
  }

  return active && active.rowIndex >= 0 && active.columnIndex >= 0 ? active : null;
}

function simpleColumnCount(table: ARTTableNode): number {
  if (table.content.length === 0) {
    throw new TableCommandError('invalid-dimensions', 'Table must contain at least one row');
  }
  const columns = table.content[0]?.content.length ?? 0;
  if (columns <= 0) throw new TableCommandError('invalid-dimensions', 'Table must contain at least one column');

  for (const row of table.content) {
    if (row.content.length !== columns) {
      throw new TableCommandError('invalid-dimensions', 'Table editing requires rectangular rows');
    }
    for (const cell of row.content) {
      if ((cell.colspan ?? 1) !== 1 || (cell.rowspan ?? 1) !== 1) {
        throw new TableCommandError('merged-cells', 'Merged-cell editing is not supported by the v0.1 table commands');
      }
    }
  }
  return columns;
}

function mapPreservedCells(
  table: ARTTableNode,
  tablePath: ARTPath,
  mapCell: (row: number, column: number) => { row: number; column: number } | null,
): ARTPathMapping[] {
  const mappings: ARTPathMapping[] = [];
  for (let rowIndex = 0; rowIndex < table.content.length; rowIndex += 1) {
    const row = table.content[rowIndex]!;
    for (let columnIndex = 0; columnIndex < row.content.length; columnIndex += 1) {
      const target = mapCell(rowIndex, columnIndex);
      if (!target) continue;
      const cell = row.content[columnIndex]!;
      for (let childIndex = 0; childIndex < cell.content.length; childIndex += 1) {
        collectPreservedMappings(
          cell.content[childIndex],
          [...tablePath, rowIndex, columnIndex, childIndex],
          [...tablePath, target.row, target.column, childIndex],
          mappings,
        );
      }
    }
  }
  return mappings;
}

function collectPreservedMappings(
  node: unknown,
  from: ARTPath,
  to: ARTPath,
  output: ARTPathMapping[],
): void {
  if (isInlineBlock(node)) {
    output.push({ from: [...from], to: [...to] });
    return;
  }
  const content = getContent(node);
  if (!content) return;
  for (let index = 0; index < content.length; index += 1) {
    collectPreservedMappings(content[index], [...from, index], [...to, index], output);
  }
}

function collapsedSelection(blockPath: number[]) {
  return {
    anchor: { blockPath: [...blockPath], offset: 0 },
    head: { blockPath: [...blockPath], offset: 0 },
  };
}

function boundedDimension(value: number, label: string, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new TableCommandError('invalid-dimensions', `${label} must be an integer between 1 and ${max}`);
  }
  return value;
}

function getNodeAtPath(document: ARTDocument, path: ARTPath): unknown {
  let current: unknown = document;
  for (const index of path) {
    const content = getContent(current);
    if (!content || index < 0 || index >= content.length) return undefined;
    current = content[index];
  }
  return current;
}

function getContent(value: unknown): unknown[] | null {
  if (!isRecord(value) || !Array.isArray(value.content)) return null;
  return value.content;
}

function isTable(value: unknown): value is ARTTableNode {
  return isRecord(value) && value.type === 'table' && Array.isArray(value.content);
}

function isInlineBlock(value: unknown): value is Extract<ARTBlockNode, { type: 'paragraph' | 'heading' }> {
  return isRecord(value) && (value.type === 'paragraph' || value.type === 'heading');
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function samePath(left: ARTPath, right: ARTPath): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

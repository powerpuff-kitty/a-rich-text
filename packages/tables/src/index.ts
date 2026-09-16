import { getTableLayout } from '@arichtext/core';
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
  const columns = horizontalColumnCount(active.node);
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
  const layout = getTableLayout(active.node);
  if (!layout || layout.rows > MAX_TABLE_ROWS || layout.columns > MAX_TABLE_COLUMNS) return null;
  const cells = active.node.content.flatMap((row, rowIndex) => row.content.map((_, columnIndex) => ({ row: rowIndex, column: columnIndex })));
  const current = cells.findIndex(cell => cell.row === active.rowIndex && cell.column === active.columnIndex);
  const targetCell = cells[current + (direction === 'next' ? 1 : -1)];
  if (!targetCell) return null;
  const { row, column } = targetCell;
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
  const columns = horizontalColumnCount(active.node);
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
  horizontalColumnCount(active.node);
  const next = cloneValue(active.node);
  next.content.splice(active.rowIndex, 1);
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => {
    if (row === active.rowIndex) return null;
    return { row: row > active.rowIndex ? row - 1 : row, column };
  });
  const targetRow = Math.min(active.rowIndex, next.content.length - 1);
  const targetColumn = Math.min(Math.max(0, active.columnIndex), next.content[targetRow]!.content.length - 1);
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
  const columns = horizontalColumnCount(active.node);
  if (columns >= MAX_TABLE_COLUMNS) {
    throw new TableCommandError('invalid-dimensions', `Tables are limited to ${MAX_TABLE_COLUMNS} columns`);
  }

  const activeCells = active.node.content[active.rowIndex]!.content;
  const boundary = activeCells.slice(0, active.columnIndex).reduce((sum, cell) => sum + (cell.colspan ?? 1), 0)
    + (position === 'after' ? (activeCells[active.columnIndex]!.colspan ?? 1) : 0);
  const next = cloneValue(active.node);
  const inserted: (number | null)[] = [];
  next.content.forEach((row, rowIndex) => {
    let logical = 0;
    for (let cellIndex = 0; cellIndex < row.content.length; cellIndex++) {
      const cell = row.content[cellIndex]!;
      if (logical === boundary) {
        row.content.splice(cellIndex, 0, createEmptyCell()); inserted[rowIndex] = cellIndex; return;
      }
      const end = logical + (cell.colspan ?? 1);
      if (logical < boundary && boundary < end) {
        cell.colspan = (cell.colspan ?? 1) + 1; inserted[rowIndex] = null; return;
      }
      logical = end;
    }
    inserted[rowIndex] = row.content.length;
    row.content.push(createEmptyCell());
  });
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => ({
    row, column: inserted[row] !== null && column >= inserted[row]! ? column + 1 : column,
  }));
  const targetPath = [...active.path, active.rowIndex, inserted[active.rowIndex]!, 0];
  return transaction().replaceBlock(active.path, [next], mappings)
    .setSelection(collapsedSelection(targetPath))
    .setMeta('command', `addTableColumn:${position}`).build();
}

/** Remove the leftmost logical column covered by the active cell. A spanning
 * cell shrinks without losing content; unit cells in that column are removed.
 */
export function removeCurrentTableColumn(state: EditorState): EditorTransaction | null {
  const active = tableLocation(state);
  if (!active) return null;
  const columns = horizontalColumnCount(active.node);
  if (columns <= 1) return null;
  const logicalColumn = active.node.content[active.rowIndex]!.content.slice(0, active.columnIndex)
    .reduce((sum, cell) => sum + (cell.colspan ?? 1), 0);
  const next = cloneValue(active.node);
  const removed: (number | null)[] = [];
  next.content.forEach((row, rowIndex) => {
    let logical = 0;
    for (let cellIndex = 0; cellIndex < row.content.length; cellIndex++) {
      const cell = row.content[cellIndex]!;
      const width = cell.colspan ?? 1;
      if (logicalColumn < logical + width) {
        if (width > 1) {
          if (width === 2) delete cell.colspan; else cell.colspan = width - 1;
          removed[rowIndex] = null;
        } else { row.content.splice(cellIndex, 1); removed[rowIndex] = cellIndex; }
        return;
      }
      logical += width;
    }
  });
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => {
    const index = removed[row];
    if (index === column) return null;
    return { row, column: index !== null && column > index! ? column - 1 : column };
  });
  const targetColumn = Math.min(active.columnIndex, next.content[active.rowIndex]!.content.length - 1);
  const cell = next.content[active.rowIndex]!.content[targetColumn]!;
  const cellPath = [...active.path, active.rowIndex, targetColumn];
  const textBlocks: ARTPathMapping[] = [];
  collectPreservedMappings(cell, cellPath, cellPath, textBlocks);
  let targetPath = textBlocks[0]?.to;
  if (!targetPath) {
    targetPath = [...cellPath, cell.content.length];
    cell.content.push({ type: 'paragraph', content: [] });
  }
  return transaction().replaceBlock(active.path, [next], mappings)
    .setSelection(collapsedSelection([...targetPath]))
    .setMeta('command', 'removeTableColumn').build();
}

/** Remove the containing table and leave an editable paragraph at its position.
 * Supports imported merged cells; no row/column grid transformation is needed.
 */
export function removeCurrentTable(state: EditorState): EditorTransaction | null {
  const active = tableLocation(state);
  if (!active) return null;
  return transaction()
    .replaceBlock(active.path, [{ type: 'paragraph', content: [] }])
    .setSelection(collapsedSelection(active.path))
    .setMeta('command', 'removeTable')
    .build();
}

export interface TableRowActions { canAddRow: boolean; canRemoveRow: boolean }

/** Row operations support horizontal spans, but reject vertical spans. */
export function getTableRowActions(state: EditorState): TableRowActions {
  const active = tableLocation(state);
  if (!active) return { canAddRow: false, canRemoveRow: false };
  try { horizontalColumnCount(active.node); }
  catch { return { canAddRow: false, canRemoveRow: false }; }
  return { canAddRow: active.node.content.length < MAX_TABLE_ROWS, canRemoveRow: active.node.content.length > 1 };
}

export interface TableCellActions { canMergeRight: boolean; canMergeBelow: boolean; canSplit: boolean }

/** Merge only adjacent cells sharing the complete edge; split any valid span. */
export function getTableCellActions(state: EditorState): TableCellActions {
  const active = tableLocation(state);
  if (!active) return { canMergeRight: false, canMergeBelow: false, canSplit: false };
  const layout = getTableLayout(active.node);
  if (!layout || layout.rows > MAX_TABLE_ROWS || layout.columns > MAX_TABLE_COLUMNS) return { canMergeRight: false, canMergeBelow: false, canSplit: false };
  const cells = active.node.content[active.rowIndex]!.content;
  const cell = cells[active.columnIndex]!;
  const current = layout.cells.find(cell => cell.row === active.rowIndex && cell.cell === active.columnIndex)!;
  const canMergeRight = layout.cells.some(cell => cell.row === current.row
    && cell.column === current.column + current.colspan && cell.rowspan === current.rowspan);
  const canMergeBelow = layout.cells.some(cell => cell.row === current.row + current.rowspan
    && cell.column === current.column && cell.colspan === current.colspan);
  return { canMergeRight, canMergeBelow, canSplit: (cell.colspan ?? 1) > 1 || (cell.rowspan ?? 1) > 1 };
}

/** Join the active cell and its right neighbor, retaining every content block. */
export function mergeTableCellRight(state: EditorState): EditorTransaction | null {
  if (!getTableCellActions(state).canMergeRight) return null;
  const active = tableLocation(state)!;
  const next = cloneValue(active.node);
  const cells = next.content[active.rowIndex]!.content;
  const left = cells[active.columnIndex]!;
  const right = cells[active.columnIndex + 1]!;
  const leftLength = left.content.length;
  left.colspan = (left.colspan ?? 1) + (right.colspan ?? 1);
  left.content.push(...right.content);
  cells.splice(active.columnIndex + 1, 1);
  const mappings: ARTPathMapping[] = [];
  active.node.content.forEach((row, r) => row.content.forEach((cell, c) => {
    const target = r === active.rowIndex && c > active.columnIndex ? c - 1 : c;
    const shift = r === active.rowIndex && c === active.columnIndex + 1 ? leftLength : 0;
    cell.content.forEach((node, child) => collectPreservedMappings(node,
      [...active.path, r, c, child], [...active.path, r, target, child + shift], mappings));
  }));
  return transaction().replaceBlock(active.path, [next], mappings)
    .setSelection(state.selection).setMeta('command', 'mergeTableCellRight').build();
}

/** Merge with the cell immediately below when both share the same column extent. */
export function mergeTableCellBelow(state: EditorState): EditorTransaction | null {
  if (!getTableCellActions(state).canMergeBelow) return null;
  const active = tableLocation(state)!;
  const layout = getTableLayout(active.node)!;
  const top = layout.cells.find(cell => cell.row === active.rowIndex && cell.cell === active.columnIndex)!;
  const bottom = layout.cells.find(cell => cell.row === top.row + top.rowspan
    && cell.column === top.column && cell.colspan === top.colspan)!;
  const next = cloneValue(active.node);
  const target = next.content[top.row]!.content[top.cell]!;
  const source = next.content[bottom.row]!.content[bottom.cell]!;
  const childOffset = target.content.length;
  target.rowspan = top.rowspan + bottom.rowspan;
  target.content.push(...source.content);
  next.content[bottom.row]!.content.splice(bottom.cell, 1);
  const mappings: ARTPathMapping[] = [];
  active.node.content.forEach((row, r) => row.content.forEach((cell, c) => {
    const moved = r === bottom.row && c === bottom.cell;
    const targetRow = moved ? top.row : r;
    const targetCell = moved ? top.cell : r === bottom.row && c > bottom.cell ? c - 1 : c;
    cell.content.forEach((node, child) => collectPreservedMappings(node,
      [...active.path, r, c, child], [...active.path, targetRow, targetCell, child + (moved ? childOffset : 0)], mappings));
  }));
  return transaction().replaceBlock(active.path, [next], mappings)
    .setSelection(state.selection).setMeta('command', 'mergeTableCellBelow').build();
}

/** Expand a span into unit cells, retaining content in its top-left cell. */
export function splitTableCell(state: EditorState): EditorTransaction | null {
  if (!getTableCellActions(state).canSplit) return null;
  const active = tableLocation(state)!;
  const layout = getTableLayout(active.node)!;
  const target = layout.cells.find(cell => cell.row === active.rowIndex && cell.cell === active.columnIndex)!;
  const next = cloneValue(active.node);
  const current = next.content[target.row]!.content[target.cell]!;
  delete current.colspan;
  delete current.rowspan;
  const indices = new Map<string, number>();
  for (let row = 0; row < layout.rows; row++) {
    const entries = layout.cells.filter(cell => cell.row === row).map(cell => ({
      column: cell.column, original: cell.cell, node: next.content[row]!.content[cell.cell]!,
    }));
    if (row >= target.row && row < target.row + target.rowspan) {
      for (let column = target.column; column < target.column + target.colspan; column++) {
        if (row === target.row && column === target.column) continue;
        entries.push({ column, original: -1, node: createEmptyCell() });
      }
    }
    entries.sort((a, b) => a.column - b.column);
    next.content[row]!.content = entries.map((entry, index) => {
      if (entry.original >= 0) indices.set(`${row}:${entry.original}`, index);
      return entry.node;
    });
  }
  const mappings = mapPreservedCells(active.node, active.path, (row, column) => ({
    row, column: indices.get(`${row}:${column}`)!,
  }));
  return transaction().replaceBlock(active.path, [next], mappings)
    .setSelection(state.selection).setMeta('command', 'splitTableCell').build();
}

function horizontalColumnCount(table: ARTTableNode): number {
  if (!table.content.length || table.content.length > MAX_TABLE_ROWS) throw new TableCommandError('invalid-dimensions', 'Unsupported table dimensions');
  let width: number | undefined;
  for (const row of table.content) {
    let columns = 0;
    for (const cell of row.content) {
      if ((cell.rowspan ?? 1) !== 1) throw new TableCommandError('merged-cells', 'Vertical merged-cell editing is not supported');
      const span = cell.colspan ?? 1;
      if (!Number.isInteger(span) || span < 1) throw new TableCommandError('invalid-dimensions', 'Invalid column span');
      columns += span;
    }
    if (!columns || columns > MAX_TABLE_COLUMNS || (width !== undefined && width !== columns)) throw new TableCommandError('invalid-dimensions', 'Unsupported table dimensions');
    width = columns;
  }
  return width!;
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

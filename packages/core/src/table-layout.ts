import type { ARTTableNode } from './index.js';

export interface ARTTableCellPosition {
  row: number;
  cell: number;
  column: number;
  colspan: number;
  rowspan: number;
}
export interface ARTTableLayout {
  rows: number;
  columns: number;
  cells: ARTTableCellPosition[];
}

/** Resolve a rectangular table without expanding spans into a dense matrix.
 * Empty physical rows are valid only when fully covered by earlier rowspans.
 */
export function getTableLayout(table: ARTTableNode): ARTTableLayout | null {
  if (!Array.isArray(table.content) || !table.content.length) return null;
  const cells: ARTTableCellPosition[] = [];
  let active: ARTTableCellPosition[] = [];
  let columns: number | undefined;
  for (let row = 0; row < table.content.length; row++) {
    const source = table.content[row];
    if (!source || source.type !== 'tableRow' || !Array.isArray(source.content)) return null;
    active = active.filter(cell => cell.row + cell.rowspan > row);
    const carried = [...active].sort((a, b) => a.column - b.column);
    const occupied = [...carried];
    let column = 0;
    let carryIndex = 0;
    for (let index = 0; index < source.content.length; index++) {
      const cell = source.content[index];
      if (!cell || cell.type !== 'tableCell') return null;
      const colspan = cell.colspan === undefined ? 1 : cell.colspan;
      const rowspan = cell.rowspan === undefined ? 1 : cell.rowspan;
      if (!Number.isSafeInteger(colspan) || colspan < 1 || !Number.isSafeInteger(rowspan) || rowspan < 1
        || rowspan > table.content.length - row) return null;
      while (carried[carryIndex] && carried[carryIndex]!.column <= column) {
        column = carried[carryIndex]!.column + carried[carryIndex]!.colspan;
        carryIndex++;
      }
      const end = column + colspan;
      if (!Number.isSafeInteger(end) || (carried[carryIndex] && carried[carryIndex]!.column < end)) return null;
      const position = { row, cell: index, column, colspan, rowspan };
      occupied.push(position); cells.push(position);
      if (rowspan > 1) active.push(position);
      column = end;
    }
    let end = 0;
    for (const cell of occupied.sort((a, b) => a.column - b.column)) {
      if (cell.column !== end) return null;
      end += cell.colspan;
    }
    if (!end || !Number.isSafeInteger(end) || (columns !== undefined && end !== columns)) return null;
    columns = end;
  }
  return { rows: table.content.length, columns: columns!, cells };
}

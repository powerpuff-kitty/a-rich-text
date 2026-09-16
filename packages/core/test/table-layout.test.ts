import { describe, expect, it } from 'vitest';
import { getTableLayout, isARTDocument, type ARTTableCellNode, type ARTTableNode } from '../src/index.js';
const cell = (colspan = 1, rowspan = 1): ARTTableCellNode => ({ type: 'tableCell', colspan, rowspan, content: [] });
const table = (rows: ARTTableCellNode[][]): ARTTableNode => ({ type: 'table', content: rows.map(content => ({ type: 'tableRow', content })) });
const valid = (grid: ARTTableNode) => isARTDocument({ type: 'doc', version: 1, content: [grid] });

describe('table grid layout', () => {
  it('places combined spans and accepts rows covered entirely from above', () => {
    const grid = table([[cell(2, 2), cell(1, 3)], [], [cell(), cell()]]);
    expect(valid(grid)).toBe(true);
    expect(getTableLayout(grid)).toEqual({ rows: 3, columns: 3, cells: [
      { row: 0, cell: 0, column: 0, colspan: 2, rowspan: 2 },
      { row: 0, cell: 1, column: 2, colspan: 1, rowspan: 3 },
      { row: 2, cell: 0, column: 0, colspan: 1, rowspan: 1 },
      { row: 2, cell: 1, column: 1, colspan: 1, rowspan: 1 },
    ] });
  });

  it('skips carried spans when positioning cells on subsequent rows', () => {
    const grid = table([[cell(1, 2), cell()], [cell()]]);
    expect(valid(grid)).toBe(true);
    expect(getTableLayout(grid)?.cells.at(-1)?.column).toBe(1);
  });

  it.each([
    table([[cell(1, 2), cell()], [cell(), cell()]]), // extra cell below a span
    table([[cell(), cell(1, 2), cell()], [cell(2)]]), // crosses an occupied slot
    table([[cell(), cell()], [cell()]]), // uncovered gap
    table([[cell(1, 3)], []]), // span beyond final row
    table([[], [cell()]]),
    table([[cell()], []]),
    table([[cell(0)]]),
    table([[{ ...cell(), colspan: null } as unknown as ARTTableCellNode]]),
    table([[{ ...cell(), rowspan: null } as unknown as ARTTableCellNode]]),
    table([[cell(1, -1)]]),
    table([[cell(Number.MAX_SAFE_INTEGER + 1)]]),
  ])('rejects invalid occupied grids without repairing content', grid => {
    const before = structuredClone(grid);
    expect(valid(grid)).toBe(false);
    expect(getTableLayout(grid)).toBeNull();
    expect(grid).toEqual(before);
  });

  it('does not allocate memory proportional to a numeric span', () => {
    const grid = table([[cell(1_000_000_000, 2)], []]);
    expect(getTableLayout(grid)).toMatchObject({ rows: 2, columns: 1_000_000_000 });
    expect(getTableLayout(grid)?.cells).toHaveLength(1);
  });
});

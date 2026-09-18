import type { ARTPath } from './types.js';

/** Map descendant paths through a validated top-level move. */
export function mapMovedBlockPath(path: ARTPath, from: number, to: number): number[] {
  if (!path.length) return [];
  const index = path[0]!;
  const mapped = index === from ? to
    : from < to && index > from && index <= to ? index - 1
    : from > to && index >= to && index < from ? index + 1 : index;
  return [mapped, ...path.slice(1)];
}

import type { Grid } from '../core/Grid';
import { CellType, Direction, type GridPos } from '../types';
import { gridPosEqual, gridPosKey, manhattanDist } from '../utils/math';
import { PriorityQueue } from '../utils/PriorityQueue';

interface AStarNode {
  gx: number;
  gy: number;
  g: number;
  f: number;
  parentKey: string | null;
}

const DIR_OFFSETS = [
  { dir: Direction.Up, dx: 0, dy: -1 },
  { dir: Direction.Down, dx: 0, dy: 1 },
  { dir: Direction.Left, dx: -1, dy: 0 },
  { dir: Direction.Right, dx: 1, dy: 0 },
] as const;

export class Pathfinder {
  private cache = new Map<string, GridPos[] | null>();
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  clearCache(): void {
    this.cache.clear();
  }

  findPath(from: GridPos, to: GridPos): GridPos[] | null {
    if (gridPosEqual(from, to)) return [from];

    const cacheKey = `${gridPosKey(from)}->${gridPosKey(to)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result = this.astar(from, to);
    this.cache.set(cacheKey, result);
    return result;
  }

  private astar(from: GridPos, to: GridPos): GridPos[] | null {
    const open = new PriorityQueue<AStarNode>((a, b) => a.f - b.f);
    const closed = new Map<string, AStarNode>();

    const startNode: AStarNode = {
      gx: from.gx,
      gy: from.gy,
      g: 0,
      f: manhattanDist(from, to),
      parentKey: null,
    };
    open.push(startNode);

    while (open.size > 0) {
      const current = open.pop()!;
      const currentKey = `${current.gx},${current.gy}`;

      if (current.gx === to.gx && current.gy === to.gy) {
        return this.reconstructPath(current, closed);
      }

      if (closed.has(currentKey)) continue;
      closed.set(currentKey, current);

      for (const { dx, dy } of DIR_OFFSETS) {
        const nx = current.gx + dx;
        const ny = current.gy + dy;
        const nKey = `${nx},${ny}`;

        if (closed.has(nKey)) continue;

        const cell = this.grid.getCell(nx, ny);
        if (!cell) continue;

        // Can traverse: roads always, house/business only as destination
        const isDestination = nx === to.gx && ny === to.gy;
        if (cell.type === CellType.Empty) continue;
        if ((cell.type === CellType.House || cell.type === CellType.Business) && !isDestination) continue;

        const g = current.g + 1;
        const h = manhattanDist({ gx: nx, gy: ny }, to);
        const f = g + h;

        open.push({
          gx: nx,
          gy: ny,
          g,
          f,
          parentKey: currentKey,
        });
      }
    }

    return null;
  }

  private reconstructPath(endNode: AStarNode, closed: Map<string, AStarNode>): GridPos[] {
    const path: GridPos[] = [];
    let current: AStarNode | undefined = endNode;

    while (current) {
      path.push({ gx: current.gx, gy: current.gy });
      if (current.parentKey === null) break;
      current = closed.get(current.parentKey);
    }

    path.reverse();
    return path;
  }
}

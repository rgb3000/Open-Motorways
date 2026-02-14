import type { Grid } from '../core/Grid';
import { CellType, Direction, TrafficLevel, type GridPos } from '../types';
import { gridPosEqual, gridPosKey, manhattanDist } from '../utils/math';
import { PriorityQueue } from '../utils/PriorityQueue';

interface AStarNode {
  gx: number;
  gy: number;
  level: TrafficLevel;
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

function isAlongBridgeAxis(dir: Direction, bridgeAxis: 'horizontal' | 'vertical'): boolean {
  if (bridgeAxis === 'horizontal') {
    return dir === Direction.Left || dir === Direction.Right;
  }
  return dir === Direction.Up || dir === Direction.Down;
}

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
      level: TrafficLevel.Ground,
      g: 0,
      f: manhattanDist(from, to),
      parentKey: null,
    };
    open.push(startNode);

    while (open.size > 0) {
      const current = open.pop()!;
      const currentKey = `${current.gx},${current.gy},${current.level}`;

      if (current.gx === to.gx && current.gy === to.gy) {
        return this.reconstructPath(current, closed);
      }

      if (closed.has(currentKey)) continue;
      closed.set(currentKey, current);

      const currentCell = this.grid.getCell(current.gx, current.gy);

      for (const { dir, dx, dy } of DIR_OFFSETS) {
        // Check if we can exit in this direction from current cell/level
        if (currentCell && currentCell.hasBridge && currentCell.bridgeAxis) {
          const dirAlongBridge = isAlongBridgeAxis(dir, currentCell.bridgeAxis);
          if (current.level === TrafficLevel.Bridge && !dirAlongBridge) continue;
          if (current.level === TrafficLevel.Ground && dirAlongBridge) continue;
        }

        const nx = current.gx + dx;
        const ny = current.gy + dy;

        const cell = this.grid.getCell(nx, ny);
        if (!cell) continue;

        // Can traverse: roads always, house/business only as destination
        const isDestination = nx === to.gx && ny === to.gy;
        if (cell.type === CellType.Empty) continue;
        if ((cell.type === CellType.House || cell.type === CellType.Business) && !isDestination) continue;

        // Determine level when entering the neighbor cell
        let nextLevel: TrafficLevel = TrafficLevel.Ground;
        if (cell.hasBridge && cell.bridgeAxis) {
          nextLevel = isAlongBridgeAxis(dir, cell.bridgeAxis)
            ? TrafficLevel.Bridge
            : TrafficLevel.Ground;
        }

        const nKey = `${nx},${ny},${nextLevel}`;
        if (closed.has(nKey)) continue;

        const g = current.g + 1;
        const h = manhattanDist({ gx: nx, gy: ny }, to);
        const f = g + h;

        open.push({
          gx: nx,
          gy: ny,
          level: nextLevel,
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

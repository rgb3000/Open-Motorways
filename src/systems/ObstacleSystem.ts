import type { Grid } from '../core/Grid';
import type { GridPos } from '../types';
import { CellType } from '../types';
import {
  GRID_COLS, GRID_ROWS,
  MOUNTAIN_CLUSTER_COUNT, MOUNTAIN_CLUSTER_MIN_SIZE, MOUNTAIN_CLUSTER_MAX_SIZE,
  LAKE_CLUSTER_COUNT, LAKE_CLUSTER_MIN_SIZE, LAKE_CLUSTER_MAX_SIZE,
  OBSTACLE_EDGE_MARGIN, OBSTACLE_CENTER_EXCLUSION,
  MOUNTAIN_MIN_HEIGHT, MOUNTAIN_MAX_HEIGHT,
} from '../constants';

export class ObstacleSystem {
  private grid: Grid;
  private mountainCells: GridPos[] = [];
  private lakeCells: GridPos[] = [];
  private mountainHeightMap = new Map<string, number>();

  constructor(grid: Grid) {
    this.grid = grid;
  }

  generate(): void {
    this.mountainCells = [];
    this.lakeCells = [];
    this.mountainHeightMap.clear();

    // Generate mountains first
    for (let i = 0; i < MOUNTAIN_CLUSTER_COUNT; i++) {
      const size = MOUNTAIN_CLUSTER_MIN_SIZE + Math.floor(Math.random() * (MOUNTAIN_CLUSTER_MAX_SIZE - MOUNTAIN_CLUSTER_MIN_SIZE + 1));
      const cluster = this.growCluster(size, CellType.Mountain);
      if (cluster.length > 0) {
        // Assign heights — cells near cluster center are taller
        const cx = cluster.reduce((s, p) => s + p.gx, 0) / cluster.length;
        const cy = cluster.reduce((s, p) => s + p.gy, 0) / cluster.length;
        const maxDist = Math.max(...cluster.map(p => Math.hypot(p.gx - cx, p.gy - cy)), 1);

        for (const pos of cluster) {
          const dist = Math.hypot(pos.gx - cx, pos.gy - cy);
          const t = 1 - dist / maxDist;
          const height = MOUNTAIN_MIN_HEIGHT + t * (MOUNTAIN_MAX_HEIGHT - MOUNTAIN_MIN_HEIGHT) + (Math.random() - 0.5) * 3;
          this.mountainHeightMap.set(`${pos.gx},${pos.gy}`, Math.max(MOUNTAIN_MIN_HEIGHT, height));
          this.mountainCells.push(pos);
        }
      }
    }

    // Generate lakes (avoid mountains)
    for (let i = 0; i < LAKE_CLUSTER_COUNT; i++) {
      const size = LAKE_CLUSTER_MIN_SIZE + Math.floor(Math.random() * (LAKE_CLUSTER_MAX_SIZE - LAKE_CLUSTER_MIN_SIZE + 1));
      const cluster = this.growCluster(size, CellType.Lake);
      this.lakeCells.push(...cluster);
    }
  }

  getMountainCells(): GridPos[] {
    return this.mountainCells;
  }

  getLakeCells(): GridPos[] {
    return this.lakeCells;
  }

  getMountainHeightMap(): Map<string, number> {
    return this.mountainHeightMap;
  }

  private growCluster(targetSize: number, cellType: CellType): GridPos[] {
    const centerX = GRID_COLS / 2;
    const centerY = GRID_ROWS / 2;

    // Try to find a valid seed cell
    for (let attempt = 0; attempt < 100; attempt++) {
      const seedX = OBSTACLE_EDGE_MARGIN + Math.floor(Math.random() * (GRID_COLS - 2 * OBSTACLE_EDGE_MARGIN));
      const seedY = OBSTACLE_EDGE_MARGIN + Math.floor(Math.random() * (GRID_ROWS - 2 * OBSTACLE_EDGE_MARGIN));

      // Must be empty
      const cell = this.grid.getCell(seedX, seedY);
      if (!cell || cell.type !== CellType.Empty) continue;

      // Must be outside center exclusion zone
      if (Math.abs(seedX - centerX) < OBSTACLE_CENTER_EXCLUSION && Math.abs(seedY - centerY) < OBSTACLE_CENTER_EXCLUSION) continue;

      // Must not be adjacent to existing obstacles
      if (this.hasAdjacentObstacle(seedX, seedY)) continue;

      // Grow cluster from seed
      const cluster: GridPos[] = [{ gx: seedX, gy: seedY }];
      const used = new Set<string>([`${seedX},${seedY}`]);
      this.grid.setCell(seedX, seedY, { type: cellType });

      while (cluster.length < targetSize) {
        // Collect all valid frontier cells
        const frontier: GridPos[] = [];
        for (const pos of cluster) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
            const nx = pos.gx + dx;
            const ny = pos.gy + dy;
            const key = `${nx},${ny}`;
            if (used.has(key)) continue;
            if (!this.grid.inBounds(nx, ny)) continue;
            if (nx < OBSTACLE_EDGE_MARGIN || nx >= GRID_COLS - OBSTACLE_EDGE_MARGIN) continue;
            if (ny < OBSTACLE_EDGE_MARGIN || ny >= GRID_ROWS - OBSTACLE_EDGE_MARGIN) continue;
            const neighborCell = this.grid.getCell(nx, ny);
            if (!neighborCell || neighborCell.type !== CellType.Empty) continue;
            frontier.push({ gx: nx, gy: ny });
            used.add(key);
          }
        }

        if (frontier.length === 0) break;

        // Pick a random frontier cell
        const pick = frontier[Math.floor(Math.random() * frontier.length)];
        this.grid.setCell(pick.gx, pick.gy, { type: cellType });
        cluster.push(pick);
      }

      return cluster;
    }

    return [];
  }

  private hasAdjacentObstacle(gx: number, gy: number): boolean {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cell = this.grid.getCell(gx + dx, gy + dy);
      if (cell && (cell.type === CellType.Mountain || cell.type === CellType.Lake)) {
        return true;
      }
    }
    return false;
  }
}

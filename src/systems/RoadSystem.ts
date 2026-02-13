import type { Grid } from '../core/Grid';
import { OPPOSITE_DIR } from '../core/Grid';
import { CellType, Direction } from '../types';

export class RoadSystem {
  private dirty = false;
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  placeRoad(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Empty) return false;

    this.grid.setCell(gx, gy, {
      type: CellType.Road,
      roadConnections: [],
    });

    this.updateConnections(gx, gy);
    this.dirty = true;
    return true;
  }

  removeRoad(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Road) return false;

    for (const dir of this.grid.getAllDirections()) {
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (neighbor) {
        const oppDir = OPPOSITE_DIR[dir];
        neighbor.cell.roadConnections = neighbor.cell.roadConnections.filter(d => d !== oppDir);
      }
    }

    this.grid.setCell(gx, gy, {
      type: CellType.Empty,
      entityId: null,
      roadConnections: [],
      color: null,
    });

    this.dirty = true;
    return true;
  }

  private updateConnections(gx: number, gy: number): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell) return;

    const connections: Direction[] = [];

    for (const dir of this.grid.getAllDirections()) {
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (!neighbor) continue;

      const nType = neighbor.cell.type;
      if (nType === CellType.Road || nType === CellType.House || nType === CellType.Business) {
        connections.push(dir);

        if (nType === CellType.Road) {
          const oppDir = OPPOSITE_DIR[dir];
          if (!neighbor.cell.roadConnections.includes(oppDir)) {
            neighbor.cell.roadConnections.push(oppDir);
          }
        }
      }
    }

    cell.roadConnections = connections;
  }
}

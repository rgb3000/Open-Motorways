import type { Grid } from '../core/Grid';
import type { RoadSystem } from './RoadSystem';

export class PendingDeletionSystem {
  private grid: Grid;
  private roadSystem: RoadSystem;
  /** Map from "gx,gy" cell key to the set of car IDs that depend on it */
  private pendingCells = new Map<string, Set<string>>();

  constructor(grid: Grid, roadSystem: RoadSystem) {
    this.grid = grid;
    this.roadSystem = roadSystem;
  }

  private cellKey(gx: number, gy: number): string {
    return `${gx},${gy}`;
  }

  markPending(gx: number, gy: number, carIds: string[]): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell) return;
    cell.pendingDeletion = true;
    const key = this.cellKey(gx, gy);
    const set = this.pendingCells.get(key) ?? new Set();
    for (const id of carIds) set.add(id);
    this.pendingCells.set(key, set);
    // Mark roads dirty so renderer shows the faded state
    this.roadSystem.markDirty();
  }

  isPending(gx: number, gy: number): boolean {
    return this.pendingCells.has(this.cellKey(gx, gy));
  }

  notifyCarPassed(carId: string, gx: number, gy: number): void {
    const key = this.cellKey(gx, gy);
    const set = this.pendingCells.get(key);
    if (!set) return;
    set.delete(carId);
  }

  notifyCarRemoved(carId: string): void {
    for (const set of this.pendingCells.values()) {
      set.delete(carId);
    }
  }

  update(): void {
    const toFinalize: { gx: number; gy: number }[] = [];
    for (const [key, set] of this.pendingCells) {
      // Also reconcile: if cell is no longer marked pending (e.g. undo), remove from tracking
      const [gxStr, gyStr] = key.split(',');
      const gx = parseInt(gxStr, 10);
      const gy = parseInt(gyStr, 10);
      const cell = this.grid.getCell(gx, gy);
      if (!cell || !cell.pendingDeletion) {
        this.pendingCells.delete(key);
        continue;
      }
      if (set.size === 0) {
        toFinalize.push({ gx, gy });
      }
    }
    for (const { gx, gy } of toFinalize) {
      this.pendingCells.delete(this.cellKey(gx, gy));
      this.roadSystem.removeRoad(gx, gy);
    }
  }

  reset(): void {
    this.pendingCells.clear();
  }
}

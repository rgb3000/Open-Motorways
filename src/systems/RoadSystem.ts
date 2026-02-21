import type { Grid } from '../core/Grid';
import { CellType } from '../types';
import { opposite, directionFromDelta, ALL_DIRECTIONS, connectionCount } from '../utils/direction';

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

  markDirty(): void {
    this.dirty = true;
  }

  placeRoad(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Empty) return false;

    this.grid.setCell(gx, gy, {
      type: CellType.Road,
      roadConnections: 0,
      pendingDeletion: false,
    });

    this.dirty = true;
    return true;
  }

  removeRoad(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || (cell.type !== CellType.Road && cell.type !== CellType.Connector)) return false;

    // Can't remove connectors
    if (cell.type === CellType.Connector) return false;

    for (const dir of ALL_DIRECTIONS) {
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (neighbor) {
        const oppDir = opposite(dir);
        // Skip disconnecting connector cells' permanent connections
        if (neighbor.cell.type === CellType.Connector) {
          // Check if this connection points toward the parking lot (permanent)
          const permanentNeighbor = this.grid.getNeighbor(neighbor.gx, neighbor.gy, oppDir);
          if (permanentNeighbor && permanentNeighbor.cell.type === CellType.ParkingLot) continue;
        }
        neighbor.cell.roadConnections &= ~oppDir;
      }
    }

    this.grid.setCell(gx, gy, {
      type: CellType.Empty,
      entityId: null,
      roadConnections: 0,
      color: null,
      connectorDir: null,
      pendingDeletion: false,
    });

    this.dirty = true;
    return true;
  }

  connectRoads(gx1: number, gy1: number, gx2: number, gy2: number): boolean {
    const cell1 = this.grid.getCell(gx1, gy1);
    const cell2 = this.grid.getCell(gx2, gy2);
    if (!cell1 || !cell2) return false;

    if (cell1.type === CellType.Empty || cell1.type === CellType.Business) return false;
    if (cell2.type === CellType.Empty || cell2.type === CellType.Business) return false;

    // Must be adjacent (cardinal or diagonal): Chebyshev distance = 1
    const dx = gx2 - gx1;
    const dy = gy2 - gy1;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;

    const dir = directionFromDelta(dx, dy);
    const oppDir = opposite(dir);

    // Houses are limited to 1 road connection
    if (cell1.type === CellType.House && connectionCount(cell1.roadConnections) >= 1) return false;
    if (cell2.type === CellType.House && connectionCount(cell2.roadConnections) >= 1) return false;

    // Business/gas station connectors: 1 permanent inward + at most 1 road = max 2
    if (cell1.type === CellType.Connector && connectionCount(cell1.roadConnections) >= 2) return false;
    if (cell2.type === CellType.Connector && connectionCount(cell2.roadConnections) >= 2) return false;

    cell1.roadConnections |= dir;
    cell2.roadConnections |= oppDir;

    this.dirty = true;
    return true;
  }

}

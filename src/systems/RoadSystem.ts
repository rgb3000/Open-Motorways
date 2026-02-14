import type { Grid } from '../core/Grid';
import { OPPOSITE_DIR } from '../core/Grid';
import { CellType, Direction } from '../types';
import { isOpposite } from '../utils/direction';

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
      hasBridge: false,
      bridgeAxis: null,
      bridgeConnections: [],
    });

    this.updateConnections(gx, gy);
    this.dirty = true;
    return true;
  }

  removeRoad(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Road) return false;

    // Disconnect bridge connections from neighbors
    if (cell.hasBridge) {
      this.disconnectBridgeFromNeighbors(gx, gy);
    }

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
      hasBridge: false,
      bridgeAxis: null,
      bridgeConnections: [],
    });

    this.dirty = true;
    return true;
  }

  placeBridge(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Road) return false;
    if (cell.hasBridge) return false;

    // Must be a straight road: exactly 2 opposite connections
    const conns = cell.roadConnections;
    if (conns.length !== 2) return false;
    if (!isOpposite(conns[0], conns[1])) return false;

    // Determine road axis and bridge axis (perpendicular)
    const isHorizontalRoad = conns[0] === Direction.Left || conns[0] === Direction.Right;
    const bridgeAxis: 'horizontal' | 'vertical' = isHorizontalRoad ? 'vertical' : 'horizontal';

    this.grid.setCell(gx, gy, {
      hasBridge: true,
      bridgeAxis,
      bridgeConnections: [],
    });

    this.updateBridgeConnections(gx, gy);
    this.dirty = true;
    return true;
  }

  removeBridge(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || !cell.hasBridge) return false;

    this.disconnectBridgeFromNeighbors(gx, gy);

    this.grid.setCell(gx, gy, {
      hasBridge: false,
      bridgeAxis: null,
      bridgeConnections: [],
    });

    this.dirty = true;
    return true;
  }

  removeBridgeOrRoad(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell) return false;

    if (cell.hasBridge) {
      return this.removeBridge(gx, gy);
    }
    return this.removeRoad(gx, gy);
  }

  private updateBridgeConnections(gx: number, gy: number): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || !cell.hasBridge || !cell.bridgeAxis) return;

    const bridgeDirs: Direction[] = cell.bridgeAxis === 'horizontal'
      ? [Direction.Left, Direction.Right]
      : [Direction.Up, Direction.Down];

    const connections: Direction[] = [];

    for (const dir of bridgeDirs) {
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (!neighbor) continue;

      const nType = neighbor.cell.type;
      if (nType === CellType.Road || nType === CellType.House || nType === CellType.Business) {
        connections.push(dir);

        // Connect neighbor's bridge back to us if it has a bridge on same axis
        if (nType === CellType.Road && neighbor.cell.hasBridge && neighbor.cell.bridgeAxis === cell.bridgeAxis) {
          const oppDir = OPPOSITE_DIR[dir];
          if (!neighbor.cell.bridgeConnections.includes(oppDir)) {
            neighbor.cell.bridgeConnections.push(oppDir);
          }
        }
      }
    }

    cell.bridgeConnections = connections;
  }

  private disconnectBridgeFromNeighbors(gx: number, gy: number): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || !cell.hasBridge || !cell.bridgeAxis) return;

    const bridgeDirs: Direction[] = cell.bridgeAxis === 'horizontal'
      ? [Direction.Left, Direction.Right]
      : [Direction.Up, Direction.Down];

    for (const dir of bridgeDirs) {
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (!neighbor) continue;

      if (neighbor.cell.hasBridge) {
        const oppDir = OPPOSITE_DIR[dir];
        neighbor.cell.bridgeConnections = neighbor.cell.bridgeConnections.filter(d => d !== oppDir);
      }
    }
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

          // Also update bridge connections on neighbor if it has a bridge connecting toward us
          if (neighbor.cell.hasBridge && neighbor.cell.bridgeAxis) {
            this.updateBridgeConnections(neighbor.gx, neighbor.gy);
          }
        }
      }
    }

    cell.roadConnections = connections;
  }
}

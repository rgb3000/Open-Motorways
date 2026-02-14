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

    // Auto-connect to all valid neighbors
    for (const dir of this.grid.getAllDirections()) {
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (!neighbor) continue;
      const t = neighbor.cell.type;
      if (t === CellType.Road || t === CellType.House || t === CellType.Business) {
        this.connectRoads(gx, gy, neighbor.gx, neighbor.gy);
      }
    }

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
      connectorDir: null,
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

  removeBridgeOrRoad(gx: number, gy: number): 'bridge' | 'road' | false {
    const cell = this.grid.getCell(gx, gy);
    if (!cell) return false;

    if (cell.hasBridge) {
      return this.removeBridge(gx, gy) ? 'bridge' : false;
    }
    return this.removeRoad(gx, gy) ? 'road' : false;
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

  connectRoads(gx1: number, gy1: number, gx2: number, gy2: number): boolean {
    const cell1 = this.grid.getCell(gx1, gy1);
    const cell2 = this.grid.getCell(gx2, gy2);
    if (!cell1 || !cell2) return false;

    if (cell1.type === CellType.Empty || cell2.type === CellType.Empty) return false;

    // Must be orthogonal neighbors
    const dx = gx2 - gx1;
    const dy = gy2 - gy1;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

    // Determine directions
    let dir: Direction;
    if (dx === 1) dir = Direction.Right;
    else if (dx === -1) dir = Direction.Left;
    else if (dy === 1) dir = Direction.Down;
    else dir = Direction.Up;

    const oppDir = OPPOSITE_DIR[dir];

    // Validate business connector: only allow connection through the connector side
    if (cell1.type === CellType.Business) {
      if (cell1.connectorDir === null || cell1.connectorDir !== dir) return false;
    }
    if (cell2.type === CellType.Business) {
      if (cell2.connectorDir === null || cell2.connectorDir !== oppDir) return false;
    }

    if (!cell1.roadConnections.includes(dir)) {
      cell1.roadConnections.push(dir);
    }
    if (!cell2.roadConnections.includes(oppDir)) {
      cell2.roadConnections.push(oppDir);
    }

    this.dirty = true;
    return true;
  }

}

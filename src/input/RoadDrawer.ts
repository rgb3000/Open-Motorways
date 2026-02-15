import type { InputHandler } from './InputHandler';
import type { UndoSystem } from './UndoSystem';
import type { RoadSystem } from '../systems/RoadSystem';
import type { Grid } from '../core/Grid';
import { OPPOSITE_DIR } from '../core/Grid';
import type { House } from '../entities/House';
import type { GridPos } from '../types';
import { CellType, Direction } from '../types';
import { GRID_COLS, GRID_ROWS, ROAD_COST, ROAD_REFUND, BRIDGE_REFUND } from '../constants';

export interface MoneyInterface {
  canAfford(cost: number): boolean;
  spend(cost: number): void;
  refund(amount: number): void;
}

type DrawMode = 'none' | 'place' | 'connector-drag';

export class RoadDrawer {
  private lastGridPos: GridPos | null = null;
  private wasLeftDown = false;
  private wasRightDown = false;
  private input: InputHandler;
  private roadSystem: RoadSystem;
  private grid: Grid;
  private money: MoneyInterface;
  private getHouses: () => House[];
  private undoSystem: UndoSystem;

  private mode: DrawMode = 'none';
  private prevPlacedPos: GridPos | null = null;
  private lastBuiltPos: GridPos | null = null;
  private draggingHouse: House | null = null;

  onRoadPlace: (() => void) | null = null;
  onRoadDelete: (() => void) | null = null;

  constructor(
    input: InputHandler, roadSystem: RoadSystem, grid: Grid,
    money: MoneyInterface,
    getHouses: () => House[],
    undoSystem: UndoSystem,
  ) {
    this.input = input;
    this.roadSystem = roadSystem;
    this.grid = grid;
    this.money = money;
    this.getHouses = getHouses;
    this.undoSystem = undoSystem;
  }

  update(): void {
    const { leftDown, rightDown, gridPos } = this.input.state;

    if (leftDown) {
      if (!this.wasLeftDown) {
        // Starting a new left-click — determine mode
        this.undoSystem.beginGroup();
        this.lastGridPos = { ...gridPos };

        // Check if clicking on a house cell → connector drag mode
        const cell = this.grid.getCell(gridPos.gx, gridPos.gy);
        if (cell && cell.type === CellType.House && cell.entityId) {
          const house = this.getHouses().find(h => h.id === cell.entityId);
          if (house) {
            this.mode = 'connector-drag';
            this.draggingHouse = house;
          } else {
            this.mode = 'place';
          }
        } else {
          this.mode = 'place';
        }

        if (this.mode === 'place') {
          if (this.input.state.shiftDown && this.lastBuiltPos) {
            // Shift-click: build L-shaped road from lastBuiltPos to clicked cell
            let prev = { ...this.lastBuiltPos };
            let stopped = false;
            this.shortestLine(this.lastBuiltPos.gx, this.lastBuiltPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
              if (stopped) return;
              const c = this.grid.getCell(x, y);
              if (c && c.type === CellType.House) {
                this.prevPlacedPos = prev;
                if (this.tryConnectToHouse(x, y)) { stopped = true; return; }
              }
              this.tryPlace(x, y);
              if (prev.gx !== x || prev.gy !== y) {
                this.roadSystem.connectRoads(prev.gx, prev.gy, x, y);
              }
              prev = { gx: x, gy: y };
            });
            this.prevPlacedPos = { ...gridPos };
            this.lastBuiltPos = { ...gridPos };
          } else {
            const isOccupied = cell && (cell.type === CellType.Road || cell.type === CellType.House || cell.type === CellType.Business);

            if (isOccupied) {
              this.prevPlacedPos = { ...gridPos };
            } else {
              this.prevPlacedPos = null;
              this.tryPlace(gridPos.gx, gridPos.gy);
              this.prevPlacedPos = { ...gridPos };
            }
            this.lastBuiltPos = { ...gridPos };
          }
        }
      } else if (this.lastGridPos && (gridPos.gx !== this.lastGridPos.gx || gridPos.gy !== this.lastGridPos.gy)) {
        if (this.mode === 'connector-drag' && this.draggingHouse) {
          const house = this.draggingHouse;
          const dx = gridPos.gx - house.pos.gx;
          const dy = gridPos.gy - house.pos.gy;

          // Determine direction from house toward cursor (8 directions)
          let newDir: Direction;
          const adx = Math.abs(dx);
          const ady = Math.abs(dy);
          if (adx > 2 * ady) {
            newDir = dx >= 0 ? Direction.Right : Direction.Left;
          } else if (ady > 2 * adx) {
            newDir = dy >= 0 ? Direction.Down : Direction.Up;
          } else if (dx > 0 && dy > 0) {
            newDir = Direction.DownRight;
          } else if (dx > 0 && dy < 0) {
            newDir = Direction.UpRight;
          } else if (dx < 0 && dy > 0) {
            newDir = Direction.DownLeft;
          } else {
            newDir = Direction.UpLeft;
          }

          if (newDir !== house.connectorDir) {
            this.relocateHouseConnector(house, newDir);
          }

          // Transition to place mode starting from the connector cell
          const connectorPos = house.connectorPos;
          this.mode = 'place';
          this.prevPlacedPos = { ...connectorPos };
          this.lastBuiltPos = { ...connectorPos };
          this.draggingHouse = null;

          // If cursor is beyond the connector cell, place roads from connector to cursor
          if (gridPos.gx !== connectorPos.gx || gridPos.gy !== connectorPos.gy) {
            let stopped1 = false;
            this.bresenhamLine(connectorPos.gx, connectorPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
              if (stopped1) return;
              // Skip the connector cell itself (already placed)
              if (x === connectorPos.gx && y === connectorPos.gy) return;
              const c = this.grid.getCell(x, y);
              if (c && c.type === CellType.House) {
                if (this.tryConnectToHouse(x, y)) { stopped1 = true; return; }
              }
              this.tryPlace(x, y);
              if (this.prevPlacedPos && (this.prevPlacedPos.gx !== x || this.prevPlacedPos.gy !== y)) {
                this.roadSystem.connectRoads(this.prevPlacedPos.gx, this.prevPlacedPos.gy, x, y);
              }
              this.prevPlacedPos = { gx: x, gy: y };
            });
            this.lastBuiltPos = { ...gridPos };
          }
        } else if (this.mode === 'place') {
          let stopped2 = false;
          this.bresenhamLine(this.lastGridPos.gx, this.lastGridPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
            if (stopped2) return;
            const c = this.grid.getCell(x, y);
            if (c && c.type === CellType.House) {
              if (this.tryConnectToHouse(x, y)) { stopped2 = true; return; }
            }
            this.tryPlace(x, y);
            if (this.prevPlacedPos && (this.prevPlacedPos.gx !== x || this.prevPlacedPos.gy !== y)) {
              this.roadSystem.connectRoads(this.prevPlacedPos.gx, this.prevPlacedPos.gy, x, y);
            }
            this.prevPlacedPos = { gx: x, gy: y };
          });
          this.lastBuiltPos = { ...gridPos };
        }
        this.lastGridPos = { ...gridPos };
      }
    }

    if (rightDown) {
      if (!this.wasRightDown) {
        this.undoSystem.beginGroup();
        this.lastGridPos = { ...gridPos };
        this.tryErase(gridPos.gx, gridPos.gy);
      } else if (this.lastGridPos && (gridPos.gx !== this.lastGridPos.gx || gridPos.gy !== this.lastGridPos.gy)) {
        this.bresenhamLine(this.lastGridPos.gx, this.lastGridPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
          this.tryErase(x, y);
        });
        this.lastGridPos = { ...gridPos };
      }
    }

    if (!leftDown && this.wasLeftDown) {
      this.undoSystem.endGroup();
    }
    if (!rightDown && this.wasRightDown) {
      this.undoSystem.endGroup();
    }

    if (!leftDown && !rightDown) {
      this.lastGridPos = null;
      this.mode = 'none';
      this.prevPlacedPos = null;
      this.draggingHouse = null;
    }

    this.wasLeftDown = leftDown;
    this.wasRightDown = rightDown;
  }

  private relocateHouseConnector(house: House, newDir: Direction): void {
    const oldConnectorPos = house.connectorPos;
    const oldDir = house.connectorDir;

    // Check target cell is empty
    const off = this.grid.getDirectionOffset(newDir);
    const newConnX = house.pos.gx + off.gx;
    const newConnY = house.pos.gy + off.gy;
    const targetCell = this.grid.getCell(newConnX, newConnY);
    if (!targetCell || (targetCell.type !== CellType.Empty && targetCell.type !== CellType.Road)) return;
    const targetIsRoad = targetCell.type === CellType.Road;

    // Snapshot old and new connector positions + neighbors before mutation
    this.undoSystem.snapshotCellAndNeighbors(oldConnectorPos.gx, oldConnectorPos.gy);
    this.undoSystem.snapshotCellAndNeighbors(newConnX, newConnY);
    this.undoSystem.snapshotCellAndNeighbors(house.pos.gx, house.pos.gy);
    this.undoSystem.setHouseConnectorChange(house, oldDir);

    // Remove old connector cell — disconnect from neighbors first
    const oldCell = this.grid.getCell(oldConnectorPos.gx, oldConnectorPos.gy);
    if (oldCell && oldCell.type === CellType.Road) {
      // Disconnect neighbors from old connector (except permanent house connection)
      for (const dir of this.grid.getAllDirections()) {
        const neighbor = this.grid.getNeighbor(oldConnectorPos.gx, oldConnectorPos.gy, dir);
        if (!neighbor) continue;
        const oppDir = OPPOSITE_DIR[dir];
        // Skip the house cell
        if (neighbor.cell.type === CellType.House) continue;
        neighbor.cell.roadConnections = neighbor.cell.roadConnections.filter(d => d !== oppDir);
      }

      // Clear old connector cell
      this.grid.setCell(oldConnectorPos.gx, oldConnectorPos.gy, {
        type: CellType.Empty,
        entityId: null,
        roadConnections: [],
        color: null,
        hasBridge: false,
        bridgeAxis: null,
        bridgeConnections: [],
        connectorDir: null,
      });
    }

    // Update house
    house.setConnectorDir(newDir);

    // Update house cell's connectorDir
    this.grid.setCell(house.pos.gx, house.pos.gy, {
      connectorDir: newDir,
    });

    // Place new connector road cell (merge into existing road or create fresh)
    const connToHouseDir = house.getConnectorToHouseDir();
    if (targetIsRoad) {
      // Merge: add house connection to existing road cell
      if (!targetCell.roadConnections.includes(connToHouseDir)) {
        targetCell.roadConnections.push(connToHouseDir);
      }
      this.grid.setCell(newConnX, newConnY, {
        entityId: house.id,
      });
    } else {
      this.grid.setCell(newConnX, newConnY, {
        type: CellType.Road,
        entityId: house.id,
        color: null,
        roadConnections: [connToHouseDir],
        hasBridge: false,
        bridgeAxis: null,
        bridgeConnections: [],
        connectorDir: null,
      });
    }

    // Mark road system dirty to trigger repath and redraw
    this.roadSystem.markDirty();
  }

  private tryPlace(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;

    if (!this.money.canAfford(ROAD_COST)) return;
    this.undoSystem.snapshotCellAndNeighbors(gx, gy);
    if (this.roadSystem.placeRoad(gx, gy)) {
      this.money.spend(ROAD_COST);
      this.undoSystem.addMoneyDelta(-ROAD_COST);
      this.onRoadPlace?.();
    }
  }

  private tryErase(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;
    this.undoSystem.snapshotCellAndNeighbors(gx, gy);
    const result = this.roadSystem.removeBridgeOrRoad(gx, gy);
    if (result === 'bridge') {
      this.money.refund(BRIDGE_REFUND);
      this.undoSystem.addMoneyDelta(BRIDGE_REFUND);
      this.onRoadDelete?.();
    } else if (result === 'road') {
      this.money.refund(ROAD_REFUND);
      this.undoSystem.addMoneyDelta(ROAD_REFUND);
      this.onRoadDelete?.();
    }
  }

  private tryConnectToHouse(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.House || !cell.entityId) return false;
    if (!this.prevPlacedPos) return false;

    const house = this.getHouses().find(h => h.id === cell.entityId);
    if (!house) return false;

    // Must be adjacent (Chebyshev distance 1) from prevPlacedPos
    const dx = gx - this.prevPlacedPos.gx;
    const dy = gy - this.prevPlacedPos.gy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;

    // Direction from house to the incoming road cell
    const rdx = this.prevPlacedPos.gx - house.pos.gx;
    const rdy = this.prevPlacedPos.gy - house.pos.gy;

    let newDir: Direction;
    if (rdx === 1 && rdy === 0) newDir = Direction.Right;
    else if (rdx === -1 && rdy === 0) newDir = Direction.Left;
    else if (rdx === 0 && rdy === 1) newDir = Direction.Down;
    else if (rdx === 0 && rdy === -1) newDir = Direction.Up;
    else if (rdx === 1 && rdy === -1) newDir = Direction.UpRight;
    else if (rdx === -1 && rdy === -1) newDir = Direction.UpLeft;
    else if (rdx === 1 && rdy === 1) newDir = Direction.DownRight;
    else if (rdx === -1 && rdy === 1) newDir = Direction.DownLeft;
    else return false;

    this.relocateHouseConnector(house, newDir);

    // Connect the incoming road to the new connector
    this.roadSystem.connectRoads(this.prevPlacedPos.gx, this.prevPlacedPos.gy, house.connectorPos.gx, house.connectorPos.gy);
    return true;
  }

  private shortestLine(x0: number, y0: number, x1: number, y1: number, callback: (x: number, y: number) => void): void {
    const sx = x0 < x1 ? 1 : x0 > x1 ? -1 : 0;
    const sy = y0 < y1 ? 1 : y0 > y1 ? -1 : 0;
    let x = x0;
    let y = y0;
    // Walk diagonally while both axes need covering (Chebyshev-optimal)
    while (x !== x1 && y !== y1) {
      callback(x, y);
      x += sx;
      y += sy;
    }
    // Then walk straight along remaining axis
    while (x !== x1) {
      callback(x, y);
      x += sx;
    }
    while (y !== y1) {
      callback(x, y);
      y += sy;
    }
    // Final cell
    callback(x1, y1);
  }

  private bresenhamLine(x0: number, y0: number, x1: number, y1: number, callback: (x: number, y: number) => void): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let x = x0;
    let y = y0;

    while (true) {
      callback(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }
}

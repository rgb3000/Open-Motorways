import type { InputHandler } from './InputHandler';
import type { RoadSystem } from '../systems/RoadSystem';
import type { Grid } from '../core/Grid';
import { OPPOSITE_DIR } from '../core/Grid';
import type { House } from '../entities/House';
import type { GridPos } from '../types';
import { CellType, Direction, ToolType } from '../types';
import { GRID_COLS, GRID_ROWS, ROAD_COST, BRIDGE_COST, ROAD_REFUND, BRIDGE_REFUND } from '../constants';

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
  private getActiveTool: () => ToolType;
  private money: MoneyInterface;
  private getHouses: () => House[];

  private mode: DrawMode = 'none';
  private prevPlacedPos: GridPos | null = null;
  private lastBuiltPos: GridPos | null = null;
  private draggingHouse: House | null = null;

  onRoadPlace: (() => void) | null = null;
  onRoadDelete: (() => void) | null = null;

  constructor(
    input: InputHandler, roadSystem: RoadSystem, grid: Grid,
    getActiveTool: () => ToolType, money: MoneyInterface,
    getHouses: () => House[],
  ) {
    this.input = input;
    this.roadSystem = roadSystem;
    this.grid = grid;
    this.getActiveTool = getActiveTool;
    this.money = money;
    this.getHouses = getHouses;
  }

  update(): void {
    const { leftDown, rightDown, gridPos } = this.input.state;

    if (leftDown) {
      if (!this.wasLeftDown) {
        // Starting a new left-click — determine mode
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
            this.manhattanLine(this.lastBuiltPos.gx, this.lastBuiltPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
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
          // Check if dragged to an adjacent cell of the house
          const house = this.draggingHouse;
          const dx = gridPos.gx - house.pos.gx;
          const dy = gridPos.gy - house.pos.gy;
          if (Math.abs(dx) + Math.abs(dy) === 1) {
            let newDir: Direction;
            if (dx === 1) newDir = Direction.Right;
            else if (dx === -1) newDir = Direction.Left;
            else if (dy === 1) newDir = Direction.Down;
            else newDir = Direction.Up;

            if (newDir !== house.connectorDir) {
              this.relocateHouseConnector(house, newDir);
            }
          }
        } else if (this.mode === 'place') {
          this.bresenhamLine(this.lastGridPos.gx, this.lastGridPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
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
        this.lastGridPos = { ...gridPos };
        this.tryErase(gridPos.gx, gridPos.gy);
      } else if (this.lastGridPos && (gridPos.gx !== this.lastGridPos.gx || gridPos.gy !== this.lastGridPos.gy)) {
        this.bresenhamLine(this.lastGridPos.gx, this.lastGridPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
          this.tryErase(x, y);
        });
        this.lastGridPos = { ...gridPos };
      }
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

    // Check target cell is empty
    const off = this.grid.getDirectionOffset(newDir);
    const newConnX = house.pos.gx + off.gx;
    const newConnY = house.pos.gy + off.gy;
    const targetCell = this.grid.getCell(newConnX, newConnY);
    if (!targetCell || targetCell.type !== CellType.Empty) return;

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

    // Place new connector road cell
    const connToHouseDir = house.getConnectorToHouseDir();
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

    // Connect new connector to any adjacent roads
    for (const dir of this.grid.getAllDirections()) {
      // Skip connection toward house (already permanent)
      if (dir === connToHouseDir) continue;
      const neighbor = this.grid.getNeighbor(newConnX, newConnY, dir);
      if (!neighbor) continue;
      if (neighbor.cell.type === CellType.Road) {
        this.roadSystem.connectRoads(newConnX, newConnY, neighbor.gx, neighbor.gy);
      }
    }

    // Mark road system dirty to trigger repath and redraw
    this.roadSystem.markDirty();
  }

  private tryPlace(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;

    if (this.getActiveTool() === ToolType.Bridge) {
      // Bridge tool: try placing bridge first, fall back to road on empty cells
      if (this.money.canAfford(BRIDGE_COST) && this.roadSystem.placeBridge(gx, gy)) {
        this.money.spend(BRIDGE_COST);
        this.onRoadPlace?.();
      } else if (this.money.canAfford(ROAD_COST) && this.roadSystem.placeRoad(gx, gy)) {
        this.money.spend(ROAD_COST);
        this.onRoadPlace?.();
      }
    } else {
      if (!this.money.canAfford(ROAD_COST)) return;
      if (this.roadSystem.placeRoad(gx, gy)) {
        this.money.spend(ROAD_COST);
        this.onRoadPlace?.();
      }
    }
  }

  private tryErase(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;
    const result = this.roadSystem.removeBridgeOrRoad(gx, gy);
    if (result === 'bridge') {
      this.money.refund(BRIDGE_REFUND);
      this.onRoadDelete?.();
    } else if (result === 'road') {
      this.money.refund(ROAD_REFUND);
      this.onRoadDelete?.();
    }
  }

  private manhattanLine(x0: number, y0: number, x1: number, y1: number, callback: (x: number, y: number) => void): void {
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let x = x0;
    let y = y0;
    // Walk horizontally first
    while (x !== x1) {
      callback(x, y);
      x += sx;
    }
    // Then walk vertically
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

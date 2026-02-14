import type { InputHandler } from './InputHandler';
import type { RoadSystem } from '../systems/RoadSystem';
import type { Grid } from '../core/Grid';
import type { GridPos } from '../types';
import { CellType, ToolType } from '../types';
import { GRID_COLS, GRID_ROWS, ROAD_COST, BRIDGE_COST, ROAD_REFUND, BRIDGE_REFUND } from '../constants';

export interface MoneyInterface {
  canAfford(cost: number): boolean;
  spend(cost: number): void;
  refund(amount: number): void;
}

type DrawMode = 'none' | 'place';

export class RoadDrawer {
  private lastGridPos: GridPos | null = null;
  private wasLeftDown = false;
  private wasRightDown = false;
  private input: InputHandler;
  private roadSystem: RoadSystem;
  private grid: Grid;
  private getActiveTool: () => ToolType;
  private money: MoneyInterface;

  private mode: DrawMode = 'none';
  private prevPlacedPos: GridPos | null = null;
  private lastBuiltPos: GridPos | null = null;

  onRoadPlace: (() => void) | null = null;
  onRoadDelete: (() => void) | null = null;

  constructor(input: InputHandler, roadSystem: RoadSystem, grid: Grid, getActiveTool: () => ToolType, money: MoneyInterface) {
    this.input = input;
    this.roadSystem = roadSystem;
    this.grid = grid;
    this.getActiveTool = getActiveTool;
    this.money = money;
  }

  update(): void {
    const { leftDown, rightDown, gridPos } = this.input.state;

    if (leftDown) {
      if (!this.wasLeftDown) {
        // Starting a new left-click — determine mode
        this.lastGridPos = { ...gridPos };
        this.mode = 'place';

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
          const cell = this.grid.getCell(gridPos.gx, gridPos.gy);
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
      } else if (this.lastGridPos && (gridPos.gx !== this.lastGridPos.gx || gridPos.gy !== this.lastGridPos.gy)) {
        if (this.mode === 'place') {
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
    }

    this.wasLeftDown = leftDown;
    this.wasRightDown = rightDown;
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

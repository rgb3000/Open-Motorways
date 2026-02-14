import type { InputHandler } from './InputHandler';
import type { RoadSystem } from '../systems/RoadSystem';
import type { Grid } from '../core/Grid';
import type { GridPos } from '../types';
import { CellType, ToolType } from '../types';
import { GRID_COLS, GRID_ROWS } from '../constants';

type DrawMode = 'none' | 'place' | 'connect';

export class RoadDrawer {
  private lastGridPos: GridPos | null = null;
  private wasLeftDown = false;
  private wasRightDown = false;
  private input: InputHandler;
  private roadSystem: RoadSystem;
  private grid: Grid;
  private getActiveTool: () => ToolType;

  private mode: DrawMode = 'none';
  private connectOrigin: GridPos | null = null;
  private prevPlacedPos: GridPos | null = null;

  constructor(input: InputHandler, roadSystem: RoadSystem, grid: Grid, getActiveTool: () => ToolType) {
    this.input = input;
    this.roadSystem = roadSystem;
    this.grid = grid;
    this.getActiveTool = getActiveTool;
  }

  update(): void {
    const { leftDown, rightDown, gridPos } = this.input.state;

    if (leftDown) {
      if (!this.wasLeftDown) {
        // Starting a new left-click drag — determine mode
        this.lastGridPos = { ...gridPos };
        const cell = this.grid.getCell(gridPos.gx, gridPos.gy);
        const isOccupied = cell && (cell.type === CellType.Road || cell.type === CellType.House || cell.type === CellType.Business);

        if (isOccupied) {
          this.mode = 'connect';
          this.connectOrigin = { ...gridPos };
        } else {
          this.mode = 'place';
          this.prevPlacedPos = null;
          this.tryPlace(gridPos.gx, gridPos.gy);
          this.prevPlacedPos = { ...gridPos };
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
        } else if (this.mode === 'connect' && this.connectOrigin) {
          this.bresenhamLine(this.lastGridPos.gx, this.lastGridPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
            if (this.connectOrigin && (this.connectOrigin.gx !== x || this.connectOrigin.gy !== y)) {
              if (this.roadSystem.connectRoads(this.connectOrigin.gx, this.connectOrigin.gy, x, y)) {
                this.connectOrigin = { gx: x, gy: y };
              }
            }
          });
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
      this.connectOrigin = null;
      this.prevPlacedPos = null;
    }

    this.wasLeftDown = leftDown;
    this.wasRightDown = rightDown;
  }

  private tryPlace(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;

    if (this.getActiveTool() === ToolType.Bridge) {
      // Bridge tool: try placing bridge first, fall back to road on empty cells
      if (!this.roadSystem.placeBridge(gx, gy)) {
        this.roadSystem.placeRoad(gx, gy);
      }
    } else {
      this.roadSystem.placeRoad(gx, gy);
    }
  }

  private tryErase(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;
    this.roadSystem.removeBridgeOrRoad(gx, gy);
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

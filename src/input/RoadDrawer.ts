import type { InputHandler } from './InputHandler';
import type { RoadSystem } from '../systems/RoadSystem';
import type { GridPos } from '../types';
import { GRID_COLS, GRID_ROWS } from '../constants';

export class RoadDrawer {
  private lastGridPos: GridPos | null = null;
  private wasLeftDown = false;
  private wasRightDown = false;
  private input: InputHandler;
  private roadSystem: RoadSystem;

  constructor(input: InputHandler, roadSystem: RoadSystem) {
    this.input = input;
    this.roadSystem = roadSystem;
  }

  update(): void {
    const { leftDown, rightDown, gridPos } = this.input.state;

    if (leftDown) {
      if (!this.wasLeftDown) {
        this.lastGridPos = { ...gridPos };
        this.tryPlace(gridPos.gx, gridPos.gy);
      } else if (this.lastGridPos && (gridPos.gx !== this.lastGridPos.gx || gridPos.gy !== this.lastGridPos.gy)) {
        this.bresenhamLine(this.lastGridPos.gx, this.lastGridPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
          this.tryPlace(x, y);
        });
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
    }

    this.wasLeftDown = leftDown;
    this.wasRightDown = rightDown;
  }

  private tryPlace(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;
    this.roadSystem.placeRoad(gx, gy);
  }

  private tryErase(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;
    this.roadSystem.removeRoad(gx, gy);
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

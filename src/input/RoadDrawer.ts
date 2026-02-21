import type { InputHandler } from './InputHandler';
import type { UndoSystem } from './UndoSystem';
import type { RoadSystem } from '../systems/RoadSystem';
import type { Grid } from '../core/Grid';
import type { GridPos } from '../types';
import { CellType, Direction, Tool } from '../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, ROAD_COST, ROAD_REFUND } from '../constants';
import { connectionCount, forEachDirection, directionFromDelta, opposite } from '../utils/direction';
import { findRoadPlacementPath } from '../pathfinding/RoadPlacementPathfinder';

const DRAG_THRESHOLD_SQ = (TILE_SIZE * 0.5) ** 2;

export interface MoneyInterface {
  canAfford(cost: number): boolean;
  spend(cost: number): void;
  refund(amount: number): void;
}

export class RoadDrawer {
  private lastGridPos: GridPos | null = null;
  private wasLeftDown = false;
  private wasRightDown = false;
  private input: InputHandler;
  private roadSystem: RoadSystem;
  private grid: Grid;
  private money: MoneyInterface;
  private undoSystem: UndoSystem | null;
  private getActiveTool: () => Tool;

  private prevPlacedPos: GridPos | null = null;
  private lastBuiltPos: GridPos | null = null;
  private prevCanvasX: number | null = null;
  private prevCanvasY: number | null = null;
  private redirectSource: GridPos | null = null;

  onRoadPlace: (() => void) | null = null;
  onRoadDelete: (() => void) | null = null;
  onTryErase: ((gx: number, gy: number) => boolean) | null = null;

  constructor(
    input: InputHandler, roadSystem: RoadSystem, grid: Grid,
    money: MoneyInterface,
    _getHouses: () => unknown[],
    undoSystem: UndoSystem | null,
    getActiveTool: () => Tool = () => Tool.Road,
  ) {
    this.input = input;
    this.roadSystem = roadSystem;
    this.grid = grid;
    this.money = money;
    this.undoSystem = undoSystem;
    this.getActiveTool = getActiveTool;
  }

  getLastBuiltPos(): GridPos | null {
    return this.lastBuiltPos;
  }

  update(): void {
    const tool = this.getActiveTool();
    if (tool === Tool.Highway || tool === Tool.GasStation) {
      // Reset drag state so we don't carry stale state into next tool switch
      this.wasLeftDown = this.input.state.leftDown;
      this.wasRightDown = this.input.state.rightDown;
      return;
    }

    const { gridPos } = this.input.state;
    const isEraser = this.getActiveTool() === Tool.Eraser;

    // Remap inputs: eraser tool makes left-click erase
    const leftDown = isEraser ? false : this.input.state.leftDown;
    const rightDown = isEraser
      ? (this.input.state.leftDown || this.input.state.rightDown)
      : this.input.state.rightDown;

    if (leftDown) {
      if (!this.wasLeftDown) {
        // Starting a new left-click
        this.undoSystem?.beginGroup();
        this.lastGridPos = { ...gridPos };
        const { canvasX: startCX, canvasY: startCY } = this.input.state;
        this.prevCanvasX = startCX;
        this.prevCanvasY = startCY;

        const cell = this.grid.getCell(gridPos.gx, gridPos.gy);

        if (this.input.state.shiftDown && this.lastBuiltPos) {
          // Shift-click: pathfind road from lastBuiltPos to clicked cell
          const path = findRoadPlacementPath(this.grid, this.lastBuiltPos, gridPos);
          if (path) {
            let prev = { ...path[0] };
            let stopped = false;
            for (let i = 0; i < path.length; i++) {
              if (stopped) break;
              const { gx: x, gy: y } = path[i];
              const c = this.grid.getCell(x, y);
              if (c && c.type === CellType.House) {
                this.prevPlacedPos = prev;
                if (this.tryConnectToHouse(x, y)) { stopped = true; break; }
              }
              if (!this.money.canAfford(ROAD_COST) && !(this.grid.getCell(x, y)?.type === CellType.Road || this.grid.getCell(x, y)?.type === CellType.Connector)) {
                this.lastBuiltPos = { ...prev };
                break;
              }
              this.tryPlace(x, y);
              if (prev.gx !== x || prev.gy !== y) {
                this.roadSystem.connectRoads(prev.gx, prev.gy, x, y);
              }
              prev = { gx: x, gy: y };
              this.lastBuiltPos = { ...prev };
            }
            if (!stopped) {
              this.lastBuiltPos = { ...prev };
            }
          }
          this.prevPlacedPos = { ...gridPos };
        } else {
          const isOccupied = cell && (cell.type === CellType.Road || cell.type === CellType.Connector || cell.type === CellType.House || cell.type === CellType.Business);

          if (isOccupied) {
            this.prevPlacedPos = { ...gridPos };
            // Detect redirect: house with 1+ connection or connector with 2+ (1 permanent + 1 external)
            if (cell) {
              const isHouseWithConn = cell.type === CellType.House && connectionCount(cell.roadConnections) >= 1;
              const isConnectorWithExternal = cell.type === CellType.Connector && connectionCount(cell.roadConnections) >= 2;
              if (isHouseWithConn || isConnectorWithExternal) {
                this.redirectSource = { ...gridPos };
              }
            }
          } else {
            this.prevPlacedPos = null;
            this.tryPlace(gridPos.gx, gridPos.gy);
            this.prevPlacedPos = { ...gridPos };
          }
          this.lastBuiltPos = { ...gridPos };
        }
      } else if (this.lastGridPos) {
        // Dragging — interpolate between previous and current mouse positions
        const { canvasX, canvasY } = this.input.state;
        const prevCX = this.prevCanvasX ?? canvasX;
        const prevCY = this.prevCanvasY ?? canvasY;

        // Sample the mouse path between frames in steps of ~0.4 tiles
        const mouseDist = Math.sqrt((canvasX - prevCX) ** 2 + (canvasY - prevCY) ** 2);
        const stepSize = TILE_SIZE * 0.4;
        const sampleCount = Math.max(1, Math.ceil(mouseDist / stepSize));

        for (let s = 1; s <= sampleCount; s++) {
          const t = s / sampleCount;
          const sx = prevCX + (canvasX - prevCX) * t;
          const sy = prevCY + (canvasY - prevCY) * t;

          const nextCell = this.computeNextDragCell(this.lastGridPos, sx, sy);
          if (!nextCell) continue;
          if (nextCell.gx < 0 || nextCell.gx >= GRID_COLS || nextCell.gy < 0 || nextCell.gy >= GRID_ROWS) continue;

          // Handle connection redirect: dragging from a house/connector with existing road
          if (this.redirectSource) {
            const src = this.redirectSource;
            const srcCell = this.grid.getCell(src.gx, src.gy);
            const targetCell = this.grid.getCell(nextCell.gx, nextCell.gy);
            if (srcCell && targetCell && targetCell.type === CellType.Empty) {
              // Must be adjacent to the redirect source
              const ddx = nextCell.gx - src.gx;
              const ddy = nextCell.gy - src.gy;
              if (Math.max(Math.abs(ddx), Math.abs(ddy)) === 1) {
                const oldRoad = this.findExternalRoadNeighbor(src.gx, src.gy);
                if (oldRoad) {
                  // Snapshot for undo
                  this.undoSystem?.snapshotCellAndNeighbors(oldRoad.gx, oldRoad.gy);
                  this.undoSystem?.snapshotCellAndNeighbors(src.gx, src.gy);
                  this.undoSystem?.snapshotCellAndNeighbors(nextCell.gx, nextCell.gy);

                  // Disconnect source from old road (don't delete the road cell)
                  const oldDir = directionFromDelta(oldRoad.gx - src.gx, oldRoad.gy - src.gy);
                  srcCell.roadConnections &= ~oldDir;
                  const oldRoadCell = this.grid.getCell(oldRoad.gx, oldRoad.gy);
                  if (oldRoadCell) {
                    oldRoadCell.roadConnections &= ~opposite(oldDir);
                  }
                  this.roadSystem.markDirty();

                  // Place new road and connect
                  this.tryPlace(nextCell.gx, nextCell.gy);
                  this.roadSystem.connectRoads(src.gx, src.gy, nextCell.gx, nextCell.gy);

                  this.redirectSource = null;
                  this.prevPlacedPos = { ...nextCell };
                  this.lastGridPos = { ...nextCell };
                  this.lastBuiltPos = { ...nextCell };
                  continue;
                }
              }
            }
            // If we dragged but couldn't redirect (e.g. not adjacent or not empty), skip
            continue;
          }

          const c = this.grid.getCell(nextCell.gx, nextCell.gy);
          if (c && c.type === CellType.House) {
            this.prevPlacedPos = this.lastGridPos;
            if (this.tryConnectToHouse(nextCell.gx, nextCell.gy)) {
              this.lastGridPos = { ...nextCell };
              this.lastBuiltPos = { ...nextCell };
              break;
            }
          }
          this.tryPlace(nextCell.gx, nextCell.gy);
          if (this.prevPlacedPos && (this.prevPlacedPos.gx !== nextCell.gx || this.prevPlacedPos.gy !== nextCell.gy)) {
            this.roadSystem.connectRoads(this.prevPlacedPos.gx, this.prevPlacedPos.gy, nextCell.gx, nextCell.gy);
          }
          this.prevPlacedPos = { ...nextCell };
          this.lastGridPos = { ...nextCell };
          this.lastBuiltPos = { ...nextCell };
        }

        this.prevCanvasX = canvasX;
        this.prevCanvasY = canvasY;
      }
    }

    if (rightDown) {
      if (!this.wasRightDown) {
        this.undoSystem?.beginGroup();
        this.lastGridPos = { ...gridPos };

        if (isEraser && this.input.state.shiftDown && this.lastBuiltPos) {
          // Shift-click erase: find A* path and erase along it
          const path = findRoadPlacementPath(this.grid, this.lastBuiltPos, gridPos);
          if (path) {
            for (const p of path) {
              this.tryErase(p.gx, p.gy);
            }
            this.lastBuiltPos = { ...gridPos };
          }
        } else {
          this.tryErase(gridPos.gx, gridPos.gy);
          this.lastBuiltPos = { ...gridPos };
        }
      } else if (this.lastGridPos && (gridPos.gx !== this.lastGridPos.gx || gridPos.gy !== this.lastGridPos.gy)) {
        this.bresenhamLine(this.lastGridPos.gx, this.lastGridPos.gy, gridPos.gx, gridPos.gy, (x, y) => {
          this.tryErase(x, y);
        });
        this.lastGridPos = { ...gridPos };
        this.lastBuiltPos = { ...gridPos };
      }
    }

    if (!leftDown && this.wasLeftDown) {
      this.undoSystem?.endGroup();
    }
    if (!rightDown && this.wasRightDown) {
      this.undoSystem?.endGroup();
    }

    if (!leftDown && !rightDown) {
      this.lastGridPos = null;
      this.prevPlacedPos = null;
      this.prevCanvasX = null;
      this.prevCanvasY = null;
      this.redirectSource = null;
    }

    this.wasLeftDown = leftDown;
    this.wasRightDown = rightDown;
  }

  private computeNextDragCell(lastPos: GridPos, canvasX: number, canvasY: number): GridPos | null {
    // Center of the current cell in world coordinates
    const cx = (lastPos.gx + 0.5) * TILE_SIZE;
    const cy = (lastPos.gy + 0.5) * TILE_SIZE;
    const dx = canvasX - cx;
    const dy = canvasY - cy;
    const distSq = dx * dx + dy * dy;

    if (distSq < DRAG_THRESHOLD_SQ) return null;

    // Quantize direction to 8-way
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    let dir: Direction;
    if (adx > 2 * ady) {
      dir = dx >= 0 ? Direction.Right : Direction.Left;
    } else if (ady > 2 * adx) {
      dir = dy >= 0 ? Direction.Down : Direction.Up;
    } else if (dx > 0 && dy > 0) {
      dir = Direction.DownRight;
    } else if (dx > 0 && dy < 0) {
      dir = Direction.UpRight;
    } else if (dx < 0 && dy > 0) {
      dir = Direction.DownLeft;
    } else {
      dir = Direction.UpLeft;
    }

    const off = this.grid.getDirectionOffset(dir);
    return { gx: lastPos.gx + off.gx, gy: lastPos.gy + off.gy };
  }

  private tryPlace(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;

    if (!this.money.canAfford(ROAD_COST)) return;
    this.undoSystem?.snapshotCellAndNeighbors(gx, gy);
    if (this.roadSystem.placeRoad(gx, gy)) {
      this.money.spend(ROAD_COST);
      this.undoSystem?.addMoneyDelta(-ROAD_COST);
      this.onRoadPlace?.();
    }
  }

  private tryErase(gx: number, gy: number): void {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;
    // If a delegate is set, let it decide (immediate delete vs pending)
    if (this.onTryErase) {
      this.undoSystem?.snapshotCellAndNeighbors(gx, gy);
      if (this.onTryErase(gx, gy)) {
        this.onRoadDelete?.();
      }
      return;
    }
    this.undoSystem?.snapshotCellAndNeighbors(gx, gy);
    if (this.roadSystem.removeRoad(gx, gy)) {
      this.money.refund(ROAD_REFUND);
      this.undoSystem?.addMoneyDelta(ROAD_REFUND);
      this.onRoadDelete?.();
    }
  }

  /** Try to connect an adjacent road to a house cell. */
  private tryConnectToHouse(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.House || !cell.entityId) return false;
    if (!this.prevPlacedPos) return false;

    // Must be adjacent (Chebyshev distance 1) from prevPlacedPos
    const dx = gx - this.prevPlacedPos.gx;
    const dy = gy - this.prevPlacedPos.gy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;

    // Connect the road to the house directly
    this.undoSystem?.snapshotCellAndNeighbors(gx, gy);
    this.roadSystem.connectRoads(this.prevPlacedPos.gx, this.prevPlacedPos.gy, gx, gy);
    this.lastBuiltPos = { gx, gy };
    return true;
  }

  /** Find the adjacent road cell connected to a house/connector (skipping ParkingLot for connectors). */
  private findExternalRoadNeighbor(gx: number, gy: number): GridPos | null {
    const cell = this.grid.getCell(gx, gy);
    if (!cell) return null;
    let result: GridPos | null = null;
    forEachDirection(cell.roadConnections, (dir) => {
      if (result) return;
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (!neighbor) return;
      // For connectors, skip the permanent inward connection to ParkingLot
      if (cell.type === CellType.Connector && neighbor.cell.type === CellType.ParkingLot) return;
      if (neighbor.cell.type === CellType.Road) {
        result = { gx: neighbor.gx, gy: neighbor.gy };
      }
    });
    return result;
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

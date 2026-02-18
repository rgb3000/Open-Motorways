import type { InputHandler } from './InputHandler';
import type { HighwaySystem } from '../systems/HighwaySystem';
import type { Grid } from '../core/Grid';
import type { MoneyInterface } from './RoadDrawer';
import type { GridPos } from '../types';
import { CellType, Tool } from '../types';
import { HIGHWAY_COST, HIGHWAY_REFUND } from '../constants';
import { defaultControlPoints } from '../highways/highwayGeometry';

export type HighwayPhase = 'idle' | 'awaiting-second-click' | 'placing';

export interface HighwayPlacementState {
  phase: HighwayPhase;
  firstPos: GridPos | null;
  activeHighwayId: string | null;
  draggingCp: 'cp1' | 'cp2' | null;
}

const CP_HIT_RADIUS = 20; // px

export class HighwayDrawer {
  private input: InputHandler;
  private highwaySystem: HighwaySystem;
  private grid: Grid;
  private money: MoneyInterface;
  private getActiveTool: () => Tool;

  private phase: HighwayPhase = 'idle';
  private firstPos: GridPos | null = null;
  private activeHighwayId: string | null = null;
  private draggingCp: 'cp1' | 'cp2' | null = null;
  private wasLeftDown = false;
  private wasRightDown = false;

  onHighwayPlace: (() => void) | null = null;
  onHighwayDelete: (() => void) | null = null;

  constructor(
    input: InputHandler,
    highwaySystem: HighwaySystem,
    grid: Grid,
    money: MoneyInterface,
    getActiveTool: () => Tool,
  ) {
    this.input = input;
    this.highwaySystem = highwaySystem;
    this.grid = grid;
    this.money = money;
    this.getActiveTool = getActiveTool;
  }

  getPlacementState(): HighwayPlacementState | null {
    if (this.getActiveTool() !== Tool.Highway) return null;
    return {
      phase: this.phase,
      firstPos: this.firstPos,
      activeHighwayId: this.activeHighwayId,
      draggingCp: this.draggingCp,
    };
  }

  update(): void {
    if (this.getActiveTool() !== Tool.Highway) {
      // If we were mid-placement, finalize
      if (this.phase !== 'idle') {
        this.finalize();
      }
      return;
    }

    const { gridPos, leftDown, rightDown, canvasX, canvasY } = this.input.state;

    // Right-click cancels
    if (rightDown && !this.wasRightDown) {
      if (this.phase === 'awaiting-second-click') {
        this.phase = 'idle';
        this.firstPos = null;
      } else if (this.phase === 'placing' && this.activeHighwayId) {
        // Cancel: remove the highway and refund
        this.highwaySystem.removeHighway(this.activeHighwayId);
        this.money.refund(HIGHWAY_COST);
        this.phase = 'idle';
        this.activeHighwayId = null;
        this.draggingCp = null;
      }
      this.wasLeftDown = leftDown;
      this.wasRightDown = rightDown;
      return;
    }

    if (this.phase === 'idle') {
      if (leftDown && !this.wasLeftDown) {
        // Click on a road or connector cell → start first point
        if (this.isValidEndpoint(gridPos.gx, gridPos.gy)) {
          this.firstPos = { ...gridPos };
          this.phase = 'awaiting-second-click';
        }
      }
    } else if (this.phase === 'awaiting-second-click') {
      if (leftDown && !this.wasLeftDown) {
        if (this.isValidEndpoint(gridPos.gx, gridPos.gy) && this.firstPos &&
            !(gridPos.gx === this.firstPos.gx && gridPos.gy === this.firstPos.gy)) {
          // Check we can afford it
          if (!this.money.canAfford(HIGHWAY_COST)) {
            this.wasLeftDown = leftDown;
            this.wasRightDown = rightDown;
            return;
          }

          // Create highway with default control points
          const { cp1, cp2 } = defaultControlPoints(this.firstPos, gridPos);
          const hw = this.highwaySystem.addHighway(this.firstPos, gridPos, cp1, cp2);
          this.money.spend(HIGHWAY_COST);
          this.activeHighwayId = hw.id;
          this.phase = 'placing';
          this.onHighwayPlace?.();
        }
      }
    } else if (this.phase === 'placing') {
      if (leftDown && !this.wasLeftDown) {
        // Check if clicking on a control point
        if (this.activeHighwayId) {
          const hw = this.highwaySystem.getById(this.activeHighwayId);
          if (hw) {
            const cp = this.hitTestControlPoint(canvasX, canvasY, hw.cp1, hw.cp2);
            if (cp) {
              this.draggingCp = cp;
            } else {
              // Click elsewhere → finalize
              this.finalize();
            }
          }
        }
      } else if (leftDown && this.draggingCp && this.activeHighwayId) {
        // Dragging control point
        const hw = this.highwaySystem.getById(this.activeHighwayId);
        if (hw) {
          const newCp1 = this.draggingCp === 'cp1' ? { x: canvasX, y: canvasY } : hw.cp1;
          const newCp2 = this.draggingCp === 'cp2' ? { x: canvasX, y: canvasY } : hw.cp2;
          this.highwaySystem.updateControlPoints(this.activeHighwayId, newCp1, newCp2);
        }
      } else if (!leftDown && this.wasLeftDown && this.draggingCp) {
        // Released drag
        this.draggingCp = null;
      }
    }

    this.wasLeftDown = leftDown;
    this.wasRightDown = rightDown;
  }

  /** Try to erase a highway at the given cell */
  tryEraseAtCell(gx: number, gy: number): boolean {
    const highways = this.highwaySystem.getHighwaysAtCell(gx, gy);
    if (highways.length === 0) return false;
    for (const hw of highways) {
      this.highwaySystem.removeHighway(hw.id);
      this.money.refund(HIGHWAY_REFUND);
    }
    return highways.length > 0;
  }

  private finalize(): void {
    this.phase = 'idle';
    this.firstPos = null;
    this.activeHighwayId = null;
    this.draggingCp = null;
  }

  private isValidEndpoint(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell) return false;
    return cell.type === CellType.Road || cell.type === CellType.Connector;
  }

  private hitTestControlPoint(
    worldX: number, worldY: number,
    cp1: { x: number; y: number }, cp2: { x: number; y: number },
  ): 'cp1' | 'cp2' | null {
    const d1 = Math.sqrt((worldX - cp1.x) ** 2 + (worldY - cp1.y) ** 2);
    const d2 = Math.sqrt((worldX - cp2.x) ** 2 + (worldY - cp2.y) ** 2);
    if (d1 < CP_HIT_RADIUS && d1 <= d2) return 'cp1';
    if (d2 < CP_HIT_RADIUS) return 'cp2';
    return null;
  }
}

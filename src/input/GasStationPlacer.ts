import type { InputHandler } from './InputHandler';
import type { GasStationSystem } from '../systems/GasStationSystem';
import type { Grid } from '../core/Grid';
import type { MoneyInterface } from './RoadDrawer';
import { CellType, Tool } from '../types';
import { GAS_STATION_COST } from '../constants';

export class GasStationPlacer {
  private input: InputHandler;
  private gasStationSystem: GasStationSystem;
  private grid: Grid;
  private money: MoneyInterface;
  private getActiveTool: () => Tool;
  private wasLeftDown = false;

  onGasStationPlace: (() => void) | null = null;

  constructor(
    input: InputHandler,
    gasStationSystem: GasStationSystem,
    grid: Grid,
    money: MoneyInterface,
    getActiveTool: () => Tool,
  ) {
    this.input = input;
    this.gasStationSystem = gasStationSystem;
    this.grid = grid;
    this.money = money;
    this.getActiveTool = getActiveTool;
  }

  update(): void {
    if (this.getActiveTool() !== Tool.GasStation) {
      this.wasLeftDown = this.input.state.leftDown;
      return;
    }

    const { gridPos, leftDown } = this.input.state;

    if (leftDown && !this.wasLeftDown) {
      if (!this.money.canAfford(GAS_STATION_COST)) {
        this.wasLeftDown = leftDown;
        return;
      }

      // Try horizontal placement first (clicked cell = entry connector)
      if (this.canPlace(gridPos.gx, gridPos.gy, 'horizontal')) {
        const station = this.gasStationSystem.placeGasStation(gridPos, 'horizontal');
        if (station) {
          this.money.spend(GAS_STATION_COST);
          this.onGasStationPlace?.();
        }
      } else if (this.canPlace(gridPos.gx, gridPos.gy, 'vertical')) {
        // Fall back to vertical
        const station = this.gasStationSystem.placeGasStation(gridPos, 'vertical');
        if (station) {
          this.money.spend(GAS_STATION_COST);
          this.onGasStationPlace?.();
        }
      }
    }

    this.wasLeftDown = leftDown;
  }

  private canPlace(gx: number, gy: number, orientation: 'horizontal' | 'vertical'): boolean {
    const positions = orientation === 'horizontal'
      ? [{ gx, gy }, { gx: gx + 1, gy }, { gx: gx + 2, gy }, { gx: gx + 3, gy }]
      : [{ gx, gy }, { gx, gy: gy + 1 }, { gx, gy: gy + 2 }, { gx, gy: gy + 3 }];

    for (const pos of positions) {
      if (!this.grid.inBounds(pos.gx, pos.gy)) return false;
      const cell = this.grid.getCell(pos.gx, pos.gy);
      if (!cell || cell.type !== CellType.Empty) return false;
    }
    return true;
  }
}

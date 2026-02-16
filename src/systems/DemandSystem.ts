import type { Business } from '../entities/Business';
import type { GameColor } from '../types';
import {
  DEMAND_AGE_INTERVAL,
  MAX_DEMAND_PINS,
} from '../constants';

export class DemandSystem {
  private _gameOver = false;
  private colorDemands: Map<GameColor, number> = new Map();

  get isGameOver(): boolean {
    return this._gameOver;
  }

  /** Returns total demand pins for a given color */
  getColorDemand(color: GameColor): number {
    return this.colorDemands.get(color) ?? 0;
  }

  /** Returns the full per-color demand map */
  getColorDemands(): Map<GameColor, number> {
    return this.colorDemands;
  }

  update(dt: number, businesses: Business[]): void {
    if (this._gameOver) return;

    // Reset per-color demand totals
    this.colorDemands.clear();

    for (const biz of businesses) {
      // Age the business
      biz.age += dt;

      // Compute target pins from age
      const targetPins = Math.min(
        Math.floor(biz.age / DEMAND_AGE_INTERVAL),
        MAX_DEMAND_PINS,
      );

      // Increment by at most 1 per update call (smooth ramp)
      if (biz.demandPins < targetPins) {
        biz.demandPins++;
      }

      // Accumulate per-color demand
      const prev = this.colorDemands.get(biz.color) ?? 0;
      this.colorDemands.set(biz.color, prev + biz.demandPins);

      // Game over check
      if (biz.demandPins >= MAX_DEMAND_PINS) {
        this._gameOver = true;
        return;
      }
    }
  }

  reset(): void {
    this._gameOver = false;
    this.colorDemands.clear();
  }
}

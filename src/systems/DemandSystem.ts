import type { Business } from '../entities/Business';
import {
  DEMAND_INTERVAL_DECAY,
  INITIAL_DEMAND_INTERVAL,
  MAX_DEMAND_PINS,
  MIN_DEMAND_INTERVAL,
} from '../constants';

export class DemandSystem {
  private demandTimer = 0;
  private currentInterval = INITIAL_DEMAND_INTERVAL;
  private _gameOver = false;
  private _warning = false;

  get isGameOver(): boolean {
    return this._gameOver;
  }

  /** True for one frame when a business reaches the warning threshold. */
  get isWarning(): boolean {
    return this._warning;
  }

  update(dt: number, businesses: Business[]): void {
    this._warning = false;
    if (this._gameOver) return;

    this.demandTimer += dt;

    if (this.demandTimer >= this.currentInterval) {
      this.demandTimer = 0;
      this.currentInterval = Math.max(MIN_DEMAND_INTERVAL, this.currentInterval * DEMAND_INTERVAL_DECAY);
      this._warning = this.addDemand(businesses);
    }

    // Check game over
    for (const biz of businesses) {
      if (biz.demandPins >= MAX_DEMAND_PINS) {
        this._gameOver = true;
        return;
      }
    }
  }

  /** Returns true if a business just hit the warning threshold (2 below max). */
  private addDemand(businesses: Business[]): boolean {
    const eligible = businesses.filter(b => b.demandPins < MAX_DEMAND_PINS);
    if (eligible.length === 0) return false;
    const target = eligible[Math.floor(Math.random() * eligible.length)];
    target.demandPins++;
    return target.demandPins >= MAX_DEMAND_PINS - 2;
  }

  reset(): void {
    this.demandTimer = 0;
    this.currentInterval = INITIAL_DEMAND_INTERVAL;
    this._gameOver = false;
  }
}

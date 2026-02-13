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

  get isGameOver(): boolean {
    return this._gameOver;
  }

  update(dt: number, businesses: Business[]): void {
    if (this._gameOver) return;

    this.demandTimer += dt;

    if (this.demandTimer >= this.currentInterval) {
      this.demandTimer = 0;
      this.currentInterval = Math.max(MIN_DEMAND_INTERVAL, this.currentInterval * DEMAND_INTERVAL_DECAY);
      this.addDemand(businesses);
    }

    // Check game over
    for (const biz of businesses) {
      if (biz.demandPins >= MAX_DEMAND_PINS) {
        this._gameOver = true;
        return;
      }
    }
  }

  private addDemand(businesses: Business[]): void {
    // Add demand to a random non-full business
    const eligible = businesses.filter(b => b.demandPins < MAX_DEMAND_PINS);
    if (eligible.length === 0) return;
    const target = eligible[Math.floor(Math.random() * eligible.length)];
    target.demandPins++;
  }

  reset(): void {
    this.demandTimer = 0;
    this.currentInterval = INITIAL_DEMAND_INTERVAL;
    this._gameOver = false;
  }
}

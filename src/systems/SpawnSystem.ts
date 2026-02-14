import type { Grid } from '../core/Grid';
import { House } from '../entities/House';
import { Business } from '../entities/Business';
import { CellType, type GameColor, type GridPos } from '../types';
import {
  COLOR_UNLOCK_ORDER,
  COLOR_UNLOCK_INTERVAL,
  GRID_COLS,
  GRID_ROWS,
  HOUSE_CLUSTER_RADIUS,
  HOUSE_SPAWN_PROBABILITY,
  INITIAL_SPAWN_DELAY,
  MIN_BUSINESS_DISTANCE,
  MIN_SPAWN_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_INTERVAL_DECAY,
} from '../constants';
import { manhattanDist } from '../utils/math';

export class SpawnSystem {
  private houses: House[] = [];
  private businesses: Business[] = [];
  private unlockedColors: GameColor[] = [COLOR_UNLOCK_ORDER[0]];
  private nextColorIndex = 1;
  private elapsedTime = 0;
  private nextColorUnlockTime = INITIAL_SPAWN_DELAY;
  private spawnTimer = 0;
  private currentSpawnInterval = SPAWN_INTERVAL;
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  getHouses(): House[] {
    return this.houses;
  }

  getBusinesses(): Business[] {
    return this.businesses;
  }

  getUnlockedColors(): GameColor[] {
    return this.unlockedColors;
  }

  spawnInitial(): void {
    const hx = Math.floor(GRID_COLS * 0.3) + Math.floor(Math.random() * 5 - 2);
    const hy = Math.floor(GRID_ROWS * 0.5) + Math.floor(Math.random() * 3 - 1);
    this.spawnHouse({ gx: hx, gy: hy }, COLOR_UNLOCK_ORDER[0]);

    const bx = Math.floor(GRID_COLS * 0.7) + Math.floor(Math.random() * 5 - 2);
    const by = Math.floor(GRID_ROWS * 0.5) + Math.floor(Math.random() * 3 - 1);
    this.spawnBusiness({ gx: bx, gy: by }, COLOR_UNLOCK_ORDER[0]);
  }

  update(dt: number): void {
    this.elapsedTime += dt;

    if (this.nextColorIndex < COLOR_UNLOCK_ORDER.length && this.elapsedTime >= this.nextColorUnlockTime) {
      const newColor = COLOR_UNLOCK_ORDER[this.nextColorIndex];
      this.unlockedColors.push(newColor);
      this.nextColorIndex++;
      this.nextColorUnlockTime += COLOR_UNLOCK_INTERVAL;
      this.spawnPairForColor(newColor);
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.currentSpawnInterval) {
      this.spawnTimer = 0;
      this.currentSpawnInterval = Math.max(MIN_SPAWN_INTERVAL, this.currentSpawnInterval * SPAWN_INTERVAL_DECAY);
      this.spawnRandom();
    }
  }

  private spawnRandom(): void {
    const color = this.unlockedColors[Math.floor(Math.random() * this.unlockedColors.length)];

    if (Math.random() < HOUSE_SPAWN_PROBABILITY) {
      this.trySpawnHouseForColor(color);
    } else {
      this.trySpawnBusinessForColor(color);
    }
  }

  private spawnPairForColor(color: GameColor): void {
    this.trySpawnHouseForColor(color);
    this.trySpawnBusinessForColor(color);
  }

  private trySpawnHouseForColor(color: GameColor): void {
    const sameColorHouses = this.houses.filter(h => h.color === color);

    let pos: GridPos | null = null;

    if (sameColorHouses.length > 0) {
      const anchor = sameColorHouses[Math.floor(Math.random() * sameColorHouses.length)];
      pos = this.findEmptyNear(anchor.pos, HOUSE_CLUSTER_RADIUS);
    }

    if (!pos) {
      pos = this.findRandomEmpty();
    }

    if (pos) {
      this.spawnHouse(pos, color);
    }
  }

  private trySpawnBusinessForColor(color: GameColor): void {
    const sameColorHouses = this.houses.filter(h => h.color === color);

    let pos: GridPos | null = null;

    if (sameColorHouses.length > 0) {
      pos = this.findEmptyFarFrom(sameColorHouses.map(h => h.pos), MIN_BUSINESS_DISTANCE);
    }

    if (!pos) {
      pos = this.findRandomEmpty();
    }

    if (pos) {
      this.spawnBusiness(pos, color);
    }
  }

  private spawnHouse(pos: GridPos, color: GameColor): void {
    const house = new House(pos, color);
    this.houses.push(house);
    this.grid.setCell(pos.gx, pos.gy, {
      type: CellType.House,
      entityId: house.id,
      color,
      hasBridge: false,
      bridgeAxis: null,
      bridgeConnections: [],
    });
  }

  private spawnBusiness(pos: GridPos, color: GameColor): void {
    const business = new Business(pos, color);
    this.businesses.push(business);
    this.grid.setCell(pos.gx, pos.gy, {
      type: CellType.Business,
      entityId: business.id,
      color,
      hasBridge: false,
      bridgeAxis: null,
      bridgeConnections: [],
    });
  }

  private findEmptyNear(center: GridPos, radius: number): GridPos | null {
    const candidates: GridPos[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const gx = center.gx + dx;
        const gy = center.gy + dy;
        const cell = this.grid.getCell(gx, gy);
        if (cell && cell.type === CellType.Empty) {
          candidates.push({ gx, gy });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findEmptyFarFrom(positions: GridPos[], minDist: number): GridPos | null {
    const empty = this.grid.getEmptyCells();
    const far = empty.filter(pos => {
      return positions.every(p => manhattanDist(pos, p) >= minDist);
    });
    if (far.length === 0) return null;
    return far[Math.floor(Math.random() * far.length)];
  }

  private findRandomEmpty(): GridPos | null {
    const empty = this.grid.getEmptyCells();
    if (empty.length === 0) return null;
    return empty[Math.floor(Math.random() * empty.length)];
  }
}

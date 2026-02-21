import { type Grid } from '../core/Grid';
import { opposite } from '../utils/direction';
import { House } from '../entities/House';
import { Business } from '../entities/Business';
import { CellType, type GameColor, type GridPos, type BusinessRotation } from '../types';
import type { DemandSystem } from './DemandSystem';
import {
  COLOR_UNLOCK_ORDER,
  COLOR_UNLOCK_INTERVAL,
  HOUSE_SUPPLY_PER_MINUTE,
  HOUSE_CLUSTER_RADIUS,
  INITIAL_SPAWN_DELAY,
  SPAWN_AREA_INTERVALS,
  MIN_SPAWN_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_INTERVAL_DECAY,
} from '../constants';
import type { GameConstants } from '../maps/types';

const ALL_ROTATIONS: BusinessRotation[] = [0, 90, 180, 270];

interface Empty2x2 {
  pos: GridPos;
  rotation: BusinessRotation;
}

export class SpawnSystem {
  private houses: House[] = [];
  private businesses: Business[] = [];
  private unlockedColors: GameColor[] = [COLOR_UNLOCK_ORDER[0]];
  private nextColorIndex = 1;
  private elapsedTime = 0;
  private nextColorUnlockTime: number;
  private spawnTimer = 0;
  private currentSpawnInterval: number;
  private grid: Grid;
  private demandSystem: DemandSystem;
  private dirty = false;
  onSpawn: (() => void) | null = null;
  private colorUnlockInterval: number;
  private houseClusterRadius: number;
  private minSpawnInterval: number;
  private spawnIntervalDecay: number;
  private houseSupplyPerMinute: number;

  get isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  constructor(grid: Grid, demandSystem: DemandSystem, config?: Partial<GameConstants>) {
    this.grid = grid;
    this.demandSystem = demandSystem;
    this.nextColorUnlockTime = config?.INITIAL_SPAWN_DELAY ?? INITIAL_SPAWN_DELAY;
    this.currentSpawnInterval = config?.SPAWN_INTERVAL ?? SPAWN_INTERVAL;
    this.colorUnlockInterval = config?.COLOR_UNLOCK_INTERVAL ?? COLOR_UNLOCK_INTERVAL;
    this.houseClusterRadius = config?.HOUSE_CLUSTER_RADIUS ?? HOUSE_CLUSTER_RADIUS;
    this.minSpawnInterval = config?.MIN_SPAWN_INTERVAL ?? MIN_SPAWN_INTERVAL;
    this.spawnIntervalDecay = config?.SPAWN_INTERVAL_DECAY ?? SPAWN_INTERVAL_DECAY;
    this.houseSupplyPerMinute = config?.HOUSE_SUPPLY_PER_MINUTE ?? HOUSE_SUPPLY_PER_MINUTE;
  }

  getHouses(): House[] {
    return this.houses;
  }

  getBusinesses(): Business[] {
    return this.businesses;
  }

  removeHouse(id: string): void {
    this.houses = this.houses.filter(h => h.id !== id);
    this.dirty = true;
  }

  removeBusiness(id: string): void {
    this.businesses = this.businesses.filter(b => b.id !== id);
    this.dirty = true;
  }

  getUnlockedColors(): GameColor[] {
    return this.unlockedColors;
  }

  unlockAllColors(): void {
    for (let i = this.nextColorIndex; i < COLOR_UNLOCK_ORDER.length; i++) {
      this.unlockedColors.push(COLOR_UNLOCK_ORDER[i]);
    }
    this.nextColorIndex = COLOR_UNLOCK_ORDER.length;
  }

  spawnInitial(): void {
    const hx = Math.floor(this.grid.cols * 0.45) + Math.floor(Math.random() * 5 - 2);
    const hy = Math.floor(this.grid.rows * 0.45) + Math.floor(Math.random() * 3 - 1);
    this.spawnHouse({ gx: hx, gy: hy }, COLOR_UNLOCK_ORDER[0]);

    // For initial business, find a 2x2 spot near desired location
    const bx = Math.floor(this.grid.cols * 0.55) + Math.floor(Math.random() * 5 - 2);
    const by = Math.floor(this.grid.rows * 0.55) + Math.floor(Math.random() * 3 - 1);
    const spot = this.findEmpty2x2Near({ gx: bx, gy: by }, 5, COLOR_UNLOCK_ORDER[0]);
    if (spot) {
      this.spawnBusiness(spot.pos, COLOR_UNLOCK_ORDER[0], spot.rotation);
    }
  }

  update(dt: number): void {
    this.elapsedTime += dt;

    if (this.nextColorIndex < COLOR_UNLOCK_ORDER.length && this.elapsedTime >= this.nextColorUnlockTime) {
      const newColor = COLOR_UNLOCK_ORDER[this.nextColorIndex];
      this.unlockedColors.push(newColor);
      this.nextColorIndex++;
      this.nextColorUnlockTime += this.colorUnlockInterval;
      this.spawnPairForColor(newColor);
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.currentSpawnInterval) {
      this.spawnTimer = 0;
      this.currentSpawnInterval = Math.max(this.minSpawnInterval, this.currentSpawnInterval * this.spawnIntervalDecay);
      this.spawnRandom();
    }
  }

  private spawnRandom(): void {
    // Compute per-color balance: supplyRate - demandRate
    const balances = this.unlockedColors.map(color => {
      const demandRate = this.demandSystem.getColorPinOutputRate(color);
      const houseCount = this.houses.filter(h => h.color === color).length;
      const supplyRate = houseCount * this.houseSupplyPerMinute;
      return { color, balance: supplyRate - demandRate };
    });

    // Find most under-supplied color (most negative balance = needs houses)
    // Find most over-supplied color (most positive balance = can absorb more demand)
    const sorted = [...balances].sort((a, b) => a.balance - b.balance);
    const mostDeficit = sorted[0];
    const mostSurplus = sorted[sorted.length - 1];

    // Decide house vs business: if any color has deficit, spawn house; otherwise spawn business
    if (mostDeficit.balance < 0) {
      this.trySpawnHouseForColor(mostDeficit.color);
    } else {
      // All colors have surplus or are balanced → spawn a business for the color with most surplus
      this.trySpawnBusinessForColor(mostSurplus.color);
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
      pos = this.findEmptyNear(anchor.pos, this.houseClusterRadius);
    }

    if (!pos) {
      pos = this.findRandomEmpty();
    }

    if (pos) {
      this.spawnHouse(pos, color);
    }
  }

  private trySpawnBusinessForColor(color: GameColor): void {
    const spot = this.findRandomEmpty2x2(color);
    if (spot) {
      this.spawnBusiness(spot.pos, color, spot.rotation);
    }
  }

  spawnHouse(pos: GridPos, color: GameColor): void {
    this.dirty = true;

    const house = new House(pos, color);
    this.houses.push(house);
    this.onSpawn?.();

    // House cell — roads connect directly to this cell
    this.grid.setCell(pos.gx, pos.gy, {
      type: CellType.House,
      entityId: house.id,
      color,
      connectorDir: null,
    });
  }

  spawnBusiness(pos: GridPos, color: GameColor, rotation: BusinessRotation): void {
    this.dirty = true;
    const business = new Business(pos, color, rotation);
    this.businesses.push(business);
    this.onSpawn?.();

    // Building cell
    this.grid.setCell(business.buildingPos.gx, business.buildingPos.gy, {
      type: CellType.Business,
      entityId: business.id,
      color,
      connectorDir: null,
    });

    // Pins cell (also CellType.Business to block road placement)
    this.grid.setCell(business.pinsPos.gx, business.pinsPos.gy, {
      type: CellType.Business,
      entityId: business.id,
      color,
      connectorDir: null,
    });

    // Parking lot cell — connectorDir points toward the connector
    const connToParkingDir = business.getConnectorToParkingDir();
    this.grid.setCell(business.parkingLotPos.gx, business.parkingLotPos.gy, {
      type: CellType.ParkingLot,
      entityId: business.id,
      color,
      connectorDir: opposite(connToParkingDir),
    });

    // Connector cell owned by the business
    this.grid.setCell(business.connectorPos.gx, business.connectorPos.gy, {
      type: CellType.Connector,
      entityId: business.id,
      color: null,
      roadConnections: connToParkingDir,
      connectorDir: null,
    });
  }

  getSpawnBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const totalEntities = this.houses.length + this.businesses.length;
    let inset = SPAWN_AREA_INTERVALS[0].inset;
    for (const interval of SPAWN_AREA_INTERVALS) {
      if (totalEntities >= interval.threshold) {
        inset = interval.inset;
      }
    }
    return {
      minX: Math.floor(this.grid.cols * inset),
      maxX: Math.floor(this.grid.cols * (1 - inset)) - 1,
      minY: Math.floor(this.grid.rows * inset),
      maxY: Math.floor(this.grid.rows * (1 - inset)) - 1,
    };
  }

  private isInBounds(gx: number, gy: number): boolean {
    const b = this.getSpawnBounds();
    return gx >= b.minX && gx <= b.maxX && gy >= b.minY && gy <= b.maxY;
  }

  private findEmpty2x2Near(center: GridPos, radius: number, color?: GameColor): Empty2x2 | null {
    const candidates: Empty2x2[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const gx = center.gx + dx;
        const gy = center.gy + dy;
        if (!this.isInBounds(gx, gy)) continue;
        this.try2x2Candidates(gx, gy, candidates);
      }
    }
    let filtered = candidates;
    if (color !== undefined) {
      filtered = candidates.filter(spot => this.isFarFromSameColorHouses(spot.pos, color, 2));
    }
    if (filtered.length === 0) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  private findRandomEmpty2x2(color?: GameColor): Empty2x2 | null {
    let candidates = this.getAllEmpty2x2().filter(spot => this.isInBounds(spot.pos.gx, spot.pos.gy));
    if (color !== undefined) {
      candidates = candidates.filter(spot => this.isFarFromSameColorHouses(spot.pos, color, 2));
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private getAllEmpty2x2(): Empty2x2[] {
    const results: Empty2x2[] = [];
    for (let gy = 0; gy < this.grid.rows - 1; gy++) {
      for (let gx = 0; gx < this.grid.cols - 1; gx++) {
        this.try2x2Candidates(gx, gy, results);
      }
    }
    return results;
  }

  private try2x2Candidates(gx: number, gy: number, results: Empty2x2[]): void {
    // Check all 4 cells of the 2x2 block are empty
    if (
      this.isCellEmpty(gx, gy) &&
      this.isCellEmpty(gx + 1, gy) &&
      this.isCellEmpty(gx, gy + 1) &&
      this.isCellEmpty(gx + 1, gy + 1)
    ) {
      // All 4 rotations are valid for any empty 2x2 block; pick one randomly
      const rotation = ALL_ROTATIONS[Math.floor(Math.random() * ALL_ROTATIONS.length)];
      results.push({ pos: { gx, gy }, rotation });
    }
  }

  private isCellEmpty(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    return cell !== null && cell.type === CellType.Empty;
  }

  private isFarFromSameColorHouses(pos: GridPos, color: GameColor, minDist: number): boolean {
    for (const house of this.houses) {
      if (house.color !== color) continue;
      const dx = Math.abs(pos.gx - house.pos.gx);
      const dy = Math.abs(pos.gy - house.pos.gy);
      if (Math.max(dx, dy) < minDist) return false;
    }
    return true;
  }

  private findEmptyNear(center: GridPos, radius: number): GridPos | null {
    const candidates: GridPos[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const gx = center.gx + dx;
        const gy = center.gy + dy;
        if (!this.isInBounds(gx, gy)) continue;
        if (this.isCellEmpty(gx, gy)) {
          candidates.push({ gx, gy });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findRandomEmpty(): GridPos | null {
    const empty = this.grid.getEmptyCells()
      .filter(p => this.isInBounds(p.gx, p.gy));
    if (empty.length === 0) return null;
    return empty[Math.floor(Math.random() * empty.length)];
  }

}

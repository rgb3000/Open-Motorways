import { OPPOSITE_DIR, type Grid } from '../core/Grid';
import { House } from '../entities/House';
import { Business } from '../entities/Business';
import { CellType, Direction, type GameColor, type GridPos } from '../types';
import type { DemandSystem } from './DemandSystem';
import {
  COLOR_UNLOCK_ORDER,
  COLOR_UNLOCK_INTERVAL,
  HOUSE_SUPPLY_PER_MINUTE,
  HOUSE_CLUSTER_RADIUS,
  INITIAL_SPAWN_DELAY,
  SPAWN_AREA_INTERVALS,
  MIN_BUSINESS_DISTANCE,
  MIN_SPAWN_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_INTERVAL_DECAY,
} from '../constants';
import { manhattanDist } from '../utils/math';
import type { GameConstants } from '../maps/types';

interface EmptyLShape {
  pos: GridPos;
  orientation: 'horizontal' | 'vertical';
  connectorSide: 'positive' | 'negative';
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
  private minBusinessDistance: number;
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
    this.minBusinessDistance = config?.MIN_BUSINESS_DISTANCE ?? MIN_BUSINESS_DISTANCE;
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

    // For initial business, find an L-shape spot near desired location
    const bx = Math.floor(this.grid.cols * 0.55) + Math.floor(Math.random() * 5 - 2);
    const by = Math.floor(this.grid.rows * 0.55) + Math.floor(Math.random() * 3 - 1);
    const spot = this.findEmptyLShapeNear({ gx: bx, gy: by }, 5);
    if (spot) {
      this.spawnBusiness(spot.pos, COLOR_UNLOCK_ORDER[0], spot.orientation, spot.connectorSide);
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
      pos = this.findEmptyWithAdjacentEmpty(anchor.pos, this.houseClusterRadius);
    }

    if (!pos) {
      pos = this.findRandomEmptyWithAdjacentEmpty();
    }

    if (pos) {
      this.spawnHouse(pos, color);
    }
  }

  private trySpawnBusinessForColor(color: GameColor): void {
    const sameColorHouses = this.houses.filter(h => h.color === color);

    let spot: EmptyLShape | null = null;

    if (sameColorHouses.length > 0) {
      spot = this.findEmptyLShapeFarFrom(sameColorHouses.map(h => h.pos), this.minBusinessDistance);
    }

    if (!spot) {
      spot = this.findRandomEmptyLShape();
    }

    if (spot) {
      this.spawnBusiness(spot.pos, color, spot.orientation, spot.connectorSide);
    }
  }

  spawnHouse(pos: GridPos, color: GameColor, connectorDir?: Direction): void {
    this.dirty = true;

    // Find an empty adjacent cell for the connector
    let connDir: Direction;
    if (connectorDir !== undefined) {
      connDir = connectorDir;
    } else {
      const tryDirs = [
        Direction.Down, Direction.Right, Direction.Up, Direction.Left,
        Direction.DownRight, Direction.DownLeft, Direction.UpRight, Direction.UpLeft,
      ];
      connDir = Direction.Down;
      for (const dir of tryDirs) {
        const off = this.grid.getDirectionOffset(dir);
        const nx = pos.gx + off.gx;
        const ny = pos.gy + off.gy;
        if (this.isCellEmpty(nx, ny)) {
          connDir = dir;
          break;
        }
      }
    }

    const house = new House(pos, color, connDir);
    this.houses.push(house);
    this.onSpawn?.();

    // House cell
    this.grid.setCell(pos.gx, pos.gy, {
      type: CellType.House,
      entityId: house.id,
      color,
      connectorDir: connDir,
    });

    // Connector cell owned by the house
    const connToHouseDir = house.getConnectorToHouseDir();
    this.grid.setCell(house.connectorPos.gx, house.connectorPos.gy, {
      type: CellType.Connector,
      entityId: house.id,
      color: null,
      roadConnections: [connToHouseDir],
      connectorDir: null,
    });
  }

  spawnBusiness(
    pos: GridPos, color: GameColor,
    orientation: 'horizontal' | 'vertical',
    connectorSide: 'positive' | 'negative',
  ): void {
    this.dirty = true;
    const business = new Business(pos, color, orientation, connectorSide);
    this.businesses.push(business);
    this.onSpawn?.();

    // Building cell
    this.grid.setCell(pos.gx, pos.gy, {
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
      connectorDir: OPPOSITE_DIR[connToParkingDir],
    });

    // Connector cell owned by the business
    this.grid.setCell(business.connectorPos.gx, business.connectorPos.gy, {
      type: CellType.Connector,
      entityId: business.id,
      color: null,
      roadConnections: [connToParkingDir],
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

  private findEmptyLShapeNear(center: GridPos, radius: number): EmptyLShape | null {
    const candidates: EmptyLShape[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const gx = center.gx + dx;
        const gy = center.gy + dy;
        if (!this.isInBounds(gx, gy)) continue;
        this.tryLShapeCandidates(gx, gy, candidates);
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findEmptyLShapeFarFrom(positions: GridPos[], minDist: number): EmptyLShape | null {
    const candidates = this.getAllEmptyLShapes().filter(spot => this.isInBounds(spot.pos.gx, spot.pos.gy));
    const far = candidates.filter(spot => {
      return positions.every(p => manhattanDist(spot.pos, p) >= minDist);
    });
    if (far.length === 0) return null;
    return far[Math.floor(Math.random() * far.length)];
  }

  private findRandomEmptyLShape(): EmptyLShape | null {
    const candidates = this.getAllEmptyLShapes().filter(spot => this.isInBounds(spot.pos.gx, spot.pos.gy));
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private getAllEmptyLShapes(): EmptyLShape[] {
    const results: EmptyLShape[] = [];
    for (let gy = 0; gy < this.grid.rows; gy++) {
      for (let gx = 0; gx < this.grid.cols; gx++) {
        this.tryLShapeCandidates(gx, gy, results);
      }
    }
    return results;
  }

  private tryLShapeCandidates(gx: number, gy: number, results: EmptyLShape[]): void {
    // For each building position, try 2 orientations x 2 connector sides
    const orientations: Array<'horizontal' | 'vertical'> = ['horizontal', 'vertical'];
    const sides: Array<'positive' | 'negative'> = ['positive', 'negative'];

    for (const orientation of orientations) {
      for (const connectorSide of sides) {
        // Compute the 3 cell positions
        let parkingLot: GridPos;
        let connector: GridPos;

        if (orientation === 'horizontal') {
          parkingLot = { gx: gx + 1, gy };
          connector = {
            gx: gx + 1,
            gy: gy + (connectorSide === 'positive' ? 1 : -1),
          };
        } else {
          parkingLot = { gx, gy: gy + 1 };
          connector = {
            gx: gx + (connectorSide === 'positive' ? 1 : -1),
            gy: gy + 1,
          };
        }

        if (
          this.isCellEmpty(gx, gy) &&
          this.isCellEmpty(parkingLot.gx, parkingLot.gy) &&
          this.isCellEmpty(connector.gx, connector.gy)
        ) {
          results.push({ pos: { gx, gy }, orientation, connectorSide });
        }
      }
    }
  }

  private isCellEmpty(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    return cell !== null && cell.type === CellType.Empty;
  }

  private hasAdjacentEmpty(gx: number, gy: number): boolean {
    for (const dir of [Direction.Down, Direction.Right, Direction.Up, Direction.Left]) {
      const off = this.grid.getDirectionOffset(dir);
      if (this.isCellEmpty(gx + off.gx, gy + off.gy)) return true;
    }
    return false;
  }

  private findEmptyWithAdjacentEmpty(center: GridPos, radius: number): GridPos | null {
    const candidates: GridPos[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const gx = center.gx + dx;
        const gy = center.gy + dy;
        if (!this.isInBounds(gx, gy)) continue;
        if (this.isCellEmpty(gx, gy) && this.hasAdjacentEmpty(gx, gy)) {
          candidates.push({ gx, gy });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findRandomEmptyWithAdjacentEmpty(): GridPos | null {
    const empty = this.grid.getEmptyCells()
      .filter(p => this.isInBounds(p.gx, p.gy) && this.hasAdjacentEmpty(p.gx, p.gy));
    if (empty.length === 0) return null;
    return empty[Math.floor(Math.random() * empty.length)];
  }

}

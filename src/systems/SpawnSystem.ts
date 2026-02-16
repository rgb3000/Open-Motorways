import { OPPOSITE_DIR, type Grid } from '../core/Grid';
import { House } from '../entities/House';
import { Business } from '../entities/Business';
import { CellType, Direction, type GameColor, type GridPos } from '../types';
import type { DemandSystem } from './DemandSystem';
import {
  COLOR_UNLOCK_ORDER,
  COLOR_UNLOCK_INTERVAL,
  DEMAND_HOUSE_THRESHOLD,
  HOUSE_SATISFACTION_RATE,
  GRID_COLS,
  GRID_ROWS,
  HOUSE_CLUSTER_RADIUS,
  HOUSE_SPAWN_PROBABILITY,
  INITIAL_SPAWN_DELAY,
  SPAWN_AREA_INTERVALS,
  MIN_BUSINESS_DISTANCE,
  MIN_SPAWN_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_INTERVAL_DECAY,
} from '../constants';
import { manhattanDist } from '../utils/math';

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
  private nextColorUnlockTime = INITIAL_SPAWN_DELAY;
  private spawnTimer = 0;
  private currentSpawnInterval = SPAWN_INTERVAL;
  private grid: Grid;
  private demandSystem: DemandSystem;
  private dirty = false;
  onSpawn: (() => void) | null = null;

  get isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  constructor(grid: Grid, demandSystem: DemandSystem) {
    this.grid = grid;
    this.demandSystem = demandSystem;
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
    const hx = Math.floor(GRID_COLS * 0.45) + Math.floor(Math.random() * 5 - 2);
    const hy = Math.floor(GRID_ROWS * 0.45) + Math.floor(Math.random() * 3 - 1);
    this.spawnHouse({ gx: hx, gy: hy }, COLOR_UNLOCK_ORDER[0]);

    // For initial business, find an L-shape spot near desired location
    const bx = Math.floor(GRID_COLS * 0.55) + Math.floor(Math.random() * 5 - 2);
    const by = Math.floor(GRID_ROWS * 0.55) + Math.floor(Math.random() * 3 - 1);
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

  private findMostStressedColor(): GameColor | null {
    let worstColor: GameColor | null = null;
    let worstRatio = -Infinity;

    for (const color of this.unlockedColors) {
      const totalRate = this.demandSystem.getColorPinOutputRate(color);
      const houseCount = this.houses.filter(h => h.color === color).length;
      const satisfaction = houseCount * HOUSE_SATISFACTION_RATE;
      if (totalRate > satisfaction * DEMAND_HOUSE_THRESHOLD) {
        const ratio = satisfaction > 0 ? totalRate / satisfaction : Infinity;
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstColor = color;
        }
      }
    }

    return worstColor;
  }

  private spawnRandom(): void {
    // Check for demand imbalance first
    const stressedColor = this.findMostStressedColor();
    if (stressedColor !== null) {
      this.trySpawnHouseForColor(stressedColor);
      return;
    }

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
      pos = this.findEmptyWithAdjacentEmpty(anchor.pos, HOUSE_CLUSTER_RADIUS);
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
      spot = this.findEmptyLShapeFarFrom(sameColorHouses.map(h => h.pos), MIN_BUSINESS_DISTANCE);
    }

    if (!spot) {
      spot = this.findRandomEmptyLShape();
    }

    if (spot) {
      this.spawnBusiness(spot.pos, color, spot.orientation, spot.connectorSide);
    }
  }

  private spawnHouse(pos: GridPos, color: GameColor): void {
    this.dirty = true;

    // Find an empty adjacent cell for the connector
    const tryDirs = [
      Direction.Down, Direction.Right, Direction.Up, Direction.Left,
      Direction.DownRight, Direction.DownLeft, Direction.UpRight, Direction.UpLeft,
    ];
    let connDir: Direction = Direction.Down;
    for (const dir of tryDirs) {
      const off = this.grid.getDirectionOffset(dir);
      const nx = pos.gx + off.gx;
      const ny = pos.gy + off.gy;
      if (this.isCellEmpty(nx, ny)) {
        connDir = dir;
        break;
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

  private spawnBusiness(
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
      minX: Math.floor(GRID_COLS * inset),
      maxX: Math.floor(GRID_COLS * (1 - inset)) - 1,
      minY: Math.floor(GRID_ROWS * inset),
      maxY: Math.floor(GRID_ROWS * (1 - inset)) - 1,
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
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
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

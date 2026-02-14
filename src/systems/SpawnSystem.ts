import type { Grid } from '../core/Grid';
import { House } from '../entities/House';
import { Business } from '../entities/Business';
import { CellType, Direction, type GameColor, type GridPos } from '../types';
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

interface Empty1x3 {
  pos: GridPos;
  orientation: 'horizontal' | 'vertical';
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

    // For initial business, find a 1x2 spot near desired location
    const bx = Math.floor(GRID_COLS * 0.7) + Math.floor(Math.random() * 5 - 2);
    const by = Math.floor(GRID_ROWS * 0.5) + Math.floor(Math.random() * 3 - 1);
    const spot = this.findEmpty1x3Near({ gx: bx, gy: by }, 5);
    if (spot) {
      this.spawnBusiness(spot.pos, COLOR_UNLOCK_ORDER[0], spot.orientation);
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

    let spot: Empty1x3 | null = null;

    if (sameColorHouses.length > 0) {
      spot = this.findEmpty1x3FarFrom(sameColorHouses.map(h => h.pos), MIN_BUSINESS_DISTANCE);
    }

    if (!spot) {
      spot = this.findRandomEmpty1x3();
    }

    if (spot) {
      this.spawnBusiness(spot.pos, color, spot.orientation);
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
      connectorDir: null,
    });
  }

  private spawnBusiness(pos: GridPos, color: GameColor, orientation: 'horizontal' | 'vertical'): void {
    // Body cells: pos and secondCell
    const secondCell: GridPos = orientation === 'horizontal'
      ? { gx: pos.gx + 1, gy: pos.gy }
      : { gx: pos.gx, gy: pos.gy + 1 };

    // Connector is always the 3rd cell at the far end
    const connectorPos: GridPos = orientation === 'horizontal'
      ? { gx: pos.gx + 2, gy: pos.gy }
      : { gx: pos.gx, gy: pos.gy + 2 };

    const connectorDir: Direction = orientation === 'horizontal'
      ? Direction.Right
      : Direction.Down;

    const business = new Business(pos, color, orientation, connectorPos, connectorDir);
    this.businesses.push(business);

    const cellData = {
      type: CellType.Business,
      entityId: business.id,
      color,
      hasBridge: false,
      bridgeAxis: null,
      bridgeConnections: [] as never[],
      connectorDir: null as Direction | null,
    };

    // Body cell 1
    this.grid.setCell(pos.gx, pos.gy, { ...cellData });
    // Body cell 2
    this.grid.setCell(secondCell.gx, secondCell.gy, { ...cellData });
    // Connector cell (3rd)
    this.grid.setCell(connectorPos.gx, connectorPos.gy, { ...cellData, connectorDir });
  }

  private findEmpty1x3Near(center: GridPos, radius: number): Empty1x3 | null {
    const candidates: Empty1x3[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const gx = center.gx + dx;
        const gy = center.gy + dy;
        // Try horizontal (3 cells)
        if (this.isCellEmpty(gx, gy) && this.isCellEmpty(gx + 1, gy) && this.isCellEmpty(gx + 2, gy)) {
          candidates.push({ pos: { gx, gy }, orientation: 'horizontal' });
        }
        // Try vertical (3 cells)
        if (this.isCellEmpty(gx, gy) && this.isCellEmpty(gx, gy + 1) && this.isCellEmpty(gx, gy + 2)) {
          candidates.push({ pos: { gx, gy }, orientation: 'vertical' });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findEmpty1x3FarFrom(positions: GridPos[], minDist: number): Empty1x3 | null {
    const candidates = this.getAllEmpty1x3();
    const far = candidates.filter(spot => {
      return positions.every(p => manhattanDist(spot.pos, p) >= minDist);
    });
    if (far.length === 0) return null;
    return far[Math.floor(Math.random() * far.length)];
  }

  private findRandomEmpty1x3(): Empty1x3 | null {
    const candidates = this.getAllEmpty1x3();
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private getAllEmpty1x3(): Empty1x3[] {
    const results: Empty1x3[] = [];
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        if (this.isCellEmpty(gx, gy) && this.isCellEmpty(gx + 1, gy) && this.isCellEmpty(gx + 2, gy)) {
          results.push({ pos: { gx, gy }, orientation: 'horizontal' });
        }
        if (this.isCellEmpty(gx, gy) && this.isCellEmpty(gx, gy + 1) && this.isCellEmpty(gx, gy + 2)) {
          results.push({ pos: { gx, gy }, orientation: 'vertical' });
        }
      }
    }
    return results;
  }

  private isCellEmpty(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    return cell !== null && cell.type === CellType.Empty;
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

  private findRandomEmpty(): GridPos | null {
    const empty = this.grid.getEmptyCells();
    if (empty.length === 0) return null;
    return empty[Math.floor(Math.random() * empty.length)];
  }
}

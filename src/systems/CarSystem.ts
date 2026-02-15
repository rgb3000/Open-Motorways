import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { Car, CarState } from '../entities/Car';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import type { Grid } from '../core/Grid';
import { CAR_SPEED, TILE_SIZE, INTERSECTION_SPEED_MULTIPLIER, INTERSECTION_DEADLOCK_TIMEOUT, UNLOAD_TIME, PARKING_EXIT_DELAY } from '../constants';
import { CellType, Direction, LaneId } from '../types';
import type { GridPos } from '../types';
import { gridToPixelCenter, manhattanDist, pixelToGrid, isDiagonal } from '../utils/math';
import {
  getDirection, directionToLane, directionAngle,
  isPerpendicularAxis, YIELD_TO_DIRECTION,
} from '../utils/direction';
import { computeSmoothLanePath, sampleAtDistance } from '../utils/roadGeometry';

function occupancyKey(gx: number, gy: number, lane: LaneId): string {
  return `${gx},${gy},${lane}`;
}

function tileKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

function isIntersection(grid: Grid, gx: number, gy: number): boolean {
  const cell = grid.getCell(gx, gy);
  if (!cell || (cell.type !== CellType.Road && cell.type !== CellType.Connector)) return false;
  if (cell.type === CellType.Connector) return false;
  return cell.roadConnections.length >= 3;
}

interface IntersectionEntry {
  carId: string;
  entryDirection: Direction;
  inIntersection: boolean;
}

// Sub-positions within a parking lot cell for visual placement
const PARKING_SLOT_OFFSETS = [
  { x: -TILE_SIZE * 0.25, y: -TILE_SIZE * 0.25 },
  { x: TILE_SIZE * 0.25, y: -TILE_SIZE * 0.25 },
  { x: -TILE_SIZE * 0.25, y: TILE_SIZE * 0.25 },
  { x: TILE_SIZE * 0.25, y: TILE_SIZE * 0.25 },
];

export class CarSystem {
  private cars: Car[] = [];
  private score = 0;
  private pathfinder: Pathfinder;
  private grid: Grid;
  private exitCooldowns = new Map<string, number>();
  onDelivery: (() => void) | null = null;
  onHomeReturn: (() => void) | null = null;

  // Reusable collections to avoid per-frame allocations
  private _occupiedMap = new Map<string, string>();
  private _intersectionMap = new Map<string, IntersectionEntry[]>();
  private _intersectionEntryPool: IntersectionEntry[][] = [];
  private _toRemove: string[] = [];
  private _toRemoveSet = new Set<string>();
  private _carsEnRoute = new Map<string, number>();
  private _businessMap = new Map<string, Business>();

  constructor(pathfinder: Pathfinder, grid: Grid) {
    this.pathfinder = pathfinder;
    this.grid = grid;
  }

  getCars(): Car[] {
    return this.cars;
  }

  getScore(): number {
    return this.score;
  }

  update(dt: number, houses: House[], businesses: Business[]): void {
    this.dispatchCars(houses, businesses);
    this.moveCars(dt, houses, businesses);
  }

  onRoadsChanged(houses: House[]): void {
    for (const car of this.cars) {
      // Skip parked cars — they're not affected by road changes
      if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit) continue;
      if (car.state !== CarState.Stranded) continue;

      const currentTile = this.getCarCurrentTile(car);
      const home = houses.find(h => h.id === car.homeHouseId);

      // Try to repath to original destination
      if (car.destination) {
        const path = this.pathfinder.findPath(currentTile, car.destination);
        if (path) {
          // Restore the state that matches the destination
          car.state = home && car.destination.gx === home.pos.gx && car.destination.gy === home.pos.gy
            ? CarState.GoingHome
            : CarState.GoingToBusiness;
          this.assignPath(car, path);
          if (car.smoothPath.length >= 2) {
            car.pixelPos.x = car.smoothPath[0].x;
            car.pixelPos.y = car.smoothPath[0].y;
          } else {
            const center = gridToPixelCenter(currentTile);
            car.pixelPos.x = center.x;
            car.pixelPos.y = center.y;
          }
          continue;
        }
      }

      // Try to go home instead
      if (home) {
        const homePath = this.pathfinder.findPath(currentTile, home.pos);
        if (homePath) {
          car.state = CarState.GoingHome;
          car.targetBusinessId = null;
          car.destination = home.pos;
          this.assignPath(car, homePath);
          if (car.smoothPath.length >= 2) {
            car.pixelPos.x = car.smoothPath[0].x;
            car.pixelPos.y = car.smoothPath[0].y;
          } else {
            const center = gridToPixelCenter(currentTile);
            car.pixelPos.x = center.x;
            car.pixelPos.y = center.y;
          }
          continue;
        }
      }

      // Stay stranded
    }
  }

  private getCarCurrentTile(car: Car): GridPos {
    if (car.path.length >= 2 && car.pathIndex < car.path.length - 1) {
      return car.segmentProgress >= 0.5
        ? car.path[car.pathIndex + 1]
        : car.path[car.pathIndex];
    }
    if (car.path.length > 0 && car.pathIndex < car.path.length) {
      return car.path[car.pathIndex];
    }
    return pixelToGrid(car.pixelPos.x, car.pixelPos.y);
  }

  private rerouteCar(car: Car, houses: House[]): void {
    // Skip parked cars
    if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit) return;

    const currentTile = this.getCarCurrentTile(car);
    const home = houses.find(h => h.id === car.homeHouseId);

    // 1. Try to repath to original destination
    if (car.destination) {
      const path = this.pathfinder.findPath(currentTile, car.destination);
      if (path) {
        this.assignPath(car, path);
        if (car.smoothPath.length >= 2) {
          car.pixelPos.x = car.smoothPath[0].x;
          car.pixelPos.y = car.smoothPath[0].y;
        } else {
          const center = gridToPixelCenter(currentTile);
          car.pixelPos.x = center.x;
          car.pixelPos.y = center.y;
        }
        return;
      }
    }

    // 2. If GoingToBusiness and can't reach business, clear target and try home
    if (car.state === CarState.GoingToBusiness) {
      car.targetBusinessId = null;
    }

    // 3. Try path home
    if (home) {
      const homePath = this.pathfinder.findPath(currentTile, home.pos);
      if (homePath) {
        car.state = CarState.GoingHome;
        car.destination = home.pos;
        this.assignPath(car, homePath);
        if (car.smoothPath.length >= 2) {
          car.pixelPos.x = car.smoothPath[0].x;
          car.pixelPos.y = car.smoothPath[0].y;
        } else {
          const center = gridToPixelCenter(currentTile);
          car.pixelPos.x = center.x;
          car.pixelPos.y = center.y;
        }
        return;
      }
    }

    // 4. Nothing works — strand the car
    car.state = CarState.Stranded;
    car.path = [];
    car.pathIndex = 0;
    car.segmentProgress = 0;
    car.smoothPath = [];
    car.smoothCumDist = [];
    car.smoothCellDist = [];
    const center = gridToPixelCenter(currentTile);
    car.pixelPos.x = center.x;
    car.pixelPos.y = center.y;
    if (home) {
      car.destination = home.pos;
    }
  }

  private assignPath(car: Car, path: GridPos[]): void {
    car.path = path;
    car.pathIndex = 0;
    car.segmentProgress = 0;
    if (path.length >= 2) {
      // Trim Business cells from both ends before smoothing
      // Keep Road, Connector, House, and ParkingLot cells for the smooth path
      let startTrim = 0;
      let endTrim = path.length;
      while (startTrim < path.length) {
        const cell = this.grid.getCell(path[startTrim].gx, path[startTrim].gy);
        if (cell && cell.type !== CellType.Business) break;
        startTrim++;
      }
      while (endTrim > startTrim) {
        const cell = this.grid.getCell(path[endTrim - 1].gx, path[endTrim - 1].gy);
        if (cell && cell.type !== CellType.Business) break;
        endTrim--;
      }
      const smoothPath = path.slice(startTrim, endTrim);
      if (smoothPath.length >= 2) {
        const smooth = computeSmoothLanePath(smoothPath);
        car.smoothPath = smooth.points;
        car.smoothCumDist = smooth.cumDist;
        // Pad cellDist to maintain pathIndex mapping: trimmed start cells get distance 0
        const padded = new Array(startTrim).fill(0);
        car.smoothCellDist = padded.concat(smooth.cellDist);
      } else {
        car.smoothPath = [];
        car.smoothCumDist = [];
        car.smoothCellDist = [];
      }
    } else {
      car.smoothPath = [];
      car.smoothCumDist = [];
      car.smoothCellDist = [];
    }
  }

  private dispatchCars(houses: House[], businesses: Business[]): void {
    const demandBusinesses = businesses.filter(b => b.demandPins > 0);
    if (demandBusinesses.length === 0) return;

    const carsEnRoute = this._carsEnRoute;
    carsEnRoute.clear();
    for (const car of this.cars) {
      if (car.state === CarState.GoingToBusiness && car.targetBusinessId) {
        carsEnRoute.set(car.targetBusinessId, (carsEnRoute.get(car.targetBusinessId) ?? 0) + 1);
      }
    }

    for (const biz of demandBusinesses) {
      const enRouteCount = carsEnRoute.get(biz.id) ?? 0;
      const neededCars = biz.demandPins - enRouteCount;
      if (neededCars <= 0) continue;

      const availableHouses = houses
        .filter(h => h.color === biz.color && h.availableCars > 0)
        .sort((a, b) => manhattanDist(a.pos, biz.parkingLotPos) - manhattanDist(b.pos, biz.parkingLotPos));

      let dispatched = 0;
      for (const house of availableHouses) {
        if (dispatched >= neededCars) break;

        const path = this.pathfinder.findPath(house.pos, biz.parkingLotPos);
        if (!path) continue;

        const car = new Car(house.id, house.color, house.pos);
        car.state = CarState.GoingToBusiness;
        car.targetBusinessId = biz.id;
        car.destination = biz.parkingLotPos;
        this.assignPath(car, path);

        if (car.smoothPath.length >= 2) {
          car.pixelPos.x = car.smoothPath[0].x;
          car.pixelPos.y = car.smoothPath[0].y;
          car.prevPixelPos.x = car.pixelPos.x;
          car.prevPixelPos.y = car.pixelPos.y;
          const initDir = getDirection(path[0], path[1]);
          car.renderAngle = directionAngle(initDir);
          car.prevRenderAngle = car.renderAngle;
        }

        house.availableCars--;
        this.cars.push(car);
        carsEnRoute.set(biz.id, (carsEnRoute.get(biz.id) ?? 0) + 1);
        dispatched++;
      }
    }
  }

  private buildOccupancyMap(): Map<string, string> {
    const occupied = this._occupiedMap;
    occupied.clear();
    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded || car.state === CarState.Unloading || car.state === CarState.WaitingToExit || car.path.length < 2) continue;

      const currentTile = car.path[car.pathIndex];
      const nextIdx = Math.min(car.pathIndex + 1, car.path.length - 1);
      const nextTile = car.path[nextIdx];
      const dir = getDirection(currentTile, nextTile);
      const lane = directionToLane(dir);

      const occupiedTile = car.segmentProgress < 0.5 ? currentTile : nextTile;
      occupied.set(occupancyKey(occupiedTile.gx, occupiedTile.gy, lane), car.id);
    }
    return occupied;
  }

  private buildIntersectionMap(): Map<string, IntersectionEntry[]> {
    const intersectionMap = this._intersectionMap;
    // Return used arrays to pool before clearing
    for (const list of intersectionMap.values()) {
      list.length = 0;
      this._intersectionEntryPool.push(list);
    }
    intersectionMap.clear();

    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded || car.state === CarState.Unloading || car.state === CarState.WaitingToExit || car.path.length < 2) continue;

      const curTile = car.path[car.pathIndex];
      const nextIdx = Math.min(car.pathIndex + 1, car.path.length - 1);
      const nxtTile = car.path[nextIdx];

      if (car.segmentProgress >= 0.5 && car.pathIndex + 1 < car.path.length) {
        if (isIntersection(this.grid, nxtTile.gx, nxtTile.gy)) {
          const dir = getDirection(curTile, nxtTile);
          const key = tileKey(nxtTile.gx, nxtTile.gy);
          let list = intersectionMap.get(key);
          if (!list) { list = this._intersectionEntryPool.pop() ?? []; intersectionMap.set(key, list); }
          list.push({ carId: car.id, entryDirection: dir, inIntersection: true });
        }
      } else if (car.segmentProgress < 0.5) {
        if (isIntersection(this.grid, curTile.gx, curTile.gy)) {
          const dir = car.pathIndex > 0
            ? getDirection(car.path[car.pathIndex - 1], curTile)
            : getDirection(curTile, nxtTile);
          const key = tileKey(curTile.gx, curTile.gy);
          let list = intersectionMap.get(key);
          if (!list) { list = this._intersectionEntryPool.pop() ?? []; intersectionMap.set(key, list); }
          list.push({ carId: car.id, entryDirection: dir, inIntersection: true });
        }

        if (car.pathIndex + 1 < car.path.length && isIntersection(this.grid, nxtTile.gx, nxtTile.gy)) {
          const dir = getDirection(curTile, nxtTile);
          const key = tileKey(nxtTile.gx, nxtTile.gy);
          let list = intersectionMap.get(key);
          if (!list) { list = this._intersectionEntryPool.pop() ?? []; intersectionMap.set(key, list); }
          list.push({ carId: car.id, entryDirection: dir, inIntersection: false });
        }
      }
    }

    return intersectionMap;
  }

  private applyCollisionAndYield(
    car: Car, dt: number, newProgress: number,
    nextTile: GridPos,
    dir: Direction, lane: LaneId,
    isNextIntersection: boolean,
    occupied: Map<string, string>,
    intersectionMap: Map<string, IntersectionEntry[]>,
  ): number {
    // Check collision when crossing into next tile
    if (newProgress >= 1 && car.pathIndex < car.path.length - 2) {
      const afterNextTile = car.path[car.pathIndex + 2];
      const nextDir = getDirection(nextTile, afterNextTile);
      const nextLane = directionToLane(nextDir);
      const nextKey = occupancyKey(nextTile.gx, nextTile.gy, nextLane);
      const blocker = occupied.get(nextKey);

      if (blocker && blocker !== car.id) {
        newProgress = Math.min(newProgress, 0.95);
      }
    }

    // Also check collision on the current segment's next tile (same lane)
    if (car.segmentProgress < 0.5 && newProgress >= 0.5) {
      const key = occupancyKey(nextTile.gx, nextTile.gy, lane);
      const blocker = occupied.get(key);
      if (blocker && blocker !== car.id) {
        newProgress = Math.min(newProgress, 0.45);
      }
    }

    // Intersection yield check (yield-to-right / rechts-vor-links)
    if (isNextIntersection && car.segmentProgress < 0.5) {
      const myDir = dir;
      const intKey = tileKey(nextTile.gx, nextTile.gy);
      const entries = intersectionMap.get(intKey);
      let mustYield = false;

      if (entries) {
        for (const other of entries) {
          if (other.carId === car.id) continue;

          // Rule 1: perpendicular car already IN intersection → wait
          if (other.inIntersection && isPerpendicularAxis(myDir, other.entryDirection)) {
            mustYield = true;
            break;
          }

          // Rule 2: car approaching/in from my yield-to direction → yield
          if (other.entryDirection === YIELD_TO_DIRECTION[myDir]) {
            mustYield = true;
            break;
          }
        }
      }

      if (mustYield) {
        car.intersectionWaitTime += dt;
        if (car.intersectionWaitTime < INTERSECTION_DEADLOCK_TIMEOUT) {
          newProgress = Math.min(newProgress, 0.45);
        }
        // else: timeout expired → let car through (deadlock breaker)
      } else {
        car.intersectionWaitTime = 0;
      }
    } else {
      car.intersectionWaitTime = 0;
    }

    return newProgress;
  }

  private interpolateCarPosition(car: Car): void {
    const curTile = car.path[car.pathIndex];
    const nxtTile = car.path[Math.min(car.pathIndex + 1, car.path.length - 1)];
    const curDir = getDirection(curTile, nxtTile);
    car.direction = curDir;

    if (car.smoothPath.length < 2) return;

    // Map pathIndex + segmentProgress to arc-length distance on the smooth polyline
    const segStart = car.smoothCellDist[car.pathIndex];
    const segEnd = car.smoothCellDist[Math.min(car.pathIndex + 1, car.smoothCellDist.length - 1)];
    const dist = segStart + car.segmentProgress * (segEnd - segStart);

    const result = sampleAtDistance(car.smoothPath, car.smoothCumDist, dist);
    car.pixelPos.x = result.x;
    car.pixelPos.y = result.y;
    car.renderAngle = result.angle;
  }

  private updateSingleCar(
    car: Car, dt: number,
    houses: House[], bizMap: Map<string, Business>,
    occupied: Map<string, string>,
    intersectionMap: Map<string, IntersectionEntry[]>,
    toRemove: string[],
  ): void {
    car.prevPixelPos.x = car.pixelPos.x;
    car.prevPixelPos.y = car.pixelPos.y;
    car.prevRenderAngle = car.renderAngle;

    if (car.path.length < 2) {
      // Degenerate path — reroute instead of treating as arrival
      this.rerouteCar(car, houses);
      return;
    }

    const currentTile = car.path[car.pathIndex];
    const nextIdx = Math.min(car.pathIndex + 1, car.path.length - 1);
    const nextTile = car.path[nextIdx];
    const dir = getDirection(currentTile, nextTile);
    car.direction = dir;
    const lane = directionToLane(dir);

    // Remove car from old occupancy position
    const oldOccupiedTile = car.segmentProgress < 0.5 ? currentTile : nextTile;
    const oldKey = occupancyKey(oldOccupiedTile.gx, oldOccupiedTile.gy, lane);
    if (occupied.get(oldKey) === car.id) {
      occupied.delete(oldKey);
    }

    const isCurrentIntersection = isIntersection(this.grid, currentTile.gx, currentTile.gy);
    const isNextIntersection = car.pathIndex + 1 < car.path.length
      && isIntersection(this.grid, nextTile.gx, nextTile.gy);
    const effectiveSpeed = (isCurrentIntersection || isNextIntersection)
      ? CAR_SPEED * INTERSECTION_SPEED_MULTIPLIER : CAR_SPEED;
    const segmentLength = isDiagonal(dir) ? Math.SQRT2 : 1;
    const tileDistance = (effectiveSpeed * dt) / segmentLength;
    let newProgress = car.segmentProgress + tileDistance;

    newProgress = this.applyCollisionAndYield(
      car, dt, newProgress, nextTile,
      dir, lane, isNextIntersection, occupied, intersectionMap,
    );

    // Block car on connector tile if parking lot is full
    if (car.state === CarState.GoingToBusiness && car.pathIndex === car.path.length - 2) {
      const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
      if (biz && car.segmentProgress < 0.5 && newProgress >= 0.5 && biz.getFreeParkingSlot() === null) {
        newProgress = Math.min(newProgress, 0.45);
      }
    }

    car.segmentProgress = newProgress;

    // Advance through path segments
    while (car.segmentProgress >= 1 && car.pathIndex < car.path.length - 1) {
      car.segmentProgress -= 1;
      car.pathIndex++;
    }

    // Check if next tile on path is still traversable
    if (car.pathIndex < car.path.length - 1) {
      const aheadTile = car.path[car.pathIndex + 1];
      const cell = this.grid.getCell(aheadTile.gx, aheadTile.gy);
      const isFinalTile = car.pathIndex + 1 === car.path.length - 1;
      const isTraversable = cell && (
        cell.type === CellType.Road ||
        cell.type === CellType.Connector ||
        (isFinalTile && (cell.type === CellType.House || cell.type === CellType.ParkingLot))
      );

      if (!isTraversable) {
        this.rerouteCar(car, houses);
        return;
      }
    }

    if (car.pathIndex >= car.path.length - 1) {
      // Arrived at destination
      car.segmentProgress = 0;
      if (car.smoothPath.length > 0) {
        const lastPt = car.smoothPath[car.smoothPath.length - 1];
        car.pixelPos.x = lastPt.x;
        car.pixelPos.y = lastPt.y;
      }
      this.handleArrival(car, houses, bizMap, toRemove);
      if (car.path.length === 0) return;
    } else {
      this.interpolateCarPosition(car);
    }

    // Register car in new occupancy position
    const newCurrentTile = car.path[car.pathIndex];
    const newNextIdx = Math.min(car.pathIndex + 1, car.path.length - 1);
    const newNextTile = car.path[newNextIdx];
    const newDir = car.pathIndex < car.path.length - 1 ? getDirection(newCurrentTile, newNextTile) : dir;
    const newLane = directionToLane(newDir);
    const newOccupiedTile = car.segmentProgress < 0.5 ? newCurrentTile : newNextTile;
    const newKey = occupancyKey(newOccupiedTile.gx, newOccupiedTile.gy, newLane);
    occupied.set(newKey, car.id);
  }

  private updateUnloadingCar(
    car: Car, dt: number,
    bizMap: Map<string, Business>,
  ): void {
    car.unloadTimer += dt;
    if (car.unloadTimer < UNLOAD_TIME) return;

    // Unload complete — score and transition to WaitingToExit (slot stays occupied)
    const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
    if (biz && biz.demandPins > 0) {
      biz.demandPins--;
      this.score++;
      this.onDelivery?.();
    }
    car.state = CarState.WaitingToExit;
    car.unloadTimer = 0;
  }

  private updateWaitingToExitCar(
    car: Car,
    houses: House[], bizMap: Map<string, Business>,
    toRemove: string[],
  ): void {
    const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
    if (!biz) { toRemove.push(car.id); return; }

    // Check exit cooldown for this business
    const cooldown = this.exitCooldowns.get(biz.id) ?? 0;
    if (cooldown > 0) return;

    // Check connector cell is free — no moving car occupies it
    // (except GoingToBusiness cars targeting this same business, since they're waiting to enter)
    const connectorFree = !this.cars.some(other => {
      if (other.id === car.id) return false;
      if (other.state === CarState.Idle || other.state === CarState.Stranded ||
          other.state === CarState.Unloading || other.state === CarState.WaitingToExit) return false;
      if (other.state === CarState.GoingToBusiness && other.targetBusinessId === biz.id) return false;
      if (other.path.length < 2) return false;
      const tile = other.segmentProgress < 0.5
        ? other.path[other.pathIndex]
        : other.path[Math.min(other.pathIndex + 1, other.path.length - 1)];
      return tile.gx === biz.connectorPos.gx && tile.gy === biz.connectorPos.gy;
    });
    if (!connectorFree) return;

    // Free the parking slot
    if (car.assignedSlotIndex !== null) {
      biz.freeSlot(car.assignedSlotIndex);
    }
    this.exitCooldowns.set(biz.id, PARKING_EXIT_DELAY);

    // Path home from connector
    const home = houses.find(h => h.id === car.homeHouseId);
    if (home) {
      const homePath = this.pathfinder.findPath(biz.parkingLotPos, home.pos);
      if (homePath) {
        car.state = CarState.GoingHome;
        car.targetBusinessId = null;
        car.assignedSlotIndex = null;
        car.destination = home.pos;
        this.assignPath(car, homePath);
        if (car.smoothPath.length >= 2) {
          car.pixelPos.x = car.smoothPath[0].x;
          car.pixelPos.y = car.smoothPath[0].y;
          car.prevPixelPos.x = car.pixelPos.x;
          car.prevPixelPos.y = car.pixelPos.y;
          const initDir = getDirection(homePath[0], homePath[1]);
          car.renderAngle = directionAngle(initDir);
          car.prevRenderAngle = car.renderAngle;
        } else {
          const center = gridToPixelCenter(biz.parkingLotPos);
          car.pixelPos.x = center.x;
          car.pixelPos.y = center.y;
          car.prevPixelPos.x = center.x;
          car.prevPixelPos.y = center.y;
        }
      } else {
        car.state = CarState.Stranded;
        car.targetBusinessId = null;
        car.assignedSlotIndex = null;
        car.destination = home.pos;
        car.path = [];
        car.pathIndex = 0;
        car.segmentProgress = 0;
        car.smoothPath = [];
        car.smoothCumDist = [];
        car.smoothCellDist = [];
        const center = gridToPixelCenter(biz.parkingLotPos);
        car.pixelPos.x = center.x;
        car.pixelPos.y = center.y;
        car.prevPixelPos.x = center.x;
        car.prevPixelPos.y = center.y;
      }
    } else {
      toRemove.push(car.id);
    }
  }

  private moveCars(dt: number, houses: House[], businesses: Business[]): void {
    // Decrement exit cooldowns
    for (const [bizId, cd] of this.exitCooldowns) {
      const remaining = cd - dt;
      if (remaining <= 0) {
        this.exitCooldowns.delete(bizId);
      } else {
        this.exitCooldowns.set(bizId, remaining);
      }
    }

    // Build business lookup map once per frame
    const bizMap = this._businessMap;
    bizMap.clear();
    for (const biz of businesses) {
      bizMap.set(biz.id, biz);
    }

    const occupied = this.buildOccupancyMap();
    const intersectionMap = this.buildIntersectionMap();
    const toRemove = this._toRemove;
    toRemove.length = 0;

    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded) continue;
      if (car.state === CarState.Unloading) {
        this.updateUnloadingCar(car, dt, bizMap);
        continue;
      }
      if (car.state === CarState.WaitingToExit) {
        this.updateWaitingToExitCar(car, houses, bizMap, toRemove);
        continue;
      }
      this.updateSingleCar(car, dt, houses, bizMap, occupied, intersectionMap, toRemove);
    }

    if (toRemove.length > 0) {
      const removeSet = this._toRemoveSet;
      removeSet.clear();
      for (const id of toRemove) removeSet.add(id);
      this.cars = this.cars.filter(c => !removeSet.has(c.id));
    }
  }

  private handleArrival(car: Car, houses: House[], bizMap: Map<string, Business>, toRemove: string[]): void {
    if (car.state === CarState.GoingToBusiness) {
      const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
      if (biz) {
        // Transition to unloading state
        const slotIndex = biz.getFreeParkingSlot();
        if (slotIndex !== null) {
          biz.occupySlot(slotIndex, car.id);
          car.state = CarState.Unloading;
          car.assignedSlotIndex = slotIndex;
          car.unloadTimer = 0;
          car.path = [];
          car.pathIndex = 0;
          car.segmentProgress = 0;

          // Position car visually in one of 4 sub-positions within the parking lot cell
          const lotCenter = gridToPixelCenter(biz.parkingLotPos);
          const slotOffset = PARKING_SLOT_OFFSETS[slotIndex];
          car.pixelPos.x = lotCenter.x + slotOffset.x;
          car.pixelPos.y = lotCenter.y + slotOffset.y;
          car.prevPixelPos.x = car.pixelPos.x;
          car.prevPixelPos.y = car.pixelPos.y;
        } else {
          // No free slot (shouldn't happen with dispatch capacity check, but handle gracefully)
          // Just path home immediately
          const home = houses.find(h => h.id === car.homeHouseId);
          if (home) {
            const homePath = this.pathfinder.findPath(biz.parkingLotPos, home.pos);
            if (homePath) {
              car.state = CarState.GoingHome;
              car.targetBusinessId = null;
              car.destination = home.pos;
              this.assignPath(car, homePath);
              if (car.smoothPath.length >= 2) {
                car.pixelPos.x = car.smoothPath[0].x;
                car.pixelPos.y = car.smoothPath[0].y;
                const initDir = getDirection(homePath[0], homePath[1]);
                car.renderAngle = directionAngle(initDir);
                car.prevRenderAngle = car.renderAngle;
              } else {
                const center = gridToPixelCenter(biz.parkingLotPos);
                car.pixelPos.x = center.x;
                car.pixelPos.y = center.y;
              }
            } else {
              car.state = CarState.Stranded;
              car.targetBusinessId = null;
              car.destination = home.pos;
              car.path = [];
              car.pathIndex = 0;
              car.segmentProgress = 0;
              car.smoothPath = [];
              car.smoothCumDist = [];
              car.smoothCellDist = [];
            }
          } else {
            toRemove.push(car.id);
          }
        }
      } else {
        toRemove.push(car.id);
      }
    } else if (car.state === CarState.GoingHome) {
      const home = houses.find(h => h.id === car.homeHouseId);
      if (home) {
        home.availableCars++;
      }
      this.onHomeReturn?.();
      toRemove.push(car.id);
    }
  }

  reset(): void {
    this.cars = [];
    this.score = 0;
    this.exitCooldowns.clear();
  }
}

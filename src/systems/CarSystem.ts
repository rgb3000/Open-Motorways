import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { Car, CarState } from '../entities/Car';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import type { Grid } from '../core/Grid';
import { CAR_SPEED, TILE_SIZE, INTERSECTION_SPEED_MULTIPLIER, INTERSECTION_DEADLOCK_TIMEOUT, BEZIER_KAPPA } from '../constants';
import { CellType, Direction, LaneId, TrafficLevel } from '../types';
import type { GridPos } from '../types';
import { gridToPixelCenter, manhattanDist, pixelToGrid, cubicBezier, cubicBezierTangent } from '../utils/math';
import {
  getDirection, directionToLane, directionAngle, unitVector,
  isOpposite, isPerpendicularAxis, YIELD_TO_DIRECTION,
  laneOffset, laneIntersection,
} from '../utils/direction';

function occupancyKey(gx: number, gy: number, lane: LaneId, level: TrafficLevel): string {
  return `${gx},${gy},${lane},${level}`;
}

function tileKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

function isIntersection(grid: Grid, gx: number, gy: number): boolean {
  const cell = grid.getCell(gx, gy);
  if (!cell || cell.type !== CellType.Road) return false;
  if (cell.hasBridge) return false;
  return cell.roadConnections.length >= 3;
}

function getTrafficLevel(grid: Grid, path: GridPos[], pathIndex: number): TrafficLevel {
  if (pathIndex <= 0 || pathIndex >= path.length) return TrafficLevel.Ground;

  const tile = path[pathIndex];
  const cell = grid.getCell(tile.gx, tile.gy);
  if (!cell || !cell.hasBridge || !cell.bridgeAxis) return TrafficLevel.Ground;

  // Derive level from entry direction
  const prevTile = path[pathIndex - 1];
  const entryDir = getDirection(prevTile, tile);
  const isHorizontal = entryDir === Direction.Left || entryDir === Direction.Right;
  const isBridgeHorizontal = cell.bridgeAxis === 'horizontal';

  // If entry direction aligns with bridge axis, we're on the bridge
  if ((isHorizontal && isBridgeHorizontal) || (!isHorizontal && !isBridgeHorizontal)) {
    return TrafficLevel.Bridge;
  }
  return TrafficLevel.Ground;
}

interface IntersectionEntry {
  carId: string;
  entryDirection: Direction;
  inIntersection: boolean;
}

export class CarSystem {
  private cars: Car[] = [];
  private score = 0;
  private pathfinder: Pathfinder;
  private grid: Grid;
  onDelivery: (() => void) | null = null;
  onHomeReturn: (() => void) | null = null;

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
          car.path = path;
          car.pathIndex = 0;
          car.segmentProgress = 0;
          const center = gridToPixelCenter(currentTile);
          car.pixelPos = { ...center };
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
          car.path = homePath;
          car.pathIndex = 0;
          car.segmentProgress = 0;
          const center = gridToPixelCenter(currentTile);
          car.pixelPos = { ...center };
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
    const currentTile = this.getCarCurrentTile(car);
    const home = houses.find(h => h.id === car.homeHouseId);

    // Snap to current tile center
    const center = gridToPixelCenter(currentTile);
    car.pixelPos = { ...center };

    // 1. Try to repath to original destination
    if (car.destination) {
      const path = this.pathfinder.findPath(currentTile, car.destination);
      if (path) {
        car.path = path;
        car.pathIndex = 0;
        car.segmentProgress = 0;
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
        car.path = homePath;
        car.pathIndex = 0;
        car.segmentProgress = 0;
        return;
      }
    }

    // 4. Nothing works — strand the car
    car.state = CarState.Stranded;
    car.path = [];
    car.pathIndex = 0;
    car.segmentProgress = 0;
    if (home) {
      car.destination = home.pos;
    }
  }

  private dispatchCars(houses: House[], businesses: Business[]): void {
    const demandBusinesses = businesses.filter(b => b.demandPins > 0);
    if (demandBusinesses.length === 0) return;

    const carsEnRoute = new Map<string, number>();
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
        .sort((a, b) => manhattanDist(a.pos, biz.connectorPos) - manhattanDist(b.pos, biz.connectorPos));

      let dispatched = 0;
      for (const house of availableHouses) {
        if (dispatched >= neededCars) break;

        const path = this.pathfinder.findPath(house.pos, biz.connectorPos);
        if (!path) continue;

        const car = new Car(house.id, house.color, house.pos);
        car.state = CarState.GoingToBusiness;
        car.targetBusinessId = biz.id;
        car.destination = biz.connectorPos;
        car.path = path;
        car.pathIndex = 0;
        car.segmentProgress = 0;

        if (path.length >= 2) {
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
    const occupied = new Map<string, string>();
    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded || car.path.length < 2) continue;

      const currentTile = car.path[car.pathIndex];
      const nextIdx = Math.min(car.pathIndex + 1, car.path.length - 1);
      const nextTile = car.path[nextIdx];
      const dir = getDirection(currentTile, nextTile);
      const lane = directionToLane(dir);

      const occupiedTile = car.segmentProgress < 0.5 ? currentTile : nextTile;
      const level = getTrafficLevel(this.grid, car.path, car.segmentProgress < 0.5 ? car.pathIndex : car.pathIndex + 1);
      occupied.set(occupancyKey(occupiedTile.gx, occupiedTile.gy, lane, level), car.id);
    }
    return occupied;
  }

  private buildIntersectionMap(): Map<string, IntersectionEntry[]> {
    const intersectionMap = new Map<string, IntersectionEntry[]>();

    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded || car.path.length < 2) continue;

      const curTile = car.path[car.pathIndex];
      const nextIdx = Math.min(car.pathIndex + 1, car.path.length - 1);
      const nxtTile = car.path[nextIdx];

      if (car.segmentProgress >= 0.5 && car.pathIndex + 1 < car.path.length) {
        // Case A: car center is past midpoint, check if next tile is intersection
        if (isIntersection(this.grid, nxtTile.gx, nxtTile.gy)) {
          const dir = getDirection(curTile, nxtTile);
          const key = tileKey(nxtTile.gx, nxtTile.gy);
          const list = intersectionMap.get(key) ?? [];
          list.push({ carId: car.id, entryDirection: dir, inIntersection: true });
          intersectionMap.set(key, list);
        }
      } else if (car.segmentProgress < 0.5) {
        // Case B: car center before midpoint, check if current tile is intersection
        if (isIntersection(this.grid, curTile.gx, curTile.gy)) {
          const dir = car.pathIndex > 0
            ? getDirection(car.path[car.pathIndex - 1], curTile)
            : getDirection(curTile, nxtTile);
          const key = tileKey(curTile.gx, curTile.gy);
          const list = intersectionMap.get(key) ?? [];
          list.push({ carId: car.id, entryDirection: dir, inIntersection: true });
          intersectionMap.set(key, list);
        }

        // Case C: car approaching, check if next tile is intersection
        if (car.pathIndex + 1 < car.path.length && isIntersection(this.grid, nxtTile.gx, nxtTile.gy)) {
          const dir = getDirection(curTile, nxtTile);
          const key = tileKey(nxtTile.gx, nxtTile.gy);
          const list = intersectionMap.get(key) ?? [];
          list.push({ carId: car.id, entryDirection: dir, inIntersection: false });
          intersectionMap.set(key, list);
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
      const nextLevel = getTrafficLevel(this.grid, car.path, car.pathIndex + 1);
      const nextKey = occupancyKey(nextTile.gx, nextTile.gy, nextLane, nextLevel);
      const blocker = occupied.get(nextKey);

      if (blocker && blocker !== car.id) {
        newProgress = Math.min(newProgress, 0.95);
      }
    }

    // Also check collision on the current segment's next tile (same lane)
    if (car.segmentProgress < 0.5 && newProgress >= 0.5) {
      const nextLevel = getTrafficLevel(this.grid, car.path, car.pathIndex + 1);
      const key = occupancyKey(nextTile.gx, nextTile.gy, lane, nextLevel);
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

    // Update traffic level
    car.currentLevel = getTrafficLevel(this.grid, car.path, car.pathIndex);

    const pathIndex = car.pathIndex;
    const t = car.segmentProgress;
    const half = TILE_SIZE / 2;
    const currentCenter = gridToPixelCenter(curTile);
    const nextCenter = gridToPixelCenter(nxtTile);

    // Determine entry and exit directions for turn detection
    const entryDir = pathIndex > 0 ? getDirection(car.path[pathIndex - 1], curTile) : curDir;
    const exitDir = pathIndex + 2 < car.path.length ? getDirection(nxtTile, car.path[pathIndex + 2]) : curDir;
    const turningAtStart = entryDir !== curDir && !isOpposite(entryDir, curDir);
    const turningAtEnd = exitDir !== curDir && !isOpposite(exitDir, curDir);

    const isFirstSegment = pathIndex === 0;
    const isLastSegment = pathIndex === car.path.length - 2;

    if (turningAtStart || turningAtEnd) {
      // Bezier curve for turns
      let p0x: number, p0y: number, tangentDir0: Direction;
      let p3x: number, p3y: number, tangentDir3: Direction;

      if (isFirstSegment) {
        p0x = currentCenter.x;
        p0y = currentCenter.y;
        tangentDir0 = curDir;
      } else if (turningAtStart) {
        const li = laneIntersection(currentCenter.x, currentCenter.y, entryDir, curDir);
        p0x = li.x;
        p0y = li.y;
        tangentDir0 = entryDir;
      } else {
        const off = laneOffset(curDir);
        p0x = currentCenter.x + off.x;
        p0y = currentCenter.y + off.y;
        tangentDir0 = curDir;
      }

      if (isLastSegment) {
        p3x = nextCenter.x;
        p3y = nextCenter.y;
        tangentDir3 = curDir;
      } else if (turningAtEnd) {
        const li = laneIntersection(nextCenter.x, nextCenter.y, curDir, exitDir);
        p3x = li.x;
        p3y = li.y;
        tangentDir3 = turningAtStart ? exitDir : curDir;
      } else {
        const off = laneOffset(curDir);
        p3x = nextCenter.x + off.x;
        p3y = nextCenter.y + off.y;
        tangentDir3 = curDir;
      }

      const u0 = unitVector(tangentDir0);
      const u3 = unitVector(tangentDir3);
      const arm = half * BEZIER_KAPPA;
      const p1x = p0x + u0.x * arm;
      const p1y = p0y + u0.y * arm;
      const p2x = p3x - u3.x * arm;
      const p2y = p3y - u3.y * arm;

      const pos = cubicBezier(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t);
      const tang = cubicBezierTangent(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t);

      car.pixelPos = { x: pos.x, y: pos.y };
      car.renderAngle = Math.atan2(tang.y, tang.x);
    } else {
      // Straight segment — linear interpolation with lane offset
      const baseX = currentCenter.x + (nextCenter.x - currentCenter.x) * t;
      const baseY = currentCenter.y + (nextCenter.y - currentCenter.y) * t;

      const offset = laneOffset(curDir);
      let offsetScale = 1.0;
      if (isFirstSegment) {
        offsetScale = t;
      } else if (isLastSegment) {
        offsetScale = 1.0 - t;
      }

      car.pixelPos = {
        x: baseX + offset.x * offsetScale,
        y: baseY + offset.y * offsetScale,
      };
      car.renderAngle = directionAngle(curDir);
    }
  }

  private updateSingleCar(
    car: Car, dt: number,
    houses: House[], businesses: Business[],
    occupied: Map<string, string>,
    intersectionMap: Map<string, IntersectionEntry[]>,
    toRemove: string[],
  ): void {
    car.prevPixelPos = { ...car.pixelPos };
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
    const level = getTrafficLevel(this.grid, car.path, car.segmentProgress < 0.5 ? car.pathIndex : car.pathIndex + 1);

    // Remove car from old occupancy position
    const oldOccupiedTile = car.segmentProgress < 0.5 ? currentTile : nextTile;
    const oldKey = occupancyKey(oldOccupiedTile.gx, oldOccupiedTile.gy, lane, level);
    if (occupied.get(oldKey) === car.id) {
      occupied.delete(oldKey);
    }

    const isCurrentIntersection = isIntersection(this.grid, currentTile.gx, currentTile.gy);
    const isNextIntersection = car.pathIndex + 1 < car.path.length
      && isIntersection(this.grid, nextTile.gx, nextTile.gy);
    const effectiveSpeed = (isCurrentIntersection || isNextIntersection)
      ? CAR_SPEED * INTERSECTION_SPEED_MULTIPLIER : CAR_SPEED;
    const tileDistance = effectiveSpeed * dt;
    let newProgress = car.segmentProgress + tileDistance;

    newProgress = this.applyCollisionAndYield(
      car, dt, newProgress, nextTile,
      dir, lane, isNextIntersection, occupied, intersectionMap,
    );

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
        (isFinalTile && (cell.type === CellType.House || cell.type === CellType.Business))
      );

      if (!isTraversable) {
        this.rerouteCar(car, houses);
        return;
      }
    }

    if (car.pathIndex >= car.path.length - 1) {
      // Arrived at destination
      car.segmentProgress = 0;
      const dest = car.path[car.path.length - 1];
      const center = gridToPixelCenter(dest);
      car.pixelPos = { ...center };
      car.currentLevel = TrafficLevel.Ground;
      this.handleArrival(car, houses, businesses, toRemove);
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
    const newLevel = getTrafficLevel(this.grid, car.path, car.segmentProgress < 0.5 ? car.pathIndex : car.pathIndex + 1);
    const newKey = occupancyKey(newOccupiedTile.gx, newOccupiedTile.gy, newLane, newLevel);
    occupied.set(newKey, car.id);
  }

  private moveCars(dt: number, houses: House[], businesses: Business[]): void {
    const occupied = this.buildOccupancyMap();
    const intersectionMap = this.buildIntersectionMap();
    const toRemove: string[] = [];

    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded) continue;
      this.updateSingleCar(car, dt, houses, businesses, occupied, intersectionMap, toRemove);
    }

    this.cars = this.cars.filter(c => !toRemove.includes(c.id));
  }

  private handleArrival(car: Car, houses: House[], businesses: Business[], toRemove: string[]): void {
    if (car.state === CarState.GoingToBusiness) {
      const biz = businesses.find(b => b.id === car.targetBusinessId);
      if (biz && biz.demandPins > 0) {
        biz.demandPins--;
        this.score++;
        this.onDelivery?.();
      }

      const dest = car.path[car.path.length - 1];
      const home = houses.find(h => h.id === car.homeHouseId);
      if (home) {
        const homePath = this.pathfinder.findPath(dest, home.pos);
        if (homePath) {
          car.state = CarState.GoingHome;
          car.targetBusinessId = null;
          car.destination = home.pos;
          car.path = homePath;
          car.pathIndex = 0;
          car.segmentProgress = 0;
          if (homePath.length >= 2) {
            const initDir = getDirection(homePath[0], homePath[1]);
            car.renderAngle = directionAngle(initDir);
            car.prevRenderAngle = car.renderAngle;
          }
        } else {
          // Can't find path home — strand at business
          car.state = CarState.Stranded;
          car.targetBusinessId = null;
          car.destination = home.pos;
          car.path = [];
          car.pathIndex = 0;
          car.segmentProgress = 0;
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
  }
}

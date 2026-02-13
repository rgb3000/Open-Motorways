import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { Car, CarState } from '../entities/Car';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import { CAR_SPEED, LANE_OFFSET } from '../constants';
import { Direction, LaneId } from '../types';
import type { GridPos, PixelPos } from '../types';
import { gridToPixelCenter, manhattanDist } from '../utils/math';

function getDirection(from: GridPos, to: GridPos): Direction {
  const dx = to.gx - from.gx;
  const dy = to.gy - from.gy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? Direction.Right : Direction.Left;
  }
  return dy >= 0 ? Direction.Down : Direction.Up;
}

function directionToLane(dir: Direction): LaneId {
  switch (dir) {
    case Direction.Right: return LaneId.HorizontalRight;
    case Direction.Left: return LaneId.HorizontalLeft;
    case Direction.Down: return LaneId.VerticalDown;
    case Direction.Up: return LaneId.VerticalUp;
  }
}

function laneOffset(dir: Direction): PixelPos {
  switch (dir) {
    case Direction.Right: return { x: 0, y: +LANE_OFFSET };  // bottom lane
    case Direction.Left:  return { x: 0, y: -LANE_OFFSET };  // top lane
    case Direction.Down:  return { x: -LANE_OFFSET, y: 0 };  // left lane
    case Direction.Up:    return { x: +LANE_OFFSET, y: 0 };  // right lane
  }
}

function occupancyKey(gx: number, gy: number, lane: LaneId): string {
  return `${gx},${gy},${lane}`;
}

export class CarSystem {
  private cars: Car[] = [];
  private score = 0;
  private pathfinder: Pathfinder;

  constructor(pathfinder: Pathfinder) {
    this.pathfinder = pathfinder;
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
      if (car.state !== CarState.Idle) {
        this.teleportHome(car, houses);
      }
    }
    // Remove all teleported (now idle) cars
    this.cars = [];
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
        .sort((a, b) => manhattanDist(a.pos, biz.pos) - manhattanDist(b.pos, biz.pos));

      let dispatched = 0;
      for (const house of availableHouses) {
        if (dispatched >= neededCars) break;

        const path = this.pathfinder.findPath(house.pos, biz.pos);
        if (!path) continue;

        const car = new Car(house.id, house.color, house.pos);
        car.state = CarState.GoingToBusiness;
        car.targetBusinessId = biz.id;
        car.path = path;
        car.pathIndex = 0;
        car.segmentProgress = 0;

        house.availableCars--;
        this.cars.push(car);
        carsEnRoute.set(biz.id, (carsEnRoute.get(biz.id) ?? 0) + 1);
        dispatched++;
      }
    }
  }

  private moveCars(dt: number, houses: House[], businesses: Business[]): void {
    // Phase 1: Build occupancy map
    const occupied = new Map<string, string>(); // occupancyKey -> carId

    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.path.length < 2) continue;

      const currentTile = car.path[car.pathIndex];
      const nextIdx = Math.min(car.pathIndex + 1, car.path.length - 1);
      const nextTile = car.path[nextIdx];
      const dir = getDirection(currentTile, nextTile);
      const lane = directionToLane(dir);

      // Car occupies the tile its center is closest to
      const occupiedTile = car.segmentProgress < 0.5 ? currentTile : nextTile;
      occupied.set(occupancyKey(occupiedTile.gx, occupiedTile.gy, lane), car.id);
    }

    // Phase 2: Move with collision
    const toRemove: string[] = [];

    for (const car of this.cars) {
      if (car.state === CarState.Idle) continue;

      car.prevPixelPos = { ...car.pixelPos };

      if (car.path.length < 2) {
        // Degenerate path (shouldn't happen but handle gracefully)
        this.handleArrival(car, houses, businesses, toRemove);
        continue;
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

      const tileDistance = CAR_SPEED * dt;
      let newProgress = car.segmentProgress + tileDistance;

      // Check collision when crossing into next tile
      if (newProgress >= 1 && car.pathIndex < car.path.length - 2) {
        const afterNextTile = car.path[car.pathIndex + 2];
        const nextDir = getDirection(nextTile, afterNextTile);
        const nextLane = directionToLane(nextDir);
        const nextKey = occupancyKey(nextTile.gx, nextTile.gy, nextLane);
        const blocker = occupied.get(nextKey);

        if (blocker && blocker !== car.id) {
          // Blocked - clamp to 0.95
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

      car.segmentProgress = newProgress;

      // Advance through path segments
      while (car.segmentProgress >= 1 && car.pathIndex < car.path.length - 1) {
        car.segmentProgress -= 1;
        car.pathIndex++;
      }

      if (car.pathIndex >= car.path.length - 1) {
        // Arrived at destination
        car.segmentProgress = 0;
        const dest = car.path[car.path.length - 1];
        const center = gridToPixelCenter(dest);
        car.pixelPos = { ...center };
        this.handleArrival(car, houses, businesses, toRemove);
      } else {
        // Interpolate position with lane offset
        const curTile = car.path[car.pathIndex];
        const nxtTile = car.path[Math.min(car.pathIndex + 1, car.path.length - 1)];
        const curDir = getDirection(curTile, nxtTile);
        car.direction = curDir;

        const currentCenter = gridToPixelCenter(curTile);
        const nextCenter = gridToPixelCenter(nxtTile);
        const t = car.segmentProgress;

        const baseX = currentCenter.x + (nextCenter.x - currentCenter.x) * t;
        const baseY = currentCenter.y + (nextCenter.y - currentCenter.y) * t;

        // Lane offset with ramping at endpoints
        const offset = laneOffset(curDir);
        let offsetScale = 1.0;
        if (car.pathIndex === 0) {
          offsetScale = t;
        } else if (car.pathIndex === car.path.length - 2) {
          offsetScale = 1.0 - t;
        }

        car.pixelPos = {
          x: baseX + offset.x * offsetScale,
          y: baseY + offset.y * offsetScale,
        };
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

    this.cars = this.cars.filter(c => !toRemove.includes(c.id));
  }

  private handleArrival(car: Car, houses: House[], businesses: Business[], toRemove: string[]): void {
    if (car.state === CarState.GoingToBusiness) {
      const biz = businesses.find(b => b.id === car.targetBusinessId);
      if (biz && biz.demandPins > 0) {
        biz.demandPins--;
        this.score++;
      }

      const dest = car.path[car.path.length - 1];
      const home = houses.find(h => h.id === car.homeHouseId);
      if (home) {
        const homePath = this.pathfinder.findPath(dest, home.pos);
        if (homePath) {
          car.state = CarState.GoingHome;
          car.targetBusinessId = null;
          car.path = homePath;
          car.pathIndex = 0;
          car.segmentProgress = 0;
        } else {
          this.teleportHome(car, houses);
          toRemove.push(car.id);
        }
      } else {
        toRemove.push(car.id);
      }
    } else if (car.state === CarState.GoingHome) {
      const home = houses.find(h => h.id === car.homeHouseId);
      if (home) {
        home.availableCars++;
      }
      toRemove.push(car.id);
    }
  }

  private teleportHome(car: Car, houses: House[]): void {
    const home = houses.find(h => h.id === car.homeHouseId);
    if (home) {
      home.availableCars++;
      const center = gridToPixelCenter(home.pos);
      car.pixelPos = { ...center };
    }
    car.state = CarState.Idle;
    car.path = [];
    car.direction = null;
  }

  reset(): void {
    this.cars = [];
    this.score = 0;
  }
}

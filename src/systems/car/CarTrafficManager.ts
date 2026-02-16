import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Grid } from '../../core/Grid';
import { CAR_SPEED, INTERSECTION_SPEED_MULTIPLIER, INTERSECTION_DEADLOCK_TIMEOUT } from '../../constants';
import { CellType, Direction, LaneId } from '../../types';
import type { GridPos } from '../../types';
import {
  getDirection, directionToLane,
  isPerpendicularAxis, YIELD_TO_DIRECTION,
} from '../../utils/direction';
import { isDiagonal } from '../../utils/math';

export function occupancyKey(gx: number, gy: number, lane: LaneId): string {
  return `${gx},${gy},${lane}`;
}

export function tileKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

export function isIntersection(grid: Grid, gx: number, gy: number): boolean {
  const cell = grid.getCell(gx, gy);
  if (!cell || (cell.type !== CellType.Road && cell.type !== CellType.Connector)) return false;
  if (cell.type === CellType.Connector) return false;
  return cell.roadConnections.length >= 3;
}

export interface IntersectionEntry {
  carId: string;
  entryDirection: Direction;
  inIntersection: boolean;
}

export class CarTrafficManager {
  private grid: Grid;

  // Reusable collections to avoid per-frame allocations
  private _occupiedMap = new Map<string, string>();
  private _intersectionMap = new Map<string, IntersectionEntry[]>();
  private _intersectionEntryPool: IntersectionEntry[][] = [];

  constructor(grid: Grid) {
    this.grid = grid;
  }

  buildOccupancyMap(cars: Car[]): Map<string, string> {
    const occupied = this._occupiedMap;
    occupied.clear();
    for (const car of cars) {
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

  buildIntersectionMap(cars: Car[]): Map<string, IntersectionEntry[]> {
    const intersectionMap = this._intersectionMap;
    // Return used arrays to pool before clearing
    for (const list of intersectionMap.values()) {
      list.length = 0;
      this._intersectionEntryPool.push(list);
    }
    intersectionMap.clear();

    for (const car of cars) {
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

  applyCollisionAndYield(
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

  computeEffectiveSpeed(
    currentTile: GridPos, nextTile: GridPos, dir: Direction,
  ): { effectiveSpeed: number; segmentLength: number } {
    const isCurrentInt = isIntersection(this.grid, currentTile.gx, currentTile.gy);
    const isNextInt = isIntersection(this.grid, nextTile.gx, nextTile.gy);
    const effectiveSpeed = (isCurrentInt || isNextInt)
      ? CAR_SPEED * INTERSECTION_SPEED_MULTIPLIER : CAR_SPEED;
    const segmentLength = isDiagonal(dir) ? Math.SQRT2 : 1;
    return { effectiveSpeed, segmentLength };
  }
}

import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Business } from '../../entities/Business';
import type { House } from '../../entities/House';
import type { Grid } from '../../core/Grid';
import { CellType } from '../../types';
import { getDirection, directionToLane } from '../../utils/direction';
import { sampleAtDistance } from '../../utils/roadGeometry';
import type { CarTrafficManager } from './CarTrafficManager';
import { occupancyKey, isIntersection } from './CarTrafficManager';
import type { IntersectionEntry } from './CarTrafficManager';
import type { CarRouter } from './CarRouter';
import type { PendingDeletionSystem } from '../PendingDeletionSystem';

export class CarMovement {
  private grid: Grid;
  private trafficManager: CarTrafficManager;
  private router: CarRouter;
  private pendingDeletionSystem: PendingDeletionSystem;

  constructor(grid: Grid, trafficManager: CarTrafficManager, router: CarRouter, pendingDeletionSystem: PendingDeletionSystem) {
    this.grid = grid;
    this.trafficManager = trafficManager;
    this.router = router;
    this.pendingDeletionSystem = pendingDeletionSystem;
  }

  interpolateCarPosition(car: Car): void {
    const curTile = car.path[car.pathIndex];
    const nxtTile = car.path[Math.min(car.pathIndex + 1, car.path.length - 1)];
    const curDir = getDirection(curTile, nxtTile);
    car.direction = curDir;

    if (car.smoothPath.length < 2) return;

    const segStart = car.smoothCellDist[car.pathIndex];
    const segEnd = car.smoothCellDist[Math.min(car.pathIndex + 1, car.smoothCellDist.length - 1)];
    const dist = segStart + car.segmentProgress * (segEnd - segStart);

    const result = sampleAtDistance(car.smoothPath, car.smoothCumDist, dist);
    car.pixelPos.x = result.x;
    car.pixelPos.y = result.y;
    car.renderAngle = result.angle;
  }

  updateSingleCar(
    car: Car, dt: number,
    houses: House[], bizMap: Map<string, Business>,
    occupied: Map<string, string>,
    intersectionMap: Map<string, IntersectionEntry[]>,
    toRemove: string[],
    onArrival: (car: Car, houses: House[], bizMap: Map<string, Business>, toRemove: string[]) => void,
  ): void {
    car.prevPixelPos.x = car.pixelPos.x;
    car.prevPixelPos.y = car.pixelPos.y;
    car.prevRenderAngle = car.renderAngle;

    if (car.path.length < 2) {
      this.router.rerouteCar(car, houses);
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

    const isNextIntersection = car.pathIndex + 1 < car.path.length
      && isIntersection(this.grid, nextTile.gx, nextTile.gy);
    const { effectiveSpeed, segmentLength } = this.trafficManager.computeEffectiveSpeed(currentTile, nextTile, dir);
    const tileDistance = (effectiveSpeed * dt) / segmentLength;
    let newProgress = car.segmentProgress + tileDistance;

    newProgress = this.trafficManager.applyCollisionAndYield(
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
      const leftTile = car.path[car.pathIndex];
      car.pathIndex++;
      // Notify pending deletion system when a GoingHome car leaves a pending cell
      if (car.state === CarState.GoingHome) {
        const leftCell = this.grid.getCell(leftTile.gx, leftTile.gy);
        if (leftCell?.pendingDeletion) {
          this.pendingDeletionSystem.notifyCarPassed(car.id, leftTile.gx, leftTile.gy);
        }
      }
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
        this.router.rerouteCar(car, houses);
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
      onArrival(car, houses, bizMap, toRemove);
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
}

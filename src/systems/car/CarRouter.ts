import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { Grid } from '../../core/Grid';
import type { House } from '../../entities/House';
import { CellType } from '../../types';
import type { GridPos } from '../../types';
import type { PathStep } from '../../highways/types';
import { gridToPixelCenter, pixelToGrid } from '../../utils/math';
import { computeSmoothLanePath } from '../../utils/roadGeometry';
import type { GasStationSystem } from '../GasStationSystem';

/** Get the grid position of a path step */
export function stepGridPos(step: PathStep): GridPos {
  if (step.kind === 'grid') return step.pos;
  return step.to;
}

export class CarRouter {
  private pathfinder: Pathfinder;
  private grid: Grid;
  private gasStationSystem: GasStationSystem | null;

  constructor(pathfinder: Pathfinder, grid: Grid, gasStationSystem?: GasStationSystem) {
    this.pathfinder = pathfinder;
    this.grid = grid;
    this.gasStationSystem = gasStationSystem ?? null;
  }

  getCarCurrentTile(car: Car): GridPos {
    if (car.onHighway) {
      return pixelToGrid(car.pixelPos.x, car.pixelPos.y);
    }
    if (car.path.length >= 2 && car.pathIndex < car.path.length - 1) {
      const curPos = stepGridPos(car.path[car.pathIndex]);
      const nxtPos = stepGridPos(car.path[car.pathIndex + 1]);
      return car.segmentProgress >= 0.5 ? nxtPos : curPos;
    }
    if (car.path.length > 0 && car.pathIndex < car.path.length) {
      return stepGridPos(car.path[car.pathIndex]);
    }
    return pixelToGrid(car.pixelPos.x, car.pixelPos.y);
  }

  assignPath(car: Car, path: PathStep[]): void {
    car.path = path;
    car.pathIndex = 0;
    car.segmentProgress = 0;
    car.onHighway = false;
    car.highwayPolyline = null;
    car.highwayCumDist = null;
    car.highwayProgress = 0;
    car.sameLaneWaitTime = 0;
    car.parkingWaitTime = 0;
    car.stuckTimer = 0;
    car.lastAdvancedPathIndex = 0;
    car.arcDistance = 0;
    car.currentSpeed = 0;
    car.leaderId = null;
    car.leaderGap = Infinity;

    if (path.length >= 2) {
      const gridPositions = this.extractLeadingGridPositions(path, 0);
      this.computeAndAssignSmoothPath(car, gridPositions, 0);
    } else {
      car.smoothPath = [];
      car.smoothCumDist = [];
      car.smoothCellDist = [];
    }
  }

  /** Extract grid positions from path starting at startIdx up to (but not including) the next highway step */
  private extractLeadingGridPositions(path: PathStep[], startIdx: number): GridPos[] {
    const positions: GridPos[] = [];
    for (let i = startIdx; i < path.length; i++) {
      const step = path[i];
      if (step.kind === 'highway') break;
      positions.push(step.pos);
    }
    return positions;
  }

  /** Compute smooth lane path for a grid segment and assign to car */
  private computeAndAssignSmoothPath(car: Car, gridPositions: GridPos[], pathStartIdx: number): void {
    if (gridPositions.length >= 2) {
      let startTrim = 0;
      let endTrim = gridPositions.length;
      while (startTrim < gridPositions.length) {
        const cell = this.grid.getCell(gridPositions[startTrim].gx, gridPositions[startTrim].gy);
        if (cell && cell.type !== CellType.Business) break;
        startTrim++;
      }
      while (endTrim > startTrim) {
        const cell = this.grid.getCell(gridPositions[endTrim - 1].gx, gridPositions[endTrim - 1].gy);
        if (cell && cell.type !== CellType.Business) break;
        endTrim--;
      }
      const smoothPath = gridPositions.slice(startTrim, endTrim);
      if (smoothPath.length >= 2) {
        const smooth = computeSmoothLanePath(smoothPath);
        car.smoothPath = smooth.points;
        car.smoothCumDist = smooth.cumDist;
        const padded = new Array(pathStartIdx + startTrim).fill(0);
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

  /** Recompute smooth path for the grid segment starting after a highway exit */
  recomputeSmoothPathFromIndex(car: Car, startIdx: number): void {
    const gridPositions = this.extractLeadingGridPositions(car.path, startIdx);
    this.computeAndAssignSmoothPath(car, gridPositions, startIdx);
  }

  rerouteCar(car: Car, houseMap: Map<string, House>): void {
    if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit ||
        car.state === CarState.ParkingIn || car.state === CarState.ParkingOut ||
        car.state === CarState.Refueling) return;

    // GoingToGasStation: try to reroute to same station or find a new one
    if (car.state === CarState.GoingToGasStation && this.gasStationSystem && car.targetGasStationId) {
      const currentTile = this.getCarCurrentTile(car);
      const station = this.gasStationSystem.getGasStationById(car.targetGasStationId);
      if (station) {
        const path = this.pathfinder.findPath(currentTile, station.entryConnectorPos);
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
      // Try to find a different gas station
      const result = this.gasStationSystem.findNearestReachable(this.getCarCurrentTile(car), this.pathfinder);
      if (result) {
        const path = this.pathfinder.findPath(currentTile, result.station.entryConnectorPos);
        if (path) {
          car.targetGasStationId = result.station.id;
          car.destination = result.station.entryConnectorPos;
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
      // Fall through to standard stranded logic below
    }

    const currentTile = this.getCarCurrentTile(car);
    const home = houseMap.get(car.homeHouseId);

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

    if (car.state === CarState.GoingToBusiness) {
      car.targetBusinessId = null;
    }

    if (home) {
      const homePath = this.pathfinder.findPath(currentTile, home.pos, true);
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

    car.state = CarState.Stranded;
    car.path = [];
    car.pathIndex = 0;
    car.segmentProgress = 0;
    car.onHighway = false;
    car.highwayPolyline = null;
    car.highwayCumDist = null;
    car.highwayProgress = 0;
    car.smoothPath = [];
    car.smoothCumDist = [];
    car.smoothCellDist = [];
    car.arcDistance = 0;
    car.currentSpeed = 0;
    car.leaderId = null;
    car.leaderGap = Infinity;
    const center = gridToPixelCenter(currentTile);
    car.pixelPos.x = center.x;
    car.pixelPos.y = center.y;
    if (home) {
      car.destination = home.pos;
    }
  }
}

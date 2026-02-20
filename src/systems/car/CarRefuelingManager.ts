import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Business } from '../../entities/Business';
import type { House } from '../../entities/House';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { CarRouter } from './CarRouter';
import { stepGridPos } from './CarRouter';
import type { GasStationSystem } from '../GasStationSystem';
import { FUEL_CAPACITY, REFUEL_TIME } from '../../constants';
import { gridToPixelCenter } from '../../utils/math';
import { getDirection, directionAngle } from '../../utils/direction';

export class CarRefuelingManager {
  private pathfinder: Pathfinder;
  private router: CarRouter;
  private gasStationSystem: GasStationSystem | null;

  constructor(pathfinder: Pathfinder, router: CarRouter, gasStationSystem?: GasStationSystem) {
    this.pathfinder = pathfinder;
    this.router = router;
    this.gasStationSystem = gasStationSystem ?? null;
  }

  handleGasStationArrival(car: Car): void {
    if (!this.gasStationSystem) return;
    const station = car.targetGasStationId ? this.gasStationSystem.getGasStationById(car.targetGasStationId) : undefined;
    if (!station) {
      car.state = CarState.Stranded;
      return;
    }

    // If station is occupied, car will be blocked by movement logic (stuck at connector)
    if (station.refuelingCarId !== null && station.refuelingCarId !== car.id) {
      // Wait — don't change state, let stuck timer handle it
      return;
    }

    station.refuelingCarId = car.id;
    car.state = CarState.Refueling;
    car.refuelTimer = 0;
    car.path = [];
    car.pathIndex = 0;
    car.segmentProgress = 0;
    car.smoothPath = [];
    car.smoothCumDist = [];
    car.smoothCellDist = [];
  }

  updateRefuelingCar(
    car: Car, dt: number,
    bizMap: Map<string, Business>,
    houseMap: Map<string, House>,
  ): void {
    car.refuelTimer += dt;
    if (car.refuelTimer < REFUEL_TIME) return;

    // Refueling complete
    car.fuel = FUEL_CAPACITY;

    if (!this.gasStationSystem) return;
    const station = car.targetGasStationId ? this.gasStationSystem.getGasStationById(car.targetGasStationId) : undefined;
    if (station) {
      station.refuelingCarId = null;
    }
    car.targetGasStationId = null;
    car.refuelTimer = 0;

    // Reposition car at exit connector
    const exitPos = station?.exitConnectorPos;
    if (exitPos) {
      const center = gridToPixelCenter(exitPos);
      car.pixelPos.x = center.x;
      car.pixelPos.y = center.y;
      car.prevPixelPos.x = center.x;
      car.prevPixelPos.y = center.y;
    }

    if (car.postRefuelIntent === 'business') {
      // Find highest-demand business of matching color
      let bestBiz: Business | null = null;
      let bestDemand = 0;
      for (const [, biz] of bizMap) {
        if (biz.color === car.color && biz.demandPins > bestDemand) {
          bestDemand = biz.demandPins;
          bestBiz = biz;
        }
      }

      if (bestBiz && exitPos) {
        const path = this.pathfinder.findPath(exitPos, bestBiz.parkingLotPos);
        if (path && path.length >= 2) {
          car.state = CarState.GoingToBusiness;
          car.targetBusinessId = bestBiz.id;
          car.destination = bestBiz.parkingLotPos;
          this.router.assignPath(car, path);
          if (car.smoothPath.length >= 2) {
            car.pixelPos.x = car.smoothPath[0].x;
            car.pixelPos.y = car.smoothPath[0].y;
            car.prevPixelPos.x = car.pixelPos.x;
            car.prevPixelPos.y = car.pixelPos.y;
            if (path.length >= 2) {
              const p0 = stepGridPos(path[0]);
              const p1 = stepGridPos(path[1]);
              const initDir = getDirection(p0, p1);
              car.renderAngle = directionAngle(initDir);
              car.prevRenderAngle = car.renderAngle;
            }
          }
          return;
        }
      }
    } else {
      // Going home
      const home = houseMap.get(car.homeHouseId);
      if (home && exitPos) {
        const homePath = this.pathfinder.findPath(exitPos, home.pos, true);
        if (homePath && homePath.length >= 2) {
          car.state = CarState.GoingHome;
          car.targetBusinessId = null;
          car.destination = home.pos;
          this.router.assignPath(car, homePath);
          if (car.smoothPath.length >= 2) {
            car.pixelPos.x = car.smoothPath[0].x;
            car.pixelPos.y = car.smoothPath[0].y;
            car.prevPixelPos.x = car.pixelPos.x;
            car.prevPixelPos.y = car.pixelPos.y;
            if (homePath.length >= 2) {
              const p0 = stepGridPos(homePath[0]);
              const p1 = stepGridPos(homePath[1]);
              const initDir = getDirection(p0, p1);
              car.renderAngle = directionAngle(initDir);
              car.prevRenderAngle = car.renderAngle;
            }
          }
          return;
        }
      }
    }

    // If no path found, strand the car
    car.state = CarState.Stranded;
    car.path = [];
    car.pathIndex = 0;
    car.segmentProgress = 0;
    car.smoothPath = [];
    car.smoothCumDist = [];
    car.smoothCellDist = [];
  }
}

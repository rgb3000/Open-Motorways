import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { CarRouter } from './CarRouter';
import { stepGridPos } from './CarRouter';
import { manhattanDist, gridToPixelCenter } from '../../utils/math';
import { getDirection, directionAngle, directionToLane } from '../../utils/direction';
import { occupancyKey } from './CarTrafficManager';
import { computePathFuelCost } from '../../pathfinding/pathCost';
import type { GasStationSystem } from '../GasStationSystem';
import type { HighwaySystem } from '../HighwaySystem';

const DISPATCH_INTERVAL = 10; // only dispatch every N ticks (~6 Hz)

export class CarDispatcher {
  private pathfinder: Pathfinder;
  private router: CarRouter;
  private _carsEnRoute = new Map<string, number>();
  private _tickCounter = 0;

  private gasStationSystem: GasStationSystem | null;
  private highwaySystem: HighwaySystem | null;

  constructor(pathfinder: Pathfinder, router: CarRouter, gasStationSystem?: GasStationSystem, highwaySystem?: HighwaySystem) {
    this.pathfinder = pathfinder;
    this.router = router;
    this.gasStationSystem = gasStationSystem ?? null;
    this.highwaySystem = highwaySystem ?? null;
  }

  dispatch(cars: Car[], houses: House[], businesses: Business[], occupied: Map<number, string>): Car[] {
    if (++this._tickCounter < DISPATCH_INTERVAL) return [];
    this._tickCounter = 0;

    const demandBusinesses = businesses.filter(b => b.demandPins > 0)
      .sort((a, b) => b.demandPins - a.demandPins);
    if (demandBusinesses.length === 0) return [];

    const carsEnRoute = this._carsEnRoute;
    carsEnRoute.clear();
    for (const car of cars) {
      if ((car.state === CarState.GoingToBusiness || (car.state === CarState.GoingToGasStation && car.postRefuelIntent === 'business')) && car.targetBusinessId) {
        carsEnRoute.set(car.targetBusinessId, (carsEnRoute.get(car.targetBusinessId) ?? 0) + 1);
      }
    }

    const newCars: Car[] = [];

    for (const biz of demandBusinesses) {
      const enRouteCount = carsEnRoute.get(biz.id) ?? 0;
      const neededCars = biz.demandPins - enRouteCount;
      if (neededCars <= 0) continue;

      const availableHouses = houses
        .filter(h => h.color === biz.color && h.carPool.length > 0)
        .sort((a, b) => manhattanDist(a.pos, biz.parkingLotPos) - manhattanDist(b.pos, biz.parkingLotPos));

      let dispatched = 0;
      for (const house of availableHouses) {
        if (dispatched >= neededCars) break;

        const path = this.pathfinder.findPath(house.pos, biz.parkingLotPos);
        if (!path || path.length < 2) continue;

        // Check if the spawn tile is already occupied
        const p0 = stepGridPos(path[0]);
        const p1 = stepGridPos(path[1]);
        const spawnDir = getDirection(p0, p1);
        const spawnLane = directionToLane(spawnDir);
        const spawnKey = occupancyKey(p0.gx, p0.gy, spawnLane);
        if (occupied.has(spawnKey)) continue;

        // Check if car has enough fuel for the trip
        const fuelCost = computePathFuelCost(path, this.highwaySystem);
        const car = house.popCar();
        if (!car) continue;

        // Set pixel position to house location (car may have been elsewhere last)
        const houseCenter = gridToPixelCenter(house.pos);
        car.pixelPos.x = houseCenter.x;
        car.pixelPos.y = houseCenter.y;
        car.prevPixelPos.x = houseCenter.x;
        car.prevPixelPos.y = houseCenter.y;

        if (fuelCost > car.fuel && this.gasStationSystem) {
          // Need to refuel first — find nearest gas station
          const result = this.gasStationSystem.findNearestReachable(house.pos, this.pathfinder, this.highwaySystem);
          if (result) {
            const stationPath = this.pathfinder.findPath(house.pos, result.station.entryConnectorPos);
            if (stationPath && stationPath.length >= 2) {
              car.state = CarState.GoingToGasStation;
              car.targetBusinessId = biz.id;
              car.targetGasStationId = result.station.id;
              car.postRefuelIntent = 'business';
              car.destination = result.station.entryConnectorPos;
              this.router.assignPath(car, stationPath);
            } else {
              house.returnCar(car);
              continue;
            }
          } else {
            house.returnCar(car);
            continue;
          }
        } else {
          car.state = CarState.GoingToBusiness;
          car.targetBusinessId = biz.id;
          car.destination = biz.parkingLotPos;
          this.router.assignPath(car, path);
        }

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

        newCars.push(car);
        occupied.set(spawnKey, car.id);
        carsEnRoute.set(biz.id, (carsEnRoute.get(biz.id) ?? 0) + 1);
        dispatched++;
      }
    }

    return newCars;
  }
}

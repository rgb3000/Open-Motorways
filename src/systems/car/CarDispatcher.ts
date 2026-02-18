import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { Car, CarState } from '../../entities/Car';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { CarRouter } from './CarRouter';
import { stepGridPos } from './CarRouter';
import { manhattanDist } from '../../utils/math';
import { getDirection, directionAngle } from '../../utils/direction';

export class CarDispatcher {
  private pathfinder: Pathfinder;
  private router: CarRouter;
  private _carsEnRoute = new Map<string, number>();

  constructor(pathfinder: Pathfinder, router: CarRouter) {
    this.pathfinder = pathfinder;
    this.router = router;
  }

  dispatch(cars: Car[], houses: House[], businesses: Business[]): Car[] {
    const demandBusinesses = businesses.filter(b => b.demandPins > 0)
      .sort((a, b) => b.demandPins - a.demandPins);
    if (demandBusinesses.length === 0) return [];

    const carsEnRoute = this._carsEnRoute;
    carsEnRoute.clear();
    for (const car of cars) {
      if (car.state === CarState.GoingToBusiness && car.targetBusinessId) {
        carsEnRoute.set(car.targetBusinessId, (carsEnRoute.get(car.targetBusinessId) ?? 0) + 1);
      }
    }

    const newCars: Car[] = [];

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

        house.availableCars--;
        newCars.push(car);
        carsEnRoute.set(biz.id, (carsEnRoute.get(biz.id) ?? 0) + 1);
        dispatched++;
      }
    }

    return newCars;
  }
}

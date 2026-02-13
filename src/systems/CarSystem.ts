import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { Car, CarState } from '../entities/Car';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import { CAR_SPEED } from '../constants';
import { gridToPixelCenter, manhattanDist } from '../utils/math';

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
    const toRemove: string[] = [];

    for (const car of this.cars) {
      if (car.state === CarState.Idle) continue;

      car.prevPixelPos = { ...car.pixelPos };

      const tileDistance = CAR_SPEED * dt;
      car.segmentProgress += tileDistance;

      while (car.segmentProgress >= 1 && car.pathIndex < car.path.length - 1) {
        car.segmentProgress -= 1;
        car.pathIndex++;
      }

      if (car.pathIndex >= car.path.length - 1) {
        car.segmentProgress = 0;
        const dest = car.path[car.path.length - 1];
        const center = gridToPixelCenter(dest);
        car.pixelPos = { ...center };

        if (car.state === CarState.GoingToBusiness) {
          const biz = businesses.find(b => b.id === car.targetBusinessId);
          if (biz && biz.demandPins > 0) {
            biz.demandPins--;
            this.score++;
          }

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
      } else {
        const currentTile = car.path[car.pathIndex];
        const nextTile = car.path[Math.min(car.pathIndex + 1, car.path.length - 1)];
        const currentCenter = gridToPixelCenter(currentTile);
        const nextCenter = gridToPixelCenter(nextTile);
        const t = car.segmentProgress;
        car.pixelPos = {
          x: currentCenter.x + (nextCenter.x - currentCenter.x) * t,
          y: currentCenter.y + (nextCenter.y - currentCenter.y) * t,
        };
      }
    }

    this.cars = this.cars.filter(c => !toRemove.includes(c.id));
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
  }

  reset(): void {
    this.cars = [];
    this.score = 0;
  }
}

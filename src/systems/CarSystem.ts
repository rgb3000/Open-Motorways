import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { Car, CarState } from '../entities/Car';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import type { Grid } from '../core/Grid';
import { PARKING_EXIT_DELAY } from '../constants';
import { gridToPixelCenter } from '../utils/math';
import { CarRouter } from './car/CarRouter';
import { CarTrafficManager } from './car/CarTrafficManager';
import { CarParkingManager } from './car/CarParkingManager';
import { CarDispatcher } from './car/CarDispatcher';
import { CarMovement } from './car/CarMovement';

export class CarSystem {
  private cars: Car[] = [];
  private score = 0;
  private pathfinder: Pathfinder;
  private exitCooldowns = new Map<string, number>();
  onDelivery: (() => void) | null = null;
  onHomeReturn: (() => void) | null = null;

  private router: CarRouter;
  private trafficManager: CarTrafficManager;
  private parkingManager: CarParkingManager;
  private dispatcher: CarDispatcher;
  private movement: CarMovement;

  // Reusable collections
  private _toRemove: string[] = [];
  private _toRemoveSet = new Set<string>();
  private _businessMap = new Map<string, Business>();

  constructor(pathfinder: Pathfinder, grid: Grid) {
    this.pathfinder = pathfinder;

    this.router = new CarRouter(pathfinder, grid);
    this.trafficManager = new CarTrafficManager(grid);
    this.dispatcher = new CarDispatcher(pathfinder, this.router);
    this.parkingManager = new CarParkingManager(pathfinder, this.router);
    this.movement = new CarMovement(grid, this.trafficManager, this.router);
  }

  getCars(): Car[] {
    return this.cars;
  }

  getScore(): number {
    return this.score;
  }

  update(dt: number, houses: House[], businesses: Business[]): void {
    // Dispatch new cars
    const newCars = this.dispatcher.dispatch(this.cars, houses, businesses);
    for (const car of newCars) {
      this.cars.push(car);
    }

    this.moveCars(dt, houses, businesses);
  }

  onRoadsChanged(houses: House[]): void {
    for (const car of this.cars) {
      if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit) continue;
      if (car.state !== CarState.Stranded) continue;

      const currentTile = this.router.getCarCurrentTile(car);
      const home = houses.find(h => h.id === car.homeHouseId);

      // Try to repath to original destination
      if (car.destination) {
        const path = this.pathfinder.findPath(currentTile, car.destination);
        if (path) {
          car.state = home && car.destination.gx === home.pos.gx && car.destination.gy === home.pos.gy
            ? CarState.GoingHome
            : CarState.GoingToBusiness;
          this.router.assignPath(car, path);
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
          this.router.assignPath(car, homePath);
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

    const occupied = this.trafficManager.buildOccupancyMap(this.cars);
    const intersectionMap = this.trafficManager.buildIntersectionMap(this.cars);
    const toRemove = this._toRemove;
    toRemove.length = 0;

    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded) continue;
      if (car.state === CarState.Unloading) {
        this.parkingManager.updateUnloadingCar(car, dt, bizMap, () => {
          this.score++;
          this.onDelivery?.();
        });
        continue;
      }
      if (car.state === CarState.WaitingToExit) {
        this.parkingManager.updateWaitingToExitCar(
          car, houses, bizMap, this.cars, toRemove,
          this.exitCooldowns,
          (bizId) => { this.exitCooldowns.set(bizId, PARKING_EXIT_DELAY); },
        );
        continue;
      }
      this.movement.updateSingleCar(
        car, dt, houses, bizMap, occupied, intersectionMap, toRemove,
        (c, h, bm, tr) => this.handleArrival(c, h, bm, tr),
      );
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
      this.parkingManager.handleParkingArrival(car, houses, bizMap, toRemove);
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

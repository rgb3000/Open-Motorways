import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { Car, CarState } from '../entities/Car';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import type { Grid } from '../core/Grid';
import { PARKING_EXIT_DELAY } from '../constants';
import { CarRouter } from './car/CarRouter';
import { CarTrafficManager } from './car/CarTrafficManager';
import { CarParkingManager } from './car/CarParkingManager';
import { CarDispatcher } from './car/CarDispatcher';
import { CarMovement } from './car/CarMovement';
import { CarLeaderIndex } from './car/CarLeaderIndex';
import { CarRefuelingManager } from './car/CarRefuelingManager';
import { CarRescueManager } from './car/CarRescueManager';
import type { PendingDeletionSystem } from './PendingDeletionSystem';
import type { HighwaySystem } from './HighwaySystem';
import type { GasStationSystem } from './GasStationSystem';

export class CarSystem {
  private cars: Car[] = [];
  private score = 0;
  private exitCooldowns = new Map<string, number>();
  onDelivery: (() => void) | null = null;
  onHomeReturn: (() => void) | null = null;

  private router: CarRouter;
  private trafficManager: CarTrafficManager;
  private parkingManager: CarParkingManager;
  private dispatcher: CarDispatcher;
  private movement: CarMovement;
  private leaderIndex: CarLeaderIndex;
  private refuelingManager: CarRefuelingManager;
  private rescueManager: CarRescueManager;
  private pendingDeletionSystem: PendingDeletionSystem;

  // Reusable collections
  private _toRemove: string[] = [];
  private _toRemoveSet = new Set<string>();
  private _businessMap = new Map<string, Business>();
  private _houseMap = new Map<string, House>();

  constructor(pathfinder: Pathfinder, grid: Grid, pendingDeletionSystem: PendingDeletionSystem, highwaySystem?: HighwaySystem, gasStationSystem?: GasStationSystem) {
    this.pendingDeletionSystem = pendingDeletionSystem;

    this.router = new CarRouter(pathfinder, grid, gasStationSystem);
    this.trafficManager = new CarTrafficManager(grid);
    this.dispatcher = new CarDispatcher(pathfinder, this.router, gasStationSystem, highwaySystem);
    this.parkingManager = new CarParkingManager(pathfinder, this.router, pendingDeletionSystem, gasStationSystem, highwaySystem);
    this.movement = new CarMovement(grid, this.trafficManager, this.router, pendingDeletionSystem, highwaySystem);
    this.leaderIndex = new CarLeaderIndex();
    this.refuelingManager = new CarRefuelingManager(pathfinder, this.router, gasStationSystem);
    this.rescueManager = new CarRescueManager(pathfinder, grid, this.router, gasStationSystem, highwaySystem);
  }

  getCars(): Car[] {
    return this.cars;
  }

  getScore(): number {
    return this.score;
  }

  update(dt: number, houses: House[], businesses: Business[]): void {
    // Build house lookup map
    const houseMap = this._houseMap;
    houseMap.clear();
    for (const h of houses) houseMap.set(h.id, h);

    // Build occupancy map before dispatch so spawning checks for existing traffic
    const occupied = this.trafficManager.buildOccupancyMap(this.cars);
    const newCars = this.dispatcher.dispatch(this.cars, houses, businesses, occupied);
    for (const car of newCars) {
      this.cars.push(car);
    }

    this.moveCars(dt, houses, businesses, occupied, houseMap);
  }

  onRoadsChanged(houses: House[]): void {
    // Build house map for O(1) lookups
    const houseMap = this._houseMap;
    houseMap.clear();
    for (const h of houses) houseMap.set(h.id, h);

    this.rescueManager.rescueStrandedCars(this.cars, houseMap);
    this.rescueManager.rerouteActiveCars(this.cars, houseMap);
  }

  private moveCars(dt: number, houses: House[], businesses: Business[], occupied: Map<number, string>, houseMap: Map<string, House>): void {
    this.trafficManager.advanceFrameTime(dt);

    for (const [bizId, cd] of this.exitCooldowns) {
      const remaining = cd - dt;
      if (remaining <= 0) {
        this.exitCooldowns.delete(bizId);
      } else {
        this.exitCooldowns.set(bizId, remaining);
      }
    }

    const bizMap = this._businessMap;
    bizMap.clear();
    for (const biz of businesses) {
      bizMap.set(biz.id, biz);
    }
    const intersectionMap = this.trafficManager.buildIntersectionMap(this.cars);

    // Build leader index and find leader for each car
    this.leaderIndex.rebuild(this.cars);
    for (const car of this.cars) {
      this.leaderIndex.findLeader(car);
    }

    const toRemove = this._toRemove;
    toRemove.length = 0;

    for (const car of this.cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded) continue;
      if (car.state === CarState.Refueling) {
        this.refuelingManager.updateRefuelingCar(car, dt, bizMap, houseMap);
        continue;
      }
      if (car.state === CarState.Unloading) {
        this.parkingManager.updateUnloadingCar(car, dt, bizMap, () => {
          this.score++;
          this.onDelivery?.();
        });
        continue;
      }
      if (car.state === CarState.WaitingToExit) {
        this.parkingManager.updateWaitingToExitCar(
          car, houseMap, bizMap, occupied, toRemove,
          this.exitCooldowns,
          (bizId) => { this.exitCooldowns.set(bizId, PARKING_EXIT_DELAY); },
        );
        continue;
      }
      if (car.state === CarState.ParkingIn) {
        this.parkingManager.updateParkingInCar(car, dt);
        continue;
      }
      if (car.state === CarState.ParkingOut) {
        this.parkingManager.updateParkingOutCar(car, dt, houses, bizMap, toRemove);
        continue;
      }
      this.movement.updateSingleCar(
        car, dt, houses, bizMap, occupied, intersectionMap, toRemove,
        (c, h, bm, tr) => this.handleArrival(c, h, bm, tr, houseMap),
        houseMap,
      );
    }

    if (toRemove.length > 0) {
      const removeSet = this._toRemoveSet;
      removeSet.clear();
      for (const id of toRemove) {
        removeSet.add(id);
        this.pendingDeletionSystem.notifyCarRemoved(id);
      }
      this.cars = this.cars.filter(c => !removeSet.has(c.id));
    }
  }

  private handleArrival(car: Car, _houses: House[], bizMap: Map<string, Business>, toRemove: string[], houseMap: Map<string, House>): void {
    if (car.state === CarState.GoingToGasStation) {
      this.refuelingManager.handleGasStationArrival(car);
      return;
    }
    if (car.state === CarState.GoingToBusiness) {
      this.parkingManager.handleParkingArrival(car, houseMap, bizMap, toRemove);
    } else if (car.state === CarState.GoingHome) {
      const home = houseMap.get(car.homeHouseId);
      if (home) {
        home.returnCar(car);
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

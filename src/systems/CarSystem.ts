import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { Car, CarState } from '../entities/Car';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import type { Grid } from '../core/Grid';
import { PARKING_EXIT_DELAY } from '../constants';
import { gridToPixelCenter } from '../utils/math';
import { CarRouter, stepGridPos } from './car/CarRouter';
import { CarTrafficManager } from './car/CarTrafficManager';
import { CarParkingManager } from './car/CarParkingManager';
import { CarDispatcher } from './car/CarDispatcher';
import { CarMovement } from './car/CarMovement';
import { CarLeaderIndex } from './car/CarLeaderIndex';
import type { PendingDeletionSystem } from './PendingDeletionSystem';
import type { HighwaySystem } from './HighwaySystem';
import type { GasStationSystem } from './GasStationSystem';
import { FUEL_CAPACITY, REFUEL_TIME } from '../constants';
import { getDirection, directionAngle } from '../utils/direction';
import { computePathFuelCost } from '../pathfinding/pathCost';

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
  private leaderIndex: CarLeaderIndex;
  private pendingDeletionSystem: PendingDeletionSystem;
  private grid: Grid;
  private gasStationSystem: GasStationSystem | null;
  private highwaySystem: HighwaySystem | null;

  // Reusable collections
  private _toRemove: string[] = [];
  private _toRemoveSet = new Set<string>();
  private _businessMap = new Map<string, Business>();
  private _houseMap = new Map<string, House>();

  constructor(pathfinder: Pathfinder, grid: Grid, pendingDeletionSystem: PendingDeletionSystem, highwaySystem?: HighwaySystem, gasStationSystem?: GasStationSystem) {
    this.pathfinder = pathfinder;
    this.pendingDeletionSystem = pendingDeletionSystem;
    this.grid = grid;
    this.gasStationSystem = gasStationSystem ?? null;
    this.highwaySystem = highwaySystem ?? null;

    this.router = new CarRouter(pathfinder, grid, gasStationSystem);
    this.trafficManager = new CarTrafficManager(grid);
    this.dispatcher = new CarDispatcher(pathfinder, this.router, gasStationSystem, highwaySystem);
    this.parkingManager = new CarParkingManager(pathfinder, this.router, pendingDeletionSystem, gasStationSystem, highwaySystem);
    this.movement = new CarMovement(grid, this.trafficManager, this.router, pendingDeletionSystem, highwaySystem);
    this.leaderIndex = new CarLeaderIndex();
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

    for (const car of this.cars) {
      if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit ||
          car.state === CarState.ParkingIn || car.state === CarState.ParkingOut ||
          car.state === CarState.Refueling) continue;
      if (car.state !== CarState.Stranded) continue;

      const currentTile = this.router.getCarCurrentTile(car);
      const home = houseMap.get(car.homeHouseId);

      // Try to find a path to the car's destination or home
      let rescuePath: typeof car.path | null = null;
      let rescueState: CarState = CarState.Stranded;

      if (car.destination) {
        const path = this.pathfinder.findPath(currentTile, car.destination);
        if (path) {
          rescuePath = path;
          rescueState = home && car.destination.gx === home.pos.gx && car.destination.gy === home.pos.gy
            ? CarState.GoingHome
            : CarState.GoingToBusiness;
        }
      }

      if (!rescuePath && home) {
        const homePath = this.pathfinder.findPath(currentTile, home.pos, true);
        if (homePath) {
          rescuePath = homePath;
          rescueState = CarState.GoingHome;
          car.targetBusinessId = null;
          car.destination = home.pos;
        }
      }

      // Check if the car has enough fuel for the rescue path
      if (rescuePath) {
        const fuelCost = computePathFuelCost(rescuePath, this.highwaySystem);
        if (fuelCost <= car.fuel) {
          // Enough fuel — send car on its way
          car.state = rescueState;
          this.router.assignPath(car, rescuePath);
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
        // Not enough fuel — fall through to gas station routing
      }

      // Car needs fuel (no path found, or not enough fuel for path) — try gas station
      if (this.gasStationSystem) {
        const result = this.gasStationSystem.findNearestReachable(currentTile, this.pathfinder, this.highwaySystem);
        if (result && result.fuelCost <= car.fuel) {
          const stationPath = this.pathfinder.findPath(currentTile, result.station.entryConnectorPos);
          if (stationPath) {
            car.state = CarState.GoingToGasStation;
            car.targetGasStationId = result.station.id;
            car.postRefuelIntent = 'home';
            if (home) car.destination = home.pos;
            this.router.assignPath(car, stationPath);
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

      // No rescue possible — car stays stranded
    }

    // Reroute active cars whose path crosses a pending-deletion cell
    for (const car of this.cars) {
      if (car.path.length === 0) continue;
      if (car.state !== CarState.GoingToBusiness && car.state !== CarState.GoingHome && car.state !== CarState.GoingToGasStation) continue;
      if (car.onHighway) continue;

      let crossesPending = false;
      for (let i = car.pathIndex; i < car.path.length; i++) {
        const step = car.path[i];
        if (step.kind !== 'grid') continue;
        const c = this.grid.getCell(step.pos.gx, step.pos.gy);
        if (c?.pendingDeletion) {
          if (car.state === CarState.GoingHome) { crossesPending = false; break; }
          crossesPending = true;
          break;
        }
      }
      if (crossesPending) {
        this.router.rerouteCar(car, houseMap);
      }
    }
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
        this.updateRefuelingCar(car, dt, houses, bizMap, houseMap, toRemove);
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
      this.handleGasStationArrival(car);
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

  private handleGasStationArrival(car: Car): void {
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

  private updateRefuelingCar(
    car: Car, dt: number,
    _houses: House[], bizMap: Map<string, Business>,
    houseMap: Map<string, House>, _toRemove: string[],
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

  reset(): void {
    this.cars = [];
    this.score = 0;
    this.exitCooldowns.clear();
  }
}

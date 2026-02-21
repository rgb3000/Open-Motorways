import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Business } from '../../entities/Business';
import type { House } from '../../entities/House';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { CarRouter } from './CarRouter';
import { stepGridPos } from './CarRouter';
import type { GasStationSystem } from '../GasStationSystem';
import { FUEL_CAPACITY, REFUEL_TIME } from '../../constants';
import { getDirection, directionAngle } from '../../utils/direction';
import { getGasStationLayout } from '../../utils/gasStationLayout';

function computeCumDist(points: { x: number; y: number }[]): number[] {
  const d = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    d.push(d[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return d;
}

function sampleQuadraticBezier(
  p0: { x: number; y: number },
  cp: { x: number; y: number },
  p1: { x: number; y: number },
  segments: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push({
      x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
    });
  }
  return points;
}

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

    const slotIndex = station.getFreeParkingSlot();
    if (slotIndex === null) {
      // No free slot — car waits at entry, stuck timer handles it
      return;
    }

    station.occupySlot(slotIndex, car.id);
    car.assignedSlotIndex = slotIndex;
    car.path = [];
    car.pathIndex = 0;
    car.segmentProgress = 0;
    car.smoothPath = [];
    car.smoothCumDist = [];
    car.smoothCellDist = [];

    // Build Bezier path from entry connector to parking slot
    const layout = getGasStationLayout({
      entryConnectorPos: station.entryConnectorPos,
      pos: station.pos,
      exitConnectorPos: station.exitConnectorPos,
      orientation: station.orientation,
    });

    const currentPos = { x: car.pixelPos.x, y: car.pixelPos.y };
    const slotRect = layout.parkingSlots[slotIndex];
    const slotPos = { x: slotRect.centerX, y: slotRect.centerZ };

    // Control point: L-corner depending on orientation
    const isHoriz = station.orientation === 'horizontal';
    const cp = isHoriz
      ? { x: slotPos.x, y: currentPos.y }
      : { x: currentPos.x, y: slotPos.y };

    car.parkingPath = sampleQuadraticBezier(currentPos, cp, slotPos, 16);
    car.parkingCumDist = computeCumDist(car.parkingPath);
    car.parkingProgress = 0;
    car.state = CarState.ParkingIn;
  }

  updateRefuelingCar(
    car: Car, dt: number,
    _bizMap: Map<string, Business>,
    _houseMap: Map<string, House>,
  ): void {
    car.refuelTimer += dt;
    if (car.refuelTimer < REFUEL_TIME) return;

    // Refueling complete
    car.fuel = FUEL_CAPACITY;
    car.refuelTimer = 0;
    car.state = CarState.WaitingToExit;
  }

  /** Called from CarParkingManager when ParkingOut completes for a gas station. */
  routeAfterGasStation(
    car: Car,
    bizMap: Map<string, Business>,
    houseMap: Map<string, House>,
  ): void {
    if (!this.gasStationSystem) {
      car.state = CarState.Stranded;
      return;
    }

    const station = car.targetGasStationId ? this.gasStationSystem.getGasStationById(car.targetGasStationId) : undefined;
    const exitPos = station?.exitConnectorPos;
    car.targetGasStationId = null;

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

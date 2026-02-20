import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Business } from '../../entities/Business';
import type { House } from '../../entities/House';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { CarRouter } from './CarRouter';
import { stepGridPos } from './CarRouter';
import type { PendingDeletionSystem } from '../PendingDeletionSystem';
import type { GasStationSystem } from '../GasStationSystem';
import type { HighwaySystem } from '../HighwaySystem';
import { TILE_SIZE, UNLOAD_TIME, CAR_SPEED } from '../../constants';
import { computePathFuelCost } from '../../pathfinding/pathCost';
import { gridToPixelCenter } from '../../utils/math';
import { getDirection, directionAngle } from '../../utils/direction';
import { getParkingSlotLayout } from '../../utils/businessLayout';
import { occupancyKey } from './CarTrafficManager';
import { LaneId } from '../../types';

const PARKING_MOVE_SPEED = CAR_SPEED * TILE_SIZE * 0.5;

function computeCumDist(points: { x: number; y: number }[]): number[] {
  const d = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    d.push(d[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return d;
}

function sampleAtDistance(
  path: { x: number; y: number }[],
  cumDist: number[],
  dist: number,
): { x: number; y: number } {
  const totalDist = cumDist[cumDist.length - 1];
  if (dist >= totalDist) return path[path.length - 1];
  if (dist <= 0) return path[0];
  for (let i = 1; i < cumDist.length; i++) {
    if (cumDist[i] >= dist) {
      const segLen = cumDist[i] - cumDist[i - 1];
      const t = segLen > 0 ? (dist - cumDist[i - 1]) / segLen : 0;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * t,
      };
    }
  }
  return path[path.length - 1];
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

// Compute parking slot offsets relative to lot cell center using layout system
export function getParkingSlotOffsets(biz: Business): { x: number; y: number }[] {
  const slots = getParkingSlotLayout({
    buildingPos: biz.pos,
    parkingLotPos: biz.parkingLotPos,
    orientation: biz.orientation,
    connectorSide: biz.connectorSide,
  });
  const lotCenterX = biz.parkingLotPos.gx * TILE_SIZE + TILE_SIZE / 2;
  const lotCenterZ = biz.parkingLotPos.gy * TILE_SIZE + TILE_SIZE / 2;
  return slots.map(slot => ({
    x: slot.centerX - lotCenterX,
    y: slot.centerZ - lotCenterZ,
  }));
}

export class CarParkingManager {
  private pathfinder: Pathfinder;
  private router: CarRouter;
  private pendingDeletionSystem: PendingDeletionSystem;
  private gasStationSystem: GasStationSystem | null;
  private highwaySystem: HighwaySystem | null;

  constructor(pathfinder: Pathfinder, router: CarRouter, pendingDeletionSystem: PendingDeletionSystem, gasStationSystem?: GasStationSystem, highwaySystem?: HighwaySystem) {
    this.pathfinder = pathfinder;
    this.router = router;
    this.pendingDeletionSystem = pendingDeletionSystem;
    this.gasStationSystem = gasStationSystem ?? null;
    this.highwaySystem = highwaySystem ?? null;
  }

  updateUnloadingCar(
    car: Car, dt: number,
    bizMap: Map<string, Business>,
    onScore: () => void,
  ): void {
    car.unloadTimer += dt;
    if (car.unloadTimer < UNLOAD_TIME) return;

    const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
    if (biz && biz.demandPins > 0) {
      biz.demandPins--;
      onScore();
    }
    car.state = CarState.WaitingToExit;
    car.unloadTimer = 0;
  }

  updateWaitingToExitCar(
    car: Car,
    houseMap: Map<string, House>, bizMap: Map<string, Business>,
    occupied: Map<number, string>, toRemove: string[],
    exitCooldowns: Map<string, number>,
    onSetCooldown: (bizId: string) => void,
  ): void {
    const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
    if (!biz) { toRemove.push(car.id); return; }

    const cooldown = exitCooldowns.get(biz.id) ?? 0;
    if (cooldown > 0) return;

    // Check connector cell is free using occupancy map (O(1) per lane)
    const cx = biz.connectorPos.gx;
    const cy = biz.connectorPos.gy;
    let connectorFree = true;
    for (let lane = 0 as LaneId; lane <= 7; lane++) {
      const occupant = occupied.get(occupancyKey(cx, cy, lane as LaneId));
      if (occupant && occupant !== car.id) {
        connectorFree = false;
        break;
      }
    }
    if (!connectorFree) return;

    if (car.assignedSlotIndex !== null) {
      biz.freeSlot(car.assignedSlotIndex);
    }
    onSetCooldown(biz.id);

    const home = houseMap.get(car.homeHouseId);
    if (home) {
      const homePath = this.pathfinder.findPath(biz.parkingLotPos, home.pos, true);
      if (homePath) {
        // Store home path for after ParkingOut completes
        car.pendingHomePath = homePath;

        // Build smooth Bezier exit path: slot → connector center
        // Control point is the L-corner: shares one axis with slot, other with connector
        const slotPos = { x: car.pixelPos.x, y: car.pixelPos.y };
        const connectorCenter = gridToPixelCenter(biz.connectorPos);
        const isVerticalEntry = biz.connectorPos.gx === biz.parkingLotPos.gx;
        const cp = isVerticalEntry
          ? { x: connectorCenter.x, y: slotPos.y }
          : { x: slotPos.x, y: connectorCenter.y };

        car.parkingPath = sampleQuadraticBezier(slotPos, cp, connectorCenter, 16);
        car.parkingCumDist = computeCumDist(car.parkingPath);
        car.parkingProgress = 0;
        car.state = CarState.ParkingOut;
        car.assignedSlotIndex = null;
      } else {
        car.state = CarState.Stranded;
        car.outboundPath = [];
        car.targetBusinessId = null;
        car.assignedSlotIndex = null;
        car.destination = home.pos;
        car.path = [];
        car.pathIndex = 0;
        car.segmentProgress = 0;
        car.smoothPath = [];
        car.smoothCumDist = [];
        car.smoothCellDist = [];
        const center = gridToPixelCenter(biz.parkingLotPos);
        car.pixelPos.x = center.x;
        car.pixelPos.y = center.y;
        car.prevPixelPos.x = center.x;
        car.prevPixelPos.y = center.y;
      }
    } else {
      toRemove.push(car.id);
    }
  }

  handleParkingArrival(
    car: Car, houseMap: Map<string, House>, bizMap: Map<string, Business>, toRemove: string[],
  ): void {
    const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
    if (!biz) { toRemove.push(car.id); return; }

    const slotIndex = biz.getFreeParkingSlot();
    if (slotIndex !== null) {
      biz.occupySlot(slotIndex, car.id);
      car.assignedSlotIndex = slotIndex;
      car.outboundPath = [...car.path];
      car.path = [];
      car.pathIndex = 0;
      car.segmentProgress = 0;

      // Build smooth Bezier path: current position → slot position
      // Control point is the L-corner: shares one axis with start, other with end
      const lotCenter = gridToPixelCenter(biz.parkingLotPos);
      const slotOffset = getParkingSlotOffsets(biz)[slotIndex];
      const slotPos = { x: lotCenter.x + slotOffset.x, y: lotCenter.y + slotOffset.y };
      const currentPos = { x: car.pixelPos.x, y: car.pixelPos.y };
      const isVerticalEntry = biz.connectorPos.gx === biz.parkingLotPos.gx;
      const cp = isVerticalEntry
        ? { x: currentPos.x, y: slotPos.y }
        : { x: slotPos.x, y: currentPos.y };

      car.parkingPath = sampleQuadraticBezier(currentPos, cp, slotPos, 16);
      car.parkingCumDist = computeCumDist(car.parkingPath);
      car.parkingProgress = 0;
      car.state = CarState.ParkingIn;
    } else {
      // No free slot — bounce back home
      const home = houseMap.get(car.homeHouseId);
      if (home) {
        const homePath = this.pathfinder.findPath(biz.parkingLotPos, home.pos, true);
        if (homePath) {
          // Check fuel before going home
          const fuelCost = computePathFuelCost(homePath, this.highwaySystem);
          if (fuelCost > car.fuel && this.gasStationSystem) {
            // Need gas station detour
            const startPos = homePath.length > 0 ? stepGridPos(homePath[0]) : biz.parkingLotPos;
            const result = this.gasStationSystem.findNearestReachable(startPos, this.pathfinder, this.highwaySystem);
            if (result) {
              const stationPath = this.pathfinder.findPath(startPos, result.station.entryConnectorPos);
              if (stationPath && stationPath.length >= 2) {
                car.state = CarState.GoingToGasStation;
                car.targetBusinessId = null;
                car.targetGasStationId = result.station.id;
                car.postRefuelIntent = 'home';
                car.destination = result.station.entryConnectorPos;
                this.router.assignPath(car, stationPath);
                if (car.smoothPath.length >= 2) {
                  car.pixelPos.x = car.smoothPath[0].x;
                  car.pixelPos.y = car.smoothPath[0].y;
                  car.prevPixelPos.x = car.pixelPos.x;
                  car.prevPixelPos.y = car.pixelPos.y;
                  if (stationPath.length >= 2) {
                    const p0 = stepGridPos(stationPath[0]);
                    const p1 = stepGridPos(stationPath[1]);
                    const initDir = getDirection(p0, p1);
                    car.renderAngle = directionAngle(initDir);
                    car.prevRenderAngle = car.renderAngle;
                  }
                } else {
                  const center = gridToPixelCenter(biz.parkingLotPos);
                  car.pixelPos.x = center.x;
                  car.pixelPos.y = center.y;
                }
                return;
              }
            }
          }

          car.state = CarState.GoingHome;
          car.targetBusinessId = null;
          car.destination = home.pos;
          this.router.assignPath(car, homePath);
          if (car.smoothPath.length >= 2) {
            car.pixelPos.x = car.smoothPath[0].x;
            car.pixelPos.y = car.smoothPath[0].y;
            if (homePath.length >= 2) {
              const p0 = stepGridPos(homePath[0]);
              const p1 = stepGridPos(homePath[1]);
              const initDir = getDirection(p0, p1);
              car.renderAngle = directionAngle(initDir);
              car.prevRenderAngle = car.renderAngle;
            }
          } else {
            const center = gridToPixelCenter(biz.parkingLotPos);
            car.pixelPos.x = center.x;
            car.pixelPos.y = center.y;
          }
        } else {
          car.state = CarState.Stranded;
          car.targetBusinessId = null;
          car.destination = home.pos;
          car.path = [];
          car.pathIndex = 0;
          car.segmentProgress = 0;
          car.smoothPath = [];
          car.smoothCumDist = [];
          car.smoothCellDist = [];
        }
      } else {
        toRemove.push(car.id);
      }
    }
  }

  updateParkingInCar(car: Car, dt: number): void {
    const totalDist = car.parkingCumDist[car.parkingCumDist.length - 1];
    car.parkingProgress += PARKING_MOVE_SPEED * dt;

    if (car.parkingProgress >= totalDist) {
      // Arrived at slot
      const endPt = car.parkingPath[car.parkingPath.length - 1];
      car.pixelPos.x = endPt.x;
      car.pixelPos.y = endPt.y;
      car.prevPixelPos.x = endPt.x;
      car.prevPixelPos.y = endPt.y;
      car.state = CarState.Unloading;
      car.unloadTimer = 0;
      car.parkingPath = [];
      car.parkingCumDist = [];
      car.parkingProgress = 0;
      return;
    }

    // Interpolate position along parking path
    const prevPos = { x: car.pixelPos.x, y: car.pixelPos.y };
    const pos = sampleAtDistance(car.parkingPath, car.parkingCumDist, car.parkingProgress);
    car.pixelPos.x = pos.x;
    car.pixelPos.y = pos.y;
    car.prevPixelPos.x = pos.x;
    car.prevPixelPos.y = pos.y;

    // Update render angle based on movement direction
    const dx = pos.x - prevPos.x;
    const dy = pos.y - prevPos.y;
    if (dx !== 0 || dy !== 0) {
      car.renderAngle = Math.atan2(dy, dx);
      car.prevRenderAngle = car.renderAngle;
    }
  }

  updateParkingOutCar(
    car: Car, dt: number,
    _houses: House[], _bizMap: Map<string, Business>, _toRemove: string[],
  ): void {
    const totalDist = car.parkingCumDist[car.parkingCumDist.length - 1];
    car.parkingProgress += PARKING_MOVE_SPEED * dt;

    if (car.parkingProgress >= totalDist) {
      // Arrived at connector — transition to GoingHome
      const endPt = car.parkingPath[car.parkingPath.length - 1];
      car.pixelPos.x = endPt.x;
      car.pixelPos.y = endPt.y;
      car.prevPixelPos.x = endPt.x;
      car.prevPixelPos.y = endPt.y;

      // Clear parking path fields
      car.parkingPath = [];
      car.parkingCumDist = [];
      car.parkingProgress = 0;

      const homePath = car.pendingHomePath;
      car.pendingHomePath = null;

      if (homePath) {
        // Check fuel before going home
        const fuelCost = computePathFuelCost(homePath, this.highwaySystem);
        if (fuelCost > car.fuel && this.gasStationSystem) {
          // Need gas station detour
          const startPos = homePath.length > 0 ? stepGridPos(homePath[0]) : car.destination!;
          const result = this.gasStationSystem.findNearestReachable(startPos, this.pathfinder, this.highwaySystem);
          if (result) {
            const stationPath = this.pathfinder.findPath(startPos, result.station.entryConnectorPos);
            if (stationPath && stationPath.length >= 2) {
              car.state = CarState.GoingToGasStation;
              car.outboundPath = [];
              car.targetGasStationId = result.station.id;
              car.postRefuelIntent = 'home';
              car.assignedSlotIndex = null;
              car.destination = result.station.entryConnectorPos;
              this.router.assignPath(car, stationPath);
              if (car.smoothPath.length >= 2) {
                car.pixelPos.x = car.smoothPath[0].x;
                car.pixelPos.y = car.smoothPath[0].y;
                car.prevPixelPos.x = car.pixelPos.x;
                car.prevPixelPos.y = car.pixelPos.y;
                if (stationPath.length >= 2) {
                  const p0 = stepGridPos(stationPath[0]);
                  const p1 = stepGridPos(stationPath[1]);
                  const initDir = getDirection(p0, p1);
                  car.renderAngle = directionAngle(initDir);
                  car.prevRenderAngle = car.renderAngle;
                }
              }
              return;
            }
          }
          // No reachable station — strand
          car.state = CarState.Stranded;
          car.outboundPath = [];
          car.targetBusinessId = null;
          car.assignedSlotIndex = null;
          car.path = [];
          car.pathIndex = 0;
          car.segmentProgress = 0;
          car.smoothPath = [];
          car.smoothCumDist = [];
          car.smoothCellDist = [];
          return;
        }

        car.state = CarState.GoingHome;
        car.outboundPath = [];
        car.targetBusinessId = null;
        car.assignedSlotIndex = null;
        car.destination = homePath.length > 0 ? stepGridPos(homePath[homePath.length - 1]) : null;
        this.router.assignPath(car, homePath);

        // Extract grid positions for pending deletion notification
        const gridPath = homePath.filter(s => s.kind === 'grid').map(s => (s as { pos: import('../../types').GridPos }).pos);
        this.pendingDeletionSystem.notifyCarTransitionedHome(car.id, gridPath);

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
      } else {
        // No path home — stranded
        car.state = CarState.Stranded;
        car.outboundPath = [];
        car.targetBusinessId = null;
        car.assignedSlotIndex = null;
        car.path = [];
        car.pathIndex = 0;
        car.segmentProgress = 0;
        car.smoothPath = [];
        car.smoothCumDist = [];
        car.smoothCellDist = [];
      }
      return;
    }

    // Interpolate position along parking path
    const prevPos = { x: car.pixelPos.x, y: car.pixelPos.y };
    const pos = sampleAtDistance(car.parkingPath, car.parkingCumDist, car.parkingProgress);
    car.pixelPos.x = pos.x;
    car.pixelPos.y = pos.y;
    car.prevPixelPos.x = pos.x;
    car.prevPixelPos.y = pos.y;

    // Update render angle based on movement direction
    const dx = pos.x - prevPos.x;
    const dy = pos.y - prevPos.y;
    if (dx !== 0 || dy !== 0) {
      car.renderAngle = Math.atan2(dy, dx);
      car.prevRenderAngle = car.renderAngle;
    }
  }
}

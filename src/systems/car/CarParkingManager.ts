import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Business } from '../../entities/Business';
import type { House } from '../../entities/House';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { CarRouter } from './CarRouter';
import { stepGridPos } from './CarRouter';
import type { PendingDeletionSystem } from '../PendingDeletionSystem';
import { TILE_SIZE, UNLOAD_TIME } from '../../constants';
import { gridToPixelCenter } from '../../utils/math';
import { getDirection, directionAngle } from '../../utils/direction';

// Sub-positions within a parking lot cell for visual placement
export const PARKING_SLOT_OFFSETS = [
  { x: -TILE_SIZE * 0.25, y: -TILE_SIZE * 0.25 },
  { x: TILE_SIZE * 0.25, y: -TILE_SIZE * 0.25 },
  { x: -TILE_SIZE * 0.25, y: TILE_SIZE * 0.25 },
  { x: TILE_SIZE * 0.25, y: TILE_SIZE * 0.25 },
];

export class CarParkingManager {
  private pathfinder: Pathfinder;
  private router: CarRouter;
  private pendingDeletionSystem: PendingDeletionSystem;

  constructor(pathfinder: Pathfinder, router: CarRouter, pendingDeletionSystem: PendingDeletionSystem) {
    this.pathfinder = pathfinder;
    this.router = router;
    this.pendingDeletionSystem = pendingDeletionSystem;
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
    houses: House[], bizMap: Map<string, Business>,
    cars: Car[], toRemove: string[],
    exitCooldowns: Map<string, number>,
    onSetCooldown: (bizId: string) => void,
  ): void {
    const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
    if (!biz) { toRemove.push(car.id); return; }

    const cooldown = exitCooldowns.get(biz.id) ?? 0;
    if (cooldown > 0) return;

    // Check connector cell is free
    const connectorFree = !cars.some(other => {
      if (other.id === car.id) return false;
      if (other.state === CarState.Idle || other.state === CarState.Stranded ||
          other.state === CarState.Unloading || other.state === CarState.WaitingToExit) return false;
      if (other.state === CarState.GoingToBusiness && other.targetBusinessId === biz.id) return false;
      if (other.path.length < 2 || other.onHighway) return false;
      const step = other.path[other.segmentProgress < 0.5 ? other.pathIndex : Math.min(other.pathIndex + 1, other.path.length - 1)];
      const tile = stepGridPos(step);
      return tile.gx === biz.connectorPos.gx && tile.gy === biz.connectorPos.gy;
    });
    if (!connectorFree) return;

    if (car.assignedSlotIndex !== null) {
      biz.freeSlot(car.assignedSlotIndex);
    }
    onSetCooldown(biz.id);

    const home = houses.find(h => h.id === car.homeHouseId);
    if (home) {
      const homePath = this.pathfinder.findPath(biz.parkingLotPos, home.pos, true);
      if (homePath) {
        car.state = CarState.GoingHome;
        car.outboundPath = [];
        car.targetBusinessId = null;
        car.assignedSlotIndex = null;
        car.destination = home.pos;
        this.router.assignPath(car, homePath);

        // Extract grid positions for pending deletion notification
        const gridPath = homePath.filter(s => s.kind === 'grid').map(s => (s as { pos: import('../../types').GridPos }).pos);
        this.pendingDeletionSystem.notifyCarTransitionedHome(car.id, gridPath);

        if (car.smoothPath.length >= 2) {
          const slotPos = { x: car.pixelPos.x, y: car.pixelPos.y };
          const firstPathPt = car.smoothPath[0];
          const dxSlot = firstPathPt.x - slotPos.x;
          const dySlot = firstPathPt.y - slotPos.y;
          const slotDist = Math.sqrt(dxSlot * dxSlot + dySlot * dySlot);

          car.smoothPath.unshift(slotPos);
          for (let i = 0; i < car.smoothCumDist.length; i++) {
            car.smoothCumDist[i] += slotDist;
          }
          car.smoothCumDist.unshift(0);
          for (let i = 0; i < car.smoothCellDist.length; i++) {
            car.smoothCellDist[i] += slotDist;
          }

          car.prevPixelPos.x = car.pixelPos.x;
          car.prevPixelPos.y = car.pixelPos.y;
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
          car.prevPixelPos.x = center.x;
          car.prevPixelPos.y = center.y;
        }
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
    car: Car, houses: House[], bizMap: Map<string, Business>, toRemove: string[],
  ): void {
    const biz = car.targetBusinessId ? bizMap.get(car.targetBusinessId) : undefined;
    if (!biz) { toRemove.push(car.id); return; }

    const slotIndex = biz.getFreeParkingSlot();
    if (slotIndex !== null) {
      biz.occupySlot(slotIndex, car.id);
      car.state = CarState.Unloading;
      car.assignedSlotIndex = slotIndex;
      car.unloadTimer = 0;
      car.outboundPath = [...car.path];
      car.path = [];
      car.pathIndex = 0;
      car.segmentProgress = 0;

      const lotCenter = gridToPixelCenter(biz.parkingLotPos);
      const slotOffset = PARKING_SLOT_OFFSETS[slotIndex];
      car.pixelPos.x = lotCenter.x + slotOffset.x;
      car.pixelPos.y = lotCenter.y + slotOffset.y;
      car.prevPixelPos.x = car.pixelPos.x;
      car.prevPixelPos.y = car.pixelPos.y;
    } else {
      const home = houses.find(h => h.id === car.homeHouseId);
      if (home) {
        const homePath = this.pathfinder.findPath(biz.parkingLotPos, home.pos, true);
        if (homePath) {
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
}

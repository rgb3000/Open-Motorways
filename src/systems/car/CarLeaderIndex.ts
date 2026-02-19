import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { LaneId } from '../../types';
import { getDirection, directionToLane } from '../../utils/direction';
import { stepGridPos } from './CarRouter';

const LEADER_SCAN_TILES = 3;

interface BucketEntry {
  carId: string;
  arcDist: number;
  px: number;
  py: number;
}

function bucketKey(gx: number, gy: number, lane: LaneId): string {
  return `${gx},${gy},${lane}`;
}

export class CarLeaderIndex {
  private buckets = new Map<string, BucketEntry[]>();
  private entryPool: BucketEntry[][] = [];

  rebuild(cars: Car[]): void {
    // Recycle arrays
    for (const list of this.buckets.values()) {
      list.length = 0;
      this.entryPool.push(list);
    }
    this.buckets.clear();

    for (const car of cars) {
      if (car.state === CarState.Idle || car.state === CarState.Stranded ||
          car.state === CarState.Unloading || car.state === CarState.WaitingToExit ||
          car.state === CarState.ParkingIn || car.state === CarState.ParkingOut) continue;
      if (car.onHighway) continue;
      if (car.path.length < 2 || car.pathIndex >= car.path.length - 1) continue;

      const curStep = car.path[car.pathIndex];
      if (curStep.kind !== 'grid') continue;

      const curTile = curStep.pos;
      const nxtTile = stepGridPos(car.path[car.pathIndex + 1]);
      const dir = getDirection(curTile, nxtTile);
      const lane = directionToLane(dir);

      // Register car in the tile it currently occupies (based on segmentProgress)
      const tile = car.segmentProgress < 0.5 ? curTile : nxtTile;
      const key = bucketKey(tile.gx, tile.gy, lane);
      let list = this.buckets.get(key);
      if (!list) {
        list = this.entryPool.pop() ?? [];
        this.buckets.set(key, list);
      }
      list.push({
        carId: car.id,
        arcDist: car.arcDistance,
        px: car.pixelPos.x,
        py: car.pixelPos.y,
      });
    }

    // Sort each bucket by arcDist ascending
    for (const list of this.buckets.values()) {
      if (list.length > 1) {
        list.sort((a, b) => a.arcDist - b.arcDist);
      }
    }
  }

  findLeader(car: Car): void {
    car.leaderId = null;
    car.leaderGap = Infinity;

    if (car.path.length < 2 || car.pathIndex >= car.path.length - 1) return;
    if (car.onHighway) return;

    const curStep = car.path[car.pathIndex];
    if (curStep.kind !== 'grid') return;

    const carPx = car.pixelPos.x;
    const carPy = car.pixelPos.y;

    // Scan forward along the car's path tiles looking for the nearest car ahead on the same lane
    for (let offset = 0; offset < LEADER_SCAN_TILES; offset++) {
      const idx = car.pathIndex + offset;
      if (idx >= car.path.length - 1) break;

      const step = car.path[idx];
      if (step.kind !== 'grid') break;
      const nextStep = car.path[idx + 1];
      if (nextStep.kind !== 'grid') break;

      const tile = step.pos;
      const nxtTile = nextStep.pos;
      const dir = getDirection(tile, nxtTile);
      const lane = directionToLane(dir);

      // Check both the current tile and next tile for this segment
      const tilesToCheck = offset === 0 && car.segmentProgress >= 0.5
        ? [nxtTile]
        : offset === 0
          ? [tile, nxtTile]
          : [tile];

      for (const t of tilesToCheck) {
        const key = bucketKey(t.gx, t.gy, lane);
        const bucket = this.buckets.get(key);
        if (!bucket) continue;

        for (const entry of bucket) {
          if (entry.carId === car.id) continue;
          // Only consider cars ahead (greater arcDist or on a further tile)
          if (offset === 0 && entry.arcDist <= car.arcDistance) continue;

          const dx = entry.px - carPx;
          const dy = entry.py - carPy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < car.leaderGap) {
            car.leaderId = entry.carId;
            car.leaderGap = dist;
          }
        }
      }

      // If we found a leader on this tile segment, no need to scan further
      if (car.leaderId !== null) return;
    }
  }
}

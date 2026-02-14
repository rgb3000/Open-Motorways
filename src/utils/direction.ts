import { Direction, LaneId } from '../types';
import type { GridPos, PixelPos } from '../types';
import { LANE_OFFSET } from '../constants';

export function getDirection(from: GridPos, to: GridPos): Direction {
  const dx = to.gx - from.gx;
  const dy = to.gy - from.gy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? Direction.Right : Direction.Left;
  }
  return dy >= 0 ? Direction.Down : Direction.Up;
}

export function directionToLane(dir: Direction): LaneId {
  switch (dir) {
    case Direction.Right: return LaneId.HorizontalRight;
    case Direction.Left: return LaneId.HorizontalLeft;
    case Direction.Down: return LaneId.VerticalDown;
    case Direction.Up: return LaneId.VerticalUp;
  }
}

export function directionAngle(dir: Direction): number {
  switch (dir) {
    case Direction.Right: return 0;
    case Direction.Down:  return Math.PI / 2;
    case Direction.Left:  return Math.PI;
    case Direction.Up:    return -Math.PI / 2;
  }
}

export function unitVector(dir: Direction): PixelPos {
  switch (dir) {
    case Direction.Right: return { x: 1, y: 0 };
    case Direction.Down:  return { x: 0, y: 1 };
    case Direction.Left:  return { x: -1, y: 0 };
    case Direction.Up:    return { x: 0, y: -1 };
  }
}

export function isOpposite(d1: Direction, d2: Direction): boolean {
  return (d1 === Direction.Up && d2 === Direction.Down) ||
         (d1 === Direction.Down && d2 === Direction.Up) ||
         (d1 === Direction.Left && d2 === Direction.Right) ||
         (d1 === Direction.Right && d2 === Direction.Left);
}

export function isPerpendicularAxis(d1: Direction, d2: Direction): boolean {
  const isH1 = d1 === Direction.Left || d1 === Direction.Right;
  const isH2 = d2 === Direction.Left || d2 === Direction.Right;
  return isH1 !== isH2;
}

export const YIELD_TO_DIRECTION: Record<Direction, Direction> = {
  [Direction.Up]: Direction.Left,
  [Direction.Right]: Direction.Up,
  [Direction.Down]: Direction.Right,
  [Direction.Left]: Direction.Down,
};

export function laneOffset(dir: Direction): PixelPos {
  switch (dir) {
    case Direction.Right: return { x: 0, y: +LANE_OFFSET };  // bottom lane
    case Direction.Left:  return { x: 0, y: -LANE_OFFSET };  // top lane
    case Direction.Down:  return { x: -LANE_OFFSET, y: 0 };  // left lane
    case Direction.Up:    return { x: +LANE_OFFSET, y: 0 };  // right lane
  }
}

export function laneIntersection(cx: number, cy: number, dir1: Direction, dir2: Direction): PixelPos {
  let x = cx;
  let y = cy;
  for (const d of [dir1, dir2]) {
    const off = laneOffset(d);
    if (d === Direction.Left || d === Direction.Right) {
      y = cy + off.y;
    } else {
      x = cx + off.x;
    }
  }
  return { x, y };
}

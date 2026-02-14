import { Direction, LaneId } from '../types';
import type { GridPos, PixelPos } from '../types';
import { LANE_OFFSET } from '../constants';

const INV_SQRT2 = 1 / Math.sqrt(2);

export function getDirection(from: GridPos, to: GridPos): Direction {
  const dx = to.gx - from.gx;
  const dy = to.gy - from.gy;

  // Diagonal: both axes move by exactly 1
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    if (dx === 1 && dy === -1) return Direction.UpRight;
    if (dx === -1 && dy === -1) return Direction.UpLeft;
    if (dx === 1 && dy === 1) return Direction.DownRight;
    return Direction.DownLeft;
  }

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
    case Direction.DownRight: return LaneId.DiagDownRight;
    case Direction.UpLeft: return LaneId.DiagUpLeft;
    case Direction.DownLeft: return LaneId.DiagDownLeft;
    case Direction.UpRight: return LaneId.DiagUpRight;
  }
}

export function directionAngle(dir: Direction): number {
  switch (dir) {
    case Direction.Right: return 0;
    case Direction.Down:  return Math.PI / 2;
    case Direction.Left:  return Math.PI;
    case Direction.Up:    return -Math.PI / 2;
    case Direction.UpRight:   return -Math.PI / 4;
    case Direction.DownRight:  return Math.PI / 4;
    case Direction.DownLeft:   return 3 * Math.PI / 4;
    case Direction.UpLeft:     return -3 * Math.PI / 4;
  }
}

export function unitVector(dir: Direction): PixelPos {
  switch (dir) {
    case Direction.Right: return { x: 1, y: 0 };
    case Direction.Down:  return { x: 0, y: 1 };
    case Direction.Left:  return { x: -1, y: 0 };
    case Direction.Up:    return { x: 0, y: -1 };
    case Direction.UpRight:   return { x: INV_SQRT2, y: -INV_SQRT2 };
    case Direction.DownRight:  return { x: INV_SQRT2, y: INV_SQRT2 };
    case Direction.DownLeft:   return { x: -INV_SQRT2, y: INV_SQRT2 };
    case Direction.UpLeft:     return { x: -INV_SQRT2, y: -INV_SQRT2 };
  }
}

export function isOpposite(d1: Direction, d2: Direction): boolean {
  return (d1 === Direction.Up && d2 === Direction.Down) ||
         (d1 === Direction.Down && d2 === Direction.Up) ||
         (d1 === Direction.Left && d2 === Direction.Right) ||
         (d1 === Direction.Right && d2 === Direction.Left) ||
         (d1 === Direction.UpLeft && d2 === Direction.DownRight) ||
         (d1 === Direction.DownRight && d2 === Direction.UpLeft) ||
         (d1 === Direction.UpRight && d2 === Direction.DownLeft) ||
         (d1 === Direction.DownLeft && d2 === Direction.UpRight);
}

export function isPerpendicularAxis(d1: Direction, d2: Direction): boolean {
  const a1 = directionAngle(d1);
  const a2 = directionAngle(d2);
  let diff = Math.abs(a1 - a2);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  // 90 degrees = PI/2, allow small epsilon
  return Math.abs(diff - Math.PI / 2) < 0.01;
}

export const YIELD_TO_DIRECTION: Record<Direction, Direction> = {
  [Direction.Up]: Direction.Left,
  [Direction.Right]: Direction.Up,
  [Direction.Down]: Direction.Right,
  [Direction.Left]: Direction.Down,
  [Direction.UpRight]: Direction.UpLeft,
  [Direction.DownRight]: Direction.UpRight,
  [Direction.DownLeft]: Direction.DownRight,
  [Direction.UpLeft]: Direction.DownLeft,
};

export function laneOffset(dir: Direction): PixelPos {
  // Perpendicular offset to the right of travel direction
  switch (dir) {
    case Direction.Right: return { x: 0, y: +LANE_OFFSET };  // bottom lane
    case Direction.Left:  return { x: 0, y: -LANE_OFFSET };  // top lane
    case Direction.Down:  return { x: -LANE_OFFSET, y: 0 };  // left lane
    case Direction.Up:    return { x: +LANE_OFFSET, y: 0 };  // right lane
    // Diagonals: perpendicular is 90deg clockwise from travel direction
    case Direction.UpRight:   return { x: LANE_OFFSET * INV_SQRT2, y: LANE_OFFSET * INV_SQRT2 };
    case Direction.DownRight:  return { x: -LANE_OFFSET * INV_SQRT2, y: LANE_OFFSET * INV_SQRT2 };
    case Direction.DownLeft:   return { x: -LANE_OFFSET * INV_SQRT2, y: -LANE_OFFSET * INV_SQRT2 };
    case Direction.UpLeft:     return { x: LANE_OFFSET * INV_SQRT2, y: -LANE_OFFSET * INV_SQRT2 };
  }
}

export function laneIntersection(cx: number, cy: number, dir1: Direction, dir2: Direction): PixelPos {
  // General 2D line-line intersection:
  // Line 1: center + laneOffset(dir1) + t * unitVector(dir1)
  // Line 2: center + laneOffset(dir2) + s * unitVector(dir2)
  const off1 = laneOffset(dir1);
  const off2 = laneOffset(dir2);
  const u1 = unitVector(dir1);
  const u2 = unitVector(dir2);

  // Solve: off1 + t * u1 = off2 + s * u2
  // => t * u1.x - s * u2.x = off2.x - off1.x
  // => t * u1.y - s * u2.y = off2.y - off1.y
  const det = u1.x * (-u2.y) - u1.y * (-u2.x);

  if (Math.abs(det) < 1e-9) {
    // Parallel or same direction — just use offset of dir1
    return { x: cx + off1.x, y: cy + off1.y };
  }

  const dx = off2.x - off1.x;
  const dy = off2.y - off1.y;
  const t = (dx * (-u2.y) - dy * (-u2.x)) / det;

  return {
    x: cx + off1.x + t * u1.x,
    y: cy + off1.y + t * u1.y,
  };
}

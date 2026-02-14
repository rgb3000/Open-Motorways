import type { GameColor, GridPos, PixelPos, Direction } from '../types';
import { generateId, gridToPixelCenter } from '../utils/math';

export const CarState = {
  Idle: 0,
  GoingToBusiness: 1,
  GoingHome: 2,
  Stranded: 3,
} as const;
export type CarState = (typeof CarState)[keyof typeof CarState];

export class Car {
  readonly id: string;
  readonly color: GameColor;
  readonly homeHouseId: string;
  state: CarState = CarState.Idle;
  targetBusinessId: string | null = null;
  destination: GridPos | null = null;
  direction: Direction | null = null;
  renderAngle = 0;      // radians: 0=Right, PI/2=Down, PI=Left, -PI/2=Up
  prevRenderAngle = 0;  // previous frame's angle for render interpolation

  // Path
  path: GridPos[] = [];
  pathIndex = 0;
  segmentProgress = 0; // 0..1 between current and next tile
  intersectionWaitTime = 0;

  // Rendering interpolation
  pixelPos: PixelPos;
  prevPixelPos: PixelPos;

  constructor(homeHouseId: string, color: GameColor, startPos: GridPos) {
    this.id = generateId();
    this.color = color;
    this.homeHouseId = homeHouseId;
    const center = gridToPixelCenter(startPos);
    this.pixelPos = { ...center };
    this.prevPixelPos = { ...center };
  }
}

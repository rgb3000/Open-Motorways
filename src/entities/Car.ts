import type { GameColor, GridPos, PixelPos, Direction } from '../types';
import type { PathStep } from '../highways/types';
import { generateId, gridToPixelCenter } from '../utils/math';

export const CarState = {
  Idle: 0,
  GoingToBusiness: 1,
  GoingHome: 2,
  Stranded: 3,
  Unloading: 4,
  WaitingToExit: 5,
  ParkingIn: 6,
  ParkingOut: 7,
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
  path: PathStep[] = [];
  pathIndex = 0;
  outboundPath: PathStep[] = []; // saved outbound path for Unloading/WaitingToExit reservation
  segmentProgress = 0; // 0..1 between current and next tile
  intersectionWaitTime = 0;
  sameLaneWaitTime = 0;
  parkingWaitTime = 0;
  stuckTimer = 0;
  lastAdvancedPathIndex = 0;
  wasBlocked = false;

  // Smooth lane path (precomputed from road geometry)
  smoothPath: { x: number; y: number }[] = [];
  smoothCumDist: number[] = [];
  smoothCellDist: number[] = [];

  // Highway state
  onHighway = false;
  elevationY = 0;
  prevElevationY = 0;
  highwayPolyline: PixelPos[] | null = null;
  highwayCumDist: number[] | null = null;
  highwayProgress = 0; // arc-length distance traveled on current highway

  // Parking
  assignedSlotIndex: number | null = null;
  unloadTimer = 0;
  parkingPath: { x: number; y: number }[] = [];
  parkingCumDist: number[] = [];
  parkingProgress = 0;
  pendingHomePath: PathStep[] | null = null;

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

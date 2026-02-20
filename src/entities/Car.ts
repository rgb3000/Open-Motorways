import type { GameColor, GridPos, PixelPos, Direction } from '../types';
import type { PathStep } from '../highways/types';
import { generateId, gridToPixelCenter } from '../utils/math';
import { FUEL_CAPACITY } from '../constants';

export const CarState = {
  Idle: 0,
  GoingToBusiness: 1,
  GoingHome: 2,
  Stranded: 3,
  Unloading: 4,
  WaitingToExit: 5,
  ParkingIn: 6,
  ParkingOut: 7,
  GoingToGasStation: 8,
  Refueling: 9,
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

  // Arc-length traffic (continuous distance-based collision)
  arcDistance = 0;           // current distance along smoothPath (px)
  currentSpeed = 0;         // current speed in px/sec
  leaderId: string | null = null;   // car ahead on same lane
  leaderGap = Infinity;     // pixel distance to leader
  arrivalTime = 0;          // time when car started waiting at intersection

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

  // Fuel
  fuel: number = FUEL_CAPACITY;
  targetGasStationId: string | null = null;
  refuelTimer = 0;
  postRefuelIntent: 'business' | 'home' = 'business';

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

  /** Reset all driving state back to idle defaults without touching fuel, id, color, or homeHouseId. */
  resetForPool(homePos: GridPos): void {
    this.state = CarState.Idle;
    this.targetBusinessId = null;
    this.destination = null;
    this.direction = null;
    this.renderAngle = 0;
    this.prevRenderAngle = 0;

    this.path = [];
    this.pathIndex = 0;
    this.outboundPath = [];
    this.segmentProgress = 0;
    this.intersectionWaitTime = 0;
    this.sameLaneWaitTime = 0;
    this.parkingWaitTime = 0;
    this.stuckTimer = 0;
    this.lastAdvancedPathIndex = 0;
    this.wasBlocked = false;

    this.smoothPath = [];
    this.smoothCumDist = [];
    this.smoothCellDist = [];

    this.arcDistance = 0;
    this.currentSpeed = 0;
    this.leaderId = null;
    this.leaderGap = Infinity;
    this.arrivalTime = 0;

    this.onHighway = false;
    this.elevationY = 0;
    this.prevElevationY = 0;
    this.highwayPolyline = null;
    this.highwayCumDist = null;
    this.highwayProgress = 0;

    this.assignedSlotIndex = null;
    this.unloadTimer = 0;
    this.parkingPath = [];
    this.parkingCumDist = [];
    this.parkingProgress = 0;
    this.pendingHomePath = null;

    this.targetGasStationId = null;
    this.refuelTimer = 0;
    this.postRefuelIntent = 'business';

    const center = gridToPixelCenter(homePos);
    this.pixelPos = { ...center };
    this.prevPixelPos = { ...center };
  }
}

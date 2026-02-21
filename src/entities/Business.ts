import type { GameColor, GridPos, BusinessRotation } from '../types';
import { Direction } from '../types';
import { PARKING_SLOTS } from '../constants';
import { generateId } from '../utils/math';
import type { ParkingSlot } from './ParkingSlot';
export type { ParkingSlot } from './ParkingSlot';

/** Cell offsets from anchor (top-left) for each rotation. */
const LAYOUT_OFFSETS: Record<BusinessRotation, {
  building: GridPos; pins: GridPos; connector: GridPos; parkingLot: GridPos;
}> = {
  0:   { building: { gx: 0, gy: 0 }, pins: { gx: 1, gy: 0 }, connector: { gx: 0, gy: 1 }, parkingLot: { gx: 1, gy: 1 } },
  90:  { building: { gx: 1, gy: 0 }, pins: { gx: 1, gy: 1 }, connector: { gx: 0, gy: 0 }, parkingLot: { gx: 0, gy: 1 } },
  180: { building: { gx: 1, gy: 1 }, pins: { gx: 0, gy: 1 }, connector: { gx: 1, gy: 0 }, parkingLot: { gx: 0, gy: 0 } },
  270: { building: { gx: 0, gy: 1 }, pins: { gx: 0, gy: 0 }, connector: { gx: 1, gy: 1 }, parkingLot: { gx: 1, gy: 0 } },
};

/** Direction from connector toward parkingLot for each rotation. */
const CONNECTOR_DIR: Record<BusinessRotation, Direction> = {
  0:   Direction.Right,
  90:  Direction.Down,
  180: Direction.Left,
  270: Direction.Up,
};

export class Business {
  readonly id: string;
  /** Anchor position (top-left of the 2x2 block). */
  readonly pos: GridPos;
  readonly color: GameColor;
  readonly rotation: BusinessRotation;
  readonly buildingPos: GridPos;
  readonly pinsPos: GridPos;
  readonly parkingLotPos: GridPos;
  readonly connectorPos: GridPos;
  readonly parkingSlots: ParkingSlot[];
  demandPins: number;
  age: number = 0;
  pinCooldown: number = 0;
  pinOutputRate: number = 0;
  pinAccumulator: number = 0;

  constructor(
    pos: GridPos,
    color: GameColor,
    rotation: BusinessRotation,
  ) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.rotation = rotation;
    this.demandPins = 1;

    const offsets = LAYOUT_OFFSETS[rotation];
    this.buildingPos = { gx: pos.gx + offsets.building.gx, gy: pos.gy + offsets.building.gy };
    this.pinsPos = { gx: pos.gx + offsets.pins.gx, gy: pos.gy + offsets.pins.gy };
    this.connectorPos = { gx: pos.gx + offsets.connector.gx, gy: pos.gy + offsets.connector.gy };
    this.parkingLotPos = { gx: pos.gx + offsets.parkingLot.gx, gy: pos.gy + offsets.parkingLot.gy };

    this.parkingSlots = [];
    for (let i = 0; i < PARKING_SLOTS; i++) {
      this.parkingSlots.push({ carId: null });
    }
  }

  /** Direction from connector toward parking lot. */
  getConnectorToParkingDir(): Direction {
    return CONNECTOR_DIR[this.rotation];
  }

  /** Returns all 4 cell positions. */
  getCells(): GridPos[] {
    return [this.buildingPos, this.pinsPos, this.parkingLotPos, this.connectorPos];
  }

  getFreeParkingSlot(): number | null {
    for (let i = 0; i < this.parkingSlots.length; i++) {
      if (this.parkingSlots[i].carId === null) return i;
    }
    return null;
  }

  occupySlot(slotIndex: number, carId: string): void {
    this.parkingSlots[slotIndex].carId = carId;
  }

  freeSlot(slotIndex: number): void {
    this.parkingSlots[slotIndex].carId = null;
  }

  getOccupiedSlotCount(): number {
    return this.parkingSlots.filter(s => s.carId !== null).length;
  }
}

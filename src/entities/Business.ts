import type { GameColor, GridPos } from '../types';
import { Direction } from '../types';
import { PARKING_SLOTS } from '../constants';
import { generateId } from '../utils/math';

export interface ParkingSlot {
  carId: string | null;
}

export class Business {
  readonly id: string;
  readonly pos: GridPos;
  readonly color: GameColor;
  readonly orientation: 'horizontal' | 'vertical';
  readonly connectorSide: 'positive' | 'negative';
  readonly parkingLotPos: GridPos;
  readonly connectorPos: GridPos;
  readonly parkingSlots: ParkingSlot[];
  demandPins: number;
  age: number = 0;

  constructor(
    pos: GridPos,
    color: GameColor,
    orientation: 'horizontal' | 'vertical',
    connectorSide: 'positive' | 'negative',
  ) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.orientation = orientation;
    this.connectorSide = connectorSide;
    this.demandPins = 1;

    // Parking lot is adjacent to building along orientation axis
    if (orientation === 'horizontal') {
      this.parkingLotPos = { gx: pos.gx + 1, gy: pos.gy };
    } else {
      this.parkingLotPos = { gx: pos.gx, gy: pos.gy + 1 };
    }

    // Connector is perpendicular to orientation, on the specified side
    if (orientation === 'horizontal') {
      // connectorSide positive = Down, negative = Up
      this.connectorPos = {
        gx: this.parkingLotPos.gx,
        gy: this.parkingLotPos.gy + (connectorSide === 'positive' ? 1 : -1),
      };
    } else {
      // connectorSide positive = Right, negative = Left
      this.connectorPos = {
        gx: this.parkingLotPos.gx + (connectorSide === 'positive' ? 1 : -1),
        gy: this.parkingLotPos.gy,
      };
    }

    this.parkingSlots = [];
    for (let i = 0; i < PARKING_SLOTS; i++) {
      this.parkingSlots.push({ carId: null });
    }
  }

  /** Direction from connector toward parking lot */
  getConnectorToParkingDir(): Direction {
    if (this.orientation === 'horizontal') {
      return this.connectorSide === 'positive' ? Direction.Up : Direction.Down;
    } else {
      return this.connectorSide === 'positive' ? Direction.Left : Direction.Right;
    }
  }

  getCells(): GridPos[] {
    return [this.pos, this.parkingLotPos, this.connectorPos];
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

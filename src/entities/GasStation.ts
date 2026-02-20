import type { GridPos } from '../types';
import { GAS_STATION_PARKING_SLOTS } from '../constants';
import { generateId } from '../utils/math';
import type { ParkingSlot } from './ParkingSlot';

export type GasStationOrientation = 'horizontal' | 'vertical';

export class GasStation {
  readonly id: string;
  /** Station cell (between entry and exit connectors) */
  readonly pos: GridPos;
  readonly orientation: GasStationOrientation;
  readonly entryConnectorPos: GridPos;
  readonly exitConnectorPos: GridPos;

  readonly parkingSlots: ParkingSlot[];

  constructor(anchorPos: GridPos, orientation: GasStationOrientation) {
    this.id = generateId();
    this.orientation = orientation;

    if (orientation === 'horizontal') {
      // Layout: [Entry] [Station] [Exit] — left to right
      this.entryConnectorPos = { gx: anchorPos.gx, gy: anchorPos.gy };
      this.pos = { gx: anchorPos.gx + 1, gy: anchorPos.gy };
      this.exitConnectorPos = { gx: anchorPos.gx + 2, gy: anchorPos.gy };
    } else {
      // Layout: [Entry(top)] [Station] [Exit(bottom)] — top to bottom
      this.entryConnectorPos = { gx: anchorPos.gx, gy: anchorPos.gy };
      this.pos = { gx: anchorPos.gx, gy: anchorPos.gy + 1 };
      this.exitConnectorPos = { gx: anchorPos.gx, gy: anchorPos.gy + 2 };
    }

    this.parkingSlots = [];
    for (let i = 0; i < GAS_STATION_PARKING_SLOTS; i++) {
      this.parkingSlots.push({ carId: null });
    }
  }

  /** Returns all 3 cell positions: [entry, station, exit] */
  getCells(): GridPos[] {
    return [this.entryConnectorPos, this.pos, this.exitConnectorPos];
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

import type { BusinessRotation } from '../types';
import { BIZ_PIN_SPACING } from '../constants';
import { cellCenter, computeGroundPlate, computeInnerSpace, computeParkingSlots } from './buildingLayout';
import type { Rect2D, Point2D } from './buildingLayout';

// Re-export shared types for backward compatibility
export type { Rect2D, Point2D };

export interface BusinessLayoutInput {
  anchorPos: { gx: number; gy: number };
  rotation: BusinessRotation;
}

export interface BusinessLayout {
  groundPlate: Rect2D;
  building: Rect2D;
  pinSlots: Point2D[];        // 8 positions (4 cols x 2 rows)
  parkingSlots: Rect2D[];     // 4 slot rectangles
}

/** Cell offsets from anchor for each rotation (mirrors Business entity). */
const LAYOUT_OFFSETS: Record<BusinessRotation, {
  building: { gx: number; gy: number };
  pins: { gx: number; gy: number };
  connector: { gx: number; gy: number };
  parkingLot: { gx: number; gy: number };
}> = {
  0:   { building: { gx: 0, gy: 0 }, pins: { gx: 1, gy: 0 }, connector: { gx: 0, gy: 1 }, parkingLot: { gx: 1, gy: 1 } },
  90:  { building: { gx: 1, gy: 0 }, pins: { gx: 1, gy: 1 }, connector: { gx: 0, gy: 0 }, parkingLot: { gx: 0, gy: 1 } },
  180: { building: { gx: 1, gy: 1 }, pins: { gx: 0, gy: 1 }, connector: { gx: 1, gy: 0 }, parkingLot: { gx: 0, gy: 0 } },
  270: { building: { gx: 0, gy: 1 }, pins: { gx: 0, gy: 0 }, connector: { gx: 1, gy: 1 }, parkingLot: { gx: 1, gy: 0 } },
};

/** Parking slot axis: perpendicular to connector→parking direction. */
const PARKING_AXIS: Record<BusinessRotation, 'x' | 'z'> = {
  0:   'z',  // connector→parking is horizontal (Right), slots along Z
  90:  'x',  // connector→parking is vertical (Down), slots along X
  180: 'z',  // connector→parking is horizontal (Left), slots along Z
  270: 'x',  // connector→parking is vertical (Up), slots along X
};

function getCellPositions(input: BusinessLayoutInput) {
  const { anchorPos, rotation } = input;
  const offsets = LAYOUT_OFFSETS[rotation];
  return {
    building: { gx: anchorPos.gx + offsets.building.gx, gy: anchorPos.gy + offsets.building.gy },
    pins: { gx: anchorPos.gx + offsets.pins.gx, gy: anchorPos.gy + offsets.pins.gy },
    connector: { gx: anchorPos.gx + offsets.connector.gx, gy: anchorPos.gy + offsets.connector.gy },
    parkingLot: { gx: anchorPos.gx + offsets.parkingLot.gx, gy: anchorPos.gy + offsets.parkingLot.gy },
  };
}

export function getGroundPlateLayout(input: BusinessLayoutInput): Rect2D {
  const cells = getCellPositions(input);
  return computeGroundPlate([cells.building, cells.pins, cells.connector, cells.parkingLot]);
}

export function getBuildingLayout(input: BusinessLayoutInput): Rect2D {
  const cells = getCellPositions(input);
  const bldgPlate = computeGroundPlate([cells.building]);
  return computeInnerSpace(bldgPlate);
}

export function getPinGridLayout(input: BusinessLayoutInput): Point2D[] {
  const cells = getCellPositions(input);
  const pinsCenter = cellCenter(cells.pins);

  const points: Point2D[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;       // 0..3
    const row = (i / 4) | 0; // 0 or 1
    const offsetA = (col - 1.5) * BIZ_PIN_SPACING;
    const offsetB = (row - 0.5) * BIZ_PIN_SPACING;
    points.push({
      x: pinsCenter.x + offsetA,
      z: pinsCenter.z + offsetB,
    });
  }
  return points;
}

export function getParkingSlotLayout(input: BusinessLayoutInput): Rect2D[] {
  const cells = getCellPositions(input);
  const lotPlate = computeGroundPlate([cells.parkingLot]);
  const lotInner = computeInnerSpace(lotPlate);
  const axis = PARKING_AXIS[input.rotation];
  return computeParkingSlots(lotInner, 4, axis);
}

export function getBusinessLayout(input: BusinessLayoutInput): BusinessLayout {
  return {
    groundPlate: getGroundPlateLayout(input),
    building: getBuildingLayout(input),
    pinSlots: getPinGridLayout(input),
    parkingSlots: getParkingSlotLayout(input),
  };
}

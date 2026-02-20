import {
  TILE_SIZE,
  BIZ_BUILDING_CROSS,
  BIZ_BUILDING_ALONG,
  BIZ_PIN_SPACING,
  BIZ_PIN_CENTER_T,
  BIZ_SLOT_CROSS,
  BIZ_SLOT_ALONG,
} from '../constants';
import { cellCenter, computeGroundPlate } from './buildingLayout';
import type { Rect2D, Point2D } from './buildingLayout';

// Re-export shared types for backward compatibility
export type { Rect2D, Point2D };

export interface BusinessLayoutInput {
  buildingPos: { gx: number; gy: number };
  parkingLotPos: { gx: number; gy: number };
  orientation: 'horizontal' | 'vertical';
  connectorSide: 'positive' | 'negative';
}

export interface BusinessLayout {
  groundPlate: Rect2D;
  building: Rect2D;
  pinSlots: Point2D[];        // 8 positions (4 cols x 2 rows)
  parkingSlots: Rect2D[];     // 4 slot rectangles
}

/** Convert (along, cross) to (worldX, worldZ) relative to an origin. */
function toWorld(
  originX: number,
  originZ: number,
  along: number,
  cross: number,
  isHorizontal: boolean,
): { x: number; z: number } {
  if (isHorizontal) {
    // along = +X (building→lot), cross = Z
    return { x: originX + along, z: originZ + cross };
  } else {
    // along = +Z (building→lot), cross = X
    return { x: originX + cross, z: originZ + along };
  }
}

export function getGroundPlateLayout(input: BusinessLayoutInput): Rect2D {
  return computeGroundPlate([input.buildingPos, input.parkingLotPos]);
}

export function getBuildingLayout(input: BusinessLayoutInput): Rect2D {
  const bldg = cellCenter(input.buildingPos);
  const isH = input.orientation === 'horizontal';
  const crossSize = TILE_SIZE * BIZ_BUILDING_CROSS;
  const alongSize = TILE_SIZE * BIZ_BUILDING_ALONG;
  return {
    centerX: bldg.x,
    centerZ: bldg.z,
    width: isH ? alongSize : crossSize,
    depth: isH ? crossSize : alongSize,
  };
}

export function getPinGridLayout(input: BusinessLayoutInput): Point2D[] {
  const bldg = cellCenter(input.buildingPos);
  const lot = cellCenter(input.parkingLotPos);
  const isH = input.orientation === 'horizontal';

  const anchorX = bldg.x + (lot.x - bldg.x) * BIZ_PIN_CENTER_T;
  const anchorZ = bldg.z + (lot.z - bldg.z) * BIZ_PIN_CENTER_T;

  const points: Point2D[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;       // 0..3 (cross-axis)
    const row = (i / 4) | 0; // 0 or 1 (along-axis)
    const crossOffset = (col - 1.5) * BIZ_PIN_SPACING;
    const alongOffset = (row - 0.5) * BIZ_PIN_SPACING;
    const pt = toWorld(anchorX, anchorZ, alongOffset, crossOffset, isH);
    points.push(pt);
  }
  return points;
}

export function getParkingSlotLayout(input: BusinessLayoutInput): Rect2D[] {
  const bldg = cellCenter(input.buildingPos);
  const lot = cellCenter(input.parkingLotPos);
  const isH = input.orientation === 'horizontal';

  // Pin anchor (same as getPinGridLayout)
  const anchorX = bldg.x + (lot.x - bldg.x) * BIZ_PIN_CENTER_T;
  const anchorZ = bldg.z + (lot.z - bldg.z) * BIZ_PIN_CENTER_T;

  const slotCross = TILE_SIZE * BIZ_SLOT_CROSS;
  const slotAlong = TILE_SIZE * BIZ_SLOT_ALONG;
  const slotSpacing = BIZ_PIN_SPACING; // align with pin grid columns

  // Place slots just past the pin grid's far edge (toward lot), with a small gap
  const pinFarEdge = 0.5 * BIZ_PIN_SPACING; // pin grid extends this far from anchor toward lot
  const gap = 6; // px gap between pins and parking slots
  const slotAlongOffset = pinFarEdge + gap + slotAlong / 2;

  const slots: Rect2D[] = [];
  for (let i = 0; i < 4; i++) {
    const crossOffset = (i - 1.5) * slotSpacing;
    const pt = toWorld(anchorX, anchorZ, slotAlongOffset, crossOffset, isH);
    if (isH) {
      slots.push({ centerX: pt.x, centerZ: pt.z, width: slotAlong, depth: slotCross });
    } else {
      slots.push({ centerX: pt.x, centerZ: pt.z, width: slotCross, depth: slotAlong });
    }
  }
  return slots;
}

export function getBusinessLayout(input: BusinessLayoutInput): BusinessLayout {
  return {
    groundPlate: getGroundPlateLayout(input),
    building: getBuildingLayout(input),
    pinSlots: getPinGridLayout(input),
    parkingSlots: getParkingSlotLayout(input),
  };
}

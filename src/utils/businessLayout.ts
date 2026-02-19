import {
  TILE_SIZE,
  BIZ_PLATE_CROSS,
  BIZ_PLATE_INSET,
  BIZ_BUILDING_CROSS,
  BIZ_BUILDING_ALONG,
  BIZ_BUILDING_SHIFT,
  BIZ_PIN_SPACING,
  BIZ_PIN_CENTER_T,
  BIZ_SLOT_CROSS,
  BIZ_SLOT_ALONG,
} from '../constants';

export interface BusinessLayoutInput {
  buildingPos: { gx: number; gy: number };
  parkingLotPos: { gx: number; gy: number };
  orientation: 'horizontal' | 'vertical';
  connectorSide: 'positive' | 'negative';
}

export interface Rect2D {
  centerX: number;  // world X (Three.js X)
  centerZ: number;  // world Z (Three.js Z)
  width: number;    // X dimension
  depth: number;    // Z dimension
}

export interface Point2D {
  x: number;  // world X
  z: number;  // world Z
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

function cellCenter(pos: { gx: number; gy: number }): { x: number; z: number } {
  return {
    x: pos.gx * TILE_SIZE + TILE_SIZE / 2,
    z: pos.gy * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function getGroundPlateLayout(input: BusinessLayoutInput): Rect2D {
  const bldg = cellCenter(input.buildingPos);
  const lot = cellCenter(input.parkingLotPos);
  const isH = input.orientation === 'horizontal';

  const shift = TILE_SIZE * BIZ_BUILDING_SHIFT;
  const plateLong = TILE_SIZE * 2 - BIZ_PLATE_INSET - shift;
  const plateNarrow = TILE_SIZE * BIZ_PLATE_CROSS;

  // Plate center: midpoint between shifted building and lot center
  // Building is shifted away from lot by BIZ_BUILDING_SHIFT
  if (isH) {
    const shiftedBldgX = bldg.x - shift; // away from lot (lot is at +X)
    const cx = (shiftedBldgX + lot.x) / 2;
    const cz = bldg.z;
    return { centerX: cx, centerZ: cz, width: plateLong, depth: plateNarrow };
  } else {
    const shiftedBldgZ = bldg.z - shift; // away from lot (lot is at +Z)
    const cx = bldg.x;
    const cz = (shiftedBldgZ + lot.z) / 2;
    return { centerX: cx, centerZ: cz, width: plateNarrow, depth: plateLong };
  }
}

export function getBuildingLayout(input: BusinessLayoutInput): Rect2D {
  const bldg = cellCenter(input.buildingPos);
  const lot = cellCenter(input.parkingLotPos);
  const isH = input.orientation === 'horizontal';

  const shift = TILE_SIZE * BIZ_BUILDING_SHIFT;
  const crossSize = TILE_SIZE * BIZ_BUILDING_CROSS;
  const alongSize = TILE_SIZE * BIZ_BUILDING_ALONG;

  if (isH) {
    // Shift building away from lot (lot is at +X, so shift -X)
    const cx = bldg.x + (bldg.x - lot.x > 0 ? shift : -shift);
    return { centerX: cx, centerZ: bldg.z, width: alongSize, depth: crossSize };
  } else {
    const cz = bldg.z + (bldg.z - lot.z > 0 ? shift : -shift);
    return { centerX: bldg.x, centerZ: cz, width: crossSize, depth: alongSize };
  }
}

export function getPinGridLayout(input: BusinessLayoutInput): Point2D[] {
  const bldg = cellCenter(input.buildingPos);
  const lot = cellCenter(input.parkingLotPos);
  const isH = input.orientation === 'horizontal';

  const shift = TILE_SIZE * BIZ_BUILDING_SHIFT;
  // Shifted building position
  const shiftedBldgX = isH ? bldg.x - shift : bldg.x;
  const shiftedBldgZ = isH ? bldg.z : bldg.z - shift;

  // Pin anchor: interpolate between shifted building and lot
  const anchorX = shiftedBldgX + (lot.x - shiftedBldgX) * BIZ_PIN_CENTER_T;
  const anchorZ = shiftedBldgZ + (lot.z - shiftedBldgZ) * BIZ_PIN_CENTER_T;

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

  const shift = TILE_SIZE * BIZ_BUILDING_SHIFT;
  const shiftedBldgX = isH ? bldg.x - shift : bldg.x;
  const shiftedBldgZ = isH ? bldg.z : bldg.z - shift;

  // Pin anchor (same as getPinGridLayout)
  const anchorX = shiftedBldgX + (lot.x - shiftedBldgX) * BIZ_PIN_CENTER_T;
  const anchorZ = shiftedBldgZ + (lot.z - shiftedBldgZ) * BIZ_PIN_CENTER_T;

  const slotCross = TILE_SIZE * BIZ_SLOT_CROSS;
  const slotAlong = TILE_SIZE * BIZ_SLOT_ALONG;
  const plateNarrow = TILE_SIZE * BIZ_PLATE_CROSS;
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

import { CELL_MARGIN, GROUND_PLATE_MARGIN, GAS_STATION_PARKING_SLOTS } from '../constants';
import type { GridPos } from '../types';
import type { GasStation } from '../entities/GasStation';
import { computeGroundPlate, computeInnerSpace, computeParkingSlots, cellCenter } from './buildingLayout';
import type { Rect2D, Point2D } from './buildingLayout';

export type { Rect2D, Point2D };

export interface GasStationLayoutInput {
  entryConnectorPos: GridPos;
  pos: GridPos;
  exitConnectorPos: GridPos;
  orientation: 'horizontal' | 'vertical';
}

export interface GasStationLayout {
  groundPlate: Rect2D;        // all 3 cells
  canopy: Rect2D;             // inner space of entire ground plate
  parkingSlots: Rect2D[];     // slots within station cells
  entryPoint: Point2D;        // center of entry connector
  exitPoint: Point2D;         // center of exit connector
}

export function getGasStationLayout(input: GasStationLayoutInput): GasStationLayout {
  const allCells = [input.entryConnectorPos, input.pos, input.exitConnectorPos];
  const groundPlate = computeGroundPlate(allCells);

  // Canopy spans the entire inner space; parking slots within station cell only
  const canopy = computeInnerSpace(groundPlate, GROUND_PLATE_MARGIN);
  const stationPlate = computeGroundPlate([input.pos], CELL_MARGIN);
  const innerSpace = computeInnerSpace(stationPlate, GROUND_PLATE_MARGIN);
  const axis = input.orientation === 'horizontal' ? 'x' : 'z';
  const parkingSlots = computeParkingSlots(innerSpace, GAS_STATION_PARKING_SLOTS, axis);

  const entry = cellCenter(input.entryConnectorPos);
  const exit = cellCenter(input.exitConnectorPos);

  return {
    groundPlate,
    canopy,
    parkingSlots,
    entryPoint: { x: entry.x, z: entry.z },
    exitPoint: { x: exit.x, z: exit.z },
  };
}

/** Get parking slot positions as offsets from the station center (midpoint of pos+pos2). */
export function getGasStationParkingSlotOffsets(gs: GasStation): { x: number; y: number }[] {
  const layout = getGasStationLayout({
    entryConnectorPos: gs.entryConnectorPos,
    pos: gs.pos,
    exitConnectorPos: gs.exitConnectorPos,
    orientation: gs.orientation,
  });

  // Return offsets relative to station midpoint (entry connector center)
  const entryCenter = cellCenter(gs.entryConnectorPos);
  return layout.parkingSlots.map(slot => ({
    x: slot.centerX - entryCenter.x,
    y: slot.centerZ - entryCenter.z,
  }));
}

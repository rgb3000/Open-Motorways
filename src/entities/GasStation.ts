import type { GridPos } from '../types';
import { generateId } from '../utils/math';

export type GasStationOrientation = 'horizontal' | 'vertical';

export class GasStation {
  readonly id: string;
  /** First station cell (closer to entry) */
  readonly pos: GridPos;
  /** Second station cell (closer to exit) */
  readonly pos2: GridPos;
  readonly orientation: GasStationOrientation;
  readonly entryConnectorPos: GridPos;
  readonly exitConnectorPos: GridPos;

  /** Car currently refueling (at most one) */
  refuelingCarId: string | null = null;

  constructor(anchorPos: GridPos, orientation: GasStationOrientation) {
    this.id = generateId();
    this.orientation = orientation;

    if (orientation === 'horizontal') {
      // Layout: [Entry] [Station1] [Station2] [Exit] — left to right
      this.entryConnectorPos = { gx: anchorPos.gx, gy: anchorPos.gy };
      this.pos = { gx: anchorPos.gx + 1, gy: anchorPos.gy };
      this.pos2 = { gx: anchorPos.gx + 2, gy: anchorPos.gy };
      this.exitConnectorPos = { gx: anchorPos.gx + 3, gy: anchorPos.gy };
    } else {
      // Layout: [Entry(top)] [Station1] [Station2] [Exit(bottom)] — top to bottom
      this.entryConnectorPos = { gx: anchorPos.gx, gy: anchorPos.gy };
      this.pos = { gx: anchorPos.gx, gy: anchorPos.gy + 1 };
      this.pos2 = { gx: anchorPos.gx, gy: anchorPos.gy + 2 };
      this.exitConnectorPos = { gx: anchorPos.gx, gy: anchorPos.gy + 3 };
    }
  }

  /** Returns all 4 cell positions: [entry, station1, station2, exit] */
  getCells(): GridPos[] {
    return [this.entryConnectorPos, this.pos, this.pos2, this.exitConnectorPos];
  }
}

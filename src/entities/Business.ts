import type { Direction, GameColor, GridPos } from '../types';
import { generateId } from '../utils/math';

export class Business {
  readonly id: string;
  readonly pos: GridPos;
  readonly color: GameColor;
  readonly orientation: 'horizontal' | 'vertical';
  readonly connectorPos: GridPos;
  readonly connectorDir: Direction;
  demandPins: number;

  constructor(
    pos: GridPos,
    color: GameColor,
    orientation: 'horizontal' | 'vertical',
    connectorPos: GridPos,
    connectorDir: Direction,
  ) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.orientation = orientation;
    this.connectorPos = connectorPos;
    this.connectorDir = connectorDir;
    this.demandPins = 1;
  }

  getCells(): GridPos[] {
    if (this.orientation === 'horizontal') {
      return [
        this.pos,
        { gx: this.pos.gx + 1, gy: this.pos.gy },
        { gx: this.pos.gx + 2, gy: this.pos.gy },
      ];
    }
    return [
      this.pos,
      { gx: this.pos.gx, gy: this.pos.gy + 1 },
      { gx: this.pos.gx, gy: this.pos.gy + 2 },
    ];
  }
}

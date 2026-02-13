import type { GameColor, GridPos } from '../types';
import { generateId } from '../utils/math';

export class Business {
  readonly id: string;
  readonly pos: GridPos;
  readonly color: GameColor;
  demandPins: number;

  constructor(pos: GridPos, color: GameColor) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.demandPins = 1; // starts with 1 demand
  }
}

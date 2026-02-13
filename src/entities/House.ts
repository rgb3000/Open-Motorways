import type { GameColor, GridPos } from '../types';
import { CARS_PER_HOUSE } from '../constants';
import { generateId } from '../utils/math';

export class House {
  readonly id: string;
  readonly pos: GridPos;
  readonly color: GameColor;
  totalCars: number;
  availableCars: number;

  constructor(pos: GridPos, color: GameColor) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.totalCars = CARS_PER_HOUSE;
    this.availableCars = CARS_PER_HOUSE;
  }
}

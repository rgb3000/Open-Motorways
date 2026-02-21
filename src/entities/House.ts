import type { GameColor, GridPos } from '../types';
import { CARS_PER_HOUSE } from '../constants';
import { generateId } from '../utils/math';
import { Car } from './Car';

export class House {
  readonly id: string;
  readonly pos: GridPos;
  readonly color: GameColor;
  totalCars: number;
  carPool: Car[];

  constructor(pos: GridPos, color: GameColor) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.totalCars = CARS_PER_HOUSE;
    this.carPool = [];

    // Initialize pool with Car objects
    for (let i = 0; i < CARS_PER_HOUSE; i++) {
      this.carPool.push(new Car(this.id, color, pos));
    }
  }

  /** Pop a car from the pool (or null if none available). */
  popCar(): Car | null {
    return this.carPool.pop() ?? null;
  }

  /** Return a car to the pool, preserving its fuel level. */
  returnCar(car: Car): void {
    car.resetForPool(this.pos);
    this.carPool.push(car);
  }
}

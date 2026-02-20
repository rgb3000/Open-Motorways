import type { GameColor, GridPos } from '../types';
import { Direction } from '../types';
import { CARS_PER_HOUSE } from '../constants';
import { generateId } from '../utils/math';
import { opposite, DIRECTION_OFFSETS } from '../utils/direction';
import { Car } from './Car';

export class House {
  readonly id: string;
  readonly pos: GridPos;
  readonly color: GameColor;
  totalCars: number;
  carPool: Car[];
  connectorDir: Direction;
  connectorPos: GridPos;

  constructor(pos: GridPos, color: GameColor, connectorDir: Direction = Direction.Down) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.totalCars = CARS_PER_HOUSE;
    this.carPool = [];
    this.connectorDir = connectorDir;
    const off = DIRECTION_OFFSETS[connectorDir];
    this.connectorPos = { gx: pos.gx + off.gx, gy: pos.gy + off.gy };

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

  /** Direction from connector toward house */
  getConnectorToHouseDir(): Direction {
    return opposite(this.connectorDir);
  }

  setConnectorDir(dir: Direction): void {
    this.connectorDir = dir;
    const off = DIRECTION_OFFSETS[dir];
    this.connectorPos = { gx: this.pos.gx + off.gx, gy: this.pos.gy + off.gy };
  }
}

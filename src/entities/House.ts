import type { GameColor, GridPos } from '../types';
import { Direction } from '../types';
import { CARS_PER_HOUSE } from '../constants';
import { generateId } from '../utils/math';
import { opposite, DIRECTION_OFFSETS } from '../utils/direction';

export class House {
  readonly id: string;
  readonly pos: GridPos;
  readonly color: GameColor;
  totalCars: number;
  availableCars: number;
  connectorDir: Direction;
  connectorPos: GridPos;

  constructor(pos: GridPos, color: GameColor, connectorDir: Direction = Direction.Down) {
    this.id = generateId();
    this.pos = pos;
    this.color = color;
    this.totalCars = CARS_PER_HOUSE;
    this.availableCars = CARS_PER_HOUSE;
    this.connectorDir = connectorDir;
    const off = DIRECTION_OFFSETS[connectorDir];
    this.connectorPos = { gx: pos.gx + off.gx, gy: pos.gy + off.gy };
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

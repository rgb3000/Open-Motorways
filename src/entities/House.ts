import type { GameColor, GridPos } from '../types';
import { Direction } from '../types';
import { CARS_PER_HOUSE } from '../constants';
import { generateId } from '../utils/math';

const DIRECTION_OFFSETS: Partial<Record<Direction, GridPos>> = {
  [Direction.Up]: { gx: 0, gy: -1 },
  [Direction.Down]: { gx: 0, gy: 1 },
  [Direction.Left]: { gx: -1, gy: 0 },
  [Direction.Right]: { gx: 1, gy: 0 },
  [Direction.UpLeft]: { gx: -1, gy: -1 },
  [Direction.UpRight]: { gx: 1, gy: -1 },
  [Direction.DownLeft]: { gx: -1, gy: 1 },
  [Direction.DownRight]: { gx: 1, gy: 1 },
};

const OPPOSITE_DIR: Partial<Record<Direction, Direction>> = {
  [Direction.Up]: Direction.Down,
  [Direction.Down]: Direction.Up,
  [Direction.Left]: Direction.Right,
  [Direction.Right]: Direction.Left,
  [Direction.UpLeft]: Direction.DownRight,
  [Direction.UpRight]: Direction.DownLeft,
  [Direction.DownLeft]: Direction.UpRight,
  [Direction.DownRight]: Direction.UpLeft,
};

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
    const off = DIRECTION_OFFSETS[connectorDir]!;
    this.connectorPos = { gx: pos.gx + off.gx, gy: pos.gy + off.gy };
  }

  /** Direction from connector toward house */
  getConnectorToHouseDir(): Direction {
    return OPPOSITE_DIR[this.connectorDir]!;
  }

  setConnectorDir(dir: Direction): void {
    this.connectorDir = dir;
    const off = DIRECTION_OFFSETS[dir]!;
    this.connectorPos = { gx: this.pos.gx + off.gx, gy: this.pos.gy + off.gy };
  }
}

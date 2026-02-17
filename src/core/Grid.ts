import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../constants';
import { type Cell, CellType, Direction, type GridPos, type PixelPos } from '../types';

const DIRECTION_OFFSETS: Record<Direction, GridPos> = {
  [Direction.Up]: { gx: 0, gy: -1 },
  [Direction.Down]: { gx: 0, gy: 1 },
  [Direction.Left]: { gx: -1, gy: 0 },
  [Direction.Right]: { gx: 1, gy: 0 },
  [Direction.UpLeft]: { gx: -1, gy: -1 },
  [Direction.UpRight]: { gx: 1, gy: -1 },
  [Direction.DownLeft]: { gx: -1, gy: 1 },
  [Direction.DownRight]: { gx: 1, gy: 1 },
};

export const OPPOSITE_DIR: Record<Direction, Direction> = {
  [Direction.Up]: Direction.Down,
  [Direction.Down]: Direction.Up,
  [Direction.Left]: Direction.Right,
  [Direction.Right]: Direction.Left,
  [Direction.UpLeft]: Direction.DownRight,
  [Direction.UpRight]: Direction.DownLeft,
  [Direction.DownLeft]: Direction.UpRight,
  [Direction.DownRight]: Direction.UpLeft,
};

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private cells: Cell[];

  constructor(cols: number = GRID_COLS, rows: number = GRID_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { type: CellType.Empty, entityId: null, roadConnections: [], color: null, connectorDir: null, pendingDeletion: false };
    }
  }

  inBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows;
  }

  getCell(gx: number, gy: number): Cell | null {
    if (!this.inBounds(gx, gy)) return null;
    return this.cells[gy * this.cols + gx];
  }

  setCell(gx: number, gy: number, cell: Partial<Cell>): void {
    if (!this.inBounds(gx, gy)) return;
    const existing = this.cells[gy * this.cols + gx];
    Object.assign(existing, cell);
  }

  pixelToGrid(px: number, py: number): GridPos {
    return {
      gx: Math.floor(px / TILE_SIZE),
      gy: Math.floor(py / TILE_SIZE),
    };
  }

  gridToPixelCenter(pos: GridPos): PixelPos {
    return {
      x: pos.gx * TILE_SIZE + TILE_SIZE / 2,
      y: pos.gy * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  getNeighbor(gx: number, gy: number, dir: Direction): { gx: number; gy: number; cell: Cell } | null {
    const offset = DIRECTION_OFFSETS[dir];
    const nx = gx + offset.gx;
    const ny = gy + offset.gy;
    const cell = this.getCell(nx, ny);
    if (!cell) return null;
    return { gx: nx, gy: ny, cell };
  }

  getRoadNeighbors(gx: number, gy: number): { dir: Direction; gx: number; gy: number }[] {
    const results: { dir: Direction; gx: number; gy: number }[] = [];
    for (const dir of this.getAllDirections()) {
      const n = this.getNeighbor(gx, gy, dir);
      if (!n) continue;
      if (n.cell.type === CellType.Road || n.cell.type === CellType.Connector || n.cell.type === CellType.House || n.cell.type === CellType.ParkingLot) {
        results.push({ dir, gx: n.gx, gy: n.gy });
      }
    }
    return results;
  }

  getEmptyCells(): GridPos[] {
    const empty: GridPos[] = [];
    for (let gy = 0; gy < this.rows; gy++) {
      for (let gx = 0; gx < this.cols; gx++) {
        if (this.cells[gy * this.cols + gx].type === CellType.Empty) {
          empty.push({ gx, gy });
        }
      }
    }
    return empty;
  }

  getAllDirections(): Direction[] {
    return [Direction.Up, Direction.Down, Direction.Left, Direction.Right,
            Direction.UpLeft, Direction.UpRight, Direction.DownLeft, Direction.DownRight];
  }

  getCardinalDirections(): Direction[] {
    return [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
  }

  getDirectionOffset(dir: Direction): GridPos {
    return DIRECTION_OFFSETS[dir];
  }
}

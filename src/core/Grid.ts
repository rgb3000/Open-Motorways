import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../constants';
import { type Cell, CellType, Direction, type GridPos, type PixelPos } from '../types';
import { ALL_DIRECTIONS, CARDINAL_DIRECTIONS, DIRECTION_OFFSETS } from '../utils/direction';

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private cells: Cell[];

  constructor(cols: number = GRID_COLS, rows: number = GRID_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { type: CellType.Empty, entityId: null, roadConnections: 0, color: null, connectorDir: null, pendingDeletion: false };
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
    for (const dir of ALL_DIRECTIONS) {
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

  getAllDirections(): readonly Direction[] {
    return ALL_DIRECTIONS;
  }

  getCardinalDirections(): readonly Direction[] {
    return CARDINAL_DIRECTIONS;
  }

  getDirectionOffset(dir: Direction): GridPos {
    return DIRECTION_OFFSETS[dir];
  }
}

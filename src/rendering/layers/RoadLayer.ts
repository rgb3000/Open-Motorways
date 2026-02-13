import type { Grid } from '../../core/Grid';
import { CellType, Direction } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, ROAD_COLOR, ROAD_OUTLINE_COLOR } from '../../constants';

export class RoadLayer {
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const half = TILE_SIZE / 2;
    const roadWidth = TILE_SIZE * 0.6;
    const roadHalf = roadWidth / 2;

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || cell.type !== CellType.Road) continue;

        const px = gx * TILE_SIZE;
        const py = gy * TILE_SIZE;
        const cx = px + half;
        const cy = py + half;
        const conns = cell.roadConnections;

        // Draw road outline
        ctx.fillStyle = ROAD_OUTLINE_COLOR;
        this.drawRoadShape(ctx, cx, cy, roadHalf + 1, conns, half);

        // Draw road fill
        ctx.fillStyle = ROAD_COLOR;
        this.drawRoadShape(ctx, cx, cy, roadHalf, conns, half);
      }
    }
  }

  private drawRoadShape(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rh: number,
    conns: Direction[],
    half: number,
  ): void {
    ctx.fillRect(cx - rh, cy - rh, rh * 2, rh * 2);

    for (const dir of conns) {
      switch (dir) {
        case Direction.Up:
          ctx.fillRect(cx - rh, cy - half, rh * 2, half - rh);
          break;
        case Direction.Down:
          ctx.fillRect(cx - rh, cy + rh, rh * 2, half - rh);
          break;
        case Direction.Left:
          ctx.fillRect(cx - half, cy - rh, half - rh, rh * 2);
          break;
        case Direction.Right:
          ctx.fillRect(cx + rh, cy - rh, half - rh, rh * 2);
          break;
      }
    }
  }
}

import { GRID_COLS, GRID_ROWS, TILE_SIZE, BG_COLOR, GRID_LINE_COLOR } from '../../constants';

export class TerrainLayer {
  render(ctx: CanvasRenderingContext2D): void {
    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, GRID_COLS * TILE_SIZE, GRID_ROWS * TILE_SIZE);

    // Grid lines
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= GRID_COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE_SIZE, 0);
      ctx.lineTo(x * TILE_SIZE, GRID_ROWS * TILE_SIZE);
      ctx.stroke();
    }

    for (let y = 0; y <= GRID_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE_SIZE);
      ctx.lineTo(GRID_COLS * TILE_SIZE, y * TILE_SIZE);
      ctx.stroke();
    }
  }
}

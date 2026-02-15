import { GRID_COLS, GRID_ROWS, TILE_SIZE, BG_COLOR, GRID_LINE_COLOR } from '../../constants';

// Generate a tileable sand noise texture once and reuse it
function createSandPatternCanvas(): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // Seed a simple pseudo-random for deterministic noise
  let seed = 42;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; };

  for (let i = 0; i < size * size; i++) {
    // Mix fine grain with occasional larger speckles
    const fine = (rand() - 0.5) * 50;
    const speckle = rand() < 0.12 ? (rand() - 0.5) * 80 : 0;
    const v = Math.round(fine + speckle);
    const idx = i * 4;
    // Warm-tinted noise to match sand
    data[idx] = Math.max(0, Math.min(255, 140 + v));
    data[idx + 1] = Math.max(0, Math.min(255, 125 + v));
    data[idx + 2] = Math.max(0, Math.min(255, 100 + v));
    data[idx + 3] = 120;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

const sandPattern = createSandPatternCanvas();

export class TerrainLayer {
  render(ctx: CanvasRenderingContext2D): void {
    const w = GRID_COLS * TILE_SIZE;
    const h = GRID_ROWS * TILE_SIZE;

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Tile the sand noise pattern across the terrain
    const pat = ctx.createPattern(sandPattern, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
    }

    // Grid lines
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= GRID_COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE_SIZE, 0);
      ctx.lineTo(x * TILE_SIZE, h);
      ctx.stroke();
    }

    for (let y = 0; y <= GRID_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE_SIZE);
      ctx.lineTo(w, y * TILE_SIZE);
      ctx.stroke();
    }
  }
}

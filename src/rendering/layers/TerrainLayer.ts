import type { GridPos } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, BG_COLOR, GRID_LINE_COLOR, LAKE_SHORE_COLOR, LAKE_BED_COLOR } from '../../constants';

// Generate a tileable sand noise texture once and reuse it
function createSandPatternCanvas(): HTMLCanvasElement {
  const size = 32;
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

// Generate a tileable water noise texture
function createWaterPatternCanvas(): HTMLCanvasElement {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  let seed = 77;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; };

  for (let i = 0; i < size * size; i++) {
    const fine = (rand() - 0.5) * 30;
    const idx = i * 4;
    // Blue-tinted noise
    data[idx] = Math.max(0, Math.min(255, 100 + Math.round(fine)));
    data[idx + 1] = Math.max(0, Math.min(255, 170 + Math.round(fine)));
    data[idx + 2] = Math.max(0, Math.min(255, 190 + Math.round(fine)));
    data[idx + 3] = 80;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

const sandPattern = createSandPatternCanvas();
const waterPattern = createWaterPatternCanvas();

export class TerrainLayer {
  render(ctx: CanvasRenderingContext2D, lakeCells?: GridPos[]): void {
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

    // Paint lake cells
    if (lakeCells && lakeCells.length > 0) {
      const lakeSet = new Set(lakeCells.map(p => `${p.gx},${p.gy}`));

      // Shore tint on cells adjacent to lake
      ctx.fillStyle = LAKE_SHORE_COLOR;
      for (const pos of lakeCells) {
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          const nx = pos.gx + dx;
          const ny = pos.gy + dy;
          if (!lakeSet.has(`${nx},${ny}`) && nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
            ctx.fillRect(nx * TILE_SIZE, ny * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }

      // Fill lake cells with lakebed color (water surface is a separate 3D mesh)
      ctx.fillStyle = LAKE_BED_COLOR;
      for (const pos of lakeCells) {
        ctx.fillRect(pos.gx * TILE_SIZE, pos.gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }

      // Water noise overlay
      const waterPat = ctx.createPattern(waterPattern, 'repeat');
      if (waterPat) {
        ctx.fillStyle = waterPat;
        for (const pos of lakeCells) {
          ctx.fillRect(pos.gx * TILE_SIZE, pos.gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Grid lines (skip lake cells for cleaner look)
    const lakeSet = lakeCells ? new Set(lakeCells.map(p => `${p.gx},${p.gy}`)) : new Set<string>();
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

    // Overdraw lake cells without grid lines (paint over the lines)
    if (lakeCells && lakeCells.length > 0) {
      for (const pos of lakeCells) {
        // Check if all 4 cardinal neighbors are also lake cells
        const allLake =
          lakeSet.has(`${pos.gx - 1},${pos.gy}`) &&
          lakeSet.has(`${pos.gx + 1},${pos.gy}`) &&
          lakeSet.has(`${pos.gx},${pos.gy - 1}`) &&
          lakeSet.has(`${pos.gx},${pos.gy + 1}`);
        if (allLake) {
          // Interior lake cell — cover grid lines with lakebed
          ctx.fillStyle = LAKE_BED_COLOR;
          ctx.fillRect(pos.gx * TILE_SIZE, pos.gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          const waterPat = ctx.createPattern(waterPattern, 'repeat');
          if (waterPat) {
            ctx.fillStyle = waterPat;
            ctx.fillRect(pos.gx * TILE_SIZE, pos.gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }
  }
}

import type { GridPos } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, LAKE_SHORE_COLOR, LAKE_BED_COLOR } from '../../constants';
import defaultTerrainUrl from '../../maps/default-terrain.svg';

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
    data[idx] = Math.max(0, Math.min(255, 100 + Math.round(fine)));
    data[idx + 1] = Math.max(0, Math.min(255, 170 + Math.round(fine)));
    data[idx + 2] = Math.max(0, Math.min(255, 190 + Math.round(fine)));
    data[idx + 3] = 80;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

const waterPattern = createWaterPatternCanvas();

export class TerrainLayer {
  private terrainImage: HTMLImageElement | null = null;

  /** Load terrain SVG from a resolved URL (e.g. from a Vite static import). */
  async load(svgUrl?: string): Promise<void> {
    const url = svgUrl || defaultTerrainUrl;

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.terrainImage = img;
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to load terrain SVG: ${url}, using white fallback`);
        this.terrainImage = null;
        resolve(); // resolve anyway so the game continues
      };
      img.src = url;
    });
  }

  render(ctx: CanvasRenderingContext2D, lakeCells?: GridPos[]): void {
    const w = GRID_COLS * TILE_SIZE;
    const h = GRID_ROWS * TILE_SIZE;

    // Background: draw SVG terrain image or white fallback
    if (this.terrainImage) {
      ctx.drawImage(this.terrainImage, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#FFFFFF';
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

      // Fill lake cells with lakebed color
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

      // Overdraw interior lake cells without grid lines
      for (const pos of lakeCells) {
        const allLake =
          lakeSet.has(`${pos.gx - 1},${pos.gy}`) &&
          lakeSet.has(`${pos.gx + 1},${pos.gy}`) &&
          lakeSet.has(`${pos.gx},${pos.gy - 1}`) &&
          lakeSet.has(`${pos.gx},${pos.gy + 1}`);
        if (allLake) {
          ctx.fillStyle = LAKE_BED_COLOR;
          ctx.fillRect(pos.gx * TILE_SIZE, pos.gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          const wp = ctx.createPattern(waterPattern, 'repeat');
          if (wp) {
            ctx.fillStyle = wp;
            ctx.fillRect(pos.gx * TILE_SIZE, pos.gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }
  }
}

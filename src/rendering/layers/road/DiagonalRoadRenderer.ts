import * as THREE from 'three';
import type { Grid } from '../../../core/Grid';
import { CellType, Direction } from '../../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../../../constants';
import { ROAD_HEIGHT, ROAD_WIDTH_RATIO } from './roadConstants';

type DiagAxis = 'NE_SW' | 'NW_SE';

interface Strip {
  cells: { gx: number; gy: number }[];
  axis: DiagAxis;
}

export class DiagonalRoadRenderer {
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  buildAllStrips(
    roadGeoms: THREE.BufferGeometry[],
    outlineGeoms: THREE.BufferGeometry[],
    outlineExtra: number,
  ): void {
    const strips = this.traceStrips();
    const half = TILE_SIZE / 2;
    const roadHalf = TILE_SIZE * ROAD_WIDTH_RATIO / 2;

    for (const strip of strips) {
      this.buildRibbonGeometry(strip, roadGeoms, roadHalf, half, 0);
      this.buildRibbonGeometry(strip, outlineGeoms, roadHalf + outlineExtra, half, -0.01);
    }
  }

  private traceStrips(): Strip[] {
    const strips: Strip[] = [];
    // Track visited edges to avoid duplicates
    const visitedNE = new Set<string>(); // NE-SW axis
    const visitedNW = new Set<string>(); // NW-SE axis

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || cell.type !== CellType.Road) continue;

        // Try NE-SW axis: walk in UpRight direction
        if (cell.roadConnections.includes(Direction.UpRight) && !visitedNE.has(`${gx},${gy}`)) {
          const strip = this.walkAxis(gx, gy, Direction.UpRight, Direction.DownLeft, visitedNE);
          if (strip.length >= 2) {
            strips.push({ cells: strip, axis: 'NE_SW' });
          }
        }

        // Try NW-SE axis: walk in UpLeft direction
        if (cell.roadConnections.includes(Direction.UpLeft) && !visitedNW.has(`${gx},${gy}`)) {
          const strip = this.walkAxis(gx, gy, Direction.UpLeft, Direction.DownRight, visitedNW);
          if (strip.length >= 2) {
            strips.push({ cells: strip, axis: 'NW_SE' });
          }
        }
      }
    }

    return strips;
  }

  private walkAxis(
    startGx: number, startGy: number,
    forwardDir: Direction, backwardDir: Direction,
    visited: Set<string>,
  ): { gx: number; gy: number }[] {
    // Walk backward first to find the start of the strip
    const backCells: { gx: number; gy: number }[] = [];
    let cx = startGx;
    let cy = startGy;

    while (true) {
      const cell = this.grid.getCell(cx, cy);
      if (!cell || cell.type !== CellType.Road) break;
      if (!cell.roadConnections.includes(backwardDir)) break;

      const neighbor = this.grid.getNeighbor(cx, cy, backwardDir);
      if (!neighbor || neighbor.cell.type !== CellType.Road) break;
      if (!neighbor.cell.roadConnections.includes(forwardDir)) break;

      cx = neighbor.gx;
      cy = neighbor.gy;
      backCells.push({ gx: cx, gy: cy });
    }

    // Build strip: reversed back-walk + start + forward-walk
    const strip: { gx: number; gy: number }[] = [];
    for (let i = backCells.length - 1; i >= 0; i--) {
      strip.push(backCells[i]);
    }
    strip.push({ gx: startGx, gy: startGy });

    // Walk forward
    cx = startGx;
    cy = startGy;
    while (true) {
      const cell = this.grid.getCell(cx, cy);
      if (!cell || cell.type !== CellType.Road) break;
      if (!cell.roadConnections.includes(forwardDir)) break;

      const neighbor = this.grid.getNeighbor(cx, cy, forwardDir);
      if (!neighbor || neighbor.cell.type !== CellType.Road) break;
      if (!neighbor.cell.roadConnections.includes(backwardDir)) break;

      cx = neighbor.gx;
      cy = neighbor.gy;
      strip.push({ gx: cx, gy: cy });
    }

    // Mark all cells as visited on this axis
    for (const c of strip) {
      visited.add(`${c.gx},${c.gy}`);
    }

    return strip;
  }

  private buildRibbonGeometry(
    strip: Strip,
    geoms: THREE.BufferGeometry[],
    roadHalf: number,
    half: number,
    yOffset: number,
  ): void {
    const cells = strip.cells;
    if (cells.length < 2) return;

    // Compute cell centers in world coords
    const centers = cells.map(c => ({
      x: c.gx * TILE_SIZE + half,
      z: c.gy * TILE_SIZE + half,
    }));

    // Strip direction vector (normalized)
    const dx = centers[centers.length - 1].x - centers[0].x;
    const dz = centers[centers.length - 1].z - centers[0].z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / len;
    const dirZ = dz / len;

    // Perpendicular direction (rotate 90 degrees)
    const perpX = -dirZ;
    const perpZ = dirX;

    // Extend ribbon beyond first/last cell centers by roadHalf
    const firstCenter = centers[0];
    const lastCenter = centers[centers.length - 1];
    const extStart = {
      x: firstCenter.x - dirX * roadHalf,
      z: firstCenter.z - dirZ * roadHalf,
    };
    const extEnd = {
      x: lastCenter.x + dirX * roadHalf,
      z: lastCenter.z + dirZ * roadHalf,
    };

    // Build shape as a rectangle along the strip axis
    // Shape is in XY plane: x = along perpendicular, y = along strip direction (mapped from world z via -z)
    // We'll use a simpler approach: build the shape in world XZ, then extrude
    const shape = new THREE.Shape();

    // Left edge of ribbon (perpendicular offset -roadHalf)
    const p1x = extStart.x + perpX * roadHalf;
    const p1z = extStart.z + perpZ * roadHalf;
    // Right edge at start
    const p2x = extStart.x - perpX * roadHalf;
    const p2z = extStart.z - perpZ * roadHalf;
    // Right edge at end
    const p3x = extEnd.x - perpX * roadHalf;
    const p3z = extEnd.z - perpZ * roadHalf;
    // Left edge at end
    const p4x = extEnd.x + perpX * roadHalf;
    const p4z = extEnd.z + perpZ * roadHalf;

    // Shape in XY plane (x stays x, y = -z for consistency with ExtrudeGeometry)
    shape.moveTo(p1x, -p1z);
    shape.lineTo(p2x, -p2z);
    shape.lineTo(p3x, -p3z);
    shape.lineTo(p4x, -p4z);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: ROAD_HEIGHT,
      bevelEnabled: false,
    });

    // Rotate -90° around X so XY→XZ, Z→Y (height)
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, yOffset, 0);
    geoms.push(geom);
  }
}

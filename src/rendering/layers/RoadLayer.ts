import type { Grid } from '../../core/Grid';
import { CellType, Direction } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, ROAD_COLOR, ROAD_OUTLINE_COLOR, ROAD_LANE_DIVIDER_COLOR, ROAD_CORNER_RADIUS } from '../../constants';

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
        this.buildRoadPath(ctx, cx, cy, roadHalf + 1, conns, half, ROAD_CORNER_RADIUS + 1);
        ctx.fill();

        // Draw road fill
        ctx.fillStyle = ROAD_COLOR;
        this.buildRoadPath(ctx, cx, cy, roadHalf, conns, half, ROAD_CORNER_RADIUS);
        ctx.fill();
      }
    }

    // Lane divider pass
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = ROAD_LANE_DIVIDER_COLOR;
    ctx.lineWidth = 1;

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || cell.type !== CellType.Road) continue;

        const px = gx * TILE_SIZE;
        const py = gy * TILE_SIZE;
        const cx = px + half;
        const cy = py + half;
        const conns = cell.roadConnections;

        this.drawLaneDivider(ctx, cx, cy, roadHalf, conns, half);
      }
    }

    ctx.setLineDash([]);
  }

  private drawLaneDivider(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    roadHalf: number,
    conns: Direction[],
    half: number,
  ): void {
    const hasUp = conns.includes(Direction.Up);
    const hasDown = conns.includes(Direction.Down);
    const hasLeft = conns.includes(Direction.Left);
    const hasRight = conns.includes(Direction.Right);
    const hasVertical = hasUp || hasDown;
    const hasHorizontal = hasLeft || hasRight;

    // Check for L-turn: exactly 2 perpendicular connections
    const isLTurn = conns.length === 2 && hasVertical && hasHorizontal;

    if (isLTurn) {
      // Draw quarter-circle arc for L-turn
      const arcRadius = half;
      ctx.beginPath();

      if (hasUp && hasRight) {
        // Arc center at top-right corner of tile
        ctx.arc(cx + half, cy - half, arcRadius, Math.PI, Math.PI / 2, true);
      } else if (hasUp && hasLeft) {
        // Arc center at top-left corner of tile
        ctx.arc(cx - half, cy - half, arcRadius, 0, Math.PI / 2, false);
      } else if (hasDown && hasRight) {
        // Arc center at bottom-right corner of tile
        ctx.arc(cx + half, cy + half, arcRadius, Math.PI, 3 * Math.PI / 2, false);
      } else if (hasDown && hasLeft) {
        // Arc center at bottom-left corner of tile
        ctx.arc(cx - half, cy + half, arcRadius, 0, -Math.PI / 2, true);
      }

      ctx.stroke();
    } else {
      // Straight-line dividers for non-L-turn tiles
      if (hasVertical) {
        const top = hasUp ? cy - half : cy - roadHalf;
        const bottom = hasDown ? cy + half : cy + roadHalf;
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, bottom);
        ctx.stroke();
      }

      if (hasHorizontal) {
        const left = hasLeft ? cx - half : cx - roadHalf;
        const right = hasRight ? cx + half : cx + roadHalf;
        ctx.beginPath();
        ctx.moveTo(left, cy);
        ctx.lineTo(right, cy);
        ctx.stroke();
      }
    }
  }

  private buildRoadPath(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rh: number,
    conns: Direction[],
    half: number,
    radius: number,
  ): void {
    const hasUp = conns.includes(Direction.Up);
    const hasDown = conns.includes(Direction.Down);
    const hasLeft = conns.includes(Direction.Left);
    const hasRight = conns.includes(Direction.Right);

    // A corner is convex (should be rounded) when neither adjacent arm is present
    const roundTL = !hasUp && !hasLeft;
    const roundTR = !hasUp && !hasRight;
    const roundBR = !hasDown && !hasRight;
    const roundBL = !hasDown && !hasLeft;

    // Build vertices clockwise around the road shape
    // Each vertex: [x, y, isConvex]
    type Vertex = [number, number, boolean];
    const verts: Vertex[] = [];

    // Top-left region
    if (hasLeft) {
      // Left arm extends: top-left goes to tile edge
      verts.push([cx - half, cy - rh, false]);
    }
    // Top-left corner of center square
    verts.push([cx - rh, cy - rh, roundTL]);

    // Top edge
    if (hasUp) {
      verts.push([cx - rh, cy - half, false]);
      verts.push([cx + rh, cy - half, false]);
    }

    // Top-right corner of center square
    verts.push([cx + rh, cy - rh, roundTR]);

    // Top-right region
    if (hasRight) {
      verts.push([cx + half, cy - rh, false]);
    }

    // Right edge
    if (hasRight) {
      verts.push([cx + half, cy + rh, false]);
    }

    // Bottom-right corner of center square
    verts.push([cx + rh, cy + rh, roundBR]);

    // Bottom edge
    if (hasDown) {
      verts.push([cx + rh, cy + half, false]);
      verts.push([cx - rh, cy + half, false]);
    }

    // Bottom-left corner of center square
    verts.push([cx - rh, cy + rh, roundBL]);

    // Left edge
    if (hasLeft) {
      verts.push([cx - half, cy + rh, false]);
    }

    // Rotate list so it starts with a non-convex vertex for clean arcTo usage
    let startIdx = 0;
    for (let i = 0; i < verts.length; i++) {
      if (!verts[i][2]) {
        startIdx = i;
        break;
      }
    }
    const rotated: Vertex[] = [];
    for (let i = 0; i < verts.length; i++) {
      rotated.push(verts[(startIdx + i) % verts.length]);
    }

    // Clamp radius to avoid overshooting on short edges
    const r = Math.min(radius, rh);

    ctx.beginPath();
    ctx.moveTo(rotated[0][0], rotated[0][1]);

    for (let i = 1; i < rotated.length; i++) {
      const [vx, vy, convex] = rotated[i];
      if (convex) {
        // Next vertex after this convex one (wrapping)
        const [nx, ny] = rotated[(i + 1) % rotated.length];
        ctx.arcTo(vx, vy, nx, ny, r);
      } else {
        ctx.lineTo(vx, vy);
      }
    }

    ctx.closePath();
  }
}

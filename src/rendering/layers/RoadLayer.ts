import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Grid } from '../../core/Grid';
import { CellType, Direction } from '../../types';
import {
  GRID_COLS, GRID_ROWS, TILE_SIZE, ROAD_COLOR, ROAD_OUTLINE_COLOR,
} from '../../constants';

const ROAD_HEIGHT = 0.4;
const ROAD_WIDTH_RATIO = 0.6;
const ROAD_CORNER_RADIUS = 5;    // outer (convex) corners
const ROAD_INNER_RADIUS = 1.8;   // inner (concave) fillets at T/cross junctions

export class RoadLayer {
  private grid: Grid;
  private roadMesh: THREE.Mesh | null = null;
  private outlineMesh: THREE.Mesh | null = null;

  private roadMat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR });
  private outlineMat = new THREE.MeshStandardMaterial({ color: ROAD_OUTLINE_COLOR });

  constructor(grid: Grid) {
    this.grid = grid;
  }

  private isRoadOrConnector(cell: { type: CellType }): boolean {
    return cell.type === CellType.Road;
  }

  update(scene: THREE.Scene): void {
    // Remove old meshes
    this.clearFromScene(scene);

    const half = TILE_SIZE / 2;
    const roadHalf = TILE_SIZE * ROAD_WIDTH_RATIO / 2;
    const outlineExtra = 1;

    const roadGeoms: THREE.BufferGeometry[] = [];
    const outlineGeoms: THREE.BufferGeometry[] = [];

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || !this.isRoadOrConnector(cell)) continue;

        const cx = gx * TILE_SIZE + half;
        const cz = gy * TILE_SIZE + half;

        const conns = cell.roadConnections;

        // Road fill geometry
        this.buildRoundedCellShape(roadGeoms, cx, cz, roadHalf, conns, half, ROAD_HEIGHT, 0);
        // Outline geometry (slightly larger, slightly lower)
        this.buildRoundedCellShape(outlineGeoms, cx, cz, roadHalf + outlineExtra, conns, half, ROAD_HEIGHT, -0.01);
      }
    }

    // Diagonal segments
    this.buildDiagonalSegments(roadGeoms, outlineGeoms, outlineExtra);

    // Create merged meshes
    if (outlineGeoms.length > 0) {
      const merged = mergeGeometries(outlineGeoms, false);
      if (merged) {
        this.outlineMesh = new THREE.Mesh(merged, this.outlineMat);
        this.outlineMesh.castShadow = true;
        this.outlineMesh.receiveShadow = true;
        scene.add(this.outlineMesh);
      }
    }

    if (roadGeoms.length > 0) {
      const merged = mergeGeometries(roadGeoms, false);
      if (merged) {
        this.roadMesh = new THREE.Mesh(merged, this.roadMat);
        this.roadMesh.castShadow = true;
        this.roadMesh.receiveShadow = true;
        scene.add(this.roadMesh);
      }
    }

    // Dispose temp geometries
    for (const g of roadGeoms) g.dispose();
    for (const g of outlineGeoms) g.dispose();
  }

  private buildOutlinePoints(
    conns: Direction[], rh: number, half: number,
  ): { x: number; z: number; round: 'none' | 'convex' | 'concave' }[] {
    // Cardinal-only outline (original logic)
    const up = conns.includes(Direction.Up);
    const right = conns.includes(Direction.Right);
    const down = conns.includes(Direction.Down);
    const left = conns.includes(Direction.Left);

    const pts: { x: number; z: number; round: 'none' | 'convex' | 'concave' }[] = [];

    // NW corner
    if (left && up) pts.push({ x: -rh, z: -rh, round: 'concave' });
    else if (!left && !up) pts.push({ x: -rh, z: -rh, round: 'convex' });

    // Up arm
    if (up) {
      pts.push({ x: -rh, z: -half, round: 'none' });
      pts.push({ x: rh, z: -half, round: 'none' });
    }

    // NE corner
    if (up && right) pts.push({ x: rh, z: -rh, round: 'concave' });
    else if (!up && !right) pts.push({ x: rh, z: -rh, round: 'convex' });

    // Right arm
    if (right) {
      pts.push({ x: half, z: -rh, round: 'none' });
      pts.push({ x: half, z: rh, round: 'none' });
    }

    // SE corner
    if (right && down) pts.push({ x: rh, z: rh, round: 'concave' });
    else if (!right && !down) pts.push({ x: rh, z: rh, round: 'convex' });

    // Down arm
    if (down) {
      pts.push({ x: rh, z: half, round: 'none' });
      pts.push({ x: -rh, z: half, round: 'none' });
    }

    // SW corner
    if (down && left) pts.push({ x: -rh, z: rh, round: 'concave' });
    else if (!down && !left) pts.push({ x: -rh, z: rh, round: 'convex' });

    // Left arm
    if (left) {
      pts.push({ x: -half, z: rh, round: 'none' });
      pts.push({ x: -half, z: -rh, round: 'none' });
    }

    return pts;
  }

  private buildRoundedCellShape(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    rh: number, conns: Direction[], half: number,
    height: number, yOffset: number,
  ): void {
    // Build cardinal body shape
    const cardinalConns = conns.filter(d => d === Direction.Up || d === Direction.Down || d === Direction.Left || d === Direction.Right);
    const pts = this.buildOutlinePoints(cardinalConns, rh, half);
    if (pts.length < 3) return;

    const armLen = half - rh;
    const Rconvex = Math.min(ROAD_CORNER_RADIUS, rh * 0.9);
    const Rconcave = Math.min(ROAD_INNER_RADIUS, armLen * 0.45);
    const shape = new THREE.Shape();
    const n = pts.length;

    const radiusFor = (type: 'convex' | 'concave') =>
      type === 'convex' ? Rconvex : Rconcave;

    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      // Shape coords: sx = world x, sy = -world z
      const psx = pt.x;
      const psy = -pt.z;

      if (pt.round === 'none') {
        if (i === 0) shape.moveTo(psx, psy);
        else shape.lineTo(psx, psy);
        continue;
      }

      // Rounded corner: replace sharp vertex with quadratic curve
      const R = radiusFor(pt.round);
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];

      // Direction vectors from corner toward adjacent vertices
      const toPrevX = prev.x - pt.x;
      const toPrevZ = prev.z - pt.z;
      const toPrevLen = Math.sqrt(toPrevX * toPrevX + toPrevZ * toPrevZ);

      const toNextX = next.x - pt.x;
      const toNextZ = next.z - pt.z;
      const toNextLen = Math.sqrt(toNextX * toNextX + toNextZ * toNextZ);

      // Tangent points: R distance from corner along each edge
      const t1x = pt.x + (toPrevX / toPrevLen) * R;
      const t1z = pt.z + (toPrevZ / toPrevLen) * R;
      const t2x = pt.x + (toNextX / toNextLen) * R;
      const t2z = pt.z + (toNextZ / toNextLen) * R;

      if (i === 0) shape.moveTo(t1x, -t1z);
      else shape.lineTo(t1x, -t1z);

      shape.quadraticCurveTo(psx, psy, t2x, -t2z);
    }

    // Close: if first point was rounded, line back to its t1
    if (pts[0].round !== 'none') {
      const R = radiusFor(pts[0].round);
      const prev = pts[n - 1];
      const first = pts[0];
      const toPrevX = prev.x - first.x;
      const toPrevZ = prev.z - first.z;
      const toPrevLen = Math.sqrt(toPrevX * toPrevX + toPrevZ * toPrevZ);
      shape.lineTo(
        first.x + (toPrevX / toPrevLen) * R,
        -(first.z + (toPrevZ / toPrevLen) * R),
      );
    }

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 6,
    });

    // Shape is in XY plane, extruded along Z.
    // Rotate -90° around X so: XY→XZ (road surface), Z→Y (height)
    geom.rotateX(-Math.PI / 2);
    geom.translate(cx, yOffset, cz);
    geoms.push(geom);
  }

  private buildDiagonalSegments(
    roadGeoms: THREE.BufferGeometry[],
    outlineGeoms: THREE.BufferGeometry[],
    outlineExtra: number,
  ): void {
    const half = TILE_SIZE / 2;
    const diagLength = TILE_SIZE * Math.SQRT2;
    const roadWidth = TILE_SIZE * ROAD_WIDTH_RATIO;
    const outlineWidth = roadWidth + outlineExtra * 2;
    const diagonalDirs = [Direction.UpRight, Direction.DownRight, Direction.DownLeft, Direction.UpLeft];
    const dirAngles: Record<number, number> = {
      [Direction.UpRight]: -Math.PI / 4,
      [Direction.DownRight]: Math.PI / 4,
      [Direction.DownLeft]: -Math.PI / 4,
      [Direction.UpLeft]: Math.PI / 4,
    };

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || !this.isRoadOrConnector(cell)) continue;

        for (const dir of diagonalDirs) {
          if (!cell.roadConnections.includes(dir)) continue;

          const neighbor = this.grid.getNeighbor(gx, gy, dir);
          if (!neighbor || !this.isRoadOrConnector(neighbor.cell)) continue;

          const oppDir = ({
            [Direction.UpRight]: Direction.DownLeft,
            [Direction.DownRight]: Direction.UpLeft,
            [Direction.DownLeft]: Direction.UpRight,
            [Direction.UpLeft]: Direction.DownRight,
          } as Record<number, Direction>)[dir];

          if (!neighbor.cell.roadConnections.includes(oppDir)) continue;

          // Only render once: when current cell is "lower" (gx < ngx, or gx == ngx && gy < ngy)
          const ngx = neighbor.gx;
          const ngy = neighbor.gy;
          if (gx > ngx || (gx === ngx && gy > ngy)) continue;

          const cx = (gx * TILE_SIZE + half + ngx * TILE_SIZE + half) / 2;
          const cz = (gy * TILE_SIZE + half + ngy * TILE_SIZE + half) / 2;
          const angle = dirAngles[dir];

          // Road segment
          const roadGeom = new THREE.BoxGeometry(diagLength, ROAD_HEIGHT, roadWidth);
          roadGeom.rotateY(angle);
          roadGeom.translate(cx, ROAD_HEIGHT / 2, cz);
          roadGeoms.push(roadGeom.toNonIndexed());
          roadGeom.dispose();

          // Outline segment
          const outGeom = new THREE.BoxGeometry(diagLength, ROAD_HEIGHT, outlineWidth);
          outGeom.rotateY(angle);
          outGeom.translate(cx, -0.01 + ROAD_HEIGHT / 2, cz);
          outlineGeoms.push(outGeom.toNonIndexed());
          outGeom.dispose();
        }
      }
    }
  }

  private clearFromScene(scene: THREE.Scene): void {
    if (this.roadMesh) {
      scene.remove(this.roadMesh);
      this.roadMesh.geometry.dispose();
      this.roadMesh = null;
    }
    if (this.outlineMesh) {
      scene.remove(this.outlineMesh);
      this.outlineMesh.geometry.dispose();
      this.outlineMesh = null;
    }
  }

  dispose(scene: THREE.Scene): void {
    this.clearFromScene(scene);
    this.roadMat.dispose();
    this.outlineMat.dispose();
  }
}

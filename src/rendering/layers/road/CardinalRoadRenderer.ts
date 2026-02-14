import * as THREE from 'three';
import { Direction } from '../../../types';
import { TILE_SIZE } from '../../../constants';
import { ROAD_HEIGHT, ROAD_WIDTH_RATIO, ROAD_CORNER_RADIUS, ROAD_INNER_RADIUS } from './roadConstants';

export class CardinalRoadRenderer {
  private buildOutlinePoints(
    conns: Direction[], rh: number, half: number,
  ): { x: number; z: number; round: 'none' | 'convex' | 'concave' }[] {
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

  buildCellGeometries(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    connections: Direction[],
  ): void {
    const half = TILE_SIZE / 2;
    const roadHalf = TILE_SIZE * ROAD_WIDTH_RATIO / 2;

    // Road fill
    this.buildRoundedCellShape(geoms, cx, cz, roadHalf, connections, half, ROAD_HEIGHT, 0);
  }

  buildCellOutlineGeometries(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    connections: Direction[],
    outlineExtra: number,
  ): void {
    const half = TILE_SIZE / 2;
    const roadHalf = TILE_SIZE * ROAD_WIDTH_RATIO / 2;

    // Outline (slightly larger, slightly lower)
    this.buildRoundedCellShape(geoms, cx, cz, roadHalf + outlineExtra, connections, half, ROAD_HEIGHT, -0.01);
  }

  private buildRoundedCellShape(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    rh: number, conns: Direction[], half: number,
    height: number, yOffset: number,
  ): void {
    const cardinalConns = conns.filter(
      d => d === Direction.Up || d === Direction.Down || d === Direction.Left || d === Direction.Right,
    );
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
      const psx = pt.x;
      const psy = -pt.z;

      if (pt.round === 'none') {
        if (i === 0) shape.moveTo(psx, psy);
        else shape.lineTo(psx, psy);
        continue;
      }

      const R = radiusFor(pt.round);
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];

      const toPrevX = prev.x - pt.x;
      const toPrevZ = prev.z - pt.z;
      const toPrevLen = Math.sqrt(toPrevX * toPrevX + toPrevZ * toPrevZ);

      const toNextX = next.x - pt.x;
      const toNextZ = next.z - pt.z;
      const toNextLen = Math.sqrt(toNextX * toNextX + toNextZ * toNextZ);

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

    geom.rotateX(-Math.PI / 2);
    geom.translate(cx, yOffset, cz);
    geoms.push(geom);
  }
}

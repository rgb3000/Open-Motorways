import * as THREE from 'three';
import { Direction } from '../../../types';
import { TILE_SIZE } from '../../../constants';
import { ROAD_HEIGHT, ROAD_WIDTH_RATIO, ROAD_CORNER_RADIUS, ROAD_INNER_RADIUS } from './roadConstants';

interface CornerDef {
  sx: number;
  sz: number;
  diagonal: Direction;
  adj1: Direction;
  adj2: Direction;
}

const CORNERS: CornerDef[] = [
  { sx: -1, sz: -1, diagonal: Direction.UpLeft,    adj1: Direction.Left, adj2: Direction.Up },
  { sx:  1, sz: -1, diagonal: Direction.UpRight,   adj1: Direction.Up,   adj2: Direction.Right },
  { sx:  1, sz:  1, diagonal: Direction.DownRight,  adj1: Direction.Right, adj2: Direction.Down },
  { sx: -1, sz:  1, diagonal: Direction.DownLeft,   adj1: Direction.Down, adj2: Direction.Left },
];

export class JunctionConnectorRenderer {
  buildCellGeometries(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    connections: Direction[],
  ): void {
    this.buildConnectors(geoms, cx, cz, connections, 0, ROAD_HEIGHT, 0);
  }

  buildCellOutlineGeometries(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    connections: Direction[],
    outlineExtra: number,
  ): void {
    this.buildConnectors(geoms, cx, cz, connections, outlineExtra, ROAD_HEIGHT, -0.01);
  }

  private buildConnectors(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    connections: Direction[],
    extra: number,
    height: number,
    yOffset: number,
  ): void {
    const rh = TILE_SIZE * ROAD_WIDTH_RATIO / 2 + extra;
    const armLen = TILE_SIZE / 2 - rh;
    const Rconvex = Math.min(ROAD_CORNER_RADIUS, rh * 0.9);
    const Rconcave = Math.min(ROAD_INNER_RADIUS, armLen * 0.45);

    for (const corner of CORNERS) {
      if (!connections.includes(corner.diagonal)) continue;

      const hasAdj1 = connections.includes(corner.adj1);
      const hasAdj2 = connections.includes(corner.adj2);

      // One-arm case: straight edge, no gap
      if (hasAdj1 !== hasAdj2) continue;

      const R = (hasAdj1 && hasAdj2) ? Rconcave : Rconvex;

      // Corner point
      const cornerX = corner.sx * rh;
      const cornerZ = corner.sz * rh;

      // Tangent points: concave corners offset outward (toward arms),
      // convex corners offset inward (toward center)
      const isConcave = hasAdj1 && hasAdj2;
      const sign = isConcave ? 1 : -1;

      const t1x = cornerX + sign * corner.sx * R;
      const t1z = cornerZ;
      const t2x = cornerX;
      const t2z = cornerZ + sign * corner.sz * R;

      // Build triangle shape in XY plane (y = -z)
      const shape = new THREE.Shape();
      shape.moveTo(cornerX, -cornerZ);
      shape.lineTo(t1x, -t1z);
      shape.lineTo(t2x, -t2z);
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
      });

      geom.rotateX(-Math.PI / 2);
      geom.translate(cx, yOffset, cz);
      geoms.push(geom);
    }
  }
}

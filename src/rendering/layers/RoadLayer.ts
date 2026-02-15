import * as THREE from 'three';
import type { Grid } from '../../core/Grid';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { CellType, Direction } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../../constants';
import { cubicBezier, lerp } from '../../utils/math';

const DIRECTION_OFFSETS: Record<Direction, { dx: number; dy: number }> = {
  [Direction.Up]: { dx: 0, dy: -1 },
  [Direction.Down]: { dx: 0, dy: 1 },
  [Direction.Left]: { dx: -1, dy: 0 },
  [Direction.Right]: { dx: 1, dy: 0 },
  [Direction.UpLeft]: { dx: -1, dy: -1 },
  [Direction.UpRight]: { dx: 1, dy: -1 },
  [Direction.DownLeft]: { dx: -1, dy: 1 },
  [Direction.DownRight]: { dx: 1, dy: 1 },
};

const CIRCLE_RADIUS = 3;
const CIRCLE_SEGMENTS = 16;
const LINE_Y = 0.5;

export class RoadLayer {
  private grid: Grid;
  private getHouses: () => House[];
  private getBusinesses: () => Business[];
  private group: THREE.Group | null = null;

  private lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
  private connectorLineMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
  private pathLineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 });
  private laneLineMat = new THREE.LineBasicMaterial({ color: 0x0088ff, linewidth: 2 });
  private edgeLineMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 2 });
  private circleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private connectorCircleMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  private circleGeom = new THREE.CircleGeometry(CIRCLE_RADIUS, CIRCLE_SEGMENTS);

  constructor(grid: Grid, getHouses: () => House[], getBusinesses: () => Business[]) {
    this.grid = grid;
    this.getHouses = getHouses;
    this.getBusinesses = getBusinesses;
  }

  update(scene: THREE.Scene): void {
    this.clearFromScene(scene);

    const group = new THREE.Group();
    const half = TILE_SIZE / 2;

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || (cell.type !== CellType.Road && cell.type !== CellType.Connector)) continue;

        const cx = gx * TILE_SIZE + half;
        const cz = gy * TILE_SIZE + half;

        // Circle at cell center
        const circle = new THREE.Mesh(this.circleGeom, this.circleMat);
        circle.rotation.x = -Math.PI / 2;
        circle.position.set(cx, LINE_Y, cz);
        group.add(circle);

        // Lines to connected neighbors (only draw if neighbor index > current to avoid duplicates)
        const currentIdx = gy * GRID_COLS + gx;
        for (const dir of cell.roadConnections) {
          const off = DIRECTION_OFFSETS[dir];
          const nx = gx + off.dx;
          const ny = gy + off.dy;
          const neighborIdx = ny * GRID_COLS + nx;
          if (neighborIdx <= currentIdx) continue;

          const ncx = nx * TILE_SIZE + half;
          const ncz = ny * TILE_SIZE + half;

          const points = [
            new THREE.Vector3(cx, LINE_Y, cz),
            new THREE.Vector3(ncx, LINE_Y, ncz),
          ];
          const geom = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geom, this.lineMat);
          group.add(line);
        }
      }
    }

    // Connector lines: house connector → house center
    for (const house of this.getHouses()) {
      const hcx = house.pos.gx * TILE_SIZE + half;
      const hcz = house.pos.gy * TILE_SIZE + half;
      const ccx = house.connectorPos.gx * TILE_SIZE + half;
      const ccz = house.connectorPos.gy * TILE_SIZE + half;
      const points = [
        new THREE.Vector3(ccx, LINE_Y, ccz),
        new THREE.Vector3(hcx, LINE_Y, hcz),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geom, this.connectorLineMat));

      const hCircle1 = new THREE.Mesh(this.circleGeom, this.connectorCircleMat);
      hCircle1.rotation.x = -Math.PI / 2;
      hCircle1.position.set(hcx, 10, hcz);
      group.add(hCircle1);

      const hCircle2 = new THREE.Mesh(this.circleGeom, this.connectorCircleMat);
      hCircle2.rotation.x = -Math.PI / 2;
      hCircle2.position.set(ccx, LINE_Y, ccz);
      group.add(hCircle2);
    }

    // Connector lines: business connector → parking lot center
    for (const biz of this.getBusinesses()) {
      const pcx = biz.parkingLotPos.gx * TILE_SIZE + half;
      const pcz = biz.parkingLotPos.gy * TILE_SIZE + half;
      const ccx = biz.connectorPos.gx * TILE_SIZE + half;
      const ccz = biz.connectorPos.gy * TILE_SIZE + half;
      const points = [
        new THREE.Vector3(ccx, LINE_Y, ccz),
        new THREE.Vector3(pcx, LINE_Y, pcz),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geom, this.connectorLineMat));

      const bCircle1 = new THREE.Mesh(this.circleGeom, this.connectorCircleMat);
      bCircle1.rotation.x = -Math.PI / 2;
      bCircle1.position.set(pcx, LINE_Y, pcz);
      group.add(bCircle1);

      const bCircle2 = new THREE.Mesh(this.circleGeom, this.connectorCircleMat);
      bCircle2.rotation.x = -Math.PI / 2;
      bCircle2.position.set(ccx, LINE_Y, ccz);
      group.add(bCircle2);
    }

    // Green bezier-smoothed lines on top of white lines
    const GREEN_Y = LINE_Y + 0.1;
    const BEZIER_SAMPLES = 8;
    const SMOOTH_T = 0.75;

    // Build adjacency with direction info
    const cellKey = (gx: number, gy: number) => gy * GRID_COLS + gx;
    const adjacency = new Map<number, Array<{ neighbor: number; dir: Direction }>>();

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || (cell.type !== CellType.Road && cell.type !== CellType.Connector)) continue;
        if (cell.roadConnections.length === 0) continue;

        const key = cellKey(gx, gy);
        const neighbors: Array<{ neighbor: number; dir: Direction }> = [];
        for (const dir of cell.roadConnections) {
          const off = DIRECTION_OFFSETS[dir];
          neighbors.push({ neighbor: cellKey(gx + off.dx, gy + off.dy), dir });
        }
        adjacency.set(key, neighbors);
      }
    }

    // Opposite direction lookup for routing chains through intersections
    const oppositeDir: Record<Direction, Direction> = {
      [Direction.Up]: Direction.Down,
      [Direction.Down]: Direction.Up,
      [Direction.Left]: Direction.Right,
      [Direction.Right]: Direction.Left,
      [Direction.UpLeft]: Direction.DownRight,
      [Direction.DownRight]: Direction.UpLeft,
      [Direction.UpRight]: Direction.DownLeft,
      [Direction.DownLeft]: Direction.UpRight,
    };

    // Trace chains, routing through intersections when opposite directions pair up
    const visited = new Set<string>(); // edge keys "a-b"
    const edgeKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;
    // Track which through-pairs at intersections have been used
    const usedThroughPairs = new Set<string>(); // "nodeKey-dir"

    const chains: number[][] = [];
    const startNodes: number[] = [];

    for (const [node, neighbors] of adjacency) {
      if (neighbors.length !== 2) {
        startNodes.push(node);
      }
    }

    // Given prev and curr node keys, determine the direction from prev to curr
    const getDirection = (prevKey: number, currKey: number): Direction | null => {
      const prevNeighbors = adjacency.get(prevKey);
      if (!prevNeighbors) return null;
      const entry = prevNeighbors.find(e => e.neighbor === currKey);
      return entry ? entry.dir : null;
    };

    // Try to continue a chain through an intersection node
    const tryPassThrough = (prevKey: number, currKey: number): number | null => {
      const incomingDir = getDirection(prevKey, currKey);
      if (incomingDir === null) return null;

      // The "through" direction is the opposite of incoming
      const throughDir = oppositeDir[incomingDir];
      const currNeighbors = adjacency.get(currKey);
      if (!currNeighbors) return null;

      const throughEntry = currNeighbors.find(e => e.dir === throughDir);
      if (!throughEntry) return null;

      // Check if this through-pair hasn't been used yet
      const pairKeyIn = `${currKey}-${incomingDir}`;
      const pairKeyOut = `${currKey}-${throughDir}`;
      if (usedThroughPairs.has(pairKeyIn) || usedThroughPairs.has(pairKeyOut)) return null;

      // Mark both directions as used at this intersection
      usedThroughPairs.add(pairKeyIn);
      usedThroughPairs.add(pairKeyOut);

      return throughEntry.neighbor;
    };

    // Walk a chain from start→next, continuing through intersections when possible
    const walkChain = (start: number, next: number): number[] | null => {
      const ek = edgeKey(start, next);
      if (visited.has(ek)) return null;
      visited.add(ek);

      const chain = [start, next];
      let prev = start;
      let curr = next;

      while (true) {
        const currNeighbors = adjacency.get(curr);
        if (!currNeighbors) break;

        if (currNeighbors.length === 2) {
          // Simple degree-2 node: continue normally
          const nextEntry = currNeighbors[0].neighbor === prev ? currNeighbors[1] : currNeighbors[0];
          const ek2 = edgeKey(curr, nextEntry.neighbor);
          if (visited.has(ek2)) break;
          visited.add(ek2);

          chain.push(nextEntry.neighbor);
          prev = curr;
          curr = nextEntry.neighbor;
        } else {
          // Intersection or endpoint: try to pass through
          const throughNode = tryPassThrough(prev, curr);
          if (throughNode === null) break;

          const ek2 = edgeKey(curr, throughNode);
          if (visited.has(ek2)) break;
          visited.add(ek2);

          chain.push(throughNode);
          prev = curr;
          curr = throughNode;
        }
      }

      return chain;
    };

    // Walk chains from each start node
    for (const start of startNodes) {
      const neighbors = adjacency.get(start)!;
      for (const entry of neighbors) {
        const chain = walkChain(start, entry.neighbor);
        if (chain) chains.push(chain);
      }
    }

    // Also handle pure loops (all degree-2, no start nodes found them)
    for (const [node, neighbors] of adjacency) {
      if (neighbors.length !== 2) continue;
      const chain = walkChain(node, neighbors[0].neighbor);
      if (chain) chains.push(chain);
    }

    // Convert chains to pixel coords and draw with bezier smoothing
    for (const chain of chains) {
      // Detect closed loops (first node == last node)
      const isLoop = chain.length > 2 && chain[0] === chain[chain.length - 1];
      if (isLoop) chain.pop(); // Remove duplicate end node

      const pixels = chain.map((key) => {
        const gx = key % GRID_COLS;
        const gy = Math.floor(key / GRID_COLS);
        return { x: gx * TILE_SIZE + half, y: gy * TILE_SIZE + half };
      });

      const points: THREE.Vector3[] = [];
      const len = pixels.length;

      for (let i = 0; i < len; i++) {
        const curr = pixels[i];

        // For non-loops, endpoints get no smoothing
        if (!isLoop && (i === 0 || i === len - 1)) {
          points.push(new THREE.Vector3(curr.x, GREEN_Y, curr.y));
          continue;
        }

        // Use modular indexing for loops, normal indexing for open chains
        const prev = isLoop ? pixels[(i - 1 + len) % len] : pixels[i - 1];
        const next = isLoop ? pixels[(i + 1) % len] : pixels[i + 1];

        const dxIn = curr.x - prev.x;
        const dyIn = curr.y - prev.y;
        const dxOut = next.x - curr.x;
        const dyOut = next.y - curr.y;

        const sameDirection =
          Math.sign(dxIn) === Math.sign(dxOut) &&
          Math.sign(dyIn) === Math.sign(dyOut) &&
          Math.abs(dxIn) > 0 === (Math.abs(dxOut) > 0) &&
          Math.abs(dyIn) > 0 === (Math.abs(dyOut) > 0);

        if (sameDirection) {
          points.push(new THREE.Vector3(curr.x, GREEN_Y, curr.y));
        } else {
          const pInX = lerp(prev.x, curr.x, 1 - SMOOTH_T);
          const pInY = lerp(prev.y, curr.y, 1 - SMOOTH_T);
          const pOutX = lerp(curr.x, next.x, SMOOTH_T);
          const pOutY = lerp(curr.y, next.y, SMOOTH_T);

          if (points.length > 0) {
            const last = points[points.length - 1];
            last.set(pInX, GREEN_Y, pInY);
          }

          for (let s = 1; s <= BEZIER_SAMPLES; s++) {
            const t = s / BEZIER_SAMPLES;
            const b = cubicBezier(
              pInX, pInY, curr.x, curr.y,
              curr.x, curr.y, pOutX, pOutY, t,
            );
            points.push(new THREE.Vector3(b.x, GREEN_Y, b.y));
          }
        }
      }

      // Close the loop by appending a copy of the first point
      if (isLoop && points.length > 0) {
        points.push(points[0].clone());
      }

      if (points.length >= 2) {
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        group.add(new THREE.Line(geom, this.pathLineMat));

        // Compute offset lane lines
        const LANE_OFFSET = 2.5;
        const LANE_Y = GREEN_Y + 0.1;
        const leftPoints: THREE.Vector3[] = [];
        const rightPoints: THREE.Vector3[] = [];

        for (let i = 0; i < points.length; i++) {
          let tx: number, tz: number;
          if (i === 0) {
            tx = points[1].x - points[0].x;
            tz = points[1].z - points[0].z;
          } else if (i === points.length - 1) {
            tx = points[i].x - points[i - 1].x;
            tz = points[i].z - points[i - 1].z;
          } else {
            tx = points[i + 1].x - points[i - 1].x;
            tz = points[i + 1].z - points[i - 1].z;
          }
          const len = Math.sqrt(tx * tx + tz * tz);
          if (len > 0) { tx /= len; tz /= len; }
          const nx = -tz;
          const nz = tx;

          leftPoints.push(new THREE.Vector3(
            points[i].x + nx * LANE_OFFSET, LANE_Y, points[i].z + nz * LANE_OFFSET
          ));
          rightPoints.push(new THREE.Vector3(
            points[i].x - nx * LANE_OFFSET, LANE_Y, points[i].z - nz * LANE_OFFSET
          ));
        }

        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftPoints), this.laneLineMat));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightPoints), this.laneLineMat));

        // Compute road edge lines (larger offset)
        const EDGE_OFFSET = 5;
        const EDGE_Y = LANE_Y + 0.1;
        const leftEdge: THREE.Vector3[] = [];
        const rightEdge: THREE.Vector3[] = [];

        for (let i = 0; i < points.length; i++) {
          let tx: number, tz: number;
          if (i === 0) {
            tx = points[1].x - points[0].x;
            tz = points[1].z - points[0].z;
          } else if (i === points.length - 1) {
            tx = points[i].x - points[i - 1].x;
            tz = points[i].z - points[i - 1].z;
          } else {
            tx = points[i + 1].x - points[i - 1].x;
            tz = points[i + 1].z - points[i - 1].z;
          }
          const len = Math.sqrt(tx * tx + tz * tz);
          if (len > 0) { tx /= len; tz /= len; }
          const nx = -tz;
          const nz = tx;

          leftEdge.push(new THREE.Vector3(
            points[i].x + nx * EDGE_OFFSET, EDGE_Y, points[i].z + nz * EDGE_OFFSET
          ));
          rightEdge.push(new THREE.Vector3(
            points[i].x - nx * EDGE_OFFSET, EDGE_Y, points[i].z - nz * EDGE_OFFSET
          ));
        }

        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftEdge), this.edgeLineMat));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightEdge), this.edgeLineMat));
      }
    }

    this.group = group;
    scene.add(group);
  }

  private clearFromScene(scene: THREE.Scene): void {
    if (this.group) {
      scene.remove(this.group);
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Line) {
          obj.geometry.dispose();
        }
      });
      this.group = null;
    }
  }

  dispose(scene: THREE.Scene): void {
    this.clearFromScene(scene);
    this.lineMat.dispose();
    this.connectorLineMat.dispose();
    this.pathLineMat.dispose();
    this.laneLineMat.dispose();
    this.edgeLineMat.dispose();
    this.circleMat.dispose();
    this.connectorCircleMat.dispose();
    this.circleGeom.dispose();
  }
}

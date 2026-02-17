import * as THREE from 'three';
import type { Grid } from '../../core/Grid';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { CellType, Direction } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, ROAD_COLOR, ROAD_HALF_WIDTH, ROAD_GRAPH_DEBUG } from '../../constants';
import { cubicBezier, lerp } from '../../utils/math';
import { forEachDirection, opposite, DIRECTION_OFFSETS } from '../../utils/direction';

const CIRCLE_RADIUS = 3;
const CIRCLE_SEGMENTS = 16;
const LINE_Y = 0.6;
const BEZIER_SAMPLES = 20;
const SMOOTH_T = 0.75;

const ROAD_SURFACE_Y = 0.3;

/**
 * Smooth the center line first, then offset perpendiculars from the dense
 * smooth curve. This keeps the road exactly centered on the green line
 * and avoids miter bulging at corners.
 */
function buildRoadShapeMesh(
  pixels: { x: number; y: number }[],
  isLoop: boolean,
  halfWidth: number,
  yLevel: number,
  material: THREE.Material,
): THREE.Mesh | null {
  if (pixels.length < 2) return null;

  // Smooth center line first (same as the green debug line)
  const center = smoothPolyline(pixels, isLoop, yLevel);
  const n = center.length;
  if (n < 2) return null;

  const leftPts: { x: number; z: number }[] = [];
  const rightPts: { x: number; z: number }[] = [];

  for (let i = 0; i < n; i++) {
    // Compute tangent via central differences
    let tx: number, tz: number;
    if (i === 0) {
      tx = center[1].x - center[0].x;
      tz = center[1].z - center[0].z;
    } else if (i === n - 1) {
      tx = center[n - 1].x - center[n - 2].x;
      tz = center[n - 1].z - center[n - 2].z;
    } else {
      tx = center[i + 1].x - center[i - 1].x;
      tz = center[i + 1].z - center[i - 1].z;
    }
    const len = Math.sqrt(tx * tx + tz * tz);
    if (len > 0) { tx /= len; tz /= len; }

    // Perpendicular in XZ plane: rotate tangent 90°
    const px = -tz, pz = tx;

    leftPts.push({ x: center[i].x + px * halfWidth, z: center[i].z + pz * halfWidth });
    rightPts.push({ x: center[i].x - px * halfWidth, z: center[i].z - pz * halfWidth });
  }

  // Remove backtracking on inner edges of tight corners.
  // When curvature radius < halfWidth, inner offset points reverse direction.
  // Detect this by checking if consecutive segments go backwards (negative dot product),
  // remove those points, then insert a rounded arc to fill the gap.
  const cleanAndRound = (pts: { x: number; z: number }[]) => {
    if (pts.length < 3) return pts;

    // Pass 1: remove backtracking points
    const cleaned: { x: number; z: number }[] = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i++) {
      const a = cleaned[cleaned.length - 2];
      const b = cleaned[cleaned.length - 1];
      const c = pts[i];
      const d1x = b.x - a.x, d1z = b.z - a.z;
      const d2x = c.x - b.x, d2z = c.z - b.z;
      const dot = d1x * d2x + d1z * d2z;
      if (dot < 0) {
        // Backtracking — replace previous point with current (skip the cusp)
        cleaned[cleaned.length - 1] = c;
      } else {
        cleaned.push(c);
      }
    }

    // Pass 2: detect remaining sharp angles and insert arc points
    const result: { x: number; z: number }[] = [cleaned[0]];
    for (let i = 1; i < cleaned.length - 1; i++) {
      const a = cleaned[i - 1];
      const b = cleaned[i];
      const c = cleaned[i + 1];
      const d1x = b.x - a.x, d1z = b.z - a.z;
      const d2x = c.x - b.x, d2z = c.z - b.z;
      const len1 = Math.sqrt(d1x * d1x + d1z * d1z);
      const len2 = Math.sqrt(d2x * d2x + d2z * d2z);
      if (len1 < 1e-6 || len2 < 1e-6) { result.push(b); continue; }
      const cos = (d1x * d2x + d1z * d2z) / (len1 * len2);

      if (cos < 0.5) {
        // Sharp angle (<60°) — insert circular arc points
        const radius = Math.min(len1, len2) * 0.4;
        // Points on incoming/outgoing edges at radius distance from corner
        const p1x = b.x - (d1x / len1) * radius;
        const p1z = b.z - (d1z / len1) * radius;
        const p2x = b.x + (d2x / len2) * radius;
        const p2z = b.z + (d2z / len2) * radius;
        // Arc center approximation: offset from corner toward the inside
        const mx = (p1x + p2x) / 2;
        const mz = (p1z + p2z) / 2;
        // Insert arc via subdivision
        const ARC_SEGS = 6;
        for (let s = 0; s <= ARC_SEGS; s++) {
          const t = s / ARC_SEGS;
          // Quadratic bezier through p1, corner offset, p2
          const u = 1 - t;
          const qx = u * u * p1x + 2 * u * t * mx + t * t * p2x;
          const qz = u * u * p1z + 2 * u * t * mz + t * t * p2z;
          result.push({ x: qx, z: qz });
        }
      } else {
        result.push(b);
      }
    }
    result.push(cleaned[cleaned.length - 1]);
    return result;
  };

  // Chaikin subdivision smoothing
  const chaikinSmooth = (pts: { x: number; z: number }[], iterations: number) => {
    let curr = pts;
    for (let iter = 0; iter < iterations; iter++) {
      const next: { x: number; z: number }[] = [curr[0]];
      for (let i = 0; i < curr.length - 1; i++) {
        const a = curr[i], b = curr[i + 1];
        next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
      }
      next.push(curr[curr.length - 1]);
      curr = next;
    }
    return curr;
  };

  const smoothLeft = chaikinSmooth(cleanAndRound(leftPts), 3);
  const smoothRight = chaikinSmooth(cleanAndRound(rightPts), 3);

  // Build Shape in (worldX, -worldZ) space
  const shape = new THREE.Shape();
  shape.moveTo(smoothLeft[0].x, -smoothLeft[0].z);
  for (let i = 1; i < smoothLeft.length; i++) {
    shape.lineTo(smoothLeft[i].x, -smoothLeft[i].z);
  }
  for (let i = smoothRight.length - 1; i >= 0; i--) {
    shape.lineTo(smoothRight[i].x, -smoothRight[i].z);
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelSegments: 2,
    curveSegments: 1,
  });
  const mesh = new THREE.Mesh(geom, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yLevel;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Bezier-smooth a polyline of pixel coordinates.
 * Returns THREE.Vector3[] at the given y level.
 */
function smoothPolyline(
  pixels: { x: number; y: number }[],
  isLoop: boolean,
  yLevel: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const len = pixels.length;

  // Pre-scan to identify corners
  const isCorner: boolean[] = new Array(len);
  for (let i = 0; i < len; i++) {
    if (!isLoop && (i === 0 || i === len - 1)) { isCorner[i] = false; continue; }
    const prev = isLoop ? pixels[(i - 1 + len) % len] : pixels[i - 1];
    const curr = pixels[i];
    const next = isLoop ? pixels[(i + 1) % len] : pixels[i + 1];
    const dxIn = curr.x - prev.x;
    const dyIn = curr.y - prev.y;
    const dxOut = next.x - curr.x;
    const dyOut = next.y - curr.y;
    const sameDir =
      Math.sign(dxIn) === Math.sign(dxOut) &&
      Math.sign(dyIn) === Math.sign(dyOut) &&
      Math.abs(dxIn) > 0 === (Math.abs(dxOut) > 0) &&
      Math.abs(dyIn) > 0 === (Math.abs(dyOut) > 0);
    isCorner[i] = !sameDir;
  }

  for (let i = 0; i < len; i++) {
    const curr = pixels[i];

    if (!isLoop && (i === 0 || i === len - 1)) {
      points.push(new THREE.Vector3(curr.x, yLevel, curr.y));
      continue;
    }

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
      points.push(new THREE.Vector3(curr.x, yLevel, curr.y));
    } else {
      const prevIdx = isLoop ? (i - 1 + len) % len : i - 1;
      const nextIdx = isLoop ? (i + 1) % len : i + 1;
      const inT = isCorner[prevIdx] ? Math.min(SMOOTH_T, 0.5) : SMOOTH_T;
      const outT = isCorner[nextIdx] ? Math.min(SMOOTH_T, 0.5) : SMOOTH_T;

      const pInX = lerp(prev.x, curr.x, 1 - inT);
      const pInY = lerp(prev.y, curr.y, 1 - inT);
      const pOutX = lerp(curr.x, next.x, outT);
      const pOutY = lerp(curr.y, next.y, outT);

      if (points.length > 0) {
        const last = points[points.length - 1];
        last.set(pInX, yLevel, pInY);
      }

      for (let s = 1; s <= BEZIER_SAMPLES; s++) {
        const t = s / BEZIER_SAMPLES;
        const b = cubicBezier(
          pInX, pInY, curr.x, curr.y,
          curr.x, curr.y, pOutX, pOutY, t,
        );
        points.push(new THREE.Vector3(b.x, yLevel, b.y));
      }
    }
  }

  if (isLoop && points.length > 0) {
    points.push(points[0].clone());
  }

  return points;
}

export class RoadLayer {
  private grid: Grid;
  private getHouses: () => House[];
  private getBusinesses: () => Business[];
  private group: THREE.Group | null = null;

  private lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
  private connectorLineMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
  private pathLineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 });
  private circleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private connectorCircleMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  private circleGeom = new THREE.CircleGeometry(CIRCLE_RADIUS, CIRCLE_SEGMENTS);
  private roadNoiseTexture = RoadLayer.createRoadNoiseTexture();
  private roadSurfaceMat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR, side: THREE.DoubleSide, map: this.roadNoiseTexture });
  private pendingOverlayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false });

  private static createRoadNoiseTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    let seed = 77;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; };

    for (let i = 0; i < size * size; i++) {
      const fine = (rand() - 0.5) * 60;
      const speckle = rand() < 0.15 ? (rand() - 0.5) * 90 : 0;
      const v = 128 + Math.round(fine + speckle);
      const idx = i * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

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

        if (ROAD_GRAPH_DEBUG) {
          // Circle at cell center
          const circle = new THREE.Mesh(this.circleGeom, this.circleMat);
          circle.rotation.x = -Math.PI / 2;
          circle.position.set(cx, LINE_Y, cz);
          group.add(circle);

          // Lines to connected neighbors (only draw if neighbor index > current to avoid duplicates)
          const currentIdx = gy * GRID_COLS + gx;
          forEachDirection(cell.roadConnections, (dir) => {
            const off = DIRECTION_OFFSETS[dir];
            const nx = gx + off.gx;
            const ny = gy + off.gy;
            const neighborIdx = ny * GRID_COLS + nx;
            if (neighborIdx <= currentIdx) return;

            const ncx = nx * TILE_SIZE + half;
            const ncz = ny * TILE_SIZE + half;

            const points = [
              new THREE.Vector3(cx, LINE_Y, cz),
              new THREE.Vector3(ncx, LINE_Y, ncz),
            ];
            const geom = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geom, this.lineMat);
            group.add(line);
          });
        }
      }
    }

    if (ROAD_GRAPH_DEBUG) {
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
    }

    // Green bezier-smoothed lines on top of white lines
    const GREEN_Y = LINE_Y + 0.1;

    // Build adjacency with direction info
    const cellKey = (gx: number, gy: number) => gy * GRID_COLS + gx;
    const adjacency = new Map<number, Array<{ neighbor: number; dir: Direction }>>();

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || (cell.type !== CellType.Road && cell.type !== CellType.Connector)) continue;
        if (cell.roadConnections === 0) continue;

        const key = cellKey(gx, gy);
        const neighbors: Array<{ neighbor: number; dir: Direction }> = [];
        forEachDirection(cell.roadConnections, (dir) => {
          const off = DIRECTION_OFFSETS[dir];
          const nx = gx + off.gx;
          const ny = gy + off.gy;
          const nCell = this.grid.getCell(nx, ny);
          if (!nCell || (nCell.type !== CellType.Road && nCell.type !== CellType.Connector)) return;
          neighbors.push({ neighbor: cellKey(nx, ny), dir });
        });
        adjacency.set(key, neighbors);
      }
    }

    // Opposite direction lookup for routing chains through intersections

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
      const throughDir = opposite(incomingDir);
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

    // Append building cells (House/ParkingLot) to chains that end at their Connector.
    // This eliminates visual gaps where road chains meet building connectors.
    const connectorToBuildings = new Map<number, number[]>();
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || cell.type !== CellType.Connector) continue;
        if (cell.roadConnections === 0) continue;

        const key = cellKey(gx, gy);
        forEachDirection(cell.roadConnections, (dir) => {
          const off = DIRECTION_OFFSETS[dir];
          const nx = gx + off.gx;
          const ny = gy + off.gy;
          const nCell = this.grid.getCell(nx, ny);
          if (nCell?.type === CellType.House || nCell?.type === CellType.ParkingLot) {
            let buildings = connectorToBuildings.get(key);
            if (!buildings) {
              buildings = [];
              connectorToBuildings.set(key, buildings);
            }
            buildings.push(cellKey(nx, ny));
          }
        });
      }
    }

    // Extend chains that start/end at a connector by appending the building cell.
    // Use a fixed length so newly pushed spur chains aren't re-processed (avoids
    // infinite loop when two houses share a connector).
    const attachedConnectors = new Set<number>();
    const originalChainCount = chains.length;
    for (let ci = 0; ci < originalChainCount; ci++) {
      const chain = chains[ci];
      const last = chain[chain.length - 1];
      const lastBuildings = connectorToBuildings.get(last);
      if (lastBuildings && !attachedConnectors.has(last)) {
        chain.push(lastBuildings[0]);
        attachedConnectors.add(last);
        for (let i = 1; i < lastBuildings.length; i++) {
          chains.push([lastBuildings[i], last]);
        }
      }
      const first = chain[0];
      const firstBuildings = connectorToBuildings.get(first);
      if (firstBuildings && !attachedConnectors.has(first)) {
        chain.unshift(firstBuildings[0]);
        attachedConnectors.add(first);
        for (let i = 1; i < firstBuildings.length; i++) {
          chains.push([firstBuildings[i], first]);
        }
      }
    }

    // Fall back to 2-node spur chains for any connectors not attached to a chain
    for (const [connKey, buildingKeys] of connectorToBuildings) {
      if (!attachedConnectors.has(connKey)) {
        for (const buildingKey of buildingKeys) {
          chains.push([connKey, buildingKey]);
        }
      }
    }

    // Convert chains to pixel coords and draw with bezier smoothing
    const pendingOverlayY = ROAD_SURFACE_Y + 0.01;
    for (const chain of chains) {
      // Detect closed loops (first node == last node)
      const isLoop = chain.length > 2 && chain[0] === chain[chain.length - 1];
      if (isLoop) chain.pop(); // Remove duplicate end node

      const pixels = chain.map((key) => {
        const gx = key % GRID_COLS;
        const gy = Math.floor(key / GRID_COLS);
        return { x: gx * TILE_SIZE + half, y: gy * TILE_SIZE + half };
      });

      // Road surface shape (offset raw positions, smooth each side independently)
      const shapeMesh = buildRoadShapeMesh(pixels, isLoop, ROAD_HALF_WIDTH, ROAD_SURFACE_Y, this.roadSurfaceMat);
      if (shapeMesh) {
        group.add(shapeMesh);
      }

      if (ROAD_GRAPH_DEBUG) {
        // Green center line: smooth the cell centers directly
        const points = smoothPolyline(pixels, isLoop, GREEN_Y);

        if (points.length >= 2) {
          const geom = new THREE.BufferGeometry().setFromPoints(points);
          group.add(new THREE.Line(geom, this.pathLineMat));
        }
      }

      // Pending-deletion overlay: extract sub-chains that include pending cells
      // and render a road-shaped overlay on top. Each sub-chain extends one cell
      // beyond the pending region on each side for smooth blending.
      const isPending = (key: number) => {
        const cell = this.grid.getCell(key % GRID_COLS, Math.floor(key / GRID_COLS));
        return cell?.pendingDeletion === true;
      };
      let i = 0;
      while (i < chain.length) {
        if (!isPending(chain[i])) { i++; continue; }
        // Found start of a pending run
        let start = i;
        while (i < chain.length && isPending(chain[i])) i++;
        let end = i; // exclusive
        // Extend one cell before/after for smooth curve continuity
        const subStart = Math.max(0, start - 1);
        const subEnd = Math.min(chain.length, end + 1);
        const subPixels = [];
        for (let j = subStart; j < subEnd; j++) {
          const gx = chain[j] % GRID_COLS;
          const gy = Math.floor(chain[j] / GRID_COLS);
          subPixels.push({ x: gx * TILE_SIZE + half, y: gy * TILE_SIZE + half });
        }
        const overlay = buildRoadShapeMesh(subPixels, false, ROAD_HALF_WIDTH, pendingOverlayY, this.pendingOverlayMat);
        if (overlay) group.add(overlay);
      }
    }

    this.group = group;
    scene.add(group);
  }

  private clearFromScene(scene: THREE.Scene): void {
    if (this.group) {
      scene.remove(this.group);
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
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
    this.circleMat.dispose();
    this.connectorCircleMat.dispose();
    this.circleGeom.dispose();
    this.roadSurfaceMat.dispose();
    this.roadNoiseTexture.dispose();
    this.pendingOverlayMat.dispose();
  }
}

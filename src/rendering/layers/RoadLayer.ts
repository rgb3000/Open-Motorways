import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Grid } from '../../core/Grid';
import { CellType, Direction } from '../../types';
import {
  GRID_COLS, GRID_ROWS, TILE_SIZE, ROAD_COLOR, ROAD_OUTLINE_COLOR,
  BRIDGE_COLOR, BRIDGE_OUTLINE_COLOR, BRIDGE_BARRIER_COLOR, BRIDGE_Y_POSITION,
} from '../../constants';

const ROAD_HEIGHT = 1.0;
const ROAD_WIDTH_RATIO = 0.45;
const BRIDGE_HEIGHT = 1.5;
const BRIDGE_WIDTH_RATIO = 0.7;

export class RoadLayer {
  private grid: Grid;
  private roadMesh: THREE.Mesh | null = null;
  private outlineMesh: THREE.Mesh | null = null;
  private bridgeGroup: THREE.Group | null = null;

  private roadMat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR });
  private outlineMat = new THREE.MeshStandardMaterial({ color: ROAD_OUTLINE_COLOR });
  private bridgeMat = new THREE.MeshStandardMaterial({ color: BRIDGE_COLOR });
  private bridgeOutlineMat = new THREE.MeshStandardMaterial({ color: BRIDGE_OUTLINE_COLOR });
  private bridgeBarrierMat = new THREE.MeshStandardMaterial({ color: BRIDGE_BARRIER_COLOR });

  constructor(grid: Grid) {
    this.grid = grid;
  }

  private oppositeDir(dir: Direction): Direction {
    switch (dir) {
      case Direction.Up: return Direction.Down;
      case Direction.Down: return Direction.Up;
      case Direction.Left: return Direction.Right;
      case Direction.Right: return Direction.Left;
    }
  }

  private isRoadOrConnector(cell: { type: CellType; connectorDir: Direction | null }): boolean {
    return cell.type === CellType.Road || (cell.type === CellType.Business && cell.connectorDir !== null);
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
        if (cell.hasBridge) continue; // bridges rendered separately

        const cx = gx * TILE_SIZE + half;
        const cz = gy * TILE_SIZE + half;

        let conns = cell.roadConnections;
        if (cell.type === CellType.Business && cell.connectorDir !== null) {
          const towardBiz = this.oppositeDir(cell.connectorDir);
          conns = conns.includes(towardBiz) ? conns : [towardBiz, ...conns];
        }

        // Road fill geometry
        this.buildCellGeometries(roadGeoms, cx, cz, roadHalf, conns, half, ROAD_HEIGHT, 0);
        // Outline geometry (slightly larger, slightly lower)
        this.buildCellGeometries(outlineGeoms, cx, cz, roadHalf + outlineExtra, conns, half, ROAD_HEIGHT, -0.01);
      }
    }

    // Also include road cells that have bridges (the ground-level road part)
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || !cell.hasBridge) continue;

        const cx = gx * TILE_SIZE + half;
        const cz = gy * TILE_SIZE + half;
        const conns = cell.roadConnections;

        // Ground-level road (perpendicular to bridge axis)
        const groundConns = cell.bridgeAxis === 'horizontal'
          ? conns.filter(d => d === Direction.Up || d === Direction.Down)
          : conns.filter(d => d === Direction.Left || d === Direction.Right);

        if (groundConns.length > 0) {
          this.buildCellGeometries(roadGeoms, cx, cz, roadHalf, groundConns, half, ROAD_HEIGHT, 0);
          this.buildCellGeometries(outlineGeoms, cx, cz, roadHalf + outlineExtra, groundConns, half, ROAD_HEIGHT, -0.01);
        }
      }
    }

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

    // Bridges
    this.buildBridges(scene);

    // Dispose temp geometries
    for (const g of roadGeoms) g.dispose();
    for (const g of outlineGeoms) g.dispose();
  }

  private buildCellGeometries(
    geoms: THREE.BufferGeometry[],
    cx: number, cz: number,
    rh: number, conns: Direction[], half: number,
    height: number, yOffset: number,
  ): void {
    const y = height / 2 + yOffset;

    // Center box
    const centerGeom = new THREE.BoxGeometry(rh * 2, height, rh * 2);
    centerGeom.translate(cx, y, cz);
    geoms.push(centerGeom);

    // Arms
    for (const dir of conns) {
      let w: number, d: number, ox: number, oz: number;
      const armLen = half - rh;

      switch (dir) {
        case Direction.Up:
          w = rh * 2; d = armLen;
          ox = cx; oz = cz - rh - armLen / 2;
          break;
        case Direction.Down:
          w = rh * 2; d = armLen;
          ox = cx; oz = cz + rh + armLen / 2;
          break;
        case Direction.Left:
          w = armLen; d = rh * 2;
          ox = cx - rh - armLen / 2; oz = cz;
          break;
        case Direction.Right:
          w = armLen; d = rh * 2;
          ox = cx + rh + armLen / 2; oz = cz;
          break;
      }

      const armGeom = new THREE.BoxGeometry(w, height, d);
      armGeom.translate(ox, y, oz);
      geoms.push(armGeom);
    }
  }

  private buildBridges(scene: THREE.Scene): void {
    const half = TILE_SIZE / 2;
    const bridgeHalf = TILE_SIZE * BRIDGE_WIDTH_RATIO / 2;
    const outlineExtra = 1;

    const bridgeGeoms: THREE.BufferGeometry[] = [];
    const bridgeOutlineGeoms: THREE.BufferGeometry[] = [];
    const barrierGeoms: THREE.BufferGeometry[] = [];

    const bridgeY = BRIDGE_Y_POSITION;

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || !cell.hasBridge || !cell.bridgeAxis) continue;

        const cx = gx * TILE_SIZE + half;
        const cz = gy * TILE_SIZE + half;
        const isHorizontal = cell.bridgeAxis === 'horizontal';

        // Bridge body
        const bw = isHorizontal ? TILE_SIZE : bridgeHalf * 2;
        const bd = isHorizontal ? bridgeHalf * 2 : TILE_SIZE;
        const bodyGeom = new THREE.BoxGeometry(bw, BRIDGE_HEIGHT, bd);
        bodyGeom.translate(cx, bridgeY + BRIDGE_HEIGHT / 2, cz);
        bridgeGeoms.push(bodyGeom);

        // Outline
        const ow = bw + outlineExtra * 2;
        const od = bd + outlineExtra * 2;
        const outGeom = new THREE.BoxGeometry(ow, BRIDGE_HEIGHT, od);
        outGeom.translate(cx, bridgeY + BRIDGE_HEIGHT / 2 - 0.01, cz);
        bridgeOutlineGeoms.push(outGeom);

        // Side barriers
        const barrierHeight = 2;
        const barrierThickness = 1.5;

        if (isHorizontal) {
          // Top and bottom barriers
          const bt = new THREE.BoxGeometry(TILE_SIZE, barrierHeight, barrierThickness);
          bt.translate(cx, bridgeY + BRIDGE_HEIGHT + barrierHeight / 2, cz - bridgeHalf);
          barrierGeoms.push(bt);
          const bb = new THREE.BoxGeometry(TILE_SIZE, barrierHeight, barrierThickness);
          bb.translate(cx, bridgeY + BRIDGE_HEIGHT + barrierHeight / 2, cz + bridgeHalf);
          barrierGeoms.push(bb);
        } else {
          const bl = new THREE.BoxGeometry(barrierThickness, barrierHeight, TILE_SIZE);
          bl.translate(cx - bridgeHalf, bridgeY + BRIDGE_HEIGHT + barrierHeight / 2, cz);
          barrierGeoms.push(bl);
          const br = new THREE.BoxGeometry(barrierThickness, barrierHeight, TILE_SIZE);
          br.translate(cx + bridgeHalf, bridgeY + BRIDGE_HEIGHT + barrierHeight / 2, cz);
          barrierGeoms.push(br);
        }

      }
    }

    this.bridgeGroup = new THREE.Group();

    if (bridgeOutlineGeoms.length > 0) {
      const merged = mergeGeometries(bridgeOutlineGeoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.bridgeOutlineMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.bridgeGroup.add(mesh);
      }
    }

    if (bridgeGeoms.length > 0) {
      const merged = mergeGeometries(bridgeGeoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.bridgeMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.bridgeGroup.add(mesh);
      }
    }

    if (barrierGeoms.length > 0) {
      const merged = mergeGeometries(barrierGeoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.bridgeBarrierMat);
        mesh.castShadow = true;
        this.bridgeGroup.add(mesh);
      }
    }

    scene.add(this.bridgeGroup);

    // Dispose temp geometries
    for (const g of [...bridgeGeoms, ...bridgeOutlineGeoms, ...barrierGeoms]) {
      g.dispose();
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
    if (this.bridgeGroup) {
      this.bridgeGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
      scene.remove(this.bridgeGroup);
      this.bridgeGroup = null;
    }
  }

  dispose(scene: THREE.Scene): void {
    this.clearFromScene(scene);
    this.roadMat.dispose();
    this.outlineMat.dispose();
    this.bridgeMat.dispose();
    this.bridgeOutlineMat.dispose();
    this.bridgeBarrierMat.dispose();
  }
}

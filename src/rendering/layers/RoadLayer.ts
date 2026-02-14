import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Grid } from '../../core/Grid';
import { CellType, Direction } from '../../types';
import {
  GRID_COLS, GRID_ROWS, TILE_SIZE, ROAD_COLOR, ROAD_OUTLINE_COLOR,
} from '../../constants';
import { CellRoadRenderer } from './road/CellRoadRenderer';
import { DiagonalRoadRenderer } from './road/DiagonalRoadRenderer';

const CARDINAL_DIRS: Direction[] = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];

export class RoadLayer {
  private grid: Grid;
  private roadMesh: THREE.Mesh | null = null;
  private outlineMesh: THREE.Mesh | null = null;

  private roadMat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR });
  private outlineMat = new THREE.MeshStandardMaterial({ color: ROAD_OUTLINE_COLOR });

  private cellRenderer = new CellRoadRenderer();
  private diagonalRenderer: DiagonalRoadRenderer;

  constructor(grid: Grid) {
    this.grid = grid;
    this.diagonalRenderer = new DiagonalRoadRenderer(grid);
  }

  update(scene: THREE.Scene): void {
    this.clearFromScene(scene);

    const half = TILE_SIZE / 2;
    const outlineExtra = 1;

    const roadGeoms: THREE.BufferGeometry[] = [];
    const outlineGeoms: THREE.BufferGeometry[] = [];

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || cell.type !== CellType.Road) continue;

        const conns = cell.roadConnections;

        // Skip cells that only have diagonal connections (no cardinal)
        const hasCardinal = conns.some(d => CARDINAL_DIRS.includes(d));
        if (!hasCardinal) continue;

        const cx = gx * TILE_SIZE + half;
        const cz = gy * TILE_SIZE + half;

        this.cellRenderer.buildCellGeometries(roadGeoms, cx, cz, conns);
        this.cellRenderer.buildCellOutlineGeometries(outlineGeoms, cx, cz, conns, outlineExtra);
      }
    }

    // Diagonal strips
    this.diagonalRenderer.buildAllStrips(roadGeoms, outlineGeoms, outlineExtra);

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

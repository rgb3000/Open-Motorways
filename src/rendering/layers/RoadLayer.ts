import * as THREE from 'three';
import type { Grid } from '../../core/Grid';
import { CellType, Direction } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../../constants';

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
  private group: THREE.Group | null = null;

  private lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  private circleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private circleGeom = new THREE.CircleGeometry(CIRCLE_RADIUS, CIRCLE_SEGMENTS);

  constructor(grid: Grid) {
    this.grid = grid;
  }

  update(scene: THREE.Scene): void {
    this.clearFromScene(scene);

    const group = new THREE.Group();
    const half = TILE_SIZE / 2;

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (!cell || cell.type !== CellType.Road) continue;

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
    this.circleMat.dispose();
    this.circleGeom.dispose();
  }
}

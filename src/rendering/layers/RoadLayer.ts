import * as THREE from 'three';
import type { Grid } from '../../core/Grid';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
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
  private getHouses: () => House[];
  private getBusinesses: () => Business[];
  private group: THREE.Group | null = null;

  private lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  private connectorLineMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
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
    this.circleMat.dispose();
    this.connectorCircleMat.dispose();
    this.circleGeom.dispose();
  }
}

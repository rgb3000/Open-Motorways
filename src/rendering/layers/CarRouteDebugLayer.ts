import * as THREE from 'three';
import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { COLOR_MAP, TILE_SIZE } from '../../constants';
import { stepGridPos } from '../../systems/car/CarRouter';

const LINE_Y = 1;
const HOVER_RADIUS = TILE_SIZE * 0.35;
const MARKER_RADIUS = TILE_SIZE * 0.3;
const MARKER_SEGMENTS = 16;

export class CarRouteDebugLayer {
  private group: THREE.Group | null = null;
  private hoveredCarId: string | null = null;
  private cachedPathIndex = -1;

  update(
    scene: THREE.Scene,
    cars: Car[],
    houses: House[],
    businesses: Business[],
    mouseWorldX: number,
    mouseWorldY: number,
  ): void {
    // Find closest car to mouse
    let closestCar: Car | null = null;
    let closestDist = HOVER_RADIUS;

    for (const car of cars) {
      if (car.state === CarState.Idle) continue;
      const dx = mouseWorldX - car.pixelPos.x;
      const dy = mouseWorldY - car.pixelPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestCar = car;
      }
    }

    if (!closestCar) {
      this.clearFromScene(scene);
      this.hoveredCarId = null;
      this.cachedPathIndex = -1;
      return;
    }

    // Skip rebuild if same car and same progress
    if (
      closestCar.id === this.hoveredCarId &&
      closestCar.pathIndex === this.cachedPathIndex
    ) {
      return;
    }

    this.clearFromScene(scene);
    this.hoveredCarId = closestCar.id;
    this.cachedPathIndex = closestCar.pathIndex;

    const group = new THREE.Group();
    const color = new THREE.Color(COLOR_MAP[closestCar.color]);

    // Use smoothPath if available, otherwise fall back to grid path
    if (closestCar.smoothPath.length > 1) {
      this.buildFromSmoothPath(group, closestCar, color);
    } else if (closestCar.path.length > 1) {
      this.buildFromGridPath(group, closestCar, color);
    }

    // Origin house marker
    const house = houses.find(h => h.id === closestCar!.homeHouseId);
    if (house) {
      const hx = (house.pos.gx + 0.5) * TILE_SIZE;
      const hz = (house.pos.gy + 0.5) * TILE_SIZE;
      this.addCircleMarker(group, hx, hz, color, 0.6);
    }

    // Destination business marker
    if (closestCar.targetBusinessId) {
      const biz = businesses.find(b => b.id === closestCar!.targetBusinessId);
      if (biz) {
        const bx = (biz.pos.gx + 0.5) * TILE_SIZE;
        const bz = (biz.pos.gy + 0.5) * TILE_SIZE;
        this.addCircleMarker(group, bx, bz, color, 1.0);
      }
    }

    this.group = group;
    scene.add(group);
  }

  private buildFromSmoothPath(group: THREE.Group, car: Car, color: THREE.Color): void {
    const sp = car.smoothPath;

    // Find split point: closest smoothPath point to car's current pixel position
    let splitIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < sp.length; i++) {
      const dx = sp[i].x - car.pixelPos.x;
      const dy = sp[i].y - car.pixelPos.y;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        splitIdx = i;
      }
    }

    // Traveled portion (start -> current position): dashed via segments
    if (splitIdx > 0) {
      const traveledPts: THREE.Vector3[] = [];
      for (let i = 0; i <= splitIdx; i++) {
        traveledPts.push(new THREE.Vector3(sp[i].x, LINE_Y, sp[i].y));
      }
      const traveledGeom = new THREE.BufferGeometry().setFromPoints(traveledPts);
      const traveledMat = new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        dashSize: 6,
        gapSize: 4,
      });
      const traveledLine = new THREE.Line(traveledGeom, traveledMat);
      traveledLine.computeLineDistances();
      group.add(traveledLine);
    }

    // Remaining portion (current position -> end): solid line
    if (splitIdx < sp.length - 1) {
      const remainPts: THREE.Vector3[] = [];
      remainPts.push(new THREE.Vector3(car.pixelPos.x, LINE_Y, car.pixelPos.y));
      for (let i = splitIdx; i < sp.length; i++) {
        remainPts.push(new THREE.Vector3(sp[i].x, LINE_Y, sp[i].y));
      }
      const remainGeom = new THREE.BufferGeometry().setFromPoints(remainPts);
      const remainMat = new THREE.LineBasicMaterial({ color });
      const remainLine = new THREE.Line(remainGeom, remainMat);
      group.add(remainLine);
    }
  }

  private buildFromGridPath(group: THREE.Group, car: Car, color: THREE.Color): void {
    const path = car.path;
    const idx = car.pathIndex;

    // Traveled portion
    if (idx > 0) {
      const traveledPts: THREE.Vector3[] = [];
      for (let i = 0; i <= idx; i++) {
        const p = stepGridPos(path[i]);
        traveledPts.push(new THREE.Vector3(
          (p.gx + 0.5) * TILE_SIZE, LINE_Y, (p.gy + 0.5) * TILE_SIZE,
        ));
      }
      const traveledGeom = new THREE.BufferGeometry().setFromPoints(traveledPts);
      const traveledMat = new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        dashSize: 6,
        gapSize: 4,
      });
      const traveledLine = new THREE.Line(traveledGeom, traveledMat);
      traveledLine.computeLineDistances();
      group.add(traveledLine);
    }

    // Remaining portion
    if (idx < path.length - 1) {
      const remainPts: THREE.Vector3[] = [];
      remainPts.push(new THREE.Vector3(car.pixelPos.x, LINE_Y, car.pixelPos.y));
      for (let i = idx + 1; i < path.length; i++) {
        const p = stepGridPos(path[i]);
        remainPts.push(new THREE.Vector3(
          (p.gx + 0.5) * TILE_SIZE, LINE_Y, (p.gy + 0.5) * TILE_SIZE,
        ));
      }
      const remainGeom = new THREE.BufferGeometry().setFromPoints(remainPts);
      const remainMat = new THREE.LineBasicMaterial({ color });
      const remainLine = new THREE.Line(remainGeom, remainMat);
      group.add(remainLine);
    }
  }

  private addCircleMarker(group: THREE.Group, x: number, z: number, color: THREE.Color, opacity: number): void {
    const geom = new THREE.RingGeometry(MARKER_RADIUS * 0.7, MARKER_RADIUS, MARKER_SEGMENTS);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, LINE_Y, z);
    mesh.renderOrder = 998;
    group.add(mesh);
  }

  clear(scene: THREE.Scene): void {
    this.clearFromScene(scene);
    this.hoveredCarId = null;
    this.cachedPathIndex = -1;
  }

  private clearFromScene(scene: THREE.Scene): void {
    if (this.group) {
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) {
            mat.forEach(m => m.dispose());
          } else {
            (mat as THREE.Material).dispose();
          }
        }
      });
      scene.remove(this.group);
      this.group = null;
    }
  }

  dispose(scene: THREE.Scene): void {
    this.clearFromScene(scene);
  }
}

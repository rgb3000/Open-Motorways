import * as THREE from 'three';
import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { COLOR_MAP, TILE_SIZE, FUEL_CAPACITY } from '../../constants';
import { stepGridPos } from '../../systems/car/CarRouter';

const LINE_Y = 1;
const HOVER_RADIUS = TILE_SIZE * 0.35;
const MARKER_RADIUS = TILE_SIZE * 0.3;
const MARKER_SEGMENTS = 16;

export class CarRouteDebugLayer {
  private group: THREE.Group | null = null;
  private hoveredCarId: string | null = null;
  private cachedPathIndex = -1;
  private cachedFuel = -1;

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
    const fuelFloored = Math.floor(closestCar.fuel);
    if (
      closestCar.id === this.hoveredCarId &&
      closestCar.pathIndex === this.cachedPathIndex &&
      fuelFloored === this.cachedFuel
    ) {
      return;
    }

    this.clearFromScene(scene);
    this.hoveredCarId = closestCar.id;
    this.cachedPathIndex = closestCar.pathIndex;
    this.cachedFuel = fuelFloored;

    const group = new THREE.Group();
    const color = new THREE.Color(COLOR_MAP[closestCar.color]);

    // Use smoothPath if available, otherwise fall back to grid path
    if (closestCar.smoothPath.length > 1) {
      this.buildFromSmoothPath(group, closestCar, color);
    } else if (closestCar.path.length > 1) {
      this.buildFromGridPath(group, closestCar, color);
    }

    // Fuel indicator
    this.addFuelIndicator(group, closestCar);

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

  private addFuelIndicator(group: THREE.Group, car: Car): void {
    const fuel = car.fuel;
    const fuelPct = fuel / FUEL_CAPACITY;
    const radius = TILE_SIZE * 0.2;
    const cx = car.pixelPos.x + TILE_SIZE * 0.6;
    const cz = car.pixelPos.y;
    const y = 2;

    // Background disc
    const bgGeom = new THREE.CircleGeometry(radius, 32);
    bgGeom.rotateX(-Math.PI / 2);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
    });
    const bgMesh = new THREE.Mesh(bgGeom, bgMat);
    bgMesh.position.set(cx, y, cz);
    bgMesh.renderOrder = 999;
    group.add(bgMesh);

    // Fuel arc
    if (fuelPct > 0) {
      const thetaLength = fuelPct * Math.PI * 2;
      const arcGeom = new THREE.CircleGeometry(radius * 0.9, 32, -Math.PI / 2, thetaLength);
      arcGeom.rotateX(-Math.PI / 2);
      const arcColor = fuelPct > 0.5 ? 0x4CAF50 : fuelPct > 0.2 ? 0xFFC107 : 0xF44336;
      const arcMat = new THREE.MeshBasicMaterial({
        color: arcColor,
        depthTest: false,
      });
      const arcMesh = new THREE.Mesh(arcGeom, arcMat);
      arcMesh.position.set(cx, y + 0.1, cz);
      arcMesh.renderOrder = 1000;
      group.add(arcMesh);
    }

    // Percentage text sprite
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 32);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(fuelPct * 100)}%`, 32, 16);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(20, 10, 1);
    sprite.position.set(cx, y + 8, cz);
    sprite.renderOrder = 1000;
    group.add(sprite);
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
    this.cachedFuel = -1;
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
        } else if (obj instanceof THREE.Sprite) {
          const mat = obj.material as THREE.SpriteMaterial;
          if (mat.map) mat.map.dispose();
          mat.dispose();
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

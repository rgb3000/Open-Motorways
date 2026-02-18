import * as THREE from 'three';
import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import { COLOR_MAP, CAR_WIDTH, CAR_LENGTH, GROUND_Y_POSITION } from '../../constants';
import type { GameColor } from '../../types';
import { lerp } from '../../utils/math';

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

export class CarLayer {
  private meshes = new Map<string, THREE.Group>();
  private materialCache = new Map<GameColor, THREE.MeshStandardMaterial>();
  private carGeometry: THREE.ExtrudeGeometry;
  private loadGeometry: THREE.ExtrudeGeometry;
  private loadMaterial: THREE.MeshStandardMaterial;
  private tireGeometry: THREE.CylinderGeometry;
  private tireMaterial: THREE.MeshStandardMaterial;
  private activeCarIds = new Set<string>();

  constructor() {
    const carShape = roundedRectShape(CAR_LENGTH, CAR_WIDTH, 1);
    this.carGeometry = new THREE.ExtrudeGeometry(carShape, { depth: 2, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2, curveSegments: 3 });
    this.carGeometry.rotateX(-Math.PI / 2);

    const loadShape = roundedRectShape(4, 3, 0.5);
    this.loadGeometry = new THREE.ExtrudeGeometry(loadShape, { depth: 2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, curveSegments: 3 });
    this.loadGeometry.rotateX(-Math.PI / 2);
    this.loadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

    // Tire: small cylinder on its side
    const tireRadius = 1.2;
    const tireWidth = 1.0;
    this.tireGeometry = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 8);
    this.tireGeometry.rotateX(Math.PI / 2); // lay flat so axis is along Z (car's side axis)
    this.tireMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  }

  private getMaterial(color: GameColor): THREE.MeshStandardMaterial {
    let mat = this.materialCache.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: COLOR_MAP[color] });
      this.materialCache.set(color, mat);
    }
    return mat;
  }

  update(scene: THREE.Scene, cars: Car[], alpha: number): void {
    const activeCars = this.activeCarIds;
    activeCars.clear();

    for (const car of cars) {
      activeCars.add(car.id);

      let group = this.meshes.get(car.id);
      if (!group) {
        group = new THREE.Group();

        const body = new THREE.Mesh(this.carGeometry, this.getMaterial(car.color));
        body.castShadow = true;
        group.add(body);

        const load = new THREE.Mesh(this.loadGeometry, this.loadMaterial);
        load.castShadow = true;
        load.position.y = 2;
        load.visible = false;
        group.add(load);

        // Four tires at the corners of the car body
        const tireOffsetX = CAR_LENGTH * 0.35; // along car length
        const tireOffsetZ = CAR_WIDTH * 0.5 + 0.3; // just outside car width
        const tireY = 0; // bottom of car
        const tirePositions = [
          { x: tireOffsetX, z: tireOffsetZ },   // front-right
          { x: tireOffsetX, z: -tireOffsetZ },  // front-left
          { x: -tireOffsetX, z: tireOffsetZ },  // rear-right
          { x: -tireOffsetX, z: -tireOffsetZ }, // rear-left
        ];
        for (const tp of tirePositions) {
          const tire = new THREE.Mesh(this.tireGeometry, this.tireMaterial);
          tire.position.set(tp.x, tireY, tp.z);
          tire.castShadow = true;
          group.add(tire);
        }

        scene.add(group);
        this.meshes.set(car.id, group);
      }

      // Toggle load visibility based on car state
      const load = group.children[1];
      load.visible = car.state === CarState.GoingHome;

      // Interpolate position
      const x = lerp(car.prevPixelPos.x, car.pixelPos.x, alpha);
      const y = lerp(car.prevPixelPos.y, car.pixelPos.y, alpha);
      const yPos = car.elevationY > 0 ? car.elevationY : GROUND_Y_POSITION;
      group.position.set(x, yPos, y);

      // Interpolate rotation
      const angle = lerpAngle(car.prevRenderAngle, car.renderAngle, alpha);
      group.rotation.y = -angle;
    }

    // Remove groups for cars no longer in the list
    for (const [id, group] of this.meshes) {
      if (!activeCars.has(id)) {
        scene.remove(group);
        this.meshes.delete(id);
      }
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const [, group] of this.meshes) {
      scene.remove(group);
    }
    this.meshes.clear();
    this.carGeometry.dispose();
    this.loadGeometry.dispose();
    this.loadMaterial.dispose();
    this.tireGeometry.dispose();
    this.tireMaterial.dispose();
    for (const [, mat] of this.materialCache) {
      mat.dispose();
    }
    this.materialCache.clear();
  }
}

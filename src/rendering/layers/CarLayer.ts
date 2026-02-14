import * as THREE from 'three';
import type { Car } from '../../entities/Car';
import { COLOR_MAP, CAR_WIDTH, CAR_LENGTH } from '../../constants';
import type { GameColor } from '../../types';
import { lerp } from '../../utils/math';

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

export class CarLayer {
  private meshes = new Map<string, THREE.Mesh>();
  private materialCache = new Map<GameColor, THREE.MeshStandardMaterial>();
  private carGeometry: THREE.BoxGeometry;

  constructor() {
    // CAR_LENGTH along X, height=2, CAR_WIDTH along Z
    this.carGeometry = new THREE.BoxGeometry(CAR_LENGTH, 2, CAR_WIDTH);
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
    const activeCars = new Set<string>();

    for (const car of cars) {
      activeCars.add(car.id);

      let mesh = this.meshes.get(car.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.carGeometry, this.getMaterial(car.color));
        mesh.castShadow = true;
        scene.add(mesh);
        this.meshes.set(car.id, mesh);
      }

      // Interpolate position
      const x = lerp(car.prevPixelPos.x, car.pixelPos.x, alpha);
      const y = lerp(car.prevPixelPos.y, car.pixelPos.y, alpha);
      mesh.position.set(x, 1, y); // y=1 centers the 2-unit-tall box above ground

      // Interpolate rotation
      const angle = lerpAngle(car.prevRenderAngle, car.renderAngle, alpha);
      mesh.rotation.y = -angle;
    }

    // Remove meshes for cars no longer in the list
    for (const [id, mesh] of this.meshes) {
      if (!activeCars.has(id)) {
        scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const [, mesh] of this.meshes) {
      scene.remove(mesh);
    }
    this.meshes.clear();
    this.carGeometry.dispose();
    for (const [, mat] of this.materialCache) {
      mat.dispose();
    }
    this.materialCache.clear();
  }
}

import * as THREE from 'three';
import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import { COLOR_MAP, CAR_WIDTH, CAR_LENGTH, BRIDGE_Y_POSITION, GROUND_Y_POSITION } from '../../constants';
import type { GameColor } from '../../types';
import { TrafficLevel } from '../../types';
import { lerp } from '../../utils/math';

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

export class CarLayer {
  private meshes = new Map<string, THREE.Group>();
  private materialCache = new Map<GameColor, THREE.MeshStandardMaterial>();
  private carGeometry: THREE.BoxGeometry;
  private loadGeometry: THREE.BoxGeometry;
  private loadMaterial: THREE.MeshStandardMaterial;
  private activeCarIds = new Set<string>();

  constructor() {
    this.carGeometry = new THREE.BoxGeometry(CAR_LENGTH, 2, CAR_WIDTH);
    this.loadGeometry = new THREE.BoxGeometry(4, 2, 3);
    this.loadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
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

        scene.add(group);
        this.meshes.set(car.id, group);
      }

      // Toggle load visibility based on car state
      const load = group.children[1];
      load.visible = car.state === CarState.GoingHome;

      // Interpolate position
      const x = lerp(car.prevPixelPos.x, car.pixelPos.x, alpha);
      const y = lerp(car.prevPixelPos.y, car.pixelPos.y, alpha);
      const elevation = car.currentLevel === TrafficLevel.Bridge ? BRIDGE_Y_POSITION : GROUND_Y_POSITION;
      group.position.set(x, elevation, y);

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
    for (const [, mat] of this.materialCache) {
      mat.dispose();
    }
    this.materialCache.clear();
  }
}

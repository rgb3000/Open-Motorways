import * as THREE from 'three';
import type { GridPos } from '../../types';
import { TILE_SIZE, MOUNTAIN_COLOR, MOUNTAIN_PEAK_COLOR, GROUND_Y_POSITION } from '../../constants';

export class ObstacleLayer {
  private group: THREE.Group | null = null;
  private mountainMat = new THREE.MeshStandardMaterial({ color: MOUNTAIN_COLOR });
  private peakMat = new THREE.MeshStandardMaterial({ color: MOUNTAIN_PEAK_COLOR });

  build(scene: THREE.Scene, mountainCells: GridPos[], heightMap: Map<string, number>): void {
    this.dispose(scene);

    this.group = new THREE.Group();

    for (const pos of mountainCells) {
      const key = `${pos.gx},${pos.gy}`;
      const height = heightMap.get(key) ?? 8;
      const cx = pos.gx * TILE_SIZE + TILE_SIZE / 2;
      const cz = pos.gy * TILE_SIZE + TILE_SIZE / 2;

      const cellGroup = new THREE.Group();

      // Main peak — big, can overflow into neighbors
      const mainScale = 0.7 + Math.random() * 0.5; // 0.7–1.2 of TILE_SIZE
      const mainRadius = TILE_SIZE * mainScale;
      const mainH = height * (1.0 + Math.random() * 0.4);
      const mainGeom = new THREE.ConeGeometry(mainRadius, mainH, 5 + Math.floor(Math.random() * 3));
      const mainCone = new THREE.Mesh(mainGeom, this.mountainMat);
      mainCone.position.set(
        cx + (Math.random() - 0.5) * TILE_SIZE * 0.15,
        GROUND_Y_POSITION + mainH / 2,
        cz + (Math.random() - 0.5) * TILE_SIZE * 0.15,
      );
      mainCone.rotation.y = Math.random() * Math.PI * 2;
      mainCone.castShadow = true;
      mainCone.receiveShadow = true;
      cellGroup.add(mainCone);

      // Secondary peak — different size, offset further
      const secScale = 0.3 + Math.random() * 0.5; // 0.3–0.8
      const secH = height * (0.4 + Math.random() * 0.5);
      const secRadius = TILE_SIZE * secScale;
      const secGeom = new THREE.ConeGeometry(secRadius, secH, 5 + Math.floor(Math.random() * 2));
      const secCone = new THREE.Mesh(secGeom, this.peakMat);
      secCone.position.set(
        cx + (Math.random() - 0.5) * TILE_SIZE * 0.6,
        GROUND_Y_POSITION + secH / 2,
        cz + (Math.random() - 0.5) * TILE_SIZE * 0.6,
      );
      secCone.rotation.y = Math.random() * Math.PI * 2;
      secCone.castShadow = true;
      secCone.receiveShadow = true;
      cellGroup.add(secCone);

      // Third peak for taller mountains — adds more mass
      if (height > 8) {
        const thirdScale = 0.25 + Math.random() * 0.4;
        const thirdH = height * (0.3 + Math.random() * 0.4);
        const thirdRadius = TILE_SIZE * thirdScale;
        const thirdGeom = new THREE.ConeGeometry(thirdRadius, thirdH, 5);
        const thirdCone = new THREE.Mesh(thirdGeom, Math.random() > 0.5 ? this.mountainMat : this.peakMat);
        thirdCone.position.set(
          cx + (Math.random() - 0.5) * TILE_SIZE * 0.7,
          GROUND_Y_POSITION + thirdH / 2,
          cz + (Math.random() - 0.5) * TILE_SIZE * 0.7,
        );
        thirdCone.rotation.y = Math.random() * Math.PI * 2;
        thirdCone.castShadow = true;
        thirdCone.receiveShadow = true;
        cellGroup.add(thirdCone);
      }

      this.group.add(cellGroup);
    }

    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    if (!this.group) return;

    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    scene.remove(this.group);
    this.group = null;
  }

  disposeAll(scene: THREE.Scene): void {
    this.dispose(scene);
    this.mountainMat.dispose();
    this.peakMat.dispose();
  }
}

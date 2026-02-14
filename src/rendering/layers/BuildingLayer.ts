import * as THREE from 'three';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { TILE_SIZE, COLOR_MAP, MAX_DEMAND_PINS } from '../../constants';
import type { GameColor } from '../../types';

export class BuildingLayer {
  private houseMeshes = new Map<string, THREE.Group>();
  private businessMeshes = new Map<string, THREE.Group>();
  private demandPinRefs = new Map<string, THREE.Mesh[]>();

  update(scene: THREE.Scene, houses: House[], businesses: Business[]): void {
    // Add meshes for new houses
    for (const house of houses) {
      if (this.houseMeshes.has(house.id)) continue;

      const group = this.createHouseMesh(house.pos.gx, house.pos.gy, house.color);
      scene.add(group);
      this.houseMeshes.set(house.id, group);
    }

    // Add meshes for new businesses
    for (const biz of businesses) {
      if (!this.businessMeshes.has(biz.id)) {
        const { group, pins } = this.createBusinessMesh(biz.pos.gx, biz.pos.gy, biz.color);
        scene.add(group);
        this.businessMeshes.set(biz.id, group);
        this.demandPinRefs.set(biz.id, pins);
      }

      // Update demand pin visibility
      const pins = this.demandPinRefs.get(biz.id)!;
      for (let i = 0; i < MAX_DEMAND_PINS; i++) {
        pins[i].visible = i < biz.demandPins;
      }
    }
  }

  private createHouseMesh(gx: number, gy: number, color: GameColor): THREE.Group {
    const group = new THREE.Group();
    const hexColor = COLOR_MAP[color];
    const mat = new THREE.MeshStandardMaterial({ color: hexColor });

    const size = TILE_SIZE * 0.75;
    const height = 5;

    // Body
    const bodyGeom = new THREE.BoxGeometry(size, height, size);
    const body = new THREE.Mesh(bodyGeom, mat);
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);

    // Roof (cone with 4 sides = pyramid)
    const roofHeight = 3;
    const roofGeom = new THREE.ConeGeometry(size / 2 * 1.1, roofHeight, 4);
    const roof = new THREE.Mesh(roofGeom, mat);
    roof.position.y = height + roofHeight / 2;
    roof.rotation.y = Math.PI / 4; // Align pyramid edges with box
    roof.castShadow = true;
    group.add(roof);

    // Position in world: pixel center of tile
    const px = gx * TILE_SIZE + TILE_SIZE / 2;
    const py = gy * TILE_SIZE + TILE_SIZE / 2;
    group.position.set(px, 0, py);

    return group;
  }

  private createBusinessMesh(gx: number, gy: number, color: GameColor): { group: THREE.Group; pins: THREE.Mesh[] } {
    const group = new THREE.Group();
    const hexColor = COLOR_MAP[color];
    const mat = new THREE.MeshStandardMaterial({ color: hexColor });

    const radius = TILE_SIZE * 0.38;
    const height = 4;

    // Body (cylinder)
    const bodyGeom = new THREE.CylinderGeometry(radius, radius, height, 16);
    const body = new THREE.Mesh(bodyGeom, mat);
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);

    // Demand pins (pre-create all 8, toggle visibility)
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xE74C3C });
    const pinGeom = new THREE.SphereGeometry(3, 8, 8);
    const ringRadius = radius + 6;
    const pins: THREE.Mesh[] = [];

    for (let i = 0; i < MAX_DEMAND_PINS; i++) {
      const angle = (i / MAX_DEMAND_PINS) * Math.PI * 2 - Math.PI / 2;
      const pin = new THREE.Mesh(pinGeom, pinMat);
      pin.position.set(
        Math.cos(angle) * ringRadius,
        0.5,
        Math.sin(angle) * ringRadius,
      );
      pin.castShadow = true;
      pin.visible = false;
      group.add(pin);
      pins.push(pin);
    }

    // Position in world
    const px = gx * TILE_SIZE + TILE_SIZE / 2;
    const py = gy * TILE_SIZE + TILE_SIZE / 2;
    group.position.set(px, 0, py);

    return { group, pins };
  }

  dispose(scene: THREE.Scene): void {
    for (const [, group] of this.houseMeshes) {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    for (const [, group] of this.businessMeshes) {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    this.houseMeshes.clear();
    this.businessMeshes.clear();
    this.demandPinRefs.clear();
  }
}

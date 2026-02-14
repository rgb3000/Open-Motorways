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
        const { group, pins } = this.createBusinessMesh(biz);
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

  private createBusinessMesh(biz: Business): { group: THREE.Group; pins: THREE.Mesh[] } {
    const group = new THREE.Group();
    const hexColor = COLOR_MAP[biz.color];
    const mat = new THREE.MeshStandardMaterial({ color: hexColor });

    // Building: single-cell box at biz.pos (taller than house)
    const buildingSize = TILE_SIZE * 0.75;
    const buildingHeight = 7;
    const bodyGeom = new THREE.BoxGeometry(buildingSize, buildingHeight, buildingSize);
    const body = new THREE.Mesh(bodyGeom, mat);
    const buildingPx = biz.pos.gx * TILE_SIZE + TILE_SIZE / 2;
    const buildingPz = biz.pos.gy * TILE_SIZE + TILE_SIZE / 2;
    body.position.set(buildingPx, buildingHeight / 2, buildingPz);
    body.castShadow = true;
    group.add(body);

    // Tower on top of building
    const towerSize = TILE_SIZE * 0.3;
    const towerHeight = 3;
    const towerGeom = new THREE.BoxGeometry(towerSize, towerHeight, towerSize);
    const tower = new THREE.Mesh(towerGeom, mat);
    tower.position.set(buildingPx, buildingHeight + towerHeight / 2, buildingPz);
    tower.castShadow = true;
    group.add(tower);

    // Parking lot: flat gray surface at biz.parkingLotPos
    const lotPx = biz.parkingLotPos.gx * TILE_SIZE + TILE_SIZE / 2;
    const lotPz = biz.parkingLotPos.gy * TILE_SIZE + TILE_SIZE / 2;
    const lotSize = TILE_SIZE * 0.9;
    const lotHeight = 0.15;
    const lotMat = new THREE.MeshStandardMaterial({ color: '#888888' });
    const lotGeom = new THREE.BoxGeometry(lotSize, lotHeight, lotSize);
    const lot = new THREE.Mesh(lotGeom, lotMat);
    lot.position.set(lotPx, lotHeight / 2, lotPz);
    lot.receiveShadow = true;
    group.add(lot);

    // Parking slot markings (4 lighter rectangles)
    const slotMat = new THREE.MeshStandardMaterial({ color: '#AAAAAA' });
    const slotW = lotSize * 0.4;
    const slotD = lotSize * 0.4;
    const slotGeom = new THREE.BoxGeometry(slotW, 0.05, slotD);
    const offsets = [
      { x: -lotSize * 0.22, z: -lotSize * 0.22 },
      { x: lotSize * 0.22, z: -lotSize * 0.22 },
      { x: -lotSize * 0.22, z: lotSize * 0.22 },
      { x: lotSize * 0.22, z: lotSize * 0.22 },
    ];
    for (const off of offsets) {
      const slot = new THREE.Mesh(slotGeom, slotMat);
      slot.position.set(lotPx + off.x, lotHeight + 0.03, lotPz + off.z);
      group.add(slot);
    }

    // Demand pins: ring around building cell center
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xE74C3C });
    const pinGeom = new THREE.SphereGeometry(3, 8, 8);
    const ringRadius = buildingSize / 2 + 6;
    const pins: THREE.Mesh[] = [];

    for (let i = 0; i < MAX_DEMAND_PINS; i++) {
      const angle = (i / MAX_DEMAND_PINS) * Math.PI * 2 - Math.PI / 2;
      const pin = new THREE.Mesh(pinGeom, pinMat);
      pin.position.set(
        buildingPx + Math.cos(angle) * ringRadius,
        0.5,
        buildingPz + Math.sin(angle) * ringRadius,
      );
      pin.castShadow = true;
      pin.visible = false;
      group.add(pin);
      pins.push(pin);
    }

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

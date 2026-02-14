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

    const bodyHeight = 4;
    const isHorizontal = biz.orientation === 'horizontal';

    // Main body: box spanning 2 body cells (NOT including connector)
    const bodyWidth = isHorizontal ? TILE_SIZE * 2 * 0.75 : TILE_SIZE * 0.75;
    const bodyDepth = isHorizontal ? TILE_SIZE * 0.75 : TILE_SIZE * 2 * 0.75;
    const bodyGeom = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    const body = new THREE.Mesh(bodyGeom, mat);
    body.position.y = bodyHeight / 2;
    body.castShadow = true;
    group.add(body);

    // Towers: 2 small boxes on top of the body, one per body cell
    const towerSize = TILE_SIZE * 0.25;
    const towerHeight = 3.5;
    const towerGeom = new THREE.BoxGeometry(towerSize, towerHeight, towerSize);
    const towerMat = new THREE.MeshStandardMaterial({ color: hexColor });

    // Tower positions relative to body center (one per body cell)
    const towerOffset = isHorizontal ? TILE_SIZE * 0.35 : 0;
    const towerOffsetZ = isHorizontal ? 0 : TILE_SIZE * 0.35;

    const tower1 = new THREE.Mesh(towerGeom, towerMat);
    tower1.position.set(-towerOffset, bodyHeight + towerHeight / 2, -towerOffsetZ);
    tower1.castShadow = true;
    group.add(tower1);

    const tower2 = new THREE.Mesh(towerGeom, towerMat);
    tower2.position.set(towerOffset, bodyHeight + towerHeight / 2, towerOffsetZ);
    tower2.castShadow = true;
    group.add(tower2);

    // Connector block: full tile-sized grey block at the connector cell
    const connMat = new THREE.MeshStandardMaterial({ color: 0xBDBDBD });
    const connSize = TILE_SIZE * 0.75;
    const connHeight = 2.5;
    const connGeom = new THREE.BoxGeometry(connSize, connHeight, connSize);
    const conn = new THREE.Mesh(connGeom, connMat);

    // Offset from body center to connector cell center (1.5 tiles from anchor, body center is at 0.5 tiles offset)
    let connOffsetX = 0, connOffsetZ = 0;
    if (isHorizontal) {
      // Connector is at gx+2, body center is between gx and gx+1 => offset = +1 tile
      connOffsetX = TILE_SIZE;
    } else {
      // Connector is at gy+2, body center is between gy and gy+1 => offset = +1 tile
      connOffsetZ = TILE_SIZE;
    }
    conn.position.set(connOffsetX, connHeight / 2, connOffsetZ);
    conn.castShadow = true;
    group.add(conn);

    // Demand pins: ring around body center
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xE74C3C });
    const pinGeom = new THREE.SphereGeometry(3, 8, 8);
    const ringRadius = Math.max(bodyWidth, bodyDepth) / 2 + 6;
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

    // Position: midpoint of the 2 body cells (connector hangs off one end)
    let px: number, py: number;
    if (isHorizontal) {
      px = biz.pos.gx * TILE_SIZE + TILE_SIZE;
      py = biz.pos.gy * TILE_SIZE + TILE_SIZE / 2;
    } else {
      px = biz.pos.gx * TILE_SIZE + TILE_SIZE / 2;
      py = biz.pos.gy * TILE_SIZE + TILE_SIZE;
    }
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

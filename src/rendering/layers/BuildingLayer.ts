import * as THREE from 'three';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { TILE_SIZE, COLOR_MAP, MAX_DEMAND_PINS, DEMAND_DEBUG } from '../../constants';
import { Direction } from '../../types';

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

export class BuildingLayer {
  private houseMeshes = new Map<string, THREE.Group>();
  private houseConnectorDirs = new Map<string, Direction>();
  private businessMeshes = new Map<string, THREE.Group>();
  private demandPinRefs = new Map<string, THREE.Mesh[]>();
  private debugSprites = new Map<string, THREE.Sprite>();
  private debugCanvas: HTMLCanvasElement | null = null;
  private debugCtx: CanvasRenderingContext2D | null = null;

  // Cached prototype geometries (created once, cloned on spawn)
  private houseBodyGeom: THREE.ExtrudeGeometry;
  private houseRoofGeom: THREE.ConeGeometry;
  private housePlateGeom: THREE.ExtrudeGeometry;
  private bizBodyGeom: THREE.ExtrudeGeometry;
  private bizTowerGeom: THREE.BoxGeometry;
  private bizChimneyGeom: THREE.ExtrudeGeometry;
  private bizPlateGeomH: THREE.ExtrudeGeometry;
  private bizPlateGeomV: THREE.ExtrudeGeometry;
  private bizLotGeom: THREE.ExtrudeGeometry;
  private bizSlotGeom: THREE.BoxGeometry;
  private bizPinGeom: THREE.CircleGeometry;
  private bizPinOutlineGeom: THREE.RingGeometry;

  // Shared plate noise texture
  private plateNoiseTexture = BuildingLayer.createPlateNoiseTexture();

  private static createPlateNoiseTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    let seed = 31;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; };

    // Low-frequency waviness for non-uniform look
    const low: number[] = [];
    for (let i = 0; i < size * size; i++) {
      const x = i % size;
      const y = (i / size) | 0;
      low.push(Math.sin(x * 0.3 + 1.2) * Math.cos(y * 0.25 + 0.8) * 25
        + Math.sin(x * 0.15 - y * 0.2) * 15);
    }

    for (let i = 0; i < size * size; i++) {
      const fine = (rand() - 0.5) * 40;
      const speckle = rand() < 0.15 ? (rand() - 0.5) * 70 : 0;
      const v = Math.max(0, Math.min(255, 235 + Math.round(low[i] * 0.4 + fine + speckle)));
      const idx = i * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }

  // Cached shared materials
  private plateMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: this.plateNoiseTexture });
  private lotMat = new THREE.MeshStandardMaterial({ color: '#888888' });
  private chimneyMat = new THREE.MeshStandardMaterial({ color: '#666666' });
  private slotMat = new THREE.MeshStandardMaterial({ color: '#CCCCCC' });
  private pinMat = new THREE.MeshBasicMaterial({ color: 0xE74C3C });
  private pinOutlineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

  constructor() {
    const plateSize = TILE_SIZE * 0.7;
    const size = TILE_SIZE * 0.6;
    const height = 5;

    // House body
    const bodyShape = roundedRectShape(size, size, 2);
    this.houseBodyGeom = new THREE.ExtrudeGeometry(bodyShape, { depth: height, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.0, bevelSegments: 3, curveSegments: 4 });
    this.houseBodyGeom.rotateX(-Math.PI / 2);

    // House roof
    this.houseRoofGeom = new THREE.ConeGeometry(size / 2 * 1.1, 3, 4);

    // House plate
    const plateShape = roundedRectShape(plateSize, plateSize, 3);
    this.housePlateGeom = new THREE.ExtrudeGeometry(plateShape, { depth: 1.5, bevelEnabled: true, bevelThickness: 1.0, bevelSize: 1.0, bevelSegments: 3, curveSegments: 4 });
    this.housePlateGeom.rotateX(-Math.PI / 2);

    // Business body
    const buildingSize = TILE_SIZE * 0.6;
    const buildingHeight = 7;
    const bizBodyShape = roundedRectShape(buildingSize, buildingSize, 2);
    this.bizBodyGeom = new THREE.ExtrudeGeometry(bizBodyShape, { depth: buildingHeight, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.0, bevelSegments: 3, curveSegments: 4 });
    this.bizBodyGeom.rotateX(-Math.PI / 2);

    // Business tower
    const towerSize = TILE_SIZE * 0.3;
    this.bizTowerGeom = new THREE.BoxGeometry(towerSize, 3, towerSize);

    // Business chimney
    const chimneyShape = new THREE.Shape();
    chimneyShape.absarc(0, 0, 5, 0, Math.PI * 2, false);
    this.bizChimneyGeom = new THREE.ExtrudeGeometry(chimneyShape, { depth: 4, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.7, bevelSegments: 3, curveSegments: 8 });
    this.bizChimneyGeom.rotateX(-Math.PI / 2);

    // Business plates (horizontal and vertical)
    const plateInset = 2;
    const plateLong = TILE_SIZE * 2 - plateInset - TILE_SIZE * 0.15;
    const plateShort = TILE_SIZE * 0.7;
    const plateH = roundedRectShape(plateLong, plateShort, 3);
    this.bizPlateGeomH = new THREE.ExtrudeGeometry(plateH, { depth: 1.5, bevelEnabled: true, bevelThickness: 1.0, bevelSize: 1.0, bevelSegments: 3, curveSegments: 4 });
    this.bizPlateGeomH.rotateX(-Math.PI / 2);
    const plateV = roundedRectShape(plateShort, plateLong, 3);
    this.bizPlateGeomV = new THREE.ExtrudeGeometry(plateV, { depth: 1.5, bevelEnabled: true, bevelThickness: 1.0, bevelSize: 1.0, bevelSegments: 3, curveSegments: 4 });
    this.bizPlateGeomV.rotateX(-Math.PI / 2);

    // Business lot
    const lotSize = TILE_SIZE * 0.7;
    const lotShape = roundedRectShape(lotSize, lotSize, 3);
    this.bizLotGeom = new THREE.ExtrudeGeometry(lotShape, { depth: 0.15, bevelEnabled: false, curveSegments: 4 });
    this.bizLotGeom.rotateX(-Math.PI / 2);

    // Business slot markings
    const slotW = lotSize * 0.4;
    const slotD = lotSize * 0.4;
    this.bizSlotGeom = new THREE.BoxGeometry(slotW, 0.05, slotD);

    // Demand pins (flat circles with outline)
    this.bizPinGeom = new THREE.CircleGeometry(2.5, 12);
    this.bizPinOutlineGeom = new THREE.RingGeometry(2.5, 3.2, 12);

    this.initSharedResources();
  }

  update(scene: THREE.Scene, houses: House[], businesses: Business[]): void {
    // Add or update meshes for houses
    for (const house of houses) {
      const prevDir = this.houseConnectorDirs.get(house.id);
      if (this.houseMeshes.has(house.id) && prevDir === house.connectorDir) continue;

      // Remove old mesh if connector direction changed
      if (this.houseMeshes.has(house.id)) {
        const oldGroup = this.houseMeshes.get(house.id)!;
        scene.remove(oldGroup);
        this.disposeGroup(oldGroup);
      }

      const group = this.createHouseMesh(house);
      scene.add(group);
      this.houseMeshes.set(house.id, group);
      this.houseConnectorDirs.set(house.id, house.connectorDir);
    }

    // Add meshes for new businesses
    for (const biz of businesses) {
      if (!this.businessMeshes.has(biz.id)) {
        const { group, pins } = this.createBusinessMesh(biz);
        scene.add(group);
        this.businessMeshes.set(biz.id, group);
        this.demandPinRefs.set(biz.id, pins);
      }

      // Update demand pin visibility and pulse when near max
      const pins = this.demandPinRefs.get(biz.id)!;
      const shouldPulse = biz.demandPins >= MAX_DEMAND_PINS - 2;
      const pulseScale = shouldPulse ? 1 + 0.25 * Math.sin(Date.now() * 0.006) : 1;
      for (let i = 0; i < MAX_DEMAND_PINS; i++) {
        const visible = i < biz.demandPins;
        pins[i].visible = visible;
        const outline = (pins[i] as any)._outline as THREE.Mesh | undefined;
        if (outline) outline.visible = visible;
        if (visible && shouldPulse) {
          pins[i].scale.set(pulseScale, pulseScale, 1);
          if (outline) outline.scale.set(pulseScale, pulseScale, 1);
        } else if (visible) {
          pins[i].scale.set(1, 1, 1);
          if (outline) outline.scale.set(1, 1, 1);
        }
      }
    }

    // Per-business debug labels
    if (DEMAND_DEBUG) {
      if (!this.debugCanvas) {
        this.debugCanvas = document.createElement('canvas');
        this.debugCanvas.width = 128;
        this.debugCanvas.height = 32;
        this.debugCtx = this.debugCanvas.getContext('2d')!;
      }
      const tmpCanvas = this.debugCanvas!;
      const ctx = this.debugCtx!;

      for (const biz of businesses) {
        const ageMin = (biz.age / 60).toFixed(1);
        const text = `${ageMin}m | ${biz.pinOutputRate.toFixed(1)}/m`;

        // Draw text onto shared scratch canvas
        ctx.clearRect(0, 0, 128, 32);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 128, 32);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 16);

        let sprite = this.debugSprites.get(biz.id);
        if (!sprite) {
          // Each sprite gets its own canvas so textures are independent
          const ownCanvas = document.createElement('canvas');
          ownCanvas.width = 128;
          ownCanvas.height = 32;
          const ownCtx = ownCanvas.getContext('2d')!;
          ownCtx.drawImage(tmpCanvas, 0, 0);
          const tex = new THREE.CanvasTexture(ownCanvas);
          const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
          sprite = new THREE.Sprite(mat);
          sprite.scale.set(40, 10, 1);
          scene.add(sprite);
          this.debugSprites.set(biz.id, sprite);
        } else {
          // Update existing sprite's canvas
          const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
          const ownCanvas = tex.image as HTMLCanvasElement;
          const ownCtx = ownCanvas.getContext('2d')!;
          ownCtx.clearRect(0, 0, 128, 32);
          ownCtx.drawImage(tmpCanvas, 0, 0);
          tex.needsUpdate = true;
        }

        const px = biz.pos.gx * TILE_SIZE + TILE_SIZE / 2;
        const pz = biz.pos.gy * TILE_SIZE + TILE_SIZE / 2;
        sprite.position.set(px + 10, 2, pz + 15);
      }
    }
  }

  private createHouseMesh(house: House): THREE.Group {
    const group = new THREE.Group();
    const hexColor = COLOR_MAP[house.color];
    const mat = new THREE.MeshStandardMaterial({ color: hexColor });

    // Body (cloned from prototype)
    const body = new THREE.Mesh(this.houseBodyGeom.clone(), mat);
    body.castShadow = true;
    group.add(body);

    // Roof (cloned from prototype)
    const roof = new THREE.Mesh(this.houseRoofGeom.clone(), mat);
    roof.position.y = 5 + 3 / 2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Ground plate (cloned from prototype)
    const plate = new THREE.Mesh(this.housePlateGeom.clone(), this.plateMat);
    plate.position.set(0, 0.05, 0);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    // Position in world
    const px = house.pos.gx * TILE_SIZE + TILE_SIZE / 2;
    const pz = house.pos.gy * TILE_SIZE + TILE_SIZE / 2;
    group.position.set(px, 0, pz);

    return group;
  }

  private createBusinessMesh(biz: Business): { group: THREE.Group; pins: THREE.Mesh[] } {
    const group = new THREE.Group();
    const hexColor = COLOR_MAP[biz.color];
    const mat = new THREE.MeshStandardMaterial({ color: hexColor });

    const buildingSize = TILE_SIZE * 0.75;
    const buildingHeight = 7;
    const buildingPx = biz.pos.gx * TILE_SIZE + TILE_SIZE / 2;
    const buildingPz = biz.pos.gy * TILE_SIZE + TILE_SIZE / 2;

    // Body (cloned from prototype)
    const body = new THREE.Mesh(this.bizBodyGeom.clone(), mat);
    body.position.set(buildingPx, 0, buildingPz);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Tower (cloned from prototype)
    const tower = new THREE.Mesh(this.bizTowerGeom.clone(), mat);
    tower.position.set(buildingPx, buildingHeight + 3 / 2, buildingPz);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    // Chimney
    const chimney = new THREE.Mesh(this.bizChimneyGeom, mat);
    chimney.position.set(buildingPx + buildingSize * 0.25, buildingHeight + 2, buildingPz - buildingSize * 0.25);
    chimney.castShadow = true;
    group.add(chimney);

    // Background plate (use pre-built horizontal or vertical variant)
    const isHoriz = biz.orientation === 'horizontal';
    const plateProto = isHoriz ? this.bizPlateGeomH : this.bizPlateGeomV;
    const plate = new THREE.Mesh(plateProto.clone(), this.plateMat);
    const lotCx = biz.parkingLotPos.gx * TILE_SIZE + TILE_SIZE / 2;
    const lotCz = biz.parkingLotPos.gy * TILE_SIZE + TILE_SIZE / 2;
    plate.position.set((buildingPx + lotCx) / 2, 0.05, (buildingPz + lotCz) / 2);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    // Parking lot (cloned from prototype)
    const lotPx = biz.parkingLotPos.gx * TILE_SIZE + TILE_SIZE / 2;
    const lotPz = biz.parkingLotPos.gy * TILE_SIZE + TILE_SIZE / 2;
    const lotSize = TILE_SIZE * 0.7;
    const lot = new THREE.Mesh(this.bizLotGeom.clone(), this.lotMat);
    lot.position.set(lotPx, 0, lotPz);
    lot.receiveShadow = true;
    group.add(lot);

    // Parking slot markings (shared geometry + material)
    const offsets = [
      { x: -lotSize * 0.22, z: -lotSize * 0.22 },
      { x: lotSize * 0.22, z: -lotSize * 0.22 },
      { x: -lotSize * 0.22, z: lotSize * 0.22 },
      { x: lotSize * 0.22, z: lotSize * 0.22 },
    ];
    for (const off of offsets) {
      const slot = new THREE.Mesh(this.bizSlotGeom, this.slotMat);
      slot.position.set(lotPx + off.x, 0.15 + 0.03, lotPz + off.z);
      group.add(slot);
    }

    // Demand pins — flat circles in a row on top of the building
    const pinSpacing = 8;
    const totalWidth = (MAX_DEMAND_PINS - 1) * pinSpacing;
    const pinY = buildingHeight + 3 + 1.6; // above tower
    const pins: THREE.Mesh[] = [];
    for (let i = 0; i < MAX_DEMAND_PINS; i++) {
      const px = buildingPx - totalWidth / 2 + i * pinSpacing;
      const pz = buildingPz;

      // White outline ring
      const outline = new THREE.Mesh(this.bizPinOutlineGeom, this.pinOutlineMat);
      outline.rotation.x = -Math.PI / 2;
      outline.position.set(px, pinY + 0.01, pz);
      outline.visible = false;
      group.add(outline);

      // Red fill circle
      const pin = new THREE.Mesh(this.bizPinGeom, this.pinMat);
      pin.rotation.x = -Math.PI / 2;
      pin.position.set(px, pinY + 0.02, pz);
      pin.visible = false;
      // Store reference to outline so we can toggle both
      (pin as any)._outline = outline;
      group.add(pin);
      pins.push(pin);
    }

    return { group, pins };
  }

  private sharedResources = new Set<THREE.Material | THREE.BufferGeometry>();

  private initSharedResources(): void {
    this.sharedResources.add(this.plateMat);
    this.sharedResources.add(this.lotMat);
    this.sharedResources.add(this.slotMat);
    this.sharedResources.add(this.pinMat);
    this.sharedResources.add(this.chimneyMat);
    this.sharedResources.add(this.bizChimneyGeom);
    this.sharedResources.add(this.bizSlotGeom);
    this.sharedResources.add(this.bizPinGeom);
    this.sharedResources.add(this.bizPinOutlineGeom);
    this.sharedResources.add(this.pinOutlineMat);
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (!this.sharedResources.has(obj.geometry)) obj.geometry.dispose();
        const mat = obj.material as THREE.Material;
        if (!this.sharedResources.has(mat)) mat.dispose();
      }
    });
  }

  dispose(scene: THREE.Scene): void {
    for (const [, group] of this.houseMeshes) {
      scene.remove(group);
      this.disposeGroup(group);
    }
    for (const [, group] of this.businessMeshes) {
      scene.remove(group);
      this.disposeGroup(group);
    }
    for (const [, sprite] of this.debugSprites) {
      scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      sprite.material.dispose();
    }
    this.debugSprites.clear();
    this.houseMeshes.clear();
    this.businessMeshes.clear();
    this.demandPinRefs.clear();

    // Dispose prototype geometries and shared materials
    this.houseBodyGeom.dispose();
    this.houseRoofGeom.dispose();
    this.housePlateGeom.dispose();
    this.bizBodyGeom.dispose();
    this.bizTowerGeom.dispose();
    this.bizPlateGeomH.dispose();
    this.bizPlateGeomV.dispose();
    this.bizLotGeom.dispose();
    this.bizChimneyGeom.dispose();
    this.bizSlotGeom.dispose();
    this.bizPinGeom.dispose();
    this.bizPinOutlineGeom.dispose();
    this.pinOutlineMat.dispose();
    this.plateMat.dispose();
    this.plateNoiseTexture.dispose();
    this.lotMat.dispose();
    this.slotMat.dispose();
    this.pinMat.dispose();
    this.chimneyMat.dispose();
  }
}

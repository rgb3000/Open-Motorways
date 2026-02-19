import * as THREE from 'three';
import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { TILE_SIZE, COLOR_MAP, MAX_DEMAND_PINS, DEMAND_DEBUG, CAR_LENGTH, CAR_WIDTH, CARS_PER_HOUSE, LANE_OFFSET, BIZ_BUILDING_CROSS, BIZ_BUILDING_ALONG, BIZ_SLOT_CROSS, BIZ_SLOT_ALONG } from '../../constants';
import { Direction } from '../../types';
import { DIRECTION_OFFSETS } from '../../utils/direction';
import { getBusinessLayout } from '../../utils/businessLayout';

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
  private parkedCarMeshes = new Map<string, THREE.Group[]>();
  private businessMeshes = new Map<string, THREE.Group>();
  private demandPinRefs = new Map<string, THREE.Mesh[]>();
  private debugSprites = new Map<string, THREE.Sprite>();
  private debugCanvas: HTMLCanvasElement | null = null;
  private debugCtx: CanvasRenderingContext2D | null = null;

  // Cached prototype geometries (created once, cloned on spawn)
  private houseBodyGeom: THREE.ExtrudeGeometry;
  private houseRoofGeom: THREE.ConeGeometry;
  private housePlateGeom: THREE.ExtrudeGeometry;
  private bizBodyGeomH: THREE.ExtrudeGeometry;
  private bizBodyGeomV: THREE.ExtrudeGeometry;
  private bizTowerGeom: THREE.BoxGeometry;
  private bizChimneyGeom: THREE.ExtrudeGeometry;
  private bizPlateGeomH: THREE.ExtrudeGeometry;
  private bizPlateGeomV: THREE.ExtrudeGeometry;
  private bizSlotGeom: THREE.BoxGeometry;
  private bizPinGeom: THREE.SphereGeometry;
  private bizPinOutlineGeom: THREE.CircleGeometry;
  private bizSlotOutlineGeom: THREE.BufferGeometry;
  private bizSlotOutlineGeomH: THREE.BufferGeometry;

  // Parked car prototype geometries (simplified pickup truck)
  private parkedCabGeom: THREE.ExtrudeGeometry;
  private parkedBedGeom: THREE.ExtrudeGeometry;
  private parkedBedSideGeom: THREE.BoxGeometry;
  private parkedBedRearGeom: THREE.BoxGeometry;

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
  private chimneyMat = new THREE.MeshStandardMaterial({ color: '#666666' });
  private slotMat = new THREE.MeshStandardMaterial({ color: '#CCCCCC' });
  private bizOutlineMat = new THREE.MeshBasicMaterial({ color: '#666666', side: THREE.DoubleSide });
  private bizSlotLineMat = new THREE.LineBasicMaterial({ color: '#666666' });

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
    this.housePlateGeom = new THREE.ExtrudeGeometry(plateShape, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 3, curveSegments: 4 });
    this.housePlateGeom.rotateX(-Math.PI / 2);

    // Business body (rectangular: wider on cross-axis, shorter on along-axis)
    const bizCross = TILE_SIZE * BIZ_BUILDING_CROSS;
    const bizAlong = TILE_SIZE * BIZ_BUILDING_ALONG;
    const buildingHeight = 14;
    // Horizontal: along=X, cross=Z → shape(along, cross) → shape(w=along, h=cross)
    const bizBodyShapeH = roundedRectShape(bizAlong, bizCross, 2);
    this.bizBodyGeomH = new THREE.ExtrudeGeometry(bizBodyShapeH, { depth: buildingHeight, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.0, bevelSegments: 3, curveSegments: 4 });
    this.bizBodyGeomH.rotateX(-Math.PI / 2);
    // Vertical: along=Z, cross=X → shape(w=cross, h=along)
    const bizBodyShapeV = roundedRectShape(bizCross, bizAlong, 2);
    this.bizBodyGeomV = new THREE.ExtrudeGeometry(bizBodyShapeV, { depth: buildingHeight, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.0, bevelSegments: 3, curveSegments: 4 });
    this.bizBodyGeomV.rotateX(-Math.PI / 2);

    // Business tower
    const towerSize = TILE_SIZE * 0.3;
    this.bizTowerGeom = new THREE.BoxGeometry(towerSize, 5, towerSize);

    // Business chimney
    const chimneyShape = new THREE.Shape();
    chimneyShape.absarc(0, 0, 5, 0, Math.PI * 2, false);
    this.bizChimneyGeom = new THREE.ExtrudeGeometry(chimneyShape, { depth: 12, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.7, bevelSegments: 3, curveSegments: 8 });
    this.bizChimneyGeom.rotateX(-Math.PI / 2);

    // Business plates (horizontal and vertical)
    const plateInset = 2;
    const plateLong = TILE_SIZE * 2 - plateInset - TILE_SIZE * 0.15;
    const plateShort = TILE_SIZE * 0.7;
    const plateH = roundedRectShape(plateLong, plateShort, 3);
    this.bizPlateGeomH = new THREE.ExtrudeGeometry(plateH, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 3, curveSegments: 4 });
    this.bizPlateGeomH.rotateX(-Math.PI / 2);
    const plateV = roundedRectShape(plateShort, plateLong, 3);
    this.bizPlateGeomV = new THREE.ExtrudeGeometry(plateV, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 3, curveSegments: 4 });
    this.bizPlateGeomV.rotateX(-Math.PI / 2);

    // Business slot markings (new 1x4 row layout)
    const slotW = TILE_SIZE * BIZ_SLOT_CROSS;
    const slotD = TILE_SIZE * BIZ_SLOT_ALONG;
    this.bizSlotGeom = new THREE.BoxGeometry(slotW, 0.05, slotD);

    // Demand pins (3D spheres)
    this.bizPinGeom = new THREE.SphereGeometry(3.5, 16, 12);

    // Pin outline (grey filled circles on ground plate)
    this.bizPinOutlineGeom = new THREE.CircleGeometry(3, 16);
    this.bizPinOutlineGeom.rotateX(-Math.PI / 2);

    // Slot outline (border-only rectangles) — vertical variant (slotW x slotD)
    const slotOutlineBoxGeom = new THREE.BoxGeometry(slotW, 0.01, slotD);
    this.bizSlotOutlineGeom = new THREE.EdgesGeometry(slotOutlineBoxGeom);
    slotOutlineBoxGeom.dispose();
    // Horizontal variant (slotD x slotW) — swapped
    const slotOutlineBoxGeomH = new THREE.BoxGeometry(slotD, 0.01, slotW);
    this.bizSlotOutlineGeomH = new THREE.EdgesGeometry(slotOutlineBoxGeomH);
    slotOutlineBoxGeomH.dispose();

    // Parked car geometries (simplified pickup truck matching CarLayer style)
    const parkedCabLen = CAR_LENGTH * 0.38;
    const parkedCabShape = roundedRectShape(parkedCabLen, CAR_WIDTH, 1);
    this.parkedCabGeom = new THREE.ExtrudeGeometry(parkedCabShape, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2, curveSegments: 3 });
    this.parkedCabGeom.rotateX(-Math.PI / 2);

    const parkedBedLen = CAR_LENGTH * 0.52;
    const parkedBedShape = roundedRectShape(parkedBedLen, CAR_WIDTH, 0.8);
    this.parkedBedGeom = new THREE.ExtrudeGeometry(parkedBedShape, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1, curveSegments: 3 });
    this.parkedBedGeom.rotateX(-Math.PI / 2);

    this.parkedBedSideGeom = new THREE.BoxGeometry(parkedBedLen * 0.9, 2.0, 0.6);
    this.parkedBedRearGeom = new THREE.BoxGeometry(0.6, 2.0, CAR_WIDTH * 0.75);

    this.initSharedResources();
  }

  update(scene: THREE.Scene, houses: House[], businesses: Business[]): void {
    // Remove meshes for deleted houses
    const houseIds = new Set(houses.map(h => h.id));
    for (const [id, group] of this.houseMeshes) {
      if (!houseIds.has(id)) {
        scene.remove(group);
        this.disposeGroup(group);
        this.houseMeshes.delete(id);
        this.houseConnectorDirs.delete(id);
        this.parkedCarMeshes.delete(id);
      }
    }

    // Remove meshes for deleted businesses
    const bizIds = new Set(businesses.map(b => b.id));
    for (const [id, group] of this.businessMeshes) {
      if (!bizIds.has(id)) {
        scene.remove(group);
        this.disposeGroup(group);
        this.businessMeshes.delete(id);
        this.demandPinRefs.delete(id);
        const sprite = this.debugSprites.get(id);
        if (sprite) {
          scene.remove(sprite);
          (sprite.material as THREE.SpriteMaterial).map?.dispose();
          sprite.material.dispose();
          this.debugSprites.delete(id);
        }
      }
    }

    // Add or update meshes for houses
    for (const house of houses) {
      const prevDir = this.houseConnectorDirs.get(house.id);
      if (this.houseMeshes.has(house.id) && prevDir === house.connectorDir) {
        // Just update parked car visibility
        const parkedCars = this.parkedCarMeshes.get(house.id);
        if (parkedCars) {
          for (let i = 0; i < parkedCars.length; i++) {
            parkedCars[i].visible = i < house.availableCars;
          }
        }
        continue;
      }

      // Remove old mesh if connector direction changed
      if (this.houseMeshes.has(house.id)) {
        const oldGroup = this.houseMeshes.get(house.id)!;
        scene.remove(oldGroup);
        this.disposeGroup(oldGroup);
      }

      const { group, parkedCars } = this.createHouseMesh(house);
      scene.add(group);
      this.houseMeshes.set(house.id, group);
      this.houseConnectorDirs.set(house.id, house.connectorDir);
      this.parkedCarMeshes.set(house.id, parkedCars);

      // Set initial visibility
      for (let i = 0; i < parkedCars.length; i++) {
        parkedCars[i].visible = i < house.availableCars;
      }
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
        if (visible && shouldPulse) {
          pins[i].scale.set(pulseScale, pulseScale, pulseScale);
        } else if (visible) {
          pins[i].scale.set(1, 1, 1);
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

  private createHouseMesh(house: House): { group: THREE.Group; parkedCars: THREE.Group[] } {
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

    // Parked car indicators (simplified pickup trucks sticking out toward connector)
    const parkedCars: THREE.Group[] = [];
    const off = DIRECTION_OFFSETS[house.connectorDir];
    // Direction vector in 3D: x = off.gx, z = off.gy
    const dirX = off.gx;
    const dirZ = off.gy;
    // Perpendicular vector (rotate 90 degrees clockwise in xz plane)
    const perpX = -dirZ;
    const perpZ = dirX;
    // Rotation angle: car mesh is built along local X axis
    const angle = Math.atan2(dirZ, dirX);

    const cabOffsetX = CAR_LENGTH * 0.18;
    const bedOffsetX = -CAR_LENGTH * 0.20;
    const sideY = 1.2;
    const sideZ = CAR_WIDTH * 0.42;

    for (let i = 0; i < CARS_PER_HOUSE; i++) {
      const carGroup = new THREE.Group();

      // Cab
      const cab = new THREE.Mesh(this.parkedCabGeom, mat);
      cab.position.x = cabOffsetX;
      carGroup.add(cab);

      // Bed floor
      const bed = new THREE.Mesh(this.parkedBedGeom, mat);
      bed.position.x = bedOffsetX;
      carGroup.add(bed);

      // Bed side walls
      const leftWall = new THREE.Mesh(this.parkedBedSideGeom, mat);
      leftWall.position.set(bedOffsetX, sideY, sideZ);
      carGroup.add(leftWall);
      const rightWall = new THREE.Mesh(this.parkedBedSideGeom, mat);
      rightWall.position.set(bedOffsetX, sideY, -sideZ);
      carGroup.add(rightWall);

      // Bed rear wall
      const rearWall = new THREE.Mesh(this.parkedBedRearGeom, mat);
      rearWall.position.set(bedOffsetX - CAR_LENGTH * 0.24, sideY, 0);
      carGroup.add(rearWall);

      // Position: offset along connector direction, staggered laterally
      const lateralOffset = (i === 0 ? -1 : 1) * LANE_OFFSET;
      const alongOffset = TILE_SIZE * 0.3; // push car center toward connector
      carGroup.position.set(
        dirX * alongOffset + perpX * lateralOffset,
        0.8, // ground Y
        dirZ * alongOffset + perpZ * lateralOffset,
      );
      carGroup.rotation.y = -angle;

      group.add(carGroup);
      parkedCars.push(carGroup);
    }

    // Position in world
    const px = house.pos.gx * TILE_SIZE + TILE_SIZE / 2;
    const pz = house.pos.gy * TILE_SIZE + TILE_SIZE / 2;
    group.position.set(px, 0, pz);

    return { group, parkedCars };
  }

  private createBusinessMesh(biz: Business): { group: THREE.Group; pins: THREE.Mesh[] } {
    const group = new THREE.Group();
    const hexColor = COLOR_MAP[biz.color];
    const mat = new THREE.MeshStandardMaterial({ color: hexColor });

    const layout = getBusinessLayout({
      buildingPos: biz.pos,
      parkingLotPos: biz.parkingLotPos,
      orientation: biz.orientation,
      connectorSide: biz.connectorSide,
    });

    const buildingHeight = 14;
    const isHoriz = biz.orientation === 'horizontal';

    // Body (rectangular, orientation-aware)
    const bodyProto = isHoriz ? this.bizBodyGeomH : this.bizBodyGeomV;
    const body = new THREE.Mesh(bodyProto.clone(), mat);
    body.position.set(layout.building.centerX, 0, layout.building.centerZ);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Tower
    const tower = new THREE.Mesh(this.bizTowerGeom.clone(), mat);
    tower.position.set(layout.building.centerX, buildingHeight + 5 / 2, layout.building.centerZ);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    // Chimney
    const chimneyOffX = layout.building.width * 0.35;
    const chimneyOffZ = -layout.building.depth * 0.35;
    const chimney = new THREE.Mesh(this.bizChimneyGeom, mat);
    chimney.position.set(layout.building.centerX + chimneyOffX, buildingHeight + 3, layout.building.centerZ + chimneyOffZ);
    chimney.castShadow = true;
    group.add(chimney);

    // Background plate
    const plateProto = isHoriz ? this.bizPlateGeomH : this.bizPlateGeomV;
    const plate = new THREE.Mesh(plateProto.clone(), this.plateMat);
    plate.position.set(layout.groundPlate.centerX, 0.05, layout.groundPlate.centerZ);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    // Pin outlines (grey circles on ground plate surface)
    const outlineY = 0.05 + 0.8 + 0.6 + 0.05; // plate base + depth + bevelThickness + offset
    for (const pin of layout.pinSlots) {
      const outline = new THREE.Mesh(this.bizPinOutlineGeom, this.bizOutlineMat);
      outline.position.set(pin.x, outlineY, pin.z);
      group.add(outline);
    }

    // Parking slot outlines (grey border rectangles on ground plate surface)
    const slotOutlineGeom = isHoriz ? this.bizSlotOutlineGeomH : this.bizSlotOutlineGeom;
    for (const slot of layout.parkingSlots) {
      const outline = new THREE.LineSegments(slotOutlineGeom, this.bizSlotLineMat);
      outline.position.set(slot.centerX, outlineY, slot.centerZ);
      group.add(outline);
    }

    // Per-business pin material (matches business color, shiny)
    const pinMat = new THREE.MeshStandardMaterial({
      color: hexColor, metalness: 0.6, roughness: 0.25,
      emissive: hexColor, emissiveIntensity: 0.15,
    });
    group.userData.pinMat = pinMat;

    // Demand pins — 3D spheres at pin slot positions
    const pinY = 5;
    const pins: THREE.Mesh[] = [];
    for (let i = 0; i < MAX_DEMAND_PINS; i++) {
      const pinPos = layout.pinSlots[i];
      const pin = new THREE.Mesh(this.bizPinGeom, pinMat);
      pin.position.set(pinPos.x, pinY, pinPos.z);
      pin.castShadow = true;
      pin.visible = false;
      group.add(pin);
      pins.push(pin);
    }

    return { group, pins };
  }

  private sharedResources = new Set<THREE.Material | THREE.BufferGeometry>();

  private initSharedResources(): void {
    this.sharedResources.add(this.plateMat);
    this.sharedResources.add(this.slotMat);
    this.sharedResources.add(this.chimneyMat);
    this.sharedResources.add(this.bizOutlineMat);
    this.sharedResources.add(this.bizChimneyGeom);
    this.sharedResources.add(this.bizSlotGeom);
    this.sharedResources.add(this.bizPinGeom);
    this.sharedResources.add(this.bizPinOutlineGeom);
    this.sharedResources.add(this.bizSlotOutlineGeom);
    this.sharedResources.add(this.bizSlotOutlineGeomH);
    this.sharedResources.add(this.parkedCabGeom);
    this.sharedResources.add(this.parkedBedGeom);
    this.sharedResources.add(this.parkedBedSideGeom);
    this.sharedResources.add(this.parkedBedRearGeom);
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        if (!this.sharedResources.has(obj.geometry)) obj.geometry.dispose();
        const mat = obj.material as THREE.Material;
        if (!this.sharedResources.has(mat)) mat.dispose();
      }
    });
    // Dispose per-business pin material if present
    if (group.userData.pinMat) {
      (group.userData.pinMat as THREE.Material).dispose();
    }
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
    this.parkedCarMeshes.clear();
    this.businessMeshes.clear();
    this.demandPinRefs.clear();

    // Dispose prototype geometries and shared materials
    this.houseBodyGeom.dispose();
    this.houseRoofGeom.dispose();
    this.housePlateGeom.dispose();
    this.bizBodyGeomH.dispose();
    this.bizBodyGeomV.dispose();
    this.bizTowerGeom.dispose();
    this.bizPlateGeomH.dispose();
    this.bizPlateGeomV.dispose();
    this.bizChimneyGeom.dispose();
    this.bizSlotGeom.dispose();
    this.bizPinGeom.dispose();
    this.bizPinOutlineGeom.dispose();
    this.bizSlotOutlineGeom.dispose();
    this.bizSlotOutlineGeomH.dispose();
    this.plateMat.dispose();
    this.plateNoiseTexture.dispose();
    this.slotMat.dispose();
    this.chimneyMat.dispose();
    this.bizOutlineMat.dispose();
    this.bizSlotLineMat.dispose();
    this.parkedCabGeom.dispose();
    this.parkedBedGeom.dispose();
    this.parkedBedSideGeom.dispose();
    this.parkedBedRearGeom.dispose();
  }
}

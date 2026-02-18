import * as THREE from 'three';
import type { Highway } from '../../highways/types';
import type { HighwaySystem } from '../../systems/HighwaySystem';
import { HIGHWAY_HALF_WIDTH, HIGHWAY_SURFACE_Y, HIGHWAY_COLOR_HEX, TILE_SIZE } from '../../constants';
import { Tool } from '../../types';
import type { HighwayPlacementState } from '../../input/HighwayDrawer';

const CONTROL_POINT_RADIUS = 8;
const CONTROL_POINT_SEGMENTS = 16;
const GUIDE_LINE_Y = HIGHWAY_SURFACE_Y + 0.3;
const PREVIEW_MARKER_RADIUS = TILE_SIZE * 0.3;

export class HighwayLayer {
  private group: THREE.Group | null = null;
  private highwaySurfaceMat = new THREE.MeshStandardMaterial({
    color: HIGHWAY_COLOR_HEX,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  private cpMat = new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false });
  private guideLineMat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
  private previewMat = new THREE.MeshBasicMaterial({ color: HIGHWAY_COLOR_HEX, transparent: true, opacity: 0.4, depthTest: false });
  private cpGeom = new THREE.SphereGeometry(CONTROL_POINT_RADIUS, CONTROL_POINT_SEGMENTS, CONTROL_POINT_SEGMENTS);
  private previewGeom = new THREE.RingGeometry(PREVIEW_MARKER_RADIUS * 0.7, PREVIEW_MARKER_RADIUS, 32);

  update(
    scene: THREE.Scene,
    highwaySystem: HighwaySystem,
    activeTool: Tool,
    placementState: HighwayPlacementState | null,
  ): void {
    this.clearFromScene(scene);

    const group = new THREE.Group();

    // Render all existing highways
    for (const hw of highwaySystem.getAll()) {
      this.buildHighwayMesh(group, hw);
    }

    // Render placement preview
    if (activeTool === Tool.Highway && placementState) {
      if (placementState.phase === 'awaiting-second-click' && placementState.firstPos) {
        // Show marker on first click cell
        const marker = new THREE.Mesh(this.previewGeom, this.previewMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(
          (placementState.firstPos.gx + 0.5) * TILE_SIZE,
          GUIDE_LINE_Y,
          (placementState.firstPos.gy + 0.5) * TILE_SIZE,
        );
        marker.renderOrder = 999;
        group.add(marker);
      }

      if (placementState.phase === 'placing' && placementState.activeHighwayId) {
        const hw = highwaySystem.getById(placementState.activeHighwayId);
        if (hw) {
          // Control point handles
          this.addControlPointHandle(group, hw.cp1.x, hw.cp1.y);
          this.addControlPointHandle(group, hw.cp2.x, hw.cp2.y);

          // Guide lines from endpoints to control points
          const fromX = (hw.fromPos.gx + 0.5) * TILE_SIZE;
          const fromZ = (hw.fromPos.gy + 0.5) * TILE_SIZE;
          const toX = (hw.toPos.gx + 0.5) * TILE_SIZE;
          const toZ = (hw.toPos.gy + 0.5) * TILE_SIZE;

          this.addGuideLine(group, fromX, fromZ, hw.cp1.x, hw.cp1.y);
          this.addGuideLine(group, toX, toZ, hw.cp2.x, hw.cp2.y);
        }
      }
    }

    this.group = group;
    scene.add(group);
  }

  private buildHighwayMesh(group: THREE.Group, hw: Highway): void {
    const polyline = hw.polyline;
    if (polyline.length < 2) return;

    // Convert polyline to 3D center points
    const center: THREE.Vector3[] = polyline.map(
      p => new THREE.Vector3(p.x, HIGHWAY_SURFACE_Y, p.y),
    );
    const n = center.length;

    const leftPts: { x: number; z: number }[] = [];
    const rightPts: { x: number; z: number }[] = [];

    for (let i = 0; i < n; i++) {
      let tx: number, tz: number;
      if (i === 0) {
        tx = center[1].x - center[0].x;
        tz = center[1].z - center[0].z;
      } else if (i === n - 1) {
        tx = center[n - 1].x - center[n - 2].x;
        tz = center[n - 1].z - center[n - 2].z;
      } else {
        tx = center[i + 1].x - center[i - 1].x;
        tz = center[i + 1].z - center[i - 1].z;
      }
      const len = Math.sqrt(tx * tx + tz * tz);
      if (len > 0) { tx /= len; tz /= len; }

      const px = -tz, pz = tx;
      leftPts.push({ x: center[i].x + px * HIGHWAY_HALF_WIDTH, z: center[i].z + pz * HIGHWAY_HALF_WIDTH });
      rightPts.push({ x: center[i].x - px * HIGHWAY_HALF_WIDTH, z: center[i].z - pz * HIGHWAY_HALF_WIDTH });
    }

    // Build shape in (worldX, -worldZ) space
    const shape = new THREE.Shape();
    shape.moveTo(leftPts[0].x, -leftPts[0].z);
    for (let i = 1; i < leftPts.length; i++) {
      shape.lineTo(leftPts[i].x, -leftPts[i].z);
    }
    for (let i = rightPts.length - 1; i >= 0; i--) {
      shape.lineTo(rightPts[i].x, -rightPts[i].z);
    }

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.6,
      bevelEnabled: true,
      bevelThickness: 0.15,
      bevelSize: 0.15,
      bevelSegments: 2,
      curveSegments: 1,
    });
    const mesh = new THREE.Mesh(geom, this.highwaySurfaceMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = HIGHWAY_SURFACE_Y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  private addControlPointHandle(group: THREE.Group, x: number, z: number): void {
    const sphere = new THREE.Mesh(this.cpGeom, this.cpMat);
    sphere.position.set(x, GUIDE_LINE_Y, z);
    sphere.renderOrder = 999;
    group.add(sphere);
  }

  private addGuideLine(group: THREE.Group, x1: number, z1: number, x2: number, z2: number): void {
    const pts = [
      new THREE.Vector3(x1, GUIDE_LINE_Y, z1),
      new THREE.Vector3(x2, GUIDE_LINE_Y, z2),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geom, this.guideLineMat);
    line.renderOrder = 998;
    group.add(line);
  }

  private clearFromScene(scene: THREE.Scene): void {
    if (this.group) {
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
          // Don't dispose shared geometries
          if (obj.geometry !== this.cpGeom && obj.geometry !== this.previewGeom) {
            obj.geometry.dispose();
          }
        }
      });
      scene.remove(this.group);
      this.group = null;
    }
  }

  dispose(scene: THREE.Scene): void {
    this.clearFromScene(scene);
    this.highwaySurfaceMat.dispose();
    this.cpMat.dispose();
    this.guideLineMat.dispose();
    this.previewMat.dispose();
    this.cpGeom.dispose();
    this.previewGeom.dispose();
  }
}

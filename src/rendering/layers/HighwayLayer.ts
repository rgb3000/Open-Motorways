import * as THREE from 'three';
import type { Highway } from '../../highways/types';
import type { HighwaySystem } from '../../systems/HighwaySystem';
import { HIGHWAY_HALF_WIDTH, HIGHWAY_COLOR_HEX, HIGHWAY_PEAK_Y, GROUND_Y_POSITION, TILE_SIZE } from '../../constants';
import { Tool } from '../../types';
import type { HighwayPlacementState } from '../../input/HighwayDrawer';

const CONTROL_POINT_RADIUS = 8;
const CONTROL_POINT_SEGMENTS = 16;
const CONTROL_POINT_Y = HIGHWAY_PEAK_Y + 2;
const PREVIEW_MARKER_RADIUS = TILE_SIZE * 0.3;
const HIGHWAY_DEPTH = 1.5;

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
          GROUND_Y_POSITION + 0.5,
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
          const endpointY = this.computeElevation(0); // road level at endpoints

          this.addGuideLine(group, fromX, fromZ, endpointY, hw.cp1.x, hw.cp1.y, CONTROL_POINT_Y);
          this.addGuideLine(group, toX, toZ, endpointY, hw.cp2.x, hw.cp2.y, CONTROL_POINT_Y);
        }
      }
    }

    this.group = group;
    scene.add(group);
  }

  private computeElevation(t: number): number {
    return GROUND_Y_POSITION + (HIGHWAY_PEAK_Y - GROUND_Y_POSITION) * Math.sin(Math.PI * t);
  }

  private buildHighwayMesh(group: THREE.Group, hw: Highway): void {
    const polyline = hw.polyline;
    if (polyline.length < 2) return;

    const n = polyline.length;

    // Compute perpendicular offsets and elevations per point
    const lefts: THREE.Vector3[] = [];
    const rights: THREE.Vector3[] = [];

    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const elevation = this.computeElevation(t);

      // Tangent direction
      let tx: number, tz: number;
      if (i === 0) {
        tx = polyline[1].x - polyline[0].x;
        tz = polyline[1].y - polyline[0].y;
      } else if (i === n - 1) {
        tx = polyline[n - 1].x - polyline[n - 2].x;
        tz = polyline[n - 1].y - polyline[n - 2].y;
      } else {
        tx = polyline[i + 1].x - polyline[i - 1].x;
        tz = polyline[i + 1].y - polyline[i - 1].y;
      }
      const len = Math.sqrt(tx * tx + tz * tz);
      if (len > 0) { tx /= len; tz /= len; }

      // Perpendicular (in XZ plane)
      const px = -tz, pz = tx;
      const cx = polyline[i].x;
      const cz = polyline[i].y; // polyline uses {x, y} for world XZ

      lefts.push(new THREE.Vector3(cx + px * HIGHWAY_HALF_WIDTH, elevation, cz + pz * HIGHWAY_HALF_WIDTH));
      rights.push(new THREE.Vector3(cx - px * HIGHWAY_HALF_WIDTH, elevation, cz - pz * HIGHWAY_HALF_WIDTH));
    }

    // Build box-profile extrusion: 4 vertices per cross-section (TL, TR, BL, BR)
    // Top = elevation, Bottom = elevation - HIGHWAY_DEPTH
    const positions: number[] = [];
    const indices: number[] = [];

    // Helper to push a vertex and return its index
    let vertexCount = 0;
    const addVertex = (x: number, y: number, z: number): number => {
      positions.push(x, y, z);
      return vertexCount++;
    };

    // Per cross-section: TL, TR, BR, BL
    const sections: { tl: number; tr: number; br: number; bl: number }[] = [];
    for (let i = 0; i < n; i++) {
      const elev = lefts[i].y;
      const bottomY = elev - HIGHWAY_DEPTH;
      const tl = addVertex(lefts[i].x, elev, lefts[i].z);
      const tr = addVertex(rights[i].x, elev, rights[i].z);
      const br = addVertex(rights[i].x, bottomY, rights[i].z);
      const bl = addVertex(lefts[i].x, bottomY, lefts[i].z);
      sections.push({ tl, tr, br, bl });
    }

    // Generate quads between consecutive sections
    for (let i = 0; i < n - 1; i++) {
      const a = sections[i];
      const b = sections[i + 1];

      // Top face (TL, TR → next TL, TR)
      indices.push(a.tl, b.tl, b.tr, a.tl, b.tr, a.tr);

      // Bottom face (BL, BR → next BL, BR) — reversed winding
      indices.push(a.bl, b.br, b.bl, a.bl, a.br, b.br);

      // Left wall (TL, BL → next TL, BL)
      indices.push(a.tl, a.bl, b.bl, a.tl, b.bl, b.tl);

      // Right wall (TR, BR → next TR, BR) — reversed winding
      indices.push(a.tr, b.tr, b.br, a.tr, b.br, a.br);
    }

    // End caps
    if (sections.length > 0) {
      // Front cap (first section)
      const f = sections[0];
      indices.push(f.tl, f.bl, f.br, f.tl, f.br, f.tr);
      // Back cap (last section)
      const bk = sections[n - 1];
      indices.push(bk.tl, bk.tr, bk.br, bk.tl, bk.br, bk.bl);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, this.highwaySurfaceMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  private addControlPointHandle(group: THREE.Group, x: number, z: number): void {
    const sphere = new THREE.Mesh(this.cpGeom, this.cpMat);
    sphere.position.set(x, CONTROL_POINT_Y, z);
    sphere.renderOrder = 999;
    group.add(sphere);
  }

  private addGuideLine(group: THREE.Group, x1: number, z1: number, y1: number, x2: number, z2: number, y2: number): void {
    const pts = [
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
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

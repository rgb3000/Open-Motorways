import * as THREE from 'three';
import type { Grid } from '../core/Grid';
import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import type { Car } from '../entities/Car';
import type { GridPos } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_COLS, GRID_ROWS, TILE_SIZE, LAKE_DEPTH, LAKE_WATER_SURFACE_Y, LAKE_WATER_COLOR_HEX, LAKE_WATER_OPACITY, ROAD_DEBUG, CAR_ROUTE_DEBUG } from '../constants';
import { lerp, clamp } from '../utils/math';
import { TerrainLayer } from './layers/TerrainLayer';
import { RoadLayer } from './layers/RoadLayer';
import { BuildingLayer } from './layers/BuildingLayer';
import { CarLayer } from './layers/CarLayer';
import { DebugLayer } from './layers/DebugLayer';
import { ObstacleLayer } from './layers/ObstacleLayer';
import { RoadDebugLayer } from './layers/RoadDebugLayer';
import { CarRouteDebugLayer } from './layers/CarRouteDebugLayer';
import { HighwayLayer } from './layers/HighwayLayer';
import type { HighwaySystem } from '../systems/HighwaySystem';
import type { HighwayPlacementState } from '../input/HighwayDrawer';
import { Tool } from '../types';

const GROUND_SUBDIV = 3; // subdivisions per grid cell for smooth lake bevel
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_LERP = 0.25;
const ZOOM_STEP = 0.05;
const KEY_ZOOM_STEP = 0.08;

export class Renderer {
  protected scene: THREE.Scene;
  protected camera: THREE.OrthographicCamera;
  private webglRenderer: THREE.WebGLRenderer;

  private terrainLayer: TerrainLayer;
  private roadLayer: RoadLayer;
  private buildingLayer: BuildingLayer;
  private carLayer: CarLayer;
  private debugLayer: DebugLayer;
  private obstacleLayer: ObstacleLayer;
  private roadDebugLayer: RoadDebugLayer;
  private carRouteDebugLayer: CarRouteDebugLayer;
  private highwayLayer: HighwayLayer;
  private grid: Grid;
  private lakeCells: GridPos[] = [];
  private indicatorMesh: THREE.Mesh | null = null;

  private offscreenCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private groundTexture: THREE.CanvasTexture;
  private groundMesh!: THREE.Mesh;
  private waterSurface: THREE.Mesh | null = null;
  private groundDirty = false;
  private highwayDirty = false;
  private roadRebuildScheduled = false;
  private dpr: number;

  // Zoom state
  private currentZoom = MAX_ZOOM;
  private targetZoom = MAX_ZOOM;
  protected cameraCenterX = CANVAS_WIDTH / 2;
  protected cameraCenterZ = CANVAS_HEIGHT / 2;
  protected cameraTargetX = CANVAS_WIDTH / 2;
  protected cameraTargetZ = CANVAS_HEIGHT / 2;
  protected viewportWidth = CANVAS_WIDTH;
  protected viewportHeight = CANVAS_HEIGHT;

  constructor(webglRenderer: THREE.WebGLRenderer, grid: Grid, getHouses: () => House[] = () => [], getBusinesses: () => Business[] = () => []) {
    this.webglRenderer = webglRenderer;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8d8b4);

    // Camera — orthographic, top-down (frustum set by updateFrustum)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.up.set(0, 0, -1);
    this.updateFrustum();
    this.updateCameraPosition();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(
      CANVAS_WIDTH / 2 - 1500,
      600,
      CANVAS_HEIGHT / 2 - 1500,
    );
    dirLight.target.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(4096, 4096);
    dirLight.shadow.radius = 1;
    const shadowMargin = 1.5;
    dirLight.shadow.camera.left = -CANVAS_WIDTH / 2 * shadowMargin;
    dirLight.shadow.camera.right = CANVAS_WIDTH / 2 * shadowMargin;
    dirLight.shadow.camera.top = CANVAS_HEIGHT / 2 * shadowMargin;
    dirLight.shadow.camera.bottom = -CANVAS_HEIGHT / 2 * shadowMargin;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 5000;
    this.scene.add(dirLight);
    this.scene.add(dirLight.target);

    // Offscreen canvas for terrain (scaled by DPR for sharp rendering)
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = CANVAS_WIDTH * this.dpr;
    this.offscreenCanvas.height = CANVAS_HEIGHT * this.dpr;
    this.offCtx = this.offscreenCanvas.getContext('2d')!;

    // Layers
    this.terrainLayer = new TerrainLayer();
    this.roadLayer = new RoadLayer(grid, getHouses, getBusinesses);
    this.buildingLayer = new BuildingLayer();
    this.carLayer = new CarLayer();
    this.debugLayer = new DebugLayer();
    this.obstacleLayer = new ObstacleLayer();
    this.roadDebugLayer = new RoadDebugLayer();
    this.carRouteDebugLayer = new CarRouteDebugLayer();
    this.highwayLayer = new HighwayLayer();
    this.grid = grid;

    // Render initial ground state (terrain only, roads are 3D)
    this.offCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.terrainLayer.render(this.offCtx, this.lakeCells);

    // Ground plane (subdivided to allow lake depressions)
    this.groundTexture = new THREE.CanvasTexture(this.offscreenCanvas);
    this.groundTexture.minFilter = THREE.LinearFilter;
    this.groundTexture.magFilter = THREE.LinearFilter;

    const groundMat = new THREE.MeshStandardMaterial({ map: this.groundTexture, roughness: 0.85 });
    const groundGeom = new THREE.PlaneGeometry(CANVAS_WIDTH, CANVAS_HEIGHT, GRID_COLS * GROUND_SUBDIV, GRID_ROWS * GROUND_SUBDIV);
    groundGeom.rotateX(-Math.PI / 2);
    this.groundMesh = new THREE.Mesh(groundGeom, groundMat);
    this.groundMesh.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.castShadow = true;
    this.scene.add(this.groundMesh);
  }

  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.updateFrustum();
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();

    if (e.ctrlKey) {
      // Ctrl+scroll / pinch-to-zoom: keep zoom behavior
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const ndcX = (sx / this.viewportWidth) * 2 - 1;
      const ndcY = (sy / this.viewportHeight) * 2 - 1;

      const worldX = this.cameraCenterX + ndcX * this.camera.right;
      const worldZ = this.cameraCenterZ + ndcY * this.camera.top;

      const direction = e.deltaY > 0 ? -1 : 1;
      this.targetZoom = clamp(
        this.targetZoom * (1 + direction * ZOOM_STEP),
        MIN_ZOOM,
        MAX_ZOOM,
      );

      const { halfW, halfH } = this.computeHalfSizes(this.targetZoom);
      this.cameraTargetX = worldX - ndcX * halfW;
      this.cameraTargetZ = worldZ - ndcY * halfH;
    } else {
      // Normal scroll: pan the camera
      const panScale = 1 / this.currentZoom;
      this.cameraTargetX += e.deltaX * panScale;
      this.cameraTargetZ += e.deltaY * panScale;
    }
  }

  panBy(dx: number, dz: number): void {
    this.cameraTargetX += dx;
    this.cameraTargetZ += dz;
  }

  getCurrentZoom(): number {
    return this.currentZoom;
  }

  zoomByKey(direction: 1 | -1): void {
    this.targetZoom = clamp(
      this.targetZoom * (1 + direction * KEY_ZOOM_STEP),
      MIN_ZOOM,
      MAX_ZOOM,
    );
  }

  screenToWorld(screenX: number, screenY: number): { x: number; z: number } {
    const ndcX = (screenX / this.viewportWidth) * 2 - 1;
    const ndcY = (screenY / this.viewportHeight) * 2 - 1;

    const worldX = this.cameraCenterX + ndcX * this.camera.right;
    const worldZ = this.cameraCenterZ + ndcY * this.camera.top;

    return { x: worldX, z: worldZ };
  }

  buildObstacles(mountainCells: GridPos[], heightMap: Map<string, number>, lakeCells: GridPos[]): void {
    this.obstacleLayer.build(this.scene, mountainCells, heightMap);
    this.lakeCells = lakeCells;

    // Displace ground vertices for lake depressions
    this.displaceGroundForLakes(lakeCells);

    // Create water surface
    this.buildWaterSurface(lakeCells);
  }

  private displaceGroundForLakes(lakeCells: GridPos[]): void {
    if (lakeCells.length === 0) return;

    // Build lake lookup: 1.0 if lake, 0.0 otherwise
    const lakeField = new Uint8Array(GRID_COLS * GRID_ROWS);
    for (const p of lakeCells) {
      lakeField[p.gy * GRID_COLS + p.gx] = 1;
    }
    const isLake = (cx: number, cy: number): number => {
      if (cx < 0 || cx >= GRID_COLS || cy < 0 || cy >= GRID_ROWS) return 0;
      return lakeField[cy * GRID_COLS + cx];
    };

    const posAttr = this.groundMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const segsX = GRID_COLS * GROUND_SUBDIV;
    const segsZ = GRID_ROWS * GROUND_SUBDIV;
    const cols = segsX + 1;

    for (let j = 0; j <= segsZ; j++) {
      for (let i = 0; i <= segsX; i++) {
        // Position in grid-cell units (vertex at cell boundaries when i % SUBDIV == 0)
        const gx = i / GROUND_SUBDIV;
        const gy = j / GROUND_SUBDIV;

        // Bilinear sample the lake field at cell centers
        // Cell (cx, cy) center is at (cx + 0.5, cy + 0.5)
        const sx = gx - 0.5;
        const sy = gy - 0.5;
        const cx0 = Math.floor(sx);
        const cy0 = Math.floor(sy);
        const fx = sx - cx0;
        const fy = sy - cy0;

        const s00 = isLake(cx0, cy0);
        const s10 = isLake(cx0 + 1, cy0);
        const s01 = isLake(cx0, cy0 + 1);
        const s11 = isLake(cx0 + 1, cy0 + 1);

        const bilinear = s00 * (1 - fx) * (1 - fy) + s10 * fx * (1 - fy) + s01 * (1 - fx) * fy + s11 * fx * fy;

        if (bilinear > 0.001) {
          // Smoothstep for concave bevel profile
          const t = bilinear * bilinear * (3 - 2 * bilinear);
          const idx = j * cols + i;
          posAttr.setY(idx, -LAKE_DEPTH * t);
        }
      }
    }

    posAttr.needsUpdate = true;
    this.groundMesh.geometry.computeVertexNormals();
  }

  private buildWaterSurface(lakeCells: GridPos[]): void {
    if (this.waterSurface) {
      this.scene.remove(this.waterSurface);
      this.waterSurface.geometry.dispose();
      (this.waterSurface.material as THREE.Material).dispose();
      this.waterSurface = null;
    }

    if (lakeCells.length === 0) return;

    // Build merged geometry for all lake cell quads
    const vertices: number[] = [];
    const indices: number[] = [];

    for (const pos of lakeCells) {
      const x0 = pos.gx * TILE_SIZE;
      const x1 = x0 + TILE_SIZE;
      const z0 = pos.gy * TILE_SIZE;
      const z1 = z0 + TILE_SIZE;
      const y = LAKE_WATER_SURFACE_Y;

      const base = vertices.length / 3;
      vertices.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: LAKE_WATER_COLOR_HEX,
      transparent: true,
      opacity: LAKE_WATER_OPACITY,
      roughness: 0.1,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });

    this.waterSurface = new THREE.Mesh(geom, mat);
    this.waterSurface.receiveShadow = true;
    this.scene.add(this.waterSurface);
  }

  updateIndicator(pos: GridPos | null): void {
    if (!pos) {
      if (this.indicatorMesh) this.indicatorMesh.visible = false;
      return;
    }

    if (!this.indicatorMesh) {
      const geom = new THREE.RingGeometry(TILE_SIZE * 0.35, TILE_SIZE * 0.42, 32);
      geom.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
      });
      this.indicatorMesh = new THREE.Mesh(geom, mat);
      this.indicatorMesh.renderOrder = 999;
      this.scene.add(this.indicatorMesh);
    }

    this.indicatorMesh.position.set(
      (pos.gx + 0.5) * TILE_SIZE,
      1.5,
      (pos.gy + 0.5) * TILE_SIZE,
    );
    this.indicatorMesh.visible = true;
  }

  markGroundDirty(): void {
    this.groundDirty = true;
  }

  markHighwayDirty(): void {
    this.highwayDirty = true;
  }

  render(
    alpha: number,
    houses: House[],
    businesses: Business[],
    cars: Car[],
    spawnBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null,
    mouseWorldX = 0,
    mouseWorldY = 0,
    isPaused = false,
    highwaySystem: HighwaySystem | null = null,
    activeTool: Tool = Tool.Road,
    highwayPlacementState: HighwayPlacementState | null = null,
  ): void {
    // Smooth zoom/pan animation
    this.updateCamera();

    // Update ground texture if dirty (terrain only)
    if (this.groundDirty) {
      this.offCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.terrainLayer.render(this.offCtx, this.lakeCells);
      this.groundTexture.needsUpdate = true;

      // Defer road mesh rebuild to next frame to avoid frame hitch
      if (!this.roadRebuildScheduled) {
        this.roadRebuildScheduled = true;
        setTimeout(() => {
          this.roadLayer.update(this.scene);
          this.roadRebuildScheduled = false;
        }, 0);
      }
      this.groundDirty = false;
    }

    // Update highway layer when dirty or placement state changes
    if (highwaySystem && (this.highwayDirty || activeTool === Tool.Highway)) {
      this.highwayLayer.update(this.scene, highwaySystem, activeTool, highwayPlacementState);
      this.highwayDirty = false;
    }

    // Update 3D meshes
    this.buildingLayer.update(this.scene, houses, businesses);
    this.carLayer.update(this.scene, cars, alpha);
    this.debugLayer.update(this.scene, spawnBounds);
    if (ROAD_DEBUG) this.roadDebugLayer.update(this.scene, this.grid, cars);
    if (CAR_ROUTE_DEBUG && isPaused) this.carRouteDebugLayer.update(this.scene, cars, houses, businesses, mouseWorldX, mouseWorldY);
    else if (CAR_ROUTE_DEBUG && !isPaused) this.carRouteDebugLayer.clear(this.scene);
    // Render
    this.webglRenderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.roadLayer.dispose(this.scene);
    this.buildingLayer.dispose(this.scene);
    this.carLayer.dispose(this.scene);
    this.debugLayer.dispose(this.scene);
    this.roadDebugLayer.dispose(this.scene);
    this.carRouteDebugLayer.dispose(this.scene);
    this.highwayLayer.dispose(this.scene);
    this.obstacleLayer.disposeAll(this.scene);
    if (this.indicatorMesh) {
      this.scene.remove(this.indicatorMesh);
      this.indicatorMesh.geometry.dispose();
      (this.indicatorMesh.material as THREE.Material).dispose();
      this.indicatorMesh = null;
    }
    if (this.waterSurface) {
      this.scene.remove(this.waterSurface);
      this.waterSurface.geometry.dispose();
      (this.waterSurface.material as THREE.Material).dispose();
      this.waterSurface = null;
    }

    // Dispose all remaining scene objects
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    });
    this.scene.clear();

    this.groundTexture.dispose();
  }

  protected computeHalfSizes(zoom: number): { halfW: number; halfH: number } {
    const worldAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
    const viewAspect = this.viewportWidth / this.viewportHeight;

    let halfW: number;
    let halfH: number;

    if (viewAspect > worldAspect) {
      // Viewport wider than world — height constrains
      halfH = CANVAS_HEIGHT / 2;
      halfW = halfH * viewAspect;
    } else {
      // Viewport taller than world — width constrains
      halfW = CANVAS_WIDTH / 2;
      halfH = halfW / viewAspect;
    }

    halfW /= zoom;
    halfH /= zoom;

    return { halfW, halfH };
  }

  protected updateFrustum(): void {
    const { halfW, halfH } = this.computeHalfSizes(this.currentZoom);

    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  protected updateCameraPosition(): void {
    this.camera.position.set(this.cameraCenterX, 100, this.cameraCenterZ);
    this.camera.lookAt(this.cameraCenterX, 0, this.cameraCenterZ);
  }

  private updateCamera(): void {
    this.currentZoom = lerp(this.currentZoom, this.targetZoom, ZOOM_LERP);
    if (Math.abs(this.currentZoom - this.targetZoom) < 0.001) {
      this.currentZoom = this.targetZoom;
    }

    this.cameraCenterX = lerp(this.cameraCenterX, this.cameraTargetX, ZOOM_LERP);
    this.cameraCenterZ = lerp(this.cameraCenterZ, this.cameraTargetZ, ZOOM_LERP);
    if (Math.abs(this.cameraCenterX - this.cameraTargetX) < 0.01) {
      this.cameraCenterX = this.cameraTargetX;
    }
    if (Math.abs(this.cameraCenterZ - this.cameraTargetZ) < 0.01) {
      this.cameraCenterZ = this.cameraTargetZ;
    }

    this.updateFrustum();
    this.updateCameraPosition();
  }
}

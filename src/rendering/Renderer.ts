import * as THREE from 'three';
import type { Grid } from '../core/Grid';
import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import type { Car } from '../entities/Car';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { lerp, clamp } from '../utils/math';
import { TerrainLayer } from './layers/TerrainLayer';
import { RoadLayer } from './layers/RoadLayer';
import { BuildingLayer } from './layers/BuildingLayer';
import { CarLayer } from './layers/CarLayer';
import { DebugLayer } from './layers/DebugLayer';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_LERP = 0.25;
const ZOOM_STEP = 0.05;
const KEY_ZOOM_STEP = 0.08;

export class Renderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private webglRenderer: THREE.WebGLRenderer;

  private terrainLayer: TerrainLayer;
  private roadLayer: RoadLayer;
  private buildingLayer: BuildingLayer;
  private carLayer: CarLayer;
  private debugLayer: DebugLayer;

  private offscreenCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private groundTexture: THREE.CanvasTexture;
  private groundDirty = false;
  private roadRebuildScheduled = false;
  private dpr: number;

  // Zoom state
  private currentZoom = MAX_ZOOM;
  private targetZoom = MAX_ZOOM;
  private cameraCenterX = CANVAS_WIDTH / 2;
  private cameraCenterZ = CANVAS_HEIGHT / 2;
  private cameraTargetX = CANVAS_WIDTH / 2;
  private cameraTargetZ = CANVAS_HEIGHT / 2;
  private viewportWidth = CANVAS_WIDTH;
  private viewportHeight = CANVAS_HEIGHT;

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
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(
      CANVAS_WIDTH / 2 - 150,
      60,
      CANVAS_HEIGHT / 2 - 150,
    );
    dirLight.target.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(4096, 4096);
    dirLight.shadow.radius = 1;
    dirLight.shadow.camera.left = -CANVAS_WIDTH / 2;
    dirLight.shadow.camera.right = CANVAS_WIDTH / 2;
    dirLight.shadow.camera.top = CANVAS_HEIGHT / 2;
    dirLight.shadow.camera.bottom = -CANVAS_HEIGHT / 2;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 600;
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

    // Render initial ground state (terrain only, roads are 3D)
    this.offCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.terrainLayer.render(this.offCtx);

    // Ground plane
    this.groundTexture = new THREE.CanvasTexture(this.offscreenCanvas);
    this.groundTexture.minFilter = THREE.LinearFilter;
    this.groundTexture.magFilter = THREE.LinearFilter;

    const groundMat = new THREE.MeshStandardMaterial({ map: this.groundTexture });
    const groundGeom = new THREE.PlaneGeometry(CANVAS_WIDTH, CANVAS_HEIGHT);
    groundGeom.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
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

  markGroundDirty(): void {
    this.groundDirty = true;
  }

  render(
    alpha: number,
    houses: House[],
    businesses: Business[],
    cars: Car[],
    spawnBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null,
  ): void {
    // Smooth zoom/pan animation
    this.updateCamera();

    // Update ground texture if dirty (terrain only)
    if (this.groundDirty) {
      this.offCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.terrainLayer.render(this.offCtx);
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

    // Update 3D meshes
    this.buildingLayer.update(this.scene, houses, businesses);
    this.carLayer.update(this.scene, cars, alpha);
    this.debugLayer.update(this.scene, spawnBounds);
    // Render
    this.webglRenderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.roadLayer.dispose(this.scene);
    this.buildingLayer.dispose(this.scene);
    this.carLayer.dispose(this.scene);
    this.debugLayer.dispose(this.scene);

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

  private computeHalfSizes(zoom: number): { halfW: number; halfH: number } {
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

  private updateFrustum(): void {
    const { halfW, halfH } = this.computeHalfSizes(this.currentZoom);

    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private updateCameraPosition(): void {
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

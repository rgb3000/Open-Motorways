import * as THREE from 'three';
import type { Grid } from '../core/Grid';
import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import type { Car } from '../entities/Car';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { TerrainLayer } from './layers/TerrainLayer';
import { RoadLayer } from './layers/RoadLayer';
import { BuildingLayer } from './layers/BuildingLayer';
import { CarLayer } from './layers/CarLayer';

export class Renderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private webglRenderer: THREE.WebGLRenderer;

  private terrainLayer: TerrainLayer;
  private roadLayer: RoadLayer;
  private buildingLayer: BuildingLayer;
  private carLayer: CarLayer;

  private offscreenCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private groundTexture: THREE.CanvasTexture;
  private groundDirty = false;

  constructor(webglRenderer: THREE.WebGLRenderer, grid: Grid) {
    this.webglRenderer = webglRenderer;

    // Scene
    this.scene = new THREE.Scene();

    // Camera — orthographic, top-down, matching pixel coords
    this.camera = new THREE.OrthographicCamera(
      -CANVAS_WIDTH / 2, CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2, -CANVAS_HEIGHT / 2,
      0.1, 1000,
    );
    this.camera.position.set(CANVAS_WIDTH / 2, 100, CANVAS_HEIGHT / 2);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(
      CANVAS_WIDTH / 2 - 150,
      200,
      CANVAS_HEIGHT / 2 - 150,
    );
    dirLight.target.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.radius = 4;
    dirLight.shadow.camera.left = -CANVAS_WIDTH / 2;
    dirLight.shadow.camera.right = CANVAS_WIDTH / 2;
    dirLight.shadow.camera.top = CANVAS_HEIGHT / 2;
    dirLight.shadow.camera.bottom = -CANVAS_HEIGHT / 2;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 600;
    this.scene.add(dirLight);
    this.scene.add(dirLight.target);

    // Offscreen canvas for terrain + roads
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = CANVAS_WIDTH;
    this.offscreenCanvas.height = CANVAS_HEIGHT;
    this.offCtx = this.offscreenCanvas.getContext('2d')!;

    // Layers
    this.terrainLayer = new TerrainLayer();
    this.roadLayer = new RoadLayer(grid);
    this.buildingLayer = new BuildingLayer();
    this.carLayer = new CarLayer();

    // Render initial ground state
    this.terrainLayer.render(this.offCtx);
    this.roadLayer.render(this.offCtx);

    // Ground plane
    this.groundTexture = new THREE.CanvasTexture(this.offscreenCanvas);
    this.groundTexture.minFilter = THREE.NearestFilter;
    this.groundTexture.magFilter = THREE.NearestFilter;

    const groundMat = new THREE.MeshStandardMaterial({ map: this.groundTexture });
    const groundGeom = new THREE.PlaneGeometry(CANVAS_WIDTH, CANVAS_HEIGHT);
    groundGeom.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  markGroundDirty(): void {
    this.groundDirty = true;
  }

  render(
    alpha: number,
    houses: House[],
    businesses: Business[],
    cars: Car[],
  ): void {
    // Update ground texture if dirty
    if (this.groundDirty) {
      this.terrainLayer.render(this.offCtx);
      this.roadLayer.render(this.offCtx);
      this.groundTexture.needsUpdate = true;
      this.groundDirty = false;
    }

    // Update 3D meshes
    this.buildingLayer.update(this.scene, houses, businesses);
    this.carLayer.update(this.scene, cars, alpha);

    // Render
    this.webglRenderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.buildingLayer.dispose(this.scene);
    this.carLayer.dispose(this.scene);

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
}

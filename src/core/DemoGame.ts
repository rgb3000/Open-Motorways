import * as THREE from 'three';
import { CellType } from '../types';
import { Grid } from './Grid';
import { GameLoop } from './GameLoop';
import { IsometricRenderer } from '../rendering/IsometricRenderer';
import { RoadSystem } from '../systems/RoadSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { DemandSystem } from '../systems/DemandSystem';
import { CarSystem } from '../systems/CarSystem';
import { ObstacleSystem } from '../systems/ObstacleSystem';
import { Pathfinder } from '../pathfinding/Pathfinder';
import { PendingDeletionSystem } from '../systems/PendingDeletionSystem';
import { buildConfig } from '../constants';
import type { MapConfig } from '../maps/types';
import { forEachDirection, opposite } from '../utils/direction';

export class DemoGame {
  private webglRenderer: THREE.WebGLRenderer;
  private grid: Grid;
  private gameLoop: GameLoop;
  private renderer: IsometricRenderer;
  private roadSystem: RoadSystem;
  private spawnSystem: SpawnSystem;
  private demandSystem: DemandSystem;
  private carSystem: CarSystem;
  private obstacleSystem: ObstacleSystem;
  private pathfinder: Pathfinder;
  private pendingDeletionSystem: PendingDeletionSystem;
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement, mapConfig: MapConfig) {
    const cfg = buildConfig(mapConfig.constants);

    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    this.webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: !isSafari });
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;

    this.grid = new Grid(cfg.GRID_COLS, cfg.GRID_ROWS);
    this.obstacleSystem = new ObstacleSystem(this.grid, mapConfig.obstacles, cfg);
    this.obstacleSystem.generate();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.pendingDeletionSystem = new PendingDeletionSystem(this.grid, this.roadSystem);
    this.demandSystem = new DemandSystem(cfg);
    this.spawnSystem = new SpawnSystem(this.grid, this.demandSystem, cfg);
    this.carSystem = new CarSystem(this.pathfinder, this.grid, this.pendingDeletionSystem);

    this.renderer = new IsometricRenderer(
      this.webglRenderer, this.grid,
      () => this.spawnSystem.getHouses(),
      () => this.spawnSystem.getBusinesses(),
    );
    this.renderer.buildObstacles(
      this.obstacleSystem.getMountainCells(),
      this.obstacleSystem.getMountainHeightMap(),
      this.obstacleSystem.getLakeCells(),
    );
    this.renderer.resize(window.innerWidth, window.innerHeight);

    // Place predefined entities
    if (mapConfig.houses) {
      for (const h of mapConfig.houses) {
        this.spawnSystem.spawnHouse({ gx: h.gx, gy: h.gy }, h.color, h.connectorDir);
      }
    }
    if (mapConfig.businesses) {
      for (const b of mapConfig.businesses) {
        this.spawnSystem.spawnBusiness({ gx: b.gx, gy: b.gy }, b.color, b.orientation, b.connectorSide);
      }
    }
    this.spawnSystem.unlockAllColors();

    // Place roads
    if (mapConfig.roads) {
      for (const r of mapConfig.roads) {
        this.roadSystem.placeRoad(r.gx, r.gy);
      }
      // Auto-connect: iterate all road cells and connect to adjacent road/connector cells
      for (const r of mapConfig.roads) {
        const cell = this.grid.getCell(r.gx, r.gy);
        if (!cell || cell.type !== CellType.Road) continue;
        // Check all 8 neighbors
        for (const dy of [-1, 0, 1]) {
          for (const dx of [-1, 0, 1]) {
            if (dx === 0 && dy === 0) continue;
            const nx = r.gx + dx;
            const ny = r.gy + dy;
            const neighbor = this.grid.getCell(nx, ny);
            if (!neighbor) continue;
            if (neighbor.type === CellType.Road || neighbor.type === CellType.Connector) {
              this.roadSystem.connectRoads(r.gx, r.gy, nx, ny);
            }
          }
        }
      }
      // Also connect connector cells to adjacent road cells
      for (const r of mapConfig.roads) {
        const cell = this.grid.getCell(r.gx, r.gy);
        if (!cell || cell.type !== CellType.Road) continue;
        forEachDirection(cell.roadConnections, (dir) => {
          const neighbor = this.grid.getNeighbor(r.gx, r.gy, dir);
          if (neighbor && neighbor.cell.type === CellType.Connector) {
            neighbor.cell.roadConnections |= opposite(dir);
          }
        });
      }
      this.roadSystem.markDirty();
    }

    this.renderer.markGroundDirty();
    this.spawnSystem.clearDirty();

    // No-op home return (no money tracking needed)
    this.carSystem.onHomeReturn = () => {};

    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    this.resizeHandler = () => {
      this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  start(): void {
    this.gameLoop.start();
  }

  stop(): void {
    this.gameLoop.stop();
  }

  dispose(): void {
    this.gameLoop.stop();
    this.renderer.dispose();
    this.webglRenderer.dispose();
    window.removeEventListener('resize', this.resizeHandler);
  }

  private update(dt: number): void {
    if (this.roadSystem.isDirty) {
      this.pathfinder.clearCache();
      this.carSystem.onRoadsChanged(this.spawnSystem.getHouses());
      this.roadSystem.clearDirty();
      this.grid.recomputeIntersectionFlags();
      this.renderer.markGroundDirty();
    }

    this.spawnSystem.update(dt);
    if (this.spawnSystem.isDirty) {
      this.renderer.markGroundDirty();
      this.spawnSystem.clearDirty();
    }

    this.demandSystem.update(dt, this.spawnSystem.getBusinesses());
    this.carSystem.update(dt, this.spawnSystem.getHouses(), this.spawnSystem.getBusinesses());
    this.pendingDeletionSystem.update();
  }

  private render(alpha: number): void {
    this.renderer.render(
      alpha,
      this.spawnSystem.getHouses(),
      this.spawnSystem.getBusinesses(),
      this.carSystem.getCars(),
    );
  }
}

import * as THREE from 'three';
import { GameState } from '../types';
import { Grid } from './Grid';
import { GameLoop } from './GameLoop';
import { Renderer } from '../rendering/Renderer';
import { InputHandler } from '../input/InputHandler';
import { RoadDrawer } from '../input/RoadDrawer';
import { RoadSystem } from '../systems/RoadSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { DemandSystem } from '../systems/DemandSystem';
import { CarSystem } from '../systems/CarSystem';
import { Pathfinder } from '../pathfinding/Pathfinder';

export class Game {
  private webglRenderer: THREE.WebGLRenderer;
  private grid: Grid;
  private gameLoop: GameLoop;
  private renderer: Renderer;
  private input: InputHandler;
  private roadDrawer: RoadDrawer;
  private roadSystem: RoadSystem;
  private spawnSystem: SpawnSystem;
  private demandSystem: DemandSystem;
  private carSystem: CarSystem;
  private pathfinder: Pathfinder;
  private state: GameState = GameState.Playing;
  private elapsedTime = 0;
  private stateCallback: ((state: GameState, score: number, time: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.webglRenderer.setPixelRatio(2);
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.grid = new Grid();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.spawnSystem = new SpawnSystem(this.grid);
    this.demandSystem = new DemandSystem();
    this.carSystem = new CarSystem(this.pathfinder, this.grid);
    this.renderer = new Renderer(this.webglRenderer, this.grid);
    this.renderer.resize(window.innerWidth, window.innerHeight);

    this.input = new InputHandler(
      canvas,
      (sx, sy) => this.renderer.screenToWorld(sx, sy),
    );
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem);

    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => this.renderer.onWheel(e), { passive: false });

    // Window resize
    window.addEventListener('resize', () => this.onResize());

    // Keyboard zoom + pause
    window.addEventListener('keydown', (e) => {
      if (e.key === '+' || e.key === '=') this.renderer.zoomByKey(1);
      if (e.key === '-') this.renderer.zoomByKey(-1);
      if (e.key === 'Escape') this.togglePause();
    });

    // Initial spawn
    this.spawnSystem.spawnInitial();
  }

  start(): void {
    this.gameLoop.start();
  }

  getState(): GameState {
    return this.state;
  }

  getScore(): number {
    return this.carSystem.getScore();
  }

  getElapsedTime(): number {
    return this.elapsedTime;
  }

  onStateUpdate(cb: (state: GameState, score: number, time: number) => void): void {
    this.stateCallback = cb;
  }

  togglePause(): void {
    if (this.state === GameState.Playing) this.state = GameState.Paused;
    else if (this.state === GameState.Paused) this.state = GameState.Playing;
  }

  restart(): void {
    this.renderer.dispose();
    this.grid = new Grid();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.spawnSystem = new SpawnSystem(this.grid);
    this.demandSystem = new DemandSystem();
    this.carSystem = new CarSystem(this.pathfinder, this.grid);
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem);
    this.renderer = new Renderer(this.webglRenderer, this.grid);
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.state = GameState.Playing;
    this.elapsedTime = 0;
    this.spawnSystem.spawnInitial();
  }

  private update(dt: number): void {
    // Road editing — always runs (even when paused)
    this.roadDrawer.update();

    if (this.roadSystem.isDirty) {
      this.pathfinder.clearCache();
      this.carSystem.onRoadsChanged(this.spawnSystem.getHouses());
      this.roadSystem.clearDirty();
      this.renderer.markGroundDirty();
    }

    // Game simulation — only when playing
    if (this.state !== GameState.Playing) return;

    this.elapsedTime += dt;
    this.spawnSystem.update(dt);
    this.demandSystem.update(dt, this.spawnSystem.getBusinesses());
    this.carSystem.update(dt, this.spawnSystem.getHouses(), this.spawnSystem.getBusinesses());

    if (this.demandSystem.isGameOver) {
      this.state = GameState.GameOver;
    }
  }

  private render(alpha: number): void {
    this.renderer.render(
      alpha,
      this.spawnSystem.getHouses(),
      this.spawnSystem.getBusinesses(),
      this.carSystem.getCars(),
    );
    this.stateCallback?.(this.state, this.carSystem.getScore(), this.elapsedTime);
  }

  private onResize(): void {
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }
}

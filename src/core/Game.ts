import * as THREE from 'three';
import { GameState, ToolType } from '../types';
import { Grid } from './Grid';
import { GameLoop } from './GameLoop';
import { Renderer } from '../rendering/Renderer';
import { InputHandler } from '../input/InputHandler';
import { RoadDrawer } from '../input/RoadDrawer';
import type { MoneyInterface } from '../input/RoadDrawer';
import { RoadSystem } from '../systems/RoadSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { DemandSystem } from '../systems/DemandSystem';
import { CarSystem } from '../systems/CarSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { Pathfinder } from '../pathfinding/Pathfinder';
import { STARTING_MONEY, DELIVERY_REWARD } from '../constants';

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
  private audioSystem: AudioSystem = new AudioSystem();
  private state: GameState = GameState.WaitingToStart;
  private elapsedTime = 0;
  private money = STARTING_MONEY;
  private stateCallback: ((state: GameState, score: number, time: number, money: number) => void) | null = null;
  private activeTool: ToolType = ToolType.Road;
  private toolChangeCallback: ((tool: ToolType) => void) | null = null;

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
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem, this.grid, () => this.activeTool, this.createMoneyInterface());

    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => this.renderer.onWheel(e), { passive: false });

    // Window resize
    window.addEventListener('resize', () => this.onResize());

    // Keyboard zoom + pause + tool shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === '+' || e.key === '=') this.renderer.zoomByKey(1);
      if (e.key === '-') this.renderer.zoomByKey(-1);
      if (e.key === 'Escape' || e.key === 'p') this.togglePause();
      if (e.key === '1') this.setActiveTool(ToolType.Road);
      if (e.key === '2') this.setActiveTool(ToolType.Bridge);
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

  getMoney(): number {
    return this.money;
  }

  private createMoneyInterface(): MoneyInterface {
    return {
      canAfford: (cost: number) => this.money >= cost,
      spend: (cost: number) => { this.money -= cost; },
      refund: (amount: number) => { this.money += amount; },
    };
  }

  getActiveTool(): ToolType {
    return this.activeTool;
  }

  setActiveTool(tool: ToolType): void {
    if (this.activeTool === tool) return;
    this.activeTool = tool;
    this.toolChangeCallback?.(tool);
  }

  onToolChange(cb: (tool: ToolType) => void): void {
    this.toolChangeCallback = cb;
  }

  onStateUpdate(cb: (state: GameState, score: number, time: number, money: number) => void): void {
    this.stateCallback = cb;
  }

  async startGame(): Promise<void> {
    if (this.state !== GameState.WaitingToStart) return;
    await this.audioSystem.init();
    this.audioSystem.startMusic();
    this.carSystem.onDelivery = () => this.audioSystem.playDeliveryChime();
    this.carSystem.onHomeReturn = () => { this.money += DELIVERY_REWARD; this.audioSystem.playHomeReturn(); };
    this.state = GameState.Playing;
  }

  togglePause(): void {
    if (this.state === GameState.Playing) {
      this.state = GameState.Paused;
      this.audioSystem.stopMusic();
    } else if (this.state === GameState.Paused) {
      this.state = GameState.Playing;
      this.audioSystem.startMusic();
    }
  }

  async restart(): Promise<void> {
    this.audioSystem.dispose();
    this.renderer.dispose();
    this.grid = new Grid();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.spawnSystem = new SpawnSystem(this.grid);
    this.demandSystem = new DemandSystem();
    this.carSystem = new CarSystem(this.pathfinder, this.grid);
    this.money = STARTING_MONEY;
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem, this.grid, () => this.activeTool, this.createMoneyInterface());
    this.renderer = new Renderer(this.webglRenderer, this.grid);
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.elapsedTime = 0;
    this.activeTool = ToolType.Road;
    this.toolChangeCallback?.(this.activeTool);
    this.spawnSystem.spawnInitial();
    this.audioSystem = new AudioSystem();
    await this.audioSystem.init();
    this.audioSystem.startMusic();
    this.carSystem.onDelivery = () => this.audioSystem.playDeliveryChime();
    this.carSystem.onHomeReturn = () => { this.money += DELIVERY_REWARD; this.audioSystem.playHomeReturn(); };
    this.state = GameState.Playing;
  }

  private update(dt: number): void {
    if (this.state === GameState.WaitingToStart) return;

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
      this.audioSystem.stopMusic();
    }
  }

  private render(alpha: number): void {
    this.renderer.render(
      alpha,
      this.spawnSystem.getHouses(),
      this.spawnSystem.getBusinesses(),
      this.carSystem.getCars(),
    );
    this.stateCallback?.(this.state, this.carSystem.getScore(), this.elapsedTime, this.money);
  }

  private onResize(): void {
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }
}

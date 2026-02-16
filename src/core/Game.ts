import * as THREE from 'three';
import { CellType, GameState, Tool } from '../types';
import type { GameColor } from '../types';
import { Grid } from './Grid';
import { GameLoop } from './GameLoop';
import { Renderer } from '../rendering/Renderer';
import { InputHandler } from '../input/InputHandler';
import { RoadDrawer } from '../input/RoadDrawer';
import type { MoneyInterface } from '../input/RoadDrawer';
import { UndoSystem } from '../input/UndoSystem';
import { RoadSystem } from '../systems/RoadSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { DemandSystem } from '../systems/DemandSystem';
import { CarSystem } from '../systems/CarSystem';
import { MusicSystem } from '../systems/MusicSystem';
import { SoundEffectSystem } from '../systems/SoundEffectSystem';
import { ObstacleSystem } from '../systems/ObstacleSystem';
import { Pathfinder } from '../pathfinding/Pathfinder';
import { PendingDeletionSystem } from '../systems/PendingDeletionSystem';
import { CarState } from '../entities/Car';
import { STARTING_MONEY, DELIVERY_REWARD, ROAD_REFUND, SPAWN_DEBUG, DEMAND_DEBUG, MAX_DEMAND_PINS, HOUSE_SUPPLY_PER_MINUTE } from '../constants';

export interface DemandStat {
  color: GameColor;
  demand: number;
  supplyPerMin: number;
  demandPerMin: number;
  houses: number;
  businesses: number;
}

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
  private demandWarnPrevSin = 0;
  private carSystem: CarSystem;
  private pendingDeletionSystem: PendingDeletionSystem;
  private obstacleSystem: ObstacleSystem;
  private pathfinder: Pathfinder;
  private musicSystem: MusicSystem = new MusicSystem();
  private soundEffects: SoundEffectSystem = new SoundEffectSystem();
  private state: GameState = GameState.WaitingToStart;
  private elapsedTime = 0;
  private money = STARTING_MONEY;
  private stateCallback: ((state: GameState, score: number, time: number, money: number, demandStats: DemandStat[] | null) => void) | null = null;
  private spaceDown = false;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private undoSystem: UndoSystem;
  private canvas: HTMLCanvasElement;
  private onUndoStateChange: (() => void) | null = null;
  private musicEnabled = true;
  private activeTool: Tool = Tool.Road;
  private toolChangeCallback: ((tool: Tool) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    this.webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: !isSafari });
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;

    this.grid = new Grid();
    this.obstacleSystem = new ObstacleSystem(this.grid);
    this.obstacleSystem.generate();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.pendingDeletionSystem = new PendingDeletionSystem(this.grid, this.roadSystem);
    this.demandSystem = new DemandSystem();
    this.spawnSystem = new SpawnSystem(this.grid, this.demandSystem);
    this.carSystem = new CarSystem(this.pathfinder, this.grid, this.pendingDeletionSystem);
    this.renderer = new Renderer(this.webglRenderer, this.grid, () => this.spawnSystem.getHouses(), () => this.spawnSystem.getBusinesses());
    this.renderer.buildObstacles(this.obstacleSystem.getMountainCells(), this.obstacleSystem.getMountainHeightMap(), this.obstacleSystem.getLakeCells());
    this.renderer.resize(window.innerWidth, window.innerHeight);

    this.input = new InputHandler(
      canvas,
      (sx, sy) => this.renderer.screenToWorld(sx, sy),
    );
    this.undoSystem = new UndoSystem(this.grid);
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem, this.grid, this.createMoneyInterface(), () => this.spawnSystem.getHouses(), this.undoSystem, () => this.activeTool);
    this.roadDrawer.onTryErase = (gx, gy) => this.handleTryErase(gx, gy);

    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    // Wheel: pan (normal scroll) or zoom (ctrl/pinch)
    canvas.addEventListener('wheel', (e) => this.renderer.onWheel(e), { passive: false });

    // Window resize
    window.addEventListener('resize', () => this.onResize());

    // Keyboard zoom + pause + tool shortcuts + space panning
    window.addEventListener('keydown', (e) => {
      if (e.key === '+' || e.key === '=') this.renderer.zoomByKey(1);
      if (e.key === '-') this.renderer.zoomByKey(-1);
      if (e.key === 'Escape' || e.key === 'p') this.togglePause();
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.performUndo();
      }
      if (e.key === 'r' || e.key === 'R') this.setActiveTool(Tool.Road);
      if (e.key === 'e' || e.key === 'E') this.setActiveTool(Tool.Eraser);
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        this.spaceDown = true;
        this.input.panningActive = true;
        this.canvas.style.cursor = 'grab';
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        this.spaceDown = false;
        this.isPanning = false;
        this.input.panningActive = false;
        this.canvas.style.cursor = this.activeTool === Tool.Eraser ? 'crosshair' : 'default';
      }
    });

    // Space+drag panning
    canvas.addEventListener('mousedown', (e) => {
      if (this.spaceDown && e.button === 0) {
        this.isPanning = true;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastPanX;
        const dy = e.clientY - this.lastPanY;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        const zoom = this.renderer.getCurrentZoom();
        this.renderer.panBy(-dx / zoom, -dy / zoom);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = this.spaceDown ? 'grab' : (this.activeTool === Tool.Eraser ? 'crosshair' : 'default');
      }
    });

    // Initial spawn
    this.spawnSystem.spawnInitial();
    this.renderer.markGroundDirty();
    this.spawnSystem.clearDirty();
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

  onStateUpdate(cb: (state: GameState, score: number, time: number, money: number, demandStats: DemandStat[] | null) => void): void {
    this.stateCallback = cb;
  }

  async startGame(): Promise<void> {
    if (this.state !== GameState.WaitingToStart) return;
    await this.musicSystem.init();
    await this.soundEffects.init();
    if (this.musicEnabled) this.musicSystem.startMusic();
    this.carSystem.onHomeReturn = () => { this.money += DELIVERY_REWARD; this.soundEffects.playHomeReturn(); };
    this.roadDrawer.onRoadPlace = () => this.soundEffects.playRoadPlace();
    this.roadDrawer.onRoadDelete = () => this.soundEffects.playRoadDelete();
    this.spawnSystem.onSpawn = () => this.soundEffects.playSpawn();
    this.state = GameState.Playing;
  }

  togglePause(): void {
    if (this.state === GameState.Playing) {
      this.state = GameState.Paused;
      this.musicSystem.stopMusic();
    } else if (this.state === GameState.Paused) {
      this.state = GameState.Playing;
      if (this.musicEnabled) this.musicSystem.startMusic();
    }
  }

  async restart(): Promise<void> {
    this.musicSystem.dispose();
    this.soundEffects.dispose();
    this.renderer.dispose();
    this.grid = new Grid();
    this.obstacleSystem = new ObstacleSystem(this.grid);
    this.obstacleSystem.generate();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.pendingDeletionSystem = new PendingDeletionSystem(this.grid, this.roadSystem);
    this.demandSystem = new DemandSystem();
    this.spawnSystem = new SpawnSystem(this.grid, this.demandSystem);
    this.demandWarnPrevSin = 0;
    this.carSystem = new CarSystem(this.pathfinder, this.grid, this.pendingDeletionSystem);
    this.money = STARTING_MONEY;
    this.undoSystem = new UndoSystem(this.grid);
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem, this.grid, this.createMoneyInterface(), () => this.spawnSystem.getHouses(), this.undoSystem, () => this.activeTool);
    this.roadDrawer.onTryErase = (gx, gy) => this.handleTryErase(gx, gy);
    this.setActiveTool(Tool.Road);
    this.renderer = new Renderer(this.webglRenderer, this.grid);
    this.renderer.buildObstacles(this.obstacleSystem.getMountainCells(), this.obstacleSystem.getMountainHeightMap(), this.obstacleSystem.getLakeCells());
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.elapsedTime = 0;
    this.spawnSystem.spawnInitial();
    this.renderer.markGroundDirty();
    this.spawnSystem.clearDirty();
    this.musicSystem = new MusicSystem();
    this.soundEffects = new SoundEffectSystem();
    await this.musicSystem.init();
    await this.soundEffects.init();
    if (this.musicEnabled) this.musicSystem.startMusic();
    this.carSystem.onHomeReturn = () => { this.money += DELIVERY_REWARD; this.soundEffects.playHomeReturn(); };
    this.roadDrawer.onRoadPlace = () => this.soundEffects.playRoadPlace();
    this.roadDrawer.onRoadDelete = () => this.soundEffects.playRoadDelete();
    this.state = GameState.Playing;
  }

  performUndo(): void {
    if (this.state === GameState.WaitingToStart || this.state === GameState.GameOver) return;
    const group = this.undoSystem.undo();
    if (!group) return;
    // Reverse the money change
    this.money -= group.moneyDelta;
    this.roadSystem.markDirty();
    this.onUndoStateChange?.();
  }

  canUndo(): boolean {
    return this.undoSystem.canUndo();
  }

  setOnUndoStateChange(cb: (() => void) | null): void {
    this.onUndoStateChange = cb;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.musicSystem.stopMusic();
    } else if (this.state === GameState.Playing) {
      this.musicSystem.startMusic();
    }
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  getActiveTool(): Tool {
    return this.activeTool;
  }

  setActiveTool(tool: Tool): void {
    if (this.activeTool === tool) return;
    this.activeTool = tool;
    this.canvas.style.cursor = tool === Tool.Eraser ? 'crosshair' : 'default';
    this.toolChangeCallback?.(tool);
  }

  onToolChange(cb: ((tool: Tool) => void) | null): void {
    this.toolChangeCallback = cb;
  }

  private handleTryErase(gx: number, gy: number): boolean {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Road) return false;

    if (cell.pendingDeletion) return false;

    // Check all car states that depend on this cell
    const cars = this.carSystem.getCars();
    const dependentCarIds: string[] = [];
    for (const car of cars) {
      if (car.state === CarState.GoingToBusiness && car.path.length > 0) {
        // Cells already passed are reserved for return trip
        for (let i = 0; i < car.pathIndex; i++) {
          if (car.path[i].gx === gx && car.path[i].gy === gy) {
            dependentCarIds.push(car.id);
            break;
          }
        }
      } else if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit) {
        // Entire outbound path is reserved
        for (const p of car.outboundPath) {
          if (p.gx === gx && p.gy === gy) {
            dependentCarIds.push(car.id);
            break;
          }
        }
      } else if (car.state === CarState.GoingHome && car.path.length > 0) {
        // Cells still ahead are reserved
        for (let i = car.pathIndex; i < car.path.length; i++) {
          if (car.path[i].gx === gx && car.path[i].gy === gy) {
            dependentCarIds.push(car.id);
            break;
          }
        }
      }
    }

    if (dependentCarIds.length === 0) {
      if (this.roadSystem.removeRoad(gx, gy)) {
        this.money += ROAD_REFUND;
        return true;
      }
      return false;
    }

    // GoingHome cars need this road — defer deletion
    this.pendingDeletionSystem.markPending(gx, gy, dependentCarIds);
    return true;
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

    if (this.spawnSystem.isDirty) {
      this.renderer.markGroundDirty();
      this.spawnSystem.clearDirty();
    }

    this.demandSystem.update(dt, this.spawnSystem.getBusinesses());
    // Chirp in sync with pulse animation (sin wave crossing from negative to positive)
    const hasWarning = this.spawnSystem.getBusinesses().some(b => b.demandPins >= MAX_DEMAND_PINS - 2);
    if (hasWarning) {
      const sinVal = Math.sin(Date.now() * 0.006);
      if (sinVal >= 0 && this.demandWarnPrevSin < 0) {
        this.soundEffects.playDemandWarning();
      }
      this.demandWarnPrevSin = sinVal;
    } else {
      this.demandWarnPrevSin = 0;
    }
    this.carSystem.update(dt, this.spawnSystem.getHouses(), this.spawnSystem.getBusinesses());
    this.pendingDeletionSystem.update();

    if (this.demandSystem.isGameOver) {
      this.state = GameState.GameOver;
      this.musicSystem.stopMusic();
    }
  }

  private render(alpha: number): void {
    this.renderer.updateIndicator(this.roadDrawer.getLastBuiltPos());
    this.renderer.render(
      alpha,
      this.spawnSystem.getHouses(),
      this.spawnSystem.getBusinesses(),
      this.carSystem.getCars(),
      SPAWN_DEBUG ? this.spawnSystem.getSpawnBounds() : null,
    );
    let demandStats: DemandStat[] | null = null;
    if (DEMAND_DEBUG) {
      const colorDemands = this.demandSystem.getColorDemands();
      demandStats = this.spawnSystem.getUnlockedColors().map(color => ({
        color,
        demand: colorDemands.get(color) ?? 0,
        supplyPerMin: this.spawnSystem.getHouses().filter(h => h.color === color).length * HOUSE_SUPPLY_PER_MINUTE,
        demandPerMin: this.demandSystem.getColorPinOutputRate(color),
        houses: this.spawnSystem.getHouses().filter(h => h.color === color).length,
        businesses: this.spawnSystem.getBusinesses().filter(b => b.color === color).length,
      }));
    }
    this.stateCallback?.(this.state, this.carSystem.getScore(), this.elapsedTime, this.money, demandStats);
  }

  private onResize(): void {
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }
}

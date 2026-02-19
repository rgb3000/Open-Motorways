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
import { HighwaySystem } from '../systems/HighwaySystem';
import { HighwayDrawer } from '../input/HighwayDrawer';
import { CarState } from '../entities/Car';
import { stepGridPos } from '../systems/car/CarRouter';
import { SPAWN_DEBUG, DEMAND_DEBUG, buildConfig } from '../constants';
import type { MapConfig } from '../maps/types';
import type { GameConstants } from '../maps/types';
import { forEachDirection, opposite } from '../utils/direction';

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
  private highwaySystem: HighwaySystem;
  private highwayDrawer: HighwayDrawer;
  private pathfinder: Pathfinder;
  private musicSystem: MusicSystem = new MusicSystem();
  private soundEffects: SoundEffectSystem = new SoundEffectSystem();
  private state: GameState = GameState.Playing;
  private elapsedTime = 0;
  private money: number;
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
  private mapConfig?: MapConfig;
  private cfg: GameConstants;
  private audioInitialized = false;

  // Event listener references for cleanup
  private resizeHandler: () => void;
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;

  constructor(canvas: HTMLCanvasElement, mapConfig?: MapConfig) {
    this.canvas = canvas;
    this.mapConfig = mapConfig;
    this.cfg = buildConfig(mapConfig?.constants);
    this.money = this.cfg.STARTING_MONEY;

    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    this.webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: !isSafari });
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;
    this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.webglRenderer.toneMappingExposure = 1.2;

    this.grid = new Grid(this.cfg.GRID_COLS, this.cfg.GRID_ROWS);
    this.obstacleSystem = new ObstacleSystem(this.grid, mapConfig?.obstacles, this.cfg);
    this.obstacleSystem.generate();
    this.roadSystem = new RoadSystem(this.grid);
    this.highwaySystem = new HighwaySystem();
    this.pathfinder = new Pathfinder(this.grid, this.highwaySystem);
    this.pendingDeletionSystem = new PendingDeletionSystem(this.grid, this.roadSystem);
    this.demandSystem = new DemandSystem(this.cfg);
    this.spawnSystem = new SpawnSystem(this.grid, this.demandSystem, this.cfg);
    this.carSystem = new CarSystem(this.pathfinder, this.grid, this.pendingDeletionSystem, this.highwaySystem);
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
    this.highwayDrawer = new HighwayDrawer(this.input, this.highwaySystem, this.grid, this.createMoneyInterface(), () => this.activeTool);

    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    // Wheel: pan (normal scroll) or zoom (ctrl/pinch)
    canvas.addEventListener('wheel', (e) => this.renderer.onWheel(e), { passive: false });

    // Window resize
    this.resizeHandler = () => this.onResize();
    window.addEventListener('resize', this.resizeHandler);

    // Keyboard zoom + pause + tool shortcuts + space panning
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') this.renderer.zoomByKey(1);
      if (e.key === '-') this.renderer.zoomByKey(-1);
      if (e.key === 'Escape' || e.key === 'p') this.togglePause();
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.performUndo();
      }
      if (e.key === 'r' || e.key === 'R') this.setActiveTool(Tool.Road);
      if (e.key === 'e' || e.key === 'E') this.setActiveTool(Tool.Eraser);
      if (e.key === 'h' || e.key === 'H') this.setActiveTool(Tool.Highway);
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        this.spaceDown = true;
        this.input.panningActive = true;
        this.canvas.style.cursor = 'grab';
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    this.keyupHandler = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        this.spaceDown = false;
        this.isPanning = false;
        this.input.panningActive = false;
        this.canvas.style.cursor = this.activeTool === Tool.Eraser ? 'crosshair' : 'default';
      }
    };
    window.addEventListener('keyup', this.keyupHandler);

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
    if (mapConfig?.houses || mapConfig?.businesses) {
      this.placePreDefinedEntities();
    } else {
      this.spawnSystem.spawnInitial();
    }
    if (mapConfig?.roads) {
      this.placePreDefinedRoads();
    }
    this.renderer.markGroundDirty();
    this.spawnSystem.clearDirty();

    // Wire up sound callbacks immediately (audio inits lazily on first interaction)
    this.carSystem.onHomeReturn = () => { this.money += this.cfg.DELIVERY_REWARD; this.soundEffects.playHomeReturn(); };
    this.roadDrawer.onRoadPlace = () => this.soundEffects.playRoadPlace();
    this.roadDrawer.onRoadDelete = () => this.soundEffects.playRoadDelete();
    this.spawnSystem.onSpawn = () => this.soundEffects.playSpawn();

    // Init audio on first user interaction (required by browsers)
    const initAudioOnce = () => {
      this.initAudio();
      canvas.removeEventListener('pointerdown', initAudioOnce);
      window.removeEventListener('keydown', initAudioOnce);
    };
    canvas.addEventListener('pointerdown', initAudioOnce);
    window.addEventListener('keydown', initAudioOnce);
  }

  start(): void {
    this.gameLoop.start();
  }

  stop(): void {
    this.gameLoop.stop();
  }

  dispose(): void {
    this.gameLoop.stop();
    this.musicSystem.dispose();
    this.soundEffects.dispose();
    this.renderer.dispose();
    this.webglRenderer.dispose();
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
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

  private async initAudio(): Promise<void> {
    if (this.audioInitialized) return;
    this.audioInitialized = true;
    await this.musicSystem.init();
    await this.soundEffects.init();
    if (this.musicEnabled) this.musicSystem.startMusic();
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
    this.grid = new Grid(this.cfg.GRID_COLS, this.cfg.GRID_ROWS);
    this.obstacleSystem = new ObstacleSystem(this.grid, this.mapConfig?.obstacles, this.cfg);
    this.obstacleSystem.generate();
    this.roadSystem = new RoadSystem(this.grid);
    this.highwaySystem = new HighwaySystem();
    this.pathfinder = new Pathfinder(this.grid, this.highwaySystem);
    this.pendingDeletionSystem = new PendingDeletionSystem(this.grid, this.roadSystem);
    this.demandSystem = new DemandSystem(this.cfg);
    this.spawnSystem = new SpawnSystem(this.grid, this.demandSystem, this.cfg);
    this.demandWarnPrevSin = 0;
    this.carSystem = new CarSystem(this.pathfinder, this.grid, this.pendingDeletionSystem, this.highwaySystem);
    this.money = this.cfg.STARTING_MONEY;
    this.undoSystem = new UndoSystem(this.grid);
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem, this.grid, this.createMoneyInterface(), () => this.spawnSystem.getHouses(), this.undoSystem, () => this.activeTool);
    this.roadDrawer.onTryErase = (gx, gy) => this.handleTryErase(gx, gy);
    this.highwayDrawer = new HighwayDrawer(this.input, this.highwaySystem, this.grid, this.createMoneyInterface(), () => this.activeTool);
    this.setActiveTool(Tool.Road);
    this.renderer = new Renderer(this.webglRenderer, this.grid, () => this.spawnSystem.getHouses(), () => this.spawnSystem.getBusinesses());
    this.renderer.buildObstacles(this.obstacleSystem.getMountainCells(), this.obstacleSystem.getMountainHeightMap(), this.obstacleSystem.getLakeCells());
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.elapsedTime = 0;
    if (this.mapConfig?.houses || this.mapConfig?.businesses) {
      this.placePreDefinedEntities();
    } else {
      this.spawnSystem.spawnInitial();
    }
    if (this.mapConfig?.roads) {
      this.placePreDefinedRoads();
    }
    this.renderer.markGroundDirty();
    this.spawnSystem.clearDirty();
    this.musicSystem = new MusicSystem();
    this.soundEffects = new SoundEffectSystem();
    this.audioInitialized = false;
    await this.initAudio();
    this.carSystem.onHomeReturn = () => { this.money += this.cfg.DELIVERY_REWARD; this.soundEffects.playHomeReturn(); };
    this.roadDrawer.onRoadPlace = () => this.soundEffects.playRoadPlace();
    this.roadDrawer.onRoadDelete = () => this.soundEffects.playRoadDelete();
    this.spawnSystem.onSpawn = () => this.soundEffects.playSpawn();
    this.state = GameState.Playing;
  }

  performUndo(): void {
    if (this.state === GameState.GameOver) return;
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
    this.canvas.style.cursor = tool === Tool.Eraser ? 'crosshair' : tool === Tool.Highway ? 'crosshair' : 'default';
    this.toolChangeCallback?.(tool);
  }

  onToolChange(cb: ((tool: Tool) => void) | null): void {
    this.toolChangeCallback = cb;
  }

  private handleTryErase(gx: number, gy: number): boolean {
    // Also try erasing highways at this cell
    this.highwayDrawer.tryEraseAtCell(gx, gy);

    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Road) return false;

    if (cell.pendingDeletion) return false;

    // Check all car states that depend on this cell
    const cars = this.carSystem.getCars();
    const dependentCarIds: string[] = [];
    for (const car of cars) {
      if (car.state === CarState.GoingToBusiness && car.path.length > 0) {
        for (let i = 0; i < car.pathIndex; i++) {
          const p = stepGridPos(car.path[i]);
          if (p.gx === gx && p.gy === gy) {
            dependentCarIds.push(car.id);
            break;
          }
        }
      } else if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit) {
        for (const step of car.outboundPath) {
          const p = stepGridPos(step);
          if (p.gx === gx && p.gy === gy) {
            dependentCarIds.push(car.id);
            break;
          }
        }
      } else if (car.state === CarState.GoingHome && car.path.length > 0) {
        for (let i = car.pathIndex; i < car.path.length; i++) {
          const p = stepGridPos(car.path[i]);
          if (p.gx === gx && p.gy === gy) {
            dependentCarIds.push(car.id);
            break;
          }
        }
      }
    }

    if (dependentCarIds.length === 0) {
      if (this.roadSystem.removeRoad(gx, gy)) {
        this.money += this.cfg.ROAD_REFUND;
        return true;
      }
      return false;
    }

    this.pendingDeletionSystem.markPending(gx, gy, dependentCarIds);
    return true;
  }

  private placePreDefinedEntities(): void {
    if (this.mapConfig?.houses) {
      for (const h of this.mapConfig.houses) {
        this.spawnSystem.spawnHouse({ gx: h.gx, gy: h.gy }, h.color, h.connectorDir);
      }
    }
    if (this.mapConfig?.businesses) {
      for (const b of this.mapConfig.businesses) {
        this.spawnSystem.spawnBusiness({ gx: b.gx, gy: b.gy }, b.color, b.orientation, b.connectorSide);
      }
    }
    this.spawnSystem.unlockAllColors();
  }

  private placePreDefinedRoads(): void {
    if (!this.mapConfig?.roads) return;
    for (const r of this.mapConfig.roads) {
      this.roadSystem.placeRoad(r.gx, r.gy);
    }
    for (const r of this.mapConfig.roads) {
      const cell = this.grid.getCell(r.gx, r.gy);
      if (!cell || cell.type !== CellType.Road) continue;

      cell.roadConnections = r.connections ?? 0;
    }
    // Restore road-side bits on connector cells
    for (const r of this.mapConfig.roads) {
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

  private update(dt: number): void {
    if (this.state === GameState.WaitingToStart) return;

    // Road/highway editing — always runs (even when paused)
    this.roadDrawer.update();
    this.highwayDrawer.update();

    if (this.roadSystem.isDirty || this.highwaySystem.isDirty) {
      this.pathfinder.clearCache();
      this.carSystem.onRoadsChanged(this.spawnSystem.getHouses());
      if (this.roadSystem.isDirty) {
        this.roadSystem.clearDirty();
        this.renderer.markGroundDirty();
      }
      if (this.highwaySystem.isDirty) {
        this.highwaySystem.clearDirty();
        this.renderer.markHighwayDirty();
      }
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
    const hasWarning = this.spawnSystem.getBusinesses().some(b => b.demandPins >= this.cfg.MAX_DEMAND_PINS - 2);
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
      this.input.state.canvasX,
      this.input.state.canvasY,
      this.state === GameState.Paused,
      this.highwaySystem,
      this.activeTool,
      this.highwayDrawer.getPlacementState(),
    );
    let demandStats: DemandStat[] | null = null;
    if (DEMAND_DEBUG) {
      const colorDemands = this.demandSystem.getColorDemands();
      demandStats = this.spawnSystem.getUnlockedColors().map(color => ({
        color,
        demand: colorDemands.get(color) ?? 0,
        supplyPerMin: this.spawnSystem.getHouses().filter(h => h.color === color).length * this.cfg.HOUSE_SUPPLY_PER_MINUTE,
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

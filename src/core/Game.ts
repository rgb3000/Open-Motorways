import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
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
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;

    this.grid = new Grid();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.spawnSystem = new SpawnSystem(this.grid);
    this.demandSystem = new DemandSystem();
    this.carSystem = new CarSystem(this.pathfinder);
    this.input = new InputHandler(canvas);
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem);
    this.renderer = new Renderer(this.ctx, this.grid);

    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    // Listen for restart click
    canvas.addEventListener('click', () => {
      if (this.state === GameState.GameOver) {
        this.restart();
      }
    });

    // Initial spawn
    this.spawnSystem.spawnInitial();
  }

  start(): void {
    this.updateCanvasScale();
    this.gameLoop.start();
  }

  private update(dt: number): void {
    if (this.state !== GameState.Playing) return;

    this.elapsedTime += dt;

    // Input / road drawing
    this.roadDrawer.update();

    // If roads changed, invalidate path cache and reroute cars
    if (this.roadSystem.isDirty) {
      this.pathfinder.clearCache();
      this.carSystem.onRoadsChanged(this.spawnSystem.getHouses());
      this.roadSystem.clearDirty();
    }

    // Spawning
    this.spawnSystem.update(dt);

    // Demand
    this.demandSystem.update(dt, this.spawnSystem.getBusinesses());

    // Cars
    this.carSystem.update(dt, this.spawnSystem.getHouses(), this.spawnSystem.getBusinesses());

    // Check game over
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
      this.state,
      this.carSystem.getScore(),
      this.elapsedTime,
    );
  }

  private restart(): void {
    this.grid = new Grid();
    this.roadSystem = new RoadSystem(this.grid);
    this.pathfinder = new Pathfinder(this.grid);
    this.spawnSystem = new SpawnSystem(this.grid);
    this.demandSystem = new DemandSystem();
    this.carSystem = new CarSystem(this.pathfinder);
    this.roadDrawer = new RoadDrawer(this.input, this.roadSystem);
    this.renderer = new Renderer(this.ctx, this.grid);
    this.state = GameState.Playing;
    this.elapsedTime = 0;
    this.spawnSystem.spawnInitial();
  }

  private updateCanvasScale(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.input.updateScale(
      this.canvas.width / rect.width,
      this.canvas.height / rect.height,
    );
  }
}

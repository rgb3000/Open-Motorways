import type { Grid } from '../core/Grid';
import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import type { Car } from '../entities/Car';
import type { GameState } from '../types';
import { TerrainLayer } from './layers/TerrainLayer';
import { RoadLayer } from './layers/RoadLayer';
import { BuildingLayer } from './layers/BuildingLayer';
import { CarLayer } from './layers/CarLayer';
import { UILayer } from './layers/UILayer';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private terrainLayer: TerrainLayer;
  private roadLayer: RoadLayer;
  private buildingLayer: BuildingLayer;
  private carLayer: CarLayer;
  private uiLayer: UILayer;

  constructor(ctx: CanvasRenderingContext2D, grid: Grid) {
    this.ctx = ctx;
    this.terrainLayer = new TerrainLayer();
    this.roadLayer = new RoadLayer(grid);
    this.buildingLayer = new BuildingLayer();
    this.carLayer = new CarLayer();
    this.uiLayer = new UILayer();
  }

  render(
    alpha: number,
    houses: House[],
    businesses: Business[],
    cars: Car[],
    state: GameState,
    score: number,
    elapsedTime: number,
  ): void {
    this.terrainLayer.render(this.ctx);
    this.roadLayer.render(this.ctx);
    this.buildingLayer.render(this.ctx, houses, businesses);
    this.carLayer.render(this.ctx, cars, alpha);
    this.uiLayer.render(this.ctx, state, score, elapsedTime);
  }
}

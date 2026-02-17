import type { GameColor, Direction } from '../types';

export interface ObstacleDefinition {
  gx: number;
  gy: number;
  type: 'mountain' | 'lake';
  height?: number; // mountains only
}

export interface HouseDefinition {
  gx: number;
  gy: number;
  color: GameColor;
  connectorDir?: Direction;
}

export interface BusinessDefinition {
  gx: number;
  gy: number;
  color: GameColor;
  orientation: 'horizontal' | 'vertical';
  connectorSide: 'positive' | 'negative';
}

export interface RoadDefinition {
  gx: number;
  gy: number;
  connections?: Direction[];
}

export interface GameConstants {
  // Grid
  GRID_COLS: number;
  GRID_ROWS: number;

  // Demand
  MAX_DEMAND_PINS: number;
  DEMAND_BASE_RATE: number;
  DEMAND_RATE_GROWTH: number;
  DEMAND_PIN_COOLDOWN: number;

  // Cars
  CARS_PER_HOUSE: number;
  CAR_SPEED: number;

  // Parking
  PARKING_SLOTS: number;
  UNLOAD_TIME: number;
  PARKING_EXIT_DELAY: number;

  // Spawning
  INITIAL_SPAWN_DELAY: number;
  COLOR_UNLOCK_INTERVAL: number;
  HOUSE_CLUSTER_RADIUS: number;
  MIN_BUSINESS_DISTANCE: number;
  SPAWN_INTERVAL: number;
  MIN_SPAWN_INTERVAL: number;
  SPAWN_INTERVAL_DECAY: number;

  // Money
  STARTING_MONEY: number;
  ROAD_COST: number;
  DELIVERY_REWARD: number;
  ROAD_REFUND: number;

  // Obstacles
  MOUNTAIN_CLUSTER_COUNT: number;
  MOUNTAIN_CLUSTER_MIN_SIZE: number;
  MOUNTAIN_CLUSTER_MAX_SIZE: number;
  LAKE_CLUSTER_COUNT: number;
  LAKE_CLUSTER_MIN_SIZE: number;
  LAKE_CLUSTER_MAX_SIZE: number;
  OBSTACLE_EDGE_MARGIN: number;
  OBSTACLE_CENTER_EXCLUSION: number;

  // Demand-aware spawning
  HOUSE_SUPPLY_PER_MINUTE: number;
}

export interface MapConfig {
  id: string;
  name: string;
  description: string;
  debug?: boolean;
  obstacles?: ObstacleDefinition[];
  houses?: HouseDefinition[];
  businesses?: BusinessDefinition[];
  roads?: RoadDefinition[];
  constants?: Partial<GameConstants>;
}

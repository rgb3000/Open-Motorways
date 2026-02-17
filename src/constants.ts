import { GameColor } from './types';

// Grid
export const GRID_COLS = 70;
export const GRID_ROWS = 40;
export const TILE_SIZE = 50;
export const CANVAS_WIDTH = GRID_COLS * TILE_SIZE;
export const CANVAS_HEIGHT = GRID_ROWS * TILE_SIZE;

// Game loop
export const FIXED_DT = 1 / 60;         // 60 updates/sec
export const MAX_FRAME_TIME = 0.2;       // spiral-of-death cap

// Demand
export const MAX_DEMAND_PINS = 8;
export const DEMAND_BASE_RATE = 1.5;   // pins/min for a fresh business
export const DEMAND_RATE_GROWTH = 0.3; // additional pins/min per minute of age
export const DEMAND_PIN_COOLDOWN = 5;  // minimum seconds between adding pins to the same business

// Cars
export const CARS_PER_HOUSE = 2;
export const CAR_SPEED = 1; // tiles per second
export const LANE_OFFSET = TILE_SIZE * 0.12;    // px from tile center to lane center
export const CAR_WIDTH = TILE_SIZE * 0.15;       // px (narrow dimension, perpendicular to travel)
export const CAR_LENGTH = TILE_SIZE * 0.25;      // px (long dimension, along travel direction)
export const INTERSECTION_SPEED_MULTIPLIER = 0.5;
export const INTERSECTION_DEADLOCK_TIMEOUT = 2.0; // seconds
export const BEZIER_KAPPA = 0.5522847498; // 4*(√2-1)/3, quarter-circle Bezier approximation

// Parking
export const PARKING_SLOTS = 4;
export const UNLOAD_TIME = 2; // seconds
export const PARKING_EXIT_DELAY = 1; // seconds between departures from same lot

// Spawning
export const INITIAL_SPAWN_DELAY = 10;     // seconds before second color
export const COLOR_UNLOCK_INTERVAL = 35;   // seconds between new colors
export const HOUSE_CLUSTER_RADIUS = 3;     // tiles
export const MIN_BUSINESS_DISTANCE = 8;    // tiles from matching houses
export const SPAWN_INTERVAL = 18;          // seconds between spawns
export const MIN_SPAWN_INTERVAL = 10;
export const SPAWN_INTERVAL_DECAY = 0.97;
export const SPAWN_AREA_INTERVALS = [
  { threshold: 0, inset: 0.42 },   //  0 entities: 10% of grid
  { threshold: 4, inset: 0.40 },   //  4 entities: 20% of grid
  { threshold: 8, inset: 0.35 },   //  8 entities: 30% of grid
  { threshold: 12, inset: 0.30 },  // 12 entities: 40% of grid
  { threshold: 20, inset: 0.25 },  // 16 entities: 50% of grid
  { threshold: 30, inset: 0.20 },  // 20 entities: 60% of grid
  { threshold: 60, inset: 0.15 },  // 24 entities: 70% of grid
  { threshold: 120, inset: 0.10 },  // 28 entities: 80% of grid
  { threshold: 240, inset: 0.05 },  // 32 entities: 90% of grid
  { threshold: 480, inset: 0.00 },  // 36 entities: full grid
];

// Money
export const STARTING_MONEY = 400;
export const ROAD_COST = 10;
export const DELIVERY_REWARD = 50;
export const ROAD_REFUND = 10;

// Colors - map GameColor enum to hex
export const COLOR_MAP: Record<GameColor, string> = {
  [GameColor.Red]: '#E74C3C',
  [GameColor.Blue]: '#3498DB',
  [GameColor.Yellow]: '#F1C40F',
  [GameColor.Green]: '#2ECC71',
  [GameColor.Purple]: '#9B59B6',
  [GameColor.Orange]: '#E67E22',
};

// Obstacles
export const MOUNTAIN_CLUSTER_COUNT = 3;
export const MOUNTAIN_CLUSTER_MIN_SIZE = 4;
export const MOUNTAIN_CLUSTER_MAX_SIZE = 8;
export const LAKE_CLUSTER_COUNT = 2;
export const LAKE_CLUSTER_MIN_SIZE = 5;
export const LAKE_CLUSTER_MAX_SIZE = 12;
export const OBSTACLE_EDGE_MARGIN = 3;
export const OBSTACLE_CENTER_EXCLUSION = 8;

export const MOUNTAIN_COLOR = '#A0947C';
export const MOUNTAIN_PEAK_COLOR = '#8A7E66';
export const LAKE_COLOR = '#7ABFCF';
export const LAKE_SHORE_COLOR = '#C4B896';
export const MOUNTAIN_MIN_HEIGHT = 6;
export const MOUNTAIN_MAX_HEIGHT = 14;
export const LAKE_DEPTH = 5;
export const LAKE_WATER_SURFACE_Y = -2;
export const LAKE_WATER_COLOR_HEX = 0x7ABFCF;
export const LAKE_WATER_OPACITY = 0.55;
export const LAKE_BED_COLOR = '#5A9AAA';

// Demand-aware spawning
export const HOUSE_SUPPLY_PER_MINUTE = 2.0; // pins/min one house can clear. this is an estimation and used to calculate if there is enough houses on the maps

// Debug
export const SPAWN_DEBUG = true;
export const DEMAND_DEBUG = true;
export const ROAD_DEBUG = false;
export const ROAD_GRAPH_DEBUG = false;

// Rendering colors
export const BG_COLOR = '#E8D8B4';
export const GRID_LINE_COLOR = '#D4C4A0';
// Roads
export const ROAD_HALF_WIDTH = TILE_SIZE * 0.2;
export const ROAD_COLOR = '#B8B8B8';
export const ROAD_OUTLINE_COLOR = '#C0C0C0';
export const ROAD_LANE_DIVIDER_COLOR = '#DDDDDD';
export const ROAD_CORNER_RADIUS = 3.0; // px
export const UI_TEXT_COLOR = '#333333';
export const GAME_OVER_OVERLAY = 'rgba(0, 0, 0, 0.6)';

export const GROUND_Y_POSITION = 1;

// Color unlock order
export const COLOR_UNLOCK_ORDER: GameColor[] = [
  GameColor.Red,
  GameColor.Blue,
  GameColor.Yellow,
  GameColor.Green,
  GameColor.Purple,
  GameColor.Orange,
];

// --- Configurable constants bundle ---
import type { GameConstants } from './maps/types';

export const DEFAULT_GAME_CONSTANTS: GameConstants = {
  GRID_COLS,
  GRID_ROWS,
  MAX_DEMAND_PINS,
  DEMAND_BASE_RATE,
  DEMAND_RATE_GROWTH,
  DEMAND_PIN_COOLDOWN,
  CARS_PER_HOUSE,
  CAR_SPEED,
  PARKING_SLOTS,
  UNLOAD_TIME,
  PARKING_EXIT_DELAY,
  INITIAL_SPAWN_DELAY,
  COLOR_UNLOCK_INTERVAL,
  HOUSE_CLUSTER_RADIUS,
  MIN_BUSINESS_DISTANCE,
  SPAWN_INTERVAL,
  MIN_SPAWN_INTERVAL,
  SPAWN_INTERVAL_DECAY,
  STARTING_MONEY,
  ROAD_COST,
  DELIVERY_REWARD,
  ROAD_REFUND,
  MOUNTAIN_CLUSTER_COUNT,
  MOUNTAIN_CLUSTER_MIN_SIZE,
  MOUNTAIN_CLUSTER_MAX_SIZE,
  LAKE_CLUSTER_COUNT,
  LAKE_CLUSTER_MIN_SIZE,
  LAKE_CLUSTER_MAX_SIZE,
  OBSTACLE_EDGE_MARGIN,
  OBSTACLE_CENTER_EXCLUSION,
  HOUSE_SUPPLY_PER_MINUTE,
};

export function buildConfig(overrides?: Partial<GameConstants>): GameConstants {
  if (!overrides) return { ...DEFAULT_GAME_CONSTANTS };
  return { ...DEFAULT_GAME_CONSTANTS, ...overrides };
}

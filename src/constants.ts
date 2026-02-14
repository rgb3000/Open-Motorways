import { GameColor } from './types';

// Grid
export const GRID_COLS = 40;
export const GRID_ROWS = 25;
export const TILE_SIZE = 24;
export const CANVAS_WIDTH = GRID_COLS * TILE_SIZE;  // 960
export const CANVAS_HEIGHT = GRID_ROWS * TILE_SIZE; // 600

// Game loop
export const FIXED_DT = 1 / 60;         // 60 updates/sec
export const MAX_FRAME_TIME = 0.2;       // spiral-of-death cap

// Demand
export const MAX_DEMAND_PINS = 8;
export const INITIAL_DEMAND_INTERVAL = 5;  // seconds
export const MIN_DEMAND_INTERVAL = 1.5;
export const DEMAND_INTERVAL_DECAY = 0.97; // multiplier per demand tick

// Cars
export const CARS_PER_HOUSE = 2;
export const CAR_SPEED = 2; // tiles per second
export const LANE_OFFSET = 3.0;   // px from tile center to lane center
export const CAR_WIDTH = 5.0;     // px (narrow dimension, perpendicular to travel)
export const CAR_LENGTH = 8.0;    // px (long dimension, along travel direction)
export const INTERSECTION_SPEED_MULTIPLIER = 0.5;
export const INTERSECTION_DEADLOCK_TIMEOUT = 2.0; // seconds
export const BEZIER_KAPPA = 0.5522847498; // 4*(√2-1)/3, quarter-circle Bezier approximation

// Spawning
export const INITIAL_SPAWN_DELAY = 10;     // seconds before second color
export const COLOR_UNLOCK_INTERVAL = 35;   // seconds between new colors
export const HOUSE_CLUSTER_RADIUS = 3;     // tiles
export const MIN_BUSINESS_DISTANCE = 8;    // tiles from matching houses
export const SPAWN_INTERVAL = 12;          // seconds between spawns
export const MIN_SPAWN_INTERVAL = 6;
export const SPAWN_INTERVAL_DECAY = 0.95;
export const HOUSE_SPAWN_PROBABILITY = 0.7;

// Money
export const STARTING_MONEY = 200;
export const ROAD_COST = 10;
export const BRIDGE_COST = 20;
export const DELIVERY_REWARD = 100;
export const ROAD_REFUND = 10;
export const BRIDGE_REFUND = 20;

// Colors - map GameColor enum to hex
export const COLOR_MAP: Record<GameColor, string> = {
  [GameColor.Red]: '#E74C3C',
  [GameColor.Blue]: '#3498DB',
  [GameColor.Yellow]: '#F1C40F',
  [GameColor.Green]: '#2ECC71',
  [GameColor.Purple]: '#9B59B6',
  [GameColor.Orange]: '#E67E22',
};

// Rendering colors
export const BG_COLOR = '#F5F0E8';
export const GRID_LINE_COLOR = '#E8E3DB';
export const ROAD_COLOR = '#9E9E9E';
export const ROAD_OUTLINE_COLOR = '#757575';
export const ROAD_LANE_DIVIDER_COLOR = '#B0B0B0';
export const ROAD_CORNER_RADIUS = 3.0; // px
export const UI_TEXT_COLOR = '#333333';
export const GAME_OVER_OVERLAY = 'rgba(0, 0, 0, 0.6)';

// Bridge rendering
export const BRIDGE_COLOR = '#787878';
export const BRIDGE_OUTLINE_COLOR = '#555555';
export const BRIDGE_BARRIER_COLOR = '#444444';
export const BRIDGE_SHADOW_COLOR = 'rgba(0, 0, 0, 0.15)';
export const BRIDGE_Y_POSITION = 5;
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

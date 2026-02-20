
import { GameColor, Direction } from '../../types';
import type { MapConfig } from '../types';

const houses = [
  { gx: 29, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 30, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 31, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 32, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 33, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 34, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 35, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 36, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 37, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 38, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 39, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 40, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 41, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 42, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
  { gx: 43, gy: 16, color: GameColor.Yellow, connectorDir: Direction.Down },
];

const businesses = [
  { gx: 39, gy: 29, color: GameColor.Yellow, orientation: 'vertical' as const, connectorSide: 'negative' as const },
  { gx: 39, gy: 27, color: GameColor.Yellow, orientation: 'vertical' as const, connectorSide: 'negative' as const },
  { gx: 39, gy: 25, color: GameColor.Yellow, orientation: 'vertical' as const, connectorSide: 'negative' as const },
  { gx: 39, gy: 23, color: GameColor.Yellow, orientation: 'vertical' as const, connectorSide: 'negative' as const },
  { gx: 39, gy: 21, color: GameColor.Yellow, orientation: 'vertical' as const, connectorSide: 'negative' as const },
  { gx: 39, gy: 19, color: GameColor.Yellow, orientation: 'vertical' as const, connectorSide: 'negative' as const },
  { gx: 39, gy: 31, color: GameColor.Yellow, orientation: 'vertical' as const, connectorSide: 'negative' as const },
];

const roads = [
  { gx: 38, gy: 18 }, { gx: 38, gy: 19 }, { gx: 38, gy: 21 }, { gx: 38, gy: 23 }, { gx: 38, gy: 25 }, { gx: 38, gy: 27 }, { gx: 38, gy: 29 }, { gx: 38, gy: 31 },
  { gx: 38, gy: 34 },
];

export const trafficStressTestMap: MapConfig = {
  id: 'traffic-stress-test',
  name: 'Traffic Stress Test',
  description: 'Created with Map Designer',
  debug: true,
  houses,
  businesses,
  roads,
  obstacles: [],
  constants: {
    STARTING_MONEY: 99999,
    SPAWN_INTERVAL: 999999,
    MIN_SPAWN_INTERVAL: 999999,
    MOUNTAIN_CLUSTER_COUNT: 0,
    LAKE_CLUSTER_COUNT: 0,
  },
};

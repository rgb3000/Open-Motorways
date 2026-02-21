
import { GameColor } from '../../types';
import type { MapConfig } from '../types';

const houses = [
  { gx: 29, gy: 16, color: GameColor.Yellow },
  { gx: 30, gy: 16, color: GameColor.Yellow },
  { gx: 31, gy: 16, color: GameColor.Yellow },
  { gx: 32, gy: 16, color: GameColor.Yellow },
  { gx: 33, gy: 16, color: GameColor.Yellow },
  { gx: 34, gy: 16, color: GameColor.Yellow },
  { gx: 35, gy: 16, color: GameColor.Yellow },
  { gx: 36, gy: 16, color: GameColor.Yellow },
  { gx: 37, gy: 16, color: GameColor.Yellow },
  { gx: 38, gy: 16, color: GameColor.Yellow },
  { gx: 39, gy: 16, color: GameColor.Yellow },
  { gx: 40, gy: 16, color: GameColor.Yellow },
  { gx: 41, gy: 16, color: GameColor.Yellow },
  { gx: 42, gy: 16, color: GameColor.Yellow },
  { gx: 43, gy: 16, color: GameColor.Yellow },
];

// 2x2 businesses with rotation 0: connector at (anchor.gx, anchor.gy+1)
// Spaced 3 rows apart to allow roads between them
const businesses = [
  { gx: 38, gy: 19, color: GameColor.Yellow, rotation: 0 as const },
  { gx: 38, gy: 22, color: GameColor.Yellow, rotation: 0 as const },
  { gx: 38, gy: 25, color: GameColor.Yellow, rotation: 0 as const },
  { gx: 38, gy: 28, color: GameColor.Yellow, rotation: 0 as const },
  { gx: 38, gy: 31, color: GameColor.Yellow, rotation: 0 as const },
];

// Road column at gx=38 connecting houses to businesses
// Roads from house row (y=17) down, filling gaps between business connectors
const roads = [
  { gx: 38, gy: 17 }, // adjacent to houses at y=16
  { gx: 38, gy: 18 }, // between houses and first business
  { gx: 38, gy: 21 }, // between business 1 and 2
  { gx: 38, gy: 24 }, // between business 2 and 3
  { gx: 38, gy: 27 }, // between business 3 and 4
  { gx: 38, gy: 30 }, // between business 4 and 5
  { gx: 38, gy: 33 }, // below last business
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

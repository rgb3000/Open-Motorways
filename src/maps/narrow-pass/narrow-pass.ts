import type { MapConfig, ObstacleDefinition } from '../types';
import terrainSvg from './terrain.svg';

// Vertical mountain wall at column 35, with a gap from rows 18-22
const obstacles: ObstacleDefinition[] = [];

for (let gy = 2; gy <= 17; gy++) {
  for (let dx = -1; dx <= 1; dx++) {
    obstacles.push({ gx: 35 + dx, gy, type: 'mountain', height: 10 + Math.abs(dx) * -2 });
  }
}

for (let gy = 23; gy <= 37; gy++) {
  for (let dx = -1; dx <= 1; dx++) {
    obstacles.push({ gx: 35 + dx, gy, type: 'mountain', height: 10 + Math.abs(dx) * -2 });
  }
}

export const narrowPassMap: MapConfig = {
  id: 'narrow-pass',
  name: 'Narrow Pass',
  description: 'A mountain wall splits the map. One gap to connect both sides.',
  terrainSvg,
  obstacles,
  constants: {
    DEMAND_RATE_GROWTH: 0.4,
    MOUNTAIN_CLUSTER_COUNT: 0,
    LAKE_CLUSTER_COUNT: 0,
  },
};

import type { MapConfig, ObstacleDefinition } from '../types';

function lakePatch(cx: number, cy: number, radius: number): ObstacleDefinition[] {
  const cells: ObstacleDefinition[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Rough circle shape with some randomness baked in
      if (dx * dx + dy * dy <= radius * radius + radius) {
        cells.push({ gx: cx + dx, gy: cy + dy, type: 'lake' });
      }
    }
  }
  return cells;
}

const obstacles: ObstacleDefinition[] = [
  ...lakePatch(12, 8, 3),
  ...lakePatch(55, 10, 3),
  ...lakePatch(8, 28, 2),
  ...lakePatch(35, 32, 3),
  ...lakePatch(58, 30, 2),
  ...lakePatch(28, 15, 2),
];

export const lakelandMap: MapConfig = {
  id: 'lakeland',
  name: 'Lakeland',
  description: 'Lakes everywhere, no mountains. Extra starting money to compensate.',
  obstacles,
  constants: {
    STARTING_MONEY: 500,
    MOUNTAIN_CLUSTER_COUNT: 0,
    LAKE_CLUSTER_COUNT: 0, // we provide our own
  },
};

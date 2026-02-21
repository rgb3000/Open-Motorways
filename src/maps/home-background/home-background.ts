import { GameColor } from '../../types';
import type { MapConfig } from '../types';
import type { HouseDefinition, BusinessDefinition, RoadDefinition } from '../types';

const ALL_COLORS: GameColor[] = [
  GameColor.Red, GameColor.Blue, GameColor.Yellow,
  GameColor.Green, GameColor.Purple, GameColor.Orange,
];

// Generate houses in rows across the map
const houses: HouseDefinition[] = [];
const houseXPositions = [12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56];
for (let row = 0; row < 3; row++) {
  const gy = 4 + row * 4; // y = 4, 8, 12
  for (let i = 0; i < houseXPositions.length; i++) {
    houses.push({
      gx: houseXPositions[i],
      gy,
      color: ALL_COLORS[i % ALL_COLORS.length],
    });
  }
}

// Generate businesses in rows across the map (2x2 layout)
// Rotation 0: anchor at top-left → connector at (anchor.gx, anchor.gy + 1)
const businesses: BusinessDefinition[] = [];
const bizXPositions = [14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58];
for (let row = 0; row < 3; row++) {
  const gy = 27 + row * 4; // y = 27, 31, 35
  for (let i = 0; i < bizXPositions.length; i++) {
    businesses.push({
      gx: bizXPositions[i] - 1, // anchor = top-left of 2x2
      gy,
      color: ALL_COLORS[i % ALL_COLORS.length],
      rotation: 0,
    });
  }
}

// Build connected road network
const roads: RoadDefinition[] = [];

// Horizontal trunk road at y=19
for (let x = 10; x <= 60; x++) {
  roads.push({ gx: x, gy: 19 });
}
// Second horizontal trunk road at y=23
for (let x = 10; x <= 60; x++) {
  roads.push({ gx: x, gy: 23 });
}
// Connect the two trunks vertically at regular intervals
for (const x of houseXPositions) {
  for (let y = 20; y <= 22; y++) {
    roads.push({ gx: x, gy: y });
  }
}

// Vertical roads from each house (gy) down to upper trunk (y=19)
// Roads go from gy+1 (adjacent to house) down to y=18 (adjacent to trunk)
for (const h of houses) {
  for (let y = h.gy + 1; y < 19; y++) {
    roads.push({ gx: h.gx, gy: y });
  }
}

// Vertical roads from lower trunk (y=23) down to each business connector
// With rotation 0: connector is at (anchor.gx, anchor.gy + 1)
for (const b of businesses) {
  const connX = b.gx; // anchor.gx = connector.gx for rotation 0
  const connY = b.gy + 1;
  // Vertical drop from trunk to connector row
  for (let y = 24; y < connY; y++) {
    roads.push({ gx: connX, gy: y });
  }
}

export const homeBackgroundMap: MapConfig = {
  id: 'home-background',
  name: 'Home Background',
  description: 'Background simulation for home page',
  debug: true,
  houses,
  businesses,
  roads,
  obstacles: [],
  constants: {
    STARTING_MONEY: 99999,
    SPAWN_INTERVAL: 999999,
    MIN_SPAWN_INTERVAL: 999999,
    DEMAND_BASE_RATE: 0.1,
    MAX_DEMAND_PINS: 999,
    MOUNTAIN_CLUSTER_COUNT: 0,
    LAKE_CLUSTER_COUNT: 0,
  },
};

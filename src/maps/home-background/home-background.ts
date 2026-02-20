import { GameColor, Direction } from '../../types';
import type { MapConfig } from '../types';
import type { HouseDefinition, BusinessDefinition, RoadDefinition } from '../types';

const ALL_COLORS: GameColor[] = [
  GameColor.Red, GameColor.Blue, GameColor.Yellow,
  GameColor.Green, GameColor.Purple, GameColor.Orange,
];

// Generate houses in rows across the map
// House at (gx, gy) with connectorDir Down -> connector at (gx, gy+1)
const houses: HouseDefinition[] = [];
const houseXPositions = [12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56];
for (let row = 0; row < 3; row++) {
  const gy = 4 + row * 4; // y = 4, 8, 12
  for (let i = 0; i < houseXPositions.length; i++) {
    houses.push({
      gx: houseXPositions[i],
      gy,
      color: ALL_COLORS[i % ALL_COLORS.length],
      connectorDir: Direction.Down,
    });
  }
}

// Generate businesses in rows across the map
// Business at (gx, gy), vertical, negative:
//   parking at (gx, gy+1), connector at (gx-1, gy+1)
// So the connector x = gx - 1
const businesses: BusinessDefinition[] = [];
const bizXPositions = [14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58];
for (let row = 0; row < 3; row++) {
  const gy = 27 + row * 4; // y = 27, 31, 35
  for (let i = 0; i < bizXPositions.length; i++) {
    businesses.push({
      gx: bizXPositions[i],
      gy,
      color: ALL_COLORS[i % ALL_COLORS.length],
      orientation: 'vertical',
      connectorSide: 'negative',
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

// Vertical roads from each house connector (gy+1) down to upper trunk (y=19)
for (const h of houses) {
  const connY = h.gy + 1; // connector cell
  for (let y = connY + 1; y < 19; y++) {
    roads.push({ gx: h.gx, gy: y });
  }
}

// Vertical roads from lower trunk (y=23) down to each business connector
// Connector is at (bizX - 1, bizY + 1)
for (const b of businesses) {
  const connX = b.gx - 1;
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

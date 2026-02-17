import { GameColor, Direction } from '../types';
import type { MapConfig, HouseDefinition, BusinessDefinition, RoadDefinition } from './types';

// Helper: horizontal road segment
function hRoad(y: number, x1: number, x2: number): RoadDefinition[] {
  const roads: RoadDefinition[] = [];
  const start = Math.min(x1, x2);
  const end = Math.max(x1, x2);
  for (let x = start; x <= end; x++) {
    roads.push({ gx: x, gy: y });
  }
  return roads;
}

// Helper: vertical road segment
function vRoad(x: number, y1: number, y2: number): RoadDefinition[] {
  const roads: RoadDefinition[] = [];
  const start = Math.min(y1, y2);
  const end = Math.max(y1, y2);
  for (let y = start; y <= end; y++) {
    roads.push({ gx: x, gy: y });
  }
  return roads;
}

// Helper: diagonal down-right
function diagDR(x: number, y: number, len: number): RoadDefinition[] {
  const roads: RoadDefinition[] = [];
  for (let i = 0; i < len; i++) {
    roads.push({ gx: x + i, gy: y + i });
  }
  return roads;
}

// Helper: diagonal down-left
function diagDL(x: number, y: number, len: number): RoadDefinition[] {
  const roads: RoadDefinition[] = [];
  for (let i = 0; i < len; i++) {
    roads.push({ gx: x - i, gy: y + i });
  }
  return roads;
}

function deduplicateRoads(roads: RoadDefinition[]): RoadDefinition[] {
  const seen = new Set<string>();
  return roads.filter(r => {
    const key = `${r.gx},${r.gy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// All 6 colors cycled evenly
const COLORS: GameColor[] = [
  GameColor.Red, GameColor.Blue, GameColor.Yellow,
  GameColor.Green, GameColor.Purple, GameColor.Orange,
];
function color(i: number): GameColor {
  return COLORS[i % COLORS.length];
}

// ── Zone A: T-junctions (cols 3-18, rows 2-10) ──
const zoneARoads: RoadDefinition[] = [
  // Horizontal main roads
  ...hRoad(3, 3, 18),
  ...hRoad(6, 3, 18),
  ...hRoad(9, 3, 18),
  // Vertical T-stems (top T-junctions on row 3)
  ...vRoad(6, 3, 5),
  ...vRoad(10, 3, 5),
  ...vRoad(14, 3, 5),
  // Bottom T-stems (row 9)
  ...vRoad(6, 7, 9),
  ...vRoad(10, 7, 9),
  ...vRoad(14, 7, 9),
];

const zoneAHouses: HouseDefinition[] = [
  { gx: 4, gy: 2, color: color(0), connectorDir: Direction.Down },
  { gx: 8, gy: 2, color: color(1), connectorDir: Direction.Down },
  { gx: 12, gy: 2, color: color(2), connectorDir: Direction.Down },
  { gx: 16, gy: 2, color: color(3), connectorDir: Direction.Down },
  { gx: 4, gy: 10, color: color(4), connectorDir: Direction.Up },
  { gx: 8, gy: 10, color: color(5), connectorDir: Direction.Up },
  { gx: 12, gy: 10, color: color(0), connectorDir: Direction.Up },
];

const zoneABusinesses: BusinessDefinition[] = [
  { gx: 16, gy: 4, color: color(0), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 4, gy: 4, color: color(1), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 8, gy: 7, color: color(2), orientation: 'vertical', connectorSide: 'negative' },
];

// ── Zone B: 4-way crossings (cols 22-42, rows 2-10) ──
const zoneBRoads: RoadDefinition[] = [
  // Grid of roads
  ...hRoad(3, 22, 42),
  ...hRoad(6, 22, 42),
  ...hRoad(9, 22, 42),
  ...vRoad(25, 2, 10),
  ...vRoad(29, 2, 10),
  ...vRoad(33, 2, 10),
  ...vRoad(37, 2, 10),
  ...vRoad(41, 2, 10),
];

const zoneBHouses: HouseDefinition[] = [
  { gx: 23, gy: 2, color: color(3), connectorDir: Direction.Down },
  { gx: 27, gy: 2, color: color(4), connectorDir: Direction.Down },
  { gx: 31, gy: 2, color: color(5), connectorDir: Direction.Down },
  { gx: 35, gy: 2, color: color(0), connectorDir: Direction.Down },
  { gx: 39, gy: 2, color: color(1), connectorDir: Direction.Down },
  { gx: 23, gy: 10, color: color(2), connectorDir: Direction.Up },
  { gx: 27, gy: 10, color: color(3), connectorDir: Direction.Up },
  { gx: 31, gy: 10, color: color(4), connectorDir: Direction.Up },
];

const zoneBBusinesses: BusinessDefinition[] = [
  { gx: 35, gy: 4, color: color(3), orientation: 'horizontal', connectorSide: 'positive' },
  { gx: 39, gy: 4, color: color(4), orientation: 'horizontal', connectorSide: 'positive' },
  { gx: 35, gy: 7, color: color(5), orientation: 'horizontal', connectorSide: 'negative' },
  { gx: 39, gy: 7, color: color(0), orientation: 'horizontal', connectorSide: 'negative' },
];

// ── Zone C: Diagonal crossings (cols 46-66, rows 2-10) ──
const zoneCRoads: RoadDefinition[] = [
  ...diagDR(46, 2, 9),
  ...diagDR(50, 2, 9),
  ...diagDL(62, 2, 9),
  ...diagDL(58, 2, 9),
  ...hRoad(6, 46, 66),
];

const zoneCHouses: HouseDefinition[] = [
  { gx: 47, gy: 2, color: color(5), connectorDir: Direction.Down },
  { gx: 51, gy: 2, color: color(0), connectorDir: Direction.Down },
  { gx: 57, gy: 2, color: color(1), connectorDir: Direction.Down },
  { gx: 61, gy: 2, color: color(2), connectorDir: Direction.Down },
  { gx: 64, gy: 2, color: color(3), connectorDir: Direction.Down },
];

const zoneCBusinesses: BusinessDefinition[] = [
  { gx: 47, gy: 9, color: color(5), orientation: 'horizontal', connectorSide: 'negative' },
  { gx: 57, gy: 9, color: color(1), orientation: 'horizontal', connectorSide: 'negative' },
  { gx: 63, gy: 4, color: color(2), orientation: 'vertical', connectorSide: 'negative' },
];

// ── Zone D: Mixed diagonal+cardinal (cols 3-18, rows 14-24) ──
const zoneDRoads: RoadDefinition[] = [
  ...hRoad(16, 3, 18),
  ...hRoad(22, 3, 18),
  ...vRoad(3, 14, 24),
  ...vRoad(18, 14, 24),
  ...diagDR(3, 14, 5),
  ...diagDL(18, 14, 5),
  ...diagDR(3, 19, 5),
  ...diagDL(18, 19, 5),
  ...vRoad(10, 14, 24),
];

const zoneDHouses: HouseDefinition[] = [
  { gx: 5, gy: 14, color: color(4), connectorDir: Direction.Down },
  { gx: 12, gy: 14, color: color(5), connectorDir: Direction.Down },
  { gx: 16, gy: 14, color: color(0), connectorDir: Direction.Down },
  { gx: 5, gy: 24, color: color(1), connectorDir: Direction.Up },
  { gx: 12, gy: 24, color: color(2), connectorDir: Direction.Up },
  { gx: 16, gy: 24, color: color(3), connectorDir: Direction.Up },
];

const zoneDBusinesses: BusinessDefinition[] = [
  { gx: 5, gy: 17, color: color(4), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 12, gy: 17, color: color(5), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 5, gy: 20, color: color(0), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 12, gy: 20, color: color(1), orientation: 'vertical', connectorSide: 'positive' },
];

// ── Zone E: Diamond/roundabout-like (cols 22-42, rows 14-24) ──
const zoneERoads: RoadDefinition[] = [
  // Diamond shape
  ...diagDR(27, 14, 6),
  ...diagDL(37, 14, 6),
  ...diagDR(27, 20, 5),
  ...diagDL(37, 20, 5),
  // Connecting horizontals
  ...hRoad(14, 27, 37),
  ...hRoad(24, 27, 37),
  ...hRoad(19, 22, 42),
  // Verticals on sides
  ...vRoad(22, 14, 24),
  ...vRoad(42, 14, 24),
];

const zoneEHouses: HouseDefinition[] = [
  { gx: 24, gy: 14, color: color(0), connectorDir: Direction.Down },
  { gx: 30, gy: 14, color: color(1), connectorDir: Direction.Down },
  { gx: 34, gy: 14, color: color(2), connectorDir: Direction.Down },
  { gx: 40, gy: 14, color: color(3), connectorDir: Direction.Down },
  { gx: 24, gy: 24, color: color(4), connectorDir: Direction.Up },
  { gx: 30, gy: 24, color: color(5), connectorDir: Direction.Up },
  { gx: 34, gy: 24, color: color(0), connectorDir: Direction.Up },
  { gx: 40, gy: 24, color: color(1), connectorDir: Direction.Up },
];

const zoneEBusinesses: BusinessDefinition[] = [
  { gx: 23, gy: 16, color: color(0), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 23, gy: 21, color: color(4), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 40, gy: 16, color: color(2), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 40, gy: 21, color: color(3), orientation: 'vertical', connectorSide: 'negative' },
];

// ── Zone F: Dense grid network (cols 46-66, rows 14-24) ──
const zoneFRoads: RoadDefinition[] = [
  ...hRoad(14, 46, 66),
  ...hRoad(17, 46, 66),
  ...hRoad(20, 46, 66),
  ...hRoad(23, 46, 66),
  ...vRoad(46, 14, 24),
  ...vRoad(49, 14, 24),
  ...vRoad(52, 14, 24),
  ...vRoad(55, 14, 24),
  ...vRoad(58, 14, 24),
  ...vRoad(61, 14, 24),
  ...vRoad(64, 14, 24),
];

const zoneFHouses: HouseDefinition[] = [
  { gx: 47, gy: 15, color: color(2), connectorDir: Direction.Right },
  { gx: 50, gy: 15, color: color(3), connectorDir: Direction.Right },
  { gx: 53, gy: 15, color: color(4), connectorDir: Direction.Right },
  { gx: 47, gy: 18, color: color(5), connectorDir: Direction.Right },
  { gx: 50, gy: 18, color: color(0), connectorDir: Direction.Right },
  { gx: 53, gy: 18, color: color(1), connectorDir: Direction.Right },
  { gx: 47, gy: 21, color: color(2), connectorDir: Direction.Right },
  { gx: 50, gy: 21, color: color(3), connectorDir: Direction.Right },
];

const zoneFBusinesses: BusinessDefinition[] = [
  { gx: 59, gy: 15, color: color(2), orientation: 'horizontal', connectorSide: 'positive' },
  { gx: 62, gy: 15, color: color(3), orientation: 'horizontal', connectorSide: 'positive' },
  { gx: 59, gy: 18, color: color(4), orientation: 'horizontal', connectorSide: 'positive' },
  { gx: 62, gy: 18, color: color(5), orientation: 'horizontal', connectorSide: 'positive' },
  { gx: 59, gy: 21, color: color(0), orientation: 'horizontal', connectorSide: 'positive' },
  { gx: 62, gy: 21, color: color(1), orientation: 'horizontal', connectorSide: 'positive' },
];

// ── Zone G: Long straights + merges (cols 3-34, rows 28-37) ──
const zoneGRoads: RoadDefinition[] = [
  ...hRoad(29, 3, 34),
  ...hRoad(33, 3, 34),
  ...hRoad(36, 3, 34),
  ...vRoad(3, 28, 37),
  ...vRoad(10, 28, 37),
  ...vRoad(18, 28, 37),
  ...vRoad(26, 28, 37),
  ...vRoad(34, 28, 37),
  // Diagonal merges
  ...diagDR(10, 29, 4),
  ...diagDL(18, 29, 4),
  ...diagDR(18, 33, 4),
  ...diagDL(26, 33, 4),
];

const zoneGHouses: HouseDefinition[] = [
  { gx: 5, gy: 28, color: color(0), connectorDir: Direction.Down },
  { gx: 12, gy: 28, color: color(1), connectorDir: Direction.Down },
  { gx: 20, gy: 28, color: color(2), connectorDir: Direction.Down },
  { gx: 28, gy: 28, color: color(3), connectorDir: Direction.Down },
  { gx: 5, gy: 37, color: color(4), connectorDir: Direction.Up },
  { gx: 12, gy: 37, color: color(5), connectorDir: Direction.Up },
  { gx: 20, gy: 37, color: color(0), connectorDir: Direction.Up },
  { gx: 28, gy: 37, color: color(1), connectorDir: Direction.Up },
];

const zoneGBusinesses: BusinessDefinition[] = [
  { gx: 5, gy: 30, color: color(0), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 12, gy: 30, color: color(1), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 20, gy: 30, color: color(2), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 28, gy: 30, color: color(3), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 5, gy: 34, color: color(4), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 12, gy: 34, color: color(5), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 20, gy: 34, color: color(0), orientation: 'vertical', connectorSide: 'negative' },
];

// ── Zone H: Highway-style Y-merges (cols 38-66, rows 28-37) ──
const zoneHRoads: RoadDefinition[] = [
  ...hRoad(32, 38, 66),
  ...vRoad(38, 28, 37),
  ...vRoad(52, 28, 37),
  ...vRoad(66, 28, 37),
  // Y-merge: two diagonals merging into vertical
  ...diagDR(42, 28, 5),
  ...diagDL(48, 28, 5),
  // Second Y-merge
  ...diagDR(56, 28, 5),
  ...diagDL(62, 28, 5),
  // Lower Y-merges
  ...diagDR(42, 33, 4),
  ...diagDL(48, 33, 4),
  ...diagDR(56, 33, 4),
  ...diagDL(62, 33, 4),
  ...hRoad(37, 38, 66),
];

const zoneHHouses: HouseDefinition[] = [
  { gx: 40, gy: 28, color: color(2), connectorDir: Direction.Down },
  { gx: 44, gy: 28, color: color(3), connectorDir: Direction.Down },
  { gx: 50, gy: 28, color: color(4), connectorDir: Direction.Down },
  { gx: 54, gy: 28, color: color(5), connectorDir: Direction.Down },
  { gx: 58, gy: 28, color: color(0), connectorDir: Direction.Down },
  { gx: 64, gy: 28, color: color(1), connectorDir: Direction.Down },
];

const zoneHBusinesses: BusinessDefinition[] = [
  { gx: 40, gy: 34, color: color(2), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 48, gy: 34, color: color(3), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 54, gy: 34, color: color(4), orientation: 'vertical', connectorSide: 'positive' },
  { gx: 62, gy: 34, color: color(5), orientation: 'vertical', connectorSide: 'negative' },
  { gx: 40, gy: 38, color: color(0), orientation: 'horizontal', connectorSide: 'negative' },
  { gx: 54, gy: 38, color: color(1), orientation: 'horizontal', connectorSide: 'negative' },
];

// ── Combine all zones ──
const allRoads = deduplicateRoads([
  ...zoneARoads, ...zoneBRoads, ...zoneCRoads, ...zoneDRoads,
  ...zoneERoads, ...zoneFRoads, ...zoneGRoads, ...zoneHRoads,
]);

const allHouses: HouseDefinition[] = [
  ...zoneAHouses, ...zoneBHouses, ...zoneCHouses, ...zoneDHouses,
  ...zoneEHouses, ...zoneFHouses, ...zoneGHouses, ...zoneHHouses,
];

const allBusinesses: BusinessDefinition[] = [
  ...zoneABusinesses, ...zoneBBusinesses, ...zoneCBusinesses, ...zoneDBusinesses,
  ...zoneEBusinesses, ...zoneFBusinesses, ...zoneGBusinesses, ...zoneHBusinesses,
];

export const trafficStressTestMap: MapConfig = {
  id: 'traffic-stress-test',
  name: 'Traffic Stress Test',
  description: 'Pre-built road network with ~50 houses and ~50 businesses. Tests all intersection types: T-junctions, 4-way, diagonals, and mixed.',
  debug: true,
  houses: allHouses,
  businesses: allBusinesses,
  roads: allRoads,
  obstacles: [], // No random obstacles
  constants: {
    STARTING_MONEY: 99999,
    SPAWN_INTERVAL: 999999,
    MIN_SPAWN_INTERVAL: 999999,
    DEMAND_BASE_RATE: 0.01,
    DEMAND_RATE_GROWTH: 0.0001,
    DEMAND_PIN_COOLDOWN: 30,
    MAX_DEMAND_PINS: 20,
    MOUNTAIN_CLUSTER_COUNT: 0,
    LAKE_CLUSTER_COUNT: 0,
  },
};

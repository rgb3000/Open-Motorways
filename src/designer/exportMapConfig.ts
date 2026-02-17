import type { Grid } from '../core/Grid';
import type { House } from '../entities/House';
import type { Business } from '../entities/Business';
import { CellType, GameColor, Direction, type GridPos } from '../types';

const COLOR_NAMES: Record<GameColor, string> = {
  [GameColor.Red]: 'GameColor.Red',
  [GameColor.Blue]: 'GameColor.Blue',
  [GameColor.Yellow]: 'GameColor.Yellow',
  [GameColor.Green]: 'GameColor.Green',
  [GameColor.Purple]: 'GameColor.Purple',
  [GameColor.Orange]: 'GameColor.Orange',
};

const DIR_NAMES: Record<Direction, string> = {
  [Direction.Up]: 'Direction.Up',
  [Direction.Down]: 'Direction.Down',
  [Direction.Left]: 'Direction.Left',
  [Direction.Right]: 'Direction.Right',
  [Direction.UpLeft]: 'Direction.UpLeft',
  [Direction.UpRight]: 'Direction.UpRight',
  [Direction.DownLeft]: 'Direction.DownLeft',
  [Direction.DownRight]: 'Direction.DownRight',
};

export function exportMapConfig(
  grid: Grid,
  houses: House[],
  businesses: Business[],
  mountainCells: GridPos[],
  mountainHeightMap: Map<string, number>,
  lakeCells: GridPos[],
): string {
  const lines: string[] = [];

  lines.push(`import { GameColor, Direction } from '../types';`);
  lines.push(`import type { MapConfig } from './types';`);
  lines.push('');

  // Houses
  if (houses.length > 0) {
    lines.push('const houses = [');
    for (const h of houses) {
      lines.push(`  { gx: ${h.pos.gx}, gy: ${h.pos.gy}, color: ${COLOR_NAMES[h.color]}, connectorDir: ${DIR_NAMES[h.connectorDir]} },`);
    }
    lines.push('];');
    lines.push('');
  }

  // Businesses
  if (businesses.length > 0) {
    lines.push('const businesses = [');
    for (const b of businesses) {
      lines.push(`  { gx: ${b.pos.gx}, gy: ${b.pos.gy}, color: ${COLOR_NAMES[b.color]}, orientation: '${b.orientation}' as const, connectorSide: '${b.connectorSide}' as const },`);
    }
    lines.push('];');
    lines.push('');
  }

  // Roads - scan grid
  const roads: { gx: number; gy: number; connections: Direction[] }[] = [];
  for (let gy = 0; gy < grid.rows; gy++) {
    for (let gx = 0; gx < grid.cols; gx++) {
      const cell = grid.getCell(gx, gy);
      if (cell && cell.type === CellType.Road) {
        roads.push({ gx, gy, connections: [...cell.roadConnections] });
      }
    }
  }

  if (roads.length > 0) {
    lines.push('const roads = [');
    for (const r of roads) {
      const conns = r.connections.map(d => DIR_NAMES[d]).join(', ');
      lines.push(`  { gx: ${r.gx}, gy: ${r.gy}, connections: [${conns}] },`);
    }
    lines.push('];');
    lines.push('');
  }

  // Obstacles
  const obstacles = [
    ...mountainCells.map(c => {
      const h = mountainHeightMap.get(`${c.gx},${c.gy}`);
      return `  { gx: ${c.gx}, gy: ${c.gy}, type: 'mountain' as const${h ? `, height: ${Math.round(h)}` : ''} }`;
    }),
    ...lakeCells.map(c =>
      `  { gx: ${c.gx}, gy: ${c.gy}, type: 'lake' as const }`,
    ),
  ];

  if (obstacles.length > 0) {
    lines.push('const obstacles = [');
    lines.push(obstacles.join(',\n') + ',');
    lines.push('];');
    lines.push('');
  }

  // MapConfig
  lines.push('export const customMap: MapConfig = {');
  lines.push(`  id: 'custom-map',`);
  lines.push(`  name: 'Custom Map',`);
  lines.push(`  description: 'Created with Map Designer',`);
  if (houses.length > 0) lines.push('  houses,');
  if (businesses.length > 0) lines.push('  businesses,');
  if (roads.length > 0) lines.push('  roads,');
  if (obstacles.length > 0) {
    lines.push('  obstacles,');
  } else {
    lines.push('  obstacles: [],');
  }
  lines.push('  constants: {');
  lines.push('    STARTING_MONEY: 99999,');
  lines.push('    SPAWN_INTERVAL: 999999,');
  lines.push('    MIN_SPAWN_INTERVAL: 999999,');
  lines.push('    MOUNTAIN_CLUSTER_COUNT: 0,');
  lines.push('    LAKE_CLUSTER_COUNT: 0,');
  lines.push('  },');
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

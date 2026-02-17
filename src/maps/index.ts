import type { MapConfig } from './types';
import { classicMap } from './classic';
import { lakelandMap } from './lakeland';
import { narrowPassMap } from './narrow-pass';

export const allMaps: MapConfig[] = [classicMap, lakelandMap, narrowPassMap];

export function getMapById(id: string): MapConfig | undefined {
  return allMaps.find((m) => m.id === id);
}

import type { MapConfig } from './types';
import { classicMap } from './classic';
import { lakelandMap } from './lakeland';
import { narrowPassMap } from './narrow-pass';
import { trafficStressTestMap } from './traffic-stress-test';

export const allMaps: MapConfig[] = [classicMap, lakelandMap, narrowPassMap, trafficStressTestMap];

export function getMapById(id: string): MapConfig | undefined {
  return allMaps.find((m) => m.id === id);
}

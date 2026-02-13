import type { GridPos, PixelPos } from '../types';
import { TILE_SIZE } from '../constants';

let nextId = 0;

export function generateId(): string {
  return (++nextId).toString(36);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function manhattanDist(a: GridPos, b: GridPos): number {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy);
}

export function gridToPixelCenter(pos: GridPos): PixelPos {
  return {
    x: pos.gx * TILE_SIZE + TILE_SIZE / 2,
    y: pos.gy * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function pixelToGrid(px: number, py: number): GridPos {
  return {
    gx: Math.floor(px / TILE_SIZE),
    gy: Math.floor(py / TILE_SIZE),
  };
}

export function gridPosEqual(a: GridPos, b: GridPos): boolean {
  return a.gx === b.gx && a.gy === b.gy;
}

export function gridPosKey(pos: GridPos): string {
  return `${pos.gx},${pos.gy}`;
}

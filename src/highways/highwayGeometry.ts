import type { GridPos, PixelPos } from '../types';
import { gridToPixelCenter, cubicBezier } from '../utils/math';

const POLYLINE_SEGMENTS = 64;

export function defaultControlPoints(
  from: GridPos,
  to: GridPos,
): { cp1: PixelPos; cp2: PixelPos } {
  const p0 = gridToPixelCenter(from);
  const p3 = gridToPixelCenter(to);
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  // Place control points at 1/3 and 2/3 along the line, offset perpendicular
  const dist = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / (dist || 1);
  const perpY = dx / (dist || 1);
  const offset = dist * 0.25;
  return {
    cp1: {
      x: p0.x + dx / 3 + perpX * offset,
      y: p0.y + dy / 3 + perpY * offset,
    },
    cp2: {
      x: p0.x + (2 * dx) / 3 - perpX * offset,
      y: p0.y + (2 * dy) / 3 - perpY * offset,
    },
  };
}

export function sampleHighwayPolyline(
  from: GridPos,
  to: GridPos,
  cp1: PixelPos,
  cp2: PixelPos,
): { polyline: PixelPos[]; cumDist: number[]; arcLength: number } {
  const p0 = gridToPixelCenter(from);
  const p3 = gridToPixelCenter(to);

  const polyline: PixelPos[] = [];
  const cumDist: number[] = [];

  for (let i = 0; i <= POLYLINE_SEGMENTS; i++) {
    const t = i / POLYLINE_SEGMENTS;
    const pt = cubicBezier(
      p0.x, p0.y, cp1.x, cp1.y,
      cp2.x, cp2.y, p3.x, p3.y, t,
    );
    polyline.push(pt);
    if (i === 0) {
      cumDist.push(0);
    } else {
      const prev = polyline[i - 1];
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
  }

  const arcLength = cumDist[cumDist.length - 1];
  return { polyline, cumDist, arcLength };
}

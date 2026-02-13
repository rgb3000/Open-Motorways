import type { House } from '../../entities/House';
import type { Business } from '../../entities/Business';
import { TILE_SIZE, COLOR_MAP, MAX_DEMAND_PINS } from '../../constants';

export class BuildingLayer {
  render(ctx: CanvasRenderingContext2D, houses: House[], businesses: Business[]): void {
    // Draw houses (filled squares with small roof triangle)
    for (const house of houses) {
      const px = house.pos.gx * TILE_SIZE;
      const py = house.pos.gy * TILE_SIZE;
      const color = COLOR_MAP[house.color];
      const size = TILE_SIZE * 0.75;
      const offset = (TILE_SIZE - size) / 2;

      // House body
      ctx.fillStyle = color;
      ctx.fillRect(px + offset, py + offset + 2, size, size - 2);

      // Roof triangle
      ctx.beginPath();
      ctx.moveTo(px + offset - 1, py + offset + 2);
      ctx.lineTo(px + TILE_SIZE / 2, py + offset - 3);
      ctx.lineTo(px + offset + size + 1, py + offset + 2);
      ctx.closePath();
      ctx.fill();

      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + offset, py + offset + 2, size, size - 2);
    }

    // Draw businesses (filled circles)
    for (const biz of businesses) {
      const px = biz.pos.gx * TILE_SIZE + TILE_SIZE / 2;
      const py = biz.pos.gy * TILE_SIZE + TILE_SIZE / 2;
      const color = COLOR_MAP[biz.color];
      const radius = TILE_SIZE * 0.38;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Demand pins - small dots arranged around the business
      if (biz.demandPins > 0) {
        this.drawDemandPins(ctx, px, py, biz.demandPins, radius);
      }
    }
  }

  private drawDemandPins(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    count: number,
    businessRadius: number,
  ): void {
    const pinRadius = 3;
    const ringRadius = businessRadius + 6;

    for (let i = 0; i < count; i++) {
      const angle = (i / MAX_DEMAND_PINS) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(angle) * ringRadius;
      const py = cy + Math.sin(angle) * ringRadius;

      ctx.fillStyle = '#E74C3C';
      ctx.beginPath();
      ctx.arc(px, py, pinRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#C0392B';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
}

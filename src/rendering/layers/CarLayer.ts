import type { Car } from '../../entities/Car';
import { Direction } from '../../types';
import { COLOR_MAP, CAR_WIDTH, CAR_LENGTH } from '../../constants';
import { lerp } from '../../utils/math';

export class CarLayer {
  render(ctx: CanvasRenderingContext2D, cars: Car[], alpha: number): void {
    for (const car of cars) {
      // Interpolate between prev and current position for smooth rendering
      const x = lerp(car.prevPixelPos.x, car.pixelPos.x, alpha);
      const y = lerp(car.prevPixelPos.y, car.pixelPos.y, alpha);

      // Direction-aware dimensions
      const isVertical = car.direction === Direction.Up || car.direction === Direction.Down;
      const w = isVertical ? CAR_WIDTH : CAR_LENGTH;
      const h = isVertical ? CAR_LENGTH : CAR_WIDTH;

      // Car body
      ctx.fillStyle = COLOR_MAP[car.color];
      ctx.fillRect(x - w / 2, y - h / 2, w, h);

      // Dark outline
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    }
  }
}

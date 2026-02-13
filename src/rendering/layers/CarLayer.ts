import type { Car } from '../../entities/Car';
import { COLOR_MAP, TILE_SIZE } from '../../constants';
import { lerp } from '../../utils/math';

export class CarLayer {
  render(ctx: CanvasRenderingContext2D, cars: Car[], alpha: number): void {
    const carSize = TILE_SIZE * 0.35;
    const halfCar = carSize / 2;

    for (const car of cars) {
      // Interpolate between prev and current position for smooth rendering
      const x = lerp(car.prevPixelPos.x, car.pixelPos.x, alpha);
      const y = lerp(car.prevPixelPos.y, car.pixelPos.y, alpha);

      // Car body
      ctx.fillStyle = COLOR_MAP[car.color];
      ctx.fillRect(x - halfCar, y - halfCar, carSize, carSize);

      // Dark outline
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - halfCar, y - halfCar, carSize, carSize);
    }
  }
}

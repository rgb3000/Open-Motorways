import type { Car } from '../../entities/Car';
import { COLOR_MAP, CAR_WIDTH, CAR_LENGTH } from '../../constants';
import { lerp } from '../../utils/math';

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

export class CarLayer {
  render(ctx: CanvasRenderingContext2D, cars: Car[], alpha: number): void {
    for (const car of cars) {
      // Interpolate between prev and current position for smooth rendering
      const x = lerp(car.prevPixelPos.x, car.pixelPos.x, alpha);
      const y = lerp(car.prevPixelPos.y, car.pixelPos.y, alpha);

      const angle = lerpAngle(car.prevRenderAngle, car.renderAngle, alpha);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Car body (drawn horizontally: length along X axis)
      ctx.fillStyle = COLOR_MAP[car.color];
      ctx.fillRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH);

      // Dark outline
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH);

      ctx.restore();
    }
  }
}

import { CANVAS_WIDTH, CANVAS_HEIGHT, UI_TEXT_COLOR, GAME_OVER_OVERLAY } from '../../constants';
import { GameState } from '../../types';

export class UILayer {
  render(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    score: number,
    elapsedTime: number,
  ): void {
    // Score display (top-left)
    ctx.fillStyle = UI_TEXT_COLOR;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${score}`, 10, 10);

    // Timer display (top-right)
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = Math.floor(elapsedTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    ctx.textAlign = 'right';
    ctx.fillText(timeStr, CANVAS_WIDTH - 10, 10);

    // Game over overlay
    if (state === GameState.GameOver) {
      ctx.fillStyle = GAME_OVER_OVERLAY;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);

      ctx.font = 'bold 24px monospace';
      ctx.fillText(`Score: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);

      ctx.font = '18px monospace';
      ctx.fillStyle = '#CCCCCC';
      ctx.fillText('Click to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
    }
  }
}

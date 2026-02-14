import { GameState } from '../../types';

export class UILayer {
  private scoreEl: HTMLElement;
  private timerEl: HTMLElement;
  private gameOverEl: HTMLElement;
  private gameOverScoreEl: HTMLElement;

  constructor() {
    this.scoreEl = document.getElementById('ui-score')!;
    this.timerEl = document.getElementById('ui-timer')!;
    this.gameOverEl = document.getElementById('game-over-overlay')!;
    this.gameOverScoreEl = document.getElementById('game-over-score')!;
  }

  update(state: GameState, score: number, elapsedTime: number): void {
    this.scoreEl.textContent = `Score: ${score}`;

    const m = Math.floor(elapsedTime / 60);
    const s = Math.floor(elapsedTime % 60);
    this.timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;

    if (state === GameState.GameOver) {
      this.gameOverEl.style.display = 'flex';
      this.gameOverScoreEl.textContent = `Score: ${score}`;
    } else {
      this.gameOverEl.style.display = 'none';
    }
  }
}

import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Game } from '../core/Game';
import { GameState } from '../types';

export function GameUI({ game }: { game: Game }) {
  const [state, setState] = useState<GameState>(GameState.Playing);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    game.onStateUpdate((s, sc, t) => {
      setState(s);
      setScore(sc);
      setTime(t);
    });
  }, [game]);

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <HUD score={score} time={timeStr} state={state} onPause={() => game.togglePause()} />
      {state === GameState.GameOver && (
        <GameOverOverlay score={score} onRestart={() => game.restart()} />
      )}
    </div>
  );
}

function HUD({ score, time, state, onPause }: { score: number; time: string; state: GameState; onPause: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 10,
      }}
    >
      <span style={{ color: '#000', font: 'bold 18px monospace' }}>
        Score: {score}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#000', font: 'bold 18px monospace' }}>
          {time}
        </span>
        <button
          onClick={onPause}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(0,0,0,0.4)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '4px 10px',
            font: 'bold 14px monospace',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {state === GameState.Paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      </div>
    </div>
  );
}

function GameOverOverlay({ score, onRestart }: { score: number; onRestart: () => void }) {
  return (
    <div
      onClick={onRestart}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ color: '#fff', font: 'bold 48px monospace' }}>GAME OVER</div>
      <div style={{ color: '#fff', font: 'bold 24px monospace' }}>Score: {score}</div>
      <div style={{ color: '#ccc', font: '18px monospace' }}>Click to restart</div>
    </div>
  );
}

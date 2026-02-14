import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Game } from '../core/Game';
import { GameState } from '../types';

export function GameUI({ game }: { game: Game }) {
  const [state, setState] = useState<GameState>(game.getState());
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);
  const [money, setMoney] = useState(game.getMoney());
  useEffect(() => {
    game.onStateUpdate((s, sc, t, m) => {
      setState(s);
      setScore(sc);
      setTime(t);
      setMoney(m);
    });
  }, [game]);

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <HUD score={score} money={money} time={timeStr} state={state} onPause={() => game.togglePause()} />
      {state === GameState.WaitingToStart && (
        <StartOverlay onStart={() => game.startGame()} />
      )}
      {state === GameState.GameOver && (
        <GameOverOverlay score={score} onRestart={() => game.restart()} />
      )}
    </div>
  );
}

function HUD({ score, money, time, state, onPause }: { score: number; money: number; time: string; state: GameState; onPause: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: '#000', font: 'bold 18px monospace' }}>
          Score: {score}
        </span>
        <span style={{ color: '#2a7d2a', font: 'bold 18px monospace' }}>
          ${money}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#000', font: 'bold 18px monospace' }}>
          {time}
        </span>
        <button
          onClick={onPause}
          style={{
            pointerEvents: 'auto',
            background: 'none',
            color: '#000',
            border: 'none',
            padding: 0,
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

function StartOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ color: '#fff', font: 'bold 48px monospace' }}>Open Motorways</div>
      <button
        onClick={onStart}
        style={{
          font: 'bold 20px monospace',
          padding: '12px 32px',
          borderRadius: 8,
          border: 'none',
          background: '#fff',
          color: '#000',
          cursor: 'pointer',
        }}
      >
        Start Game
      </button>
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

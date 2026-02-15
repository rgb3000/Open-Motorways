import { useEffect, useState, useCallback } from 'react';
import { Pause, Play, Undo2 } from 'lucide-react';
import type { Game } from '../core/Game';
import { GameState } from '../types';

export function GameUI({ game }: { game: Game }) {
  const [state, setState] = useState<GameState>(game.getState());
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);
  const [money, setMoney] = useState(game.getMoney());
  const [canUndo, setCanUndo] = useState(false);
  useEffect(() => {
    game.onStateUpdate((s, sc, t, m) => {
      setState(s);
      setScore(sc);
      setTime(t);
      setMoney(m);
      setCanUndo(game.canUndo());
    });
    game.setOnUndoStateChange(() => setCanUndo(game.canUndo()));
    return () => game.setOnUndoStateChange(null);
  }, [game]);
  const handleUndo = useCallback(() => game.performUndo(), [game]);

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <HUD score={score} money={money} time={timeStr} state={state} onPause={() => game.togglePause()} canUndo={canUndo} onUndo={handleUndo} />
      {state === GameState.WaitingToStart && (
        <StartOverlay onStart={() => game.startGame()} />
      )}
      {state === GameState.GameOver && (
        <GameOverOverlay score={score} onRestart={() => game.restart()} />
      )}
    </div>
  );
}

function HUD({ score, money, time, state, onPause, canUndo, onUndo }: { score: number; money: number; time: string; state: GameState; onPause: () => void; canUndo: boolean; onUndo: () => void }) {
  return (
    <div className="flex justify-between items-start p-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-black font-bold font-mono text-lg">
          Score: {score}
        </span>
        <span className="text-[#2a7d2a] font-bold font-mono text-lg">
          ${money}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-black font-bold font-mono text-lg">
          {time}
        </span>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className={`pointer-events-auto bg-transparent border-none p-0 flex items-center ${canUndo ? 'text-black cursor-pointer' : 'text-[#bbb] cursor-default'}`}
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={onPause}
          className="pointer-events-auto bg-transparent border-none p-0 cursor-pointer flex items-center text-black"
        >
          {state === GameState.Paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      </div>
    </div>
  );
}

function StartOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center gap-5 pointer-events-auto">
      <div className="text-white font-bold font-mono text-5xl">Open Motorways</div>
      <button
        onClick={onStart}
        className="font-bold font-mono text-xl py-3 px-8 rounded-lg border-none bg-white text-black cursor-pointer"
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
      className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center gap-2.5 cursor-pointer pointer-events-auto"
    >
      <div className="text-white font-bold font-mono text-5xl">GAME OVER</div>
      <div className="text-white font-bold font-mono text-2xl">Score: {score}</div>
      <div className="text-[#ccc] font-mono text-lg">Click to restart</div>
    </div>
  );
}

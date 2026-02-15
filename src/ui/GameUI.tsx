import { useEffect, useState, useCallback } from 'react';
import { Pause, Play, Undo2, Settings, Volume2, VolumeX, X } from 'lucide-react';
import type { Game } from '../core/Game';
import { GameState } from '../types';

export function GameUI({ game }: { game: Game }) {
  const [state, setState] = useState<GameState>(game.getState());
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);
  const [money, setMoney] = useState(game.getMoney());
  const [canUndo, setCanUndo] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const handleToggleMusic = useCallback(() => {
    const next = !game.isMusicEnabled();
    game.setMusicEnabled(next);
    setMusicEnabled(next);
  }, [game]);
  const handleToggleSettings = useCallback(() => setSettingsOpen(o => !o), []);

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <HUD score={score} money={money} time={timeStr} state={state} onPause={() => game.togglePause()} canUndo={canUndo} onUndo={handleUndo} onToggleSettings={handleToggleSettings} />
      {settingsOpen && (
        <SettingsOverlay onClose={handleToggleSettings} musicEnabled={musicEnabled} onToggleMusic={handleToggleMusic} />
      )}
      {state === GameState.WaitingToStart && (
        <StartOverlay onStart={() => game.startGame()} />
      )}
      {state === GameState.GameOver && (
        <GameOverOverlay score={score} onRestart={() => game.restart()} />
      )}
    </div>
  );
}

function HUD({ score, money, time, state, onPause, canUndo, onUndo, onToggleSettings }: { score: number; money: number; time: string; state: GameState; onPause: () => void; canUndo: boolean; onUndo: () => void; onToggleSettings: () => void }) {
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
        <button
          onClick={onToggleSettings}
          className="pointer-events-auto bg-transparent border-none p-0 cursor-pointer flex items-center text-black"
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}

function SettingsOverlay({ onClose, musicEnabled, onToggleMusic }: { onClose: () => void; musicEnabled: boolean; onToggleMusic: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center pointer-events-auto">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[320px]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-black font-bold font-mono text-2xl">Settings</h2>
          <button onClick={onClose} className="bg-transparent border-none p-0 cursor-pointer text-black">
            <X size={20} />
          </button>
        </div>
        <button
          onClick={onToggleMusic}
          className="flex items-center gap-3 w-full bg-transparent border-none p-2 cursor-pointer text-black font-mono text-base rounded-lg hover:bg-gray-100"
        >
          {musicEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          <span>Music</span>
          <span className="ml-auto text-sm text-gray-500">{musicEnabled ? 'On' : 'Off'}</span>
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
      <div className="absolute bottom-6 left-6 bg-white/10 rounded-xl p-4">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
          <kbd className="font-mono text-xs bg-white/20 border border-white/30 rounded px-2 py-0.5 text-white text-center">Space + Drag</kbd>
          <span className="text-white/70 text-sm">Pan the map</span>
          <kbd className="font-mono text-xs bg-white/20 border border-white/30 rounded px-2 py-0.5 text-white text-center">+ / −</kbd>
          <span className="text-white/70 text-sm">Zoom in / out</span>
          <kbd className="font-mono text-xs bg-white/20 border border-white/30 rounded px-2 py-0.5 text-white text-center">Click + Drag</kbd>
          <span className="text-white/70 text-sm">Draw a road</span>
          <kbd className="font-mono text-xs bg-white/20 border border-white/30 rounded px-2 py-0.5 text-white text-center">Shift + Click</kbd>
          <span className="text-white/70 text-sm">Auto-connect two points</span>
        </div>
      </div>
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

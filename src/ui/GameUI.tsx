import { useEffect, useState, useCallback } from 'react';
import { Pause, Play, Undo2, Settings, Volume2, VolumeX, X, Pencil, Eraser } from 'lucide-react';
import type { Game, DemandStat } from '../core/Game';
import { GameState, Tool } from '../types';
import { COLOR_MAP } from '../constants';

export function GameUI({ game }: { game: Game }) {
  const [state, setState] = useState<GameState>(game.getState());
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);
  const [money, setMoney] = useState(game.getMoney());
  const [canUndo, setCanUndo] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>(game.getActiveTool());
  const [demandStats, setDemandStats] = useState<DemandStat[] | null>(null);
  useEffect(() => {
    game.onStateUpdate((s, sc, t, m, ds) => {
      setState(s);
      setScore(sc);
      setTime(t);
      setMoney(m);
      setCanUndo(game.canUndo());
      setDemandStats(ds);
    });
    game.setOnUndoStateChange(() => setCanUndo(game.canUndo()));
    game.onToolChange((tool) => setActiveTool(tool));
    return () => {
      game.setOnUndoStateChange(null);
      game.onToolChange(null);
    };
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
      {(state === GameState.Playing || state === GameState.Paused) && (
        <Toolbar activeTool={activeTool} onSelectTool={(tool) => game.setActiveTool(tool)} />
      )}
      {settingsOpen && (
        <SettingsOverlay onClose={handleToggleSettings} musicEnabled={musicEnabled} onToggleMusic={handleToggleMusic} />
      )}
      {demandStats && demandStats.length > 0 && (
        <DemandDebugOverlay stats={demandStats} />
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

function Toolbar({ activeTool, onSelectTool }: { activeTool: Tool; onSelectTool: (tool: Tool) => void }) {
  const tools = [
    { tool: Tool.Road, icon: Pencil, label: 'Road', shortcut: 'R' },
    { tool: Tool.Eraser, icon: Eraser, label: 'Eraser', shortcut: 'E' },
  ] as const;

  return (
    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-auto">
      {tools.map(({ tool, icon: Icon, label, shortcut }) => (
        <button
          key={tool}
          onClick={() => onSelectTool(tool)}
          title={`${label} (${shortcut})`}
          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-colors ${
            activeTool === tool
              ? 'bg-white border-black text-black'
              : 'bg-white/50 border-transparent text-black/40 hover:bg-white/80 hover:text-black/70'
          }`}
        >
          <Icon size={20} />
        </button>
      ))}
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
          <kbd className="font-mono text-xs bg-white/20 border border-white/30 rounded px-2 py-0.5 text-white text-center">R / E</kbd>
          <span className="text-white/70 text-sm">Road / Eraser tool</span>
        </div>
      </div>
    </div>
  );
}

function DemandDebugOverlay({ stats }: { stats: DemandStat[] }) {
  return (
    <div className="absolute bottom-2.5 right-2.5 bg-black/70 rounded-lg p-2.5 font-mono text-xs pointer-events-none">
      <div className="text-white/60 mb-1">Demand / Supply</div>
      {stats.map(({ color, demand, supply, demandPerMin }) => {
        const balance = supply - demand;
        return (
          <div key={color} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: COLOR_MAP[color] }}
            />
            <span className="text-white w-8 text-right">{demand}</span>
            <span className="text-white/40">/</span>
            <span className="text-white w-8">{supply}</span>
            <span className={`w-10 text-right ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {balance >= 0 ? '+' : ''}{balance}
            </span>
            <span className="text-white/40 w-12 text-right">{demandPerMin.toFixed(1)}/m</span>
          </div>
        );
      })}
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

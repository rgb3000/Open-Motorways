import { useEffect, useState, useCallback } from 'react';
import { Pause, Play, Undo2, Settings, Volume2, VolumeX, X, Pencil, Eraser, ArrowLeft, Route, FastForward, Fuel } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Game, DemandStat } from '../core/Game';
import { GameState, Tool } from '../types';
import { COLOR_MAP } from '../constants';

export function GameUI({ game }: { game: Game }) {
  const navigate = useNavigate();
  const [state, setState] = useState<GameState>(game.getState());
  const [score, setScore] = useState(0);
  const [money, setMoney] = useState(game.getMoney());
  const [canUndo, setCanUndo] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>(game.getActiveTool());
  const [demandStats, setDemandStats] = useState<DemandStat[] | null>(null);
  const [gameDay, setGameDay] = useState(1);
  const [timeScale, setTimeScale] = useState(1);
  useEffect(() => {
    game.onStateUpdate((s, sc, _t, m, ds, day, scale) => {
      setState(s);
      setScore(sc);
      setMoney(m);
      setCanUndo(game.canUndo());
      setDemandStats(ds);
      setGameDay(day);
      setTimeScale(scale);
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
  const handleBack = useCallback(() => navigate('/'), [navigate]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <HUD score={score} money={money} gameDay={gameDay} timeScale={timeScale} state={state} onPause={() => game.togglePause()} onToggleSpeed={() => game.toggleSpeed()} canUndo={canUndo} onUndo={handleUndo} onToggleSettings={handleToggleSettings} onBack={handleBack} />
      {(state === GameState.Playing || state === GameState.Paused) && (
        <Toolbar activeTool={activeTool} onSelectTool={(tool) => game.setActiveTool(tool)} />
      )}
      {settingsOpen && (
        <SettingsOverlay onClose={handleToggleSettings} musicEnabled={musicEnabled} onToggleMusic={handleToggleMusic} />
      )}
      {demandStats && demandStats.length > 0 && (
        <DemandDebugOverlay stats={demandStats} />
      )}
      {state === GameState.GameOver && (
        <GameOverOverlay score={score} onRestart={() => game.restart()} />
      )}
    </div>
  );
}

function HUD({ score, money, gameDay, timeScale, state, onPause, onToggleSpeed, canUndo, onUndo, onToggleSettings, onBack }: { score: number; money: number; gameDay: number; timeScale: number; state: GameState; onPause: () => void; onToggleSpeed: () => void; canUndo: boolean; onUndo: () => void; onToggleSettings: () => void; onBack: () => void }) {
  return (
    <div className="flex justify-between items-start p-3">
      <div className="flex items-start gap-2">
        <button
          onClick={onBack}
          title="Back to map select"
          className="pointer-events-auto bg-transparent border-none p-0 cursor-pointer flex items-center text-black mt-0.5"
        >
          <ArrowLeft size={25} />
        </button>
        <div className="flex flex-col gap-0.5">
          <span className="text-black font-bold font-mono text-base">
            Score: {score}
          </span>
          <span className="text-[#2a7d2a] font-bold font-mono text-base">
            ${money}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-black font-bold font-mono text-base">
          Day {gameDay}
        </span>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className={`pointer-events-auto bg-transparent border-none p-0 flex items-center ${canUndo ? 'text-black cursor-pointer' : 'text-[#bbb] cursor-default'}`}
        >
          <Undo2 size={25} />
        </button>
        <button
          onClick={onToggleSpeed}
          title="Toggle speed (F)"
          className={`pointer-events-auto bg-transparent border-none p-0 cursor-pointer flex items-center gap-0.5 ${timeScale > 1 ? 'text-orange-500' : 'text-black'}`}
        >
          <FastForward size={25} />
          <span className="font-mono text-xs font-bold">{timeScale}x</span>
        </button>
        <button
          onClick={onPause}
          className="pointer-events-auto bg-transparent border-none p-0 cursor-pointer flex items-center text-black"
        >
          {state === GameState.Paused ? <Play size={25} /> : <Pause size={25} />}
        </button>
        <button
          onClick={onToggleSettings}
          className="pointer-events-auto bg-transparent border-none p-0 cursor-pointer flex items-center text-black"
          title="Settings"
        >
          <Settings size={25} />
        </button>
      </div>
    </div>
  );
}

function SettingsOverlay({ onClose, musicEnabled, onToggleMusic }: { onClose: () => void; musicEnabled: boolean; onToggleMusic: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center pointer-events-auto">
      <div className="bg-white rounded-2xl shadow-2xl p-4 w-[300px]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-black font-bold font-mono text-xl">Settings</h2>
          <button onClick={onClose} className="bg-transparent border-none p-0 cursor-pointer text-black">
            <X size={25} />
          </button>
        </div>
        <button
          onClick={onToggleMusic}
          className="flex items-center gap-2 w-full bg-transparent border-none p-1.5 cursor-pointer text-black font-mono text-sm rounded-lg hover:bg-gray-100"
        >
          {musicEnabled ? <Volume2 size={25} /> : <VolumeX size={25} />}
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
    { tool: Tool.Highway, icon: Route, label: 'Highway', shortcut: 'H' },
    { tool: Tool.GasStation, icon: Fuel, label: 'Gas Station', shortcut: 'G' },
  ] as const;

  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
      {tools.map(({ tool, icon: Icon, label, shortcut }) => (
        <button
          key={tool}
          onClick={() => onSelectTool(tool)}
          title={`${label} (${shortcut})`}
          className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-colors ${
            activeTool === tool
              ? 'bg-white border-black text-black'
              : 'bg-white/50 border-transparent text-black/40 hover:bg-white/80 hover:text-black/70'
          }`}
        >
          <Icon size={28} />
        </button>
      ))}
    </div>
  );
}

function DemandDebugOverlay({ stats }: { stats: DemandStat[] }) {
  return (
    <div className="absolute bottom-2.5 right-2.5 bg-black/70 rounded-lg p-2.5 font-mono text-xs pointer-events-none">
      <div className="text-white/60 mb-1">Demand / Supply (pins/min) — {stats.reduce((s, r) => s + r.houses + r.businesses, 0)} ({stats.reduce((s, r) => s + r.houses, 0)}H {stats.reduce((s, r) => s + r.businesses, 0)}B)</div>
      {stats.map(({ color, demand, supplyPerMin, demandPerMin, houses, businesses }) => {
        const balance = supplyPerMin - demandPerMin;
        return (
          <div key={color} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: COLOR_MAP[color] }}
            />
            <span className="text-white/40 w-10 text-right">{houses}H {businesses}B</span>
            <span className="text-white w-14 text-right">{demandPerMin.toFixed(1)}/m</span>
            <span className="text-white/40">/</span>
            <span className="text-white w-14">{supplyPerMin.toFixed(1)}/m</span>
            <span className={`w-14 text-right ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {balance >= 0 ? '+' : ''}{balance.toFixed(1)}
            </span>
            <span className="text-white/40 w-6 text-right">({demand})</span>
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

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Pencil, Eraser, Home, Store, Mountain, X, Copy, Check, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapDesigner, DesignerTool } from '../designer/MapDesigner';
import { GameColor, type BusinessRotation } from '../types';
import { COLOR_MAP } from '../constants';

export function DesignerUI({ designer, onTestPlay }: { designer: MapDesigner; onTestPlay: () => void }) {
  const navigate = useNavigate();
  const [activeTool, setActiveTool] = useState<DesignerTool>(designer.activeTool);
  const [activeColor, setActiveColor] = useState<GameColor>(designer.activeColor);
  const [bizRotation, setBizRotation] = useState<BusinessRotation>(designer.businessRotation);
  const [obstacleType, setObstacleType] = useState(designer.obstacleType);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportCode, setExportCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    designer.onToolChange = () => {
      setActiveTool(designer.activeTool);
      setActiveColor(designer.activeColor);
    };
    return () => { designer.onToolChange = null; };
  }, [designer]);

  const selectTool = useCallback((tool: DesignerTool) => {
    designer.setTool(tool);
    setActiveTool(tool);
  }, [designer]);

  const selectColor = useCallback((color: GameColor) => {
    designer.activeColor = color;
    setActiveColor(color);
  }, [designer]);

  const selectBizRotation = useCallback((r: BusinessRotation) => {
    designer.businessRotation = r;
    setBizRotation(r);
  }, [designer]);

  const selectObstacleType = useCallback((t: 'mountain' | 'lake') => {
    designer.obstacleType = t;
    setObstacleType(t);
  }, [designer]);

  const handleExport = useCallback(() => {
    const code = designer.exportConfig();
    setExportCode(code);
    setExportModalOpen(true);
    setCopied(false);
  }, [designer]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(exportCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [exportCode]);

  const tools = [
    { tool: DesignerTool.Road, icon: Pencil, label: 'Road', shortcut: 'R' },
    { tool: DesignerTool.House, icon: Home, label: 'House', shortcut: 'H' },
    { tool: DesignerTool.Business, icon: Store, label: 'Business', shortcut: 'B' },
    { tool: DesignerTool.Obstacle, icon: Mountain, label: 'Obstacle', shortcut: 'O' },
    { tool: DesignerTool.Eraser, icon: Eraser, label: 'Eraser', shortcut: 'E' },
  ] as const;

  const colors: GameColor[] = [
    GameColor.Red, GameColor.Blue, GameColor.Yellow,
    GameColor.Green, GameColor.Purple, GameColor.Orange,
  ];

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="flex justify-between items-center p-2.5">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/')}
            title="Back to map select"
            className="pointer-events-auto bg-transparent border-none p-0 cursor-pointer flex items-center text-black"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-black font-bold font-mono text-lg">Map Designer</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onTestPlay}
            className="pointer-events-auto flex items-center gap-1.5 bg-black text-white font-mono text-sm font-bold px-4 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-800 transition-colors"
          >
            <Play size={14} /> Play
          </button>
          <button
            onClick={handleExport}
            className="pointer-events-auto bg-black text-white font-mono text-sm font-bold px-4 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-800 transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Left toolbar */}
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-auto">
        {tools.map(({ tool, icon: Icon, label, shortcut }) => (
          <button
            key={tool}
            onClick={() => selectTool(tool)}
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

      {/* Context panel */}
      {(activeTool === DesignerTool.House || activeTool === DesignerTool.Business) && (
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-3 pointer-events-auto">
          {/* Color picker */}
          <div className="mb-2">
            <div className="text-xs font-mono text-gray-500 mb-1">Color</div>
            <div className="grid grid-cols-3 gap-1">
              {colors.map((c, i) => (
                <button
                  key={c}
                  onClick={() => selectColor(c)}
                  title={`Color ${i + 1}`}
                  className={`w-7 h-7 rounded border-2 cursor-pointer transition-colors ${
                    activeColor === c ? 'border-black scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: COLOR_MAP[c] }}
                />
              ))}
            </div>
          </div>

          {activeTool === DesignerTool.Business && (
            <div>
              <div className="text-xs font-mono text-gray-500 mb-1">Rotation</div>
              <div className="flex gap-1">
                {([0, 90, 180, 270] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => selectBizRotation(r)}
                    className={`px-2 py-1 rounded text-xs font-mono cursor-pointer border ${
                      bizRotation === r ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTool === DesignerTool.Obstacle && (
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-3 pointer-events-auto">
          <div className="text-xs font-mono text-gray-500 mb-1">Type</div>
          <div className="flex gap-1">
            <button
              onClick={() => selectObstacleType('mountain')}
              className={`px-2 py-1 rounded text-xs font-mono cursor-pointer border ${
                obstacleType === 'mountain' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300'
              }`}
            >
              Mountain
            </button>
            <button
              onClick={() => selectObstacleType('lake')}
              className={`px-2 py-1 rounded text-xs font-mono cursor-pointer border ${
                obstacleType === 'lake' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300'
              }`}
            >
              Lake
            </button>
          </div>
        </div>
      )}

      {/* Export modal */}
      {exportModalOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-black font-bold font-mono text-xl">Exported Map Config</h2>
              <button onClick={() => setExportModalOpen(false)} className="bg-transparent border-none p-0 cursor-pointer text-black">
                <X size={20} />
              </button>
            </div>
            <pre className="bg-gray-100 rounded-lg p-4 overflow-auto flex-1 text-sm font-mono text-black whitespace-pre">
              {exportCode}
            </pre>
            <button
              onClick={handleCopy}
              className="mt-4 flex items-center justify-center gap-2 bg-black text-white font-mono text-sm font-bold px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-800 transition-colors"
            >
              {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy to Clipboard</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

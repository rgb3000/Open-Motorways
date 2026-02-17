import { useRef, useEffect, useState, useCallback } from 'react';
import { MapDesigner } from '../designer/MapDesigner';
import { DesignerUI } from './DesignerUI';
import { GameCanvas } from './GameCanvas';
import type { MapConfig } from '../maps/types';

export function DesignerCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [designer, setDesigner] = useState<MapDesigner | null>(null);
  const [testMapConfig, setTestMapConfig] = useState<MapConfig | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const d = new MapDesigner(canvas);
    setDesigner(d);
    d.start();

    return () => {
      d.dispose();
      setDesigner(null);
      container.removeChild(canvas);
    };
  }, []);

  const handleTestPlay = useCallback(() => {
    if (!designer) return;
    const config = designer.toMapConfig();
    designer.pause();
    setTestMapConfig(config);
  }, [designer]);

  const handleBackToDesigner = useCallback(() => {
    setTestMapConfig(null);
    designer?.resume();
  }, [designer]);

  const isTesting = testMapConfig !== null;

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          display: isTesting ? 'none' : 'block',
        }}
      >
        {designer && <DesignerUI designer={designer} onTestPlay={handleTestPlay} />}
      </div>
      {isTesting && (
        <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
          <GameCanvas mapConfig={testMapConfig} />
          <button
            onClick={handleBackToDesigner}
            className="absolute top-2.5 left-2.5 z-50 bg-black text-white font-mono text-sm font-bold px-4 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-800 transition-colors"
          >
            Back to Designer
          </button>
        </div>
      )}
    </>
  );
}

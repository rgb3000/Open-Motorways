import { useRef, useEffect, useState } from 'react';
import { Game } from '../core/Game';
import { GameUI } from './GameUI';
import type { MapConfig } from '../maps/types';

export function GameCanvas({ mapConfig }: { mapConfig?: MapConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const g = new Game(canvas, mapConfig);
    setGame(g);
    g.start();

    return () => {
      g.dispose();
      setGame(null);
      container.removeChild(canvas);
    };
  }, [mapConfig]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {game && <GameUI game={game} />}
    </div>
  );
}

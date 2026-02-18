import { useRef, useEffect } from 'react';
import { DemoGame } from '../core/DemoGame';
import { homeBackgroundMap } from '../maps/home-background';

export function DemoBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const demo = new DemoGame(canvas, homeBackgroundMap);
    demo.start();

    return () => {
      demo.dispose();
      container.removeChild(canvas);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}

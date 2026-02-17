import { useRef, useEffect, useState } from 'react';
import { MapDesigner } from '../designer/MapDesigner';
import { DesignerUI } from './DesignerUI';

export function DesignerCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [designer, setDesigner] = useState<MapDesigner | null>(null);

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

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {designer && <DesignerUI designer={designer} />}
    </div>
  );
}

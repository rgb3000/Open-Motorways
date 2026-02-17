import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

type Direction = 'forward' | 'back';

const NavDirectionContext = createContext<{
  setDirection: (dir: Direction) => void;
}>({ setDirection: () => {} });

export function useNavDirection() {
  return useContext(NavDirectionContext);
}

const DURATION = 350; // ms

export function SlideTransition() {
  const location = useLocation();
  const outlet = useOutlet();

  // Track pages: current is always shown, prev is shown during animation
  const [currentKey, setCurrentKey] = useState(location.key);
  const [currentOutlet, setCurrentOutlet] = useState(outlet);
  const [prevOutlet, setPrevOutlet] = useState<ReactNode | null>(null);
  const [animating, setAnimating] = useState(false);
  const directionRef = useRef<Direction>('forward');
  const [animDirection, setAnimDirection] = useState<Direction>('forward');

  const setDirection = useCallback((dir: Direction) => {
    directionRef.current = dir;
  }, []);

  // When location changes, kick off animation
  if (location.key !== currentKey) {
    const dir = directionRef.current;
    setPrevOutlet(currentOutlet);
    setCurrentOutlet(outlet);
    setCurrentKey(location.key);
    setAnimDirection(dir);
    setAnimating(true);
    directionRef.current = 'forward'; // reset to default

    setTimeout(() => {
      setAnimating(false);
      setPrevOutlet(null);
    }, DURATION);
  }

  return (
    <NavDirectionContext.Provider value={{ setDirection }}>
      <div className="relative w-screen h-screen overflow-hidden">
        {/* Previous page (exits) */}
        {animating && prevOutlet && (
          <div
            className={`absolute inset-0 transition-transform ease-in-out`}
            style={{ transitionDuration: `${DURATION}ms`, transform: `translateX(0)` }}
            ref={(el) => {
              if (el) {
                // Force reflow then apply exit transform
                el.getBoundingClientRect();
                requestAnimationFrame(() => {
                  el.style.transform = animDirection === 'forward' ? 'translateX(-100%)' : 'translateX(100%)';
                });
              }
            }}
          >
            {prevOutlet}
          </div>
        )}

        {/* Current page (enters) */}
        <div
          className={`absolute inset-0 ${animating ? `transition-transform ease-in-out` : ''}`}
          style={animating ? {
            transitionDuration: `${DURATION}ms`,
            transform: 'translateX(0)',
          } : undefined}
          ref={animating ? (el) => {
            if (el) {
              // Start off-screen, then animate to 0
              el.style.transform = animDirection === 'forward' ? 'translateX(100%)' : 'translateX(-100%)';
              el.getBoundingClientRect();
              requestAnimationFrame(() => {
                el.style.transform = 'translateX(0)';
              });
            }
          } : undefined}
        >
          {currentOutlet}
        </div>
      </div>
    </NavDirectionContext.Provider>
  );
}

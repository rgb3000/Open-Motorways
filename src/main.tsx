import { Game } from './core/Game';
import { createRoot } from 'react-dom/client';
import { GameUI } from './ui/GameUI';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

const game = new Game(canvas);

const uiRoot = document.getElementById('ui-root')!;
const root = createRoot(uiRoot);
root.render(<GameUI game={game} />);

game.start();

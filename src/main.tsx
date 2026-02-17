import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './index.css';

const root = createRoot(document.getElementById('app')!);
root.render(<App />);

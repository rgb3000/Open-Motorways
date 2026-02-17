import { HashRouter, Routes, Route } from 'react-router-dom';
import { MapSelectPage } from './MapSelectPage';
import { PlayPage } from './PlayPage';
import { DesignerPage } from './DesignerPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MapSelectPage />} />
        <Route path="/play/:mapId" element={<PlayPage />} />
        <Route path="/designer" element={<DesignerPage />} />
      </Routes>
    </HashRouter>
  );
}

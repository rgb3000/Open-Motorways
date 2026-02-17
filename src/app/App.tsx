import { HashRouter, Routes, Route } from 'react-router-dom';
import { MapSelectPage } from './MapSelectPage';
import { PlayPage } from './PlayPage';
import { SlideTransition } from './SlideTransition';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<SlideTransition />}>
          <Route path="/" element={<MapSelectPage />} />
          <Route path="/play/:mapId" element={<PlayPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

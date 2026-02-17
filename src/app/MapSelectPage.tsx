import { Link } from 'react-router-dom';
import { allMaps } from '../maps';

export function MapSelectPage() {
  return (
    <div className="min-h-screen bg-[#E8D8B4] flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold font-mono text-[#333] mb-2">Open Motorways</h1>
      <p className="text-[#666] font-mono mb-8">Choose a map to play</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-3xl w-full">
        {allMaps.map((map) => (
          <Link
            key={map.id}
            to={`/play/${map.id}`}
            className="block bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl hover:-translate-y-1 transition-all no-underline"
          >
            <h2 className="text-xl font-bold font-mono text-[#333] mb-2">{map.name}</h2>
            <p className="text-sm font-mono text-[#666] leading-relaxed">{map.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { getMapById } from '../maps';
import { GameCanvas } from '../ui/GameCanvas';

export function PlayPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const mapConfig = useMemo(() => (mapId ? getMapById(mapId) : undefined), [mapId]);

  if (!mapConfig) {
    return <Navigate to="/" replace />;
  }

  return <GameCanvas key={mapConfig.id} mapConfig={mapConfig} />;
}

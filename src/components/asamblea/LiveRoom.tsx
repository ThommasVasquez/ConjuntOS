'use client';

import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ControlBar,
  GridLayout,
  ParticipantTile,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { api } from '@/lib/api/client';
import type { LiveKitTokenDto } from '@/lib/api/types';

interface LiveRoomProps {
  asambleaId: string;
  onDisconnect?: () => void;
}

export default function LiveRoom({ asambleaId, onDisconnect }: LiveRoomProps) {
  const [token, setToken] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function getToken() {
      try {
        const data = await api.get<LiveKitTokenDto>(
          `/asambleas/${asambleaId}/livekit-token`
        );
        setToken(data.token);
        setUrl(data.url);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'No se pudo conectar a la sala'
        );
      }
    }
    getToken();
  }, [asambleaId]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <p className="text-text font-bold mb-2">Error de conexion</p>
          <p className="text-white text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!token || !url) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-sm animate-pulse">
          Conectando a la sala...
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={onDisconnect}
      data-lk-theme="default"
      style={{ height: '100%', width: '100%' }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

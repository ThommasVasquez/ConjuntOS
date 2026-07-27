'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { api } from '@/lib/api/client';
import { useWsSubscription } from '@/hooks/useWebSocket';
import type { LiveKitTokenDto } from '@/lib/api/types';

interface LiveRoomProps {
  asambleaId: string;
  onDisconnect?: () => void;
}

export default function LiveRoom({ asambleaId, onDisconnect }: LiveRoomProps) {
  const [grant, setGrant] = useState<LiveKitTokenDto | null>(null);
  const [error, setError] = useState<string>('');
  // Read inside the WS handler without making the callback depend on it.
  const canPublishRef = useRef<boolean | null>(null);

  const fetchToken = useCallback(async () => {
    return api.get<LiveKitTokenDto>(`/asambleas/${asambleaId}/livekit-token`);
  }, [asambleaId]);

  useEffect(() => {
    let cancelled = false;
    fetchToken()
      .then((data) => {
        if (cancelled) return;
        canPublishRef.current = data.canPublish;
        setGrant(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudo conectar a la sala');
      });
    return () => {
      cancelled = true;
    };
  }, [fetchToken]);

  /**
   * The publish grant is baked into the token, so being given (or losing) the
   * floor only takes effect on a new one. Re-fetch when the assembly changes
   * and swap tokens only if the grant actually flipped — swapping remounts the
   * room, and reconnecting on every unrelated event would be disruptive.
   */
  useWsSubscription('asamblea', (event) => {
    if (event.action !== 'turno_updated' && event.action !== 'session_updated') return;
    fetchToken()
      .then((data) => {
        if (data.canPublish === canPublishRef.current) return;
        canPublishRef.current = data.canPublish;
        setGrant(data);
      })
      .catch(() => {
        /* keep the current session; the next event retries */
      });
  });

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

  if (!grant?.token || !grant?.url) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-sm animate-pulse">
          Conectando a la sala...
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <LiveKitRoom
        // Remount on a new token so the room reconnects with the new grant.
        key={grant.token}
        serverUrl={grant.url}
        token={grant.token}
        connect={true}
        // Only ask for devices we are allowed to send. Requesting them without
        // the grant lights the camera for a moment before LiveKit drops the
        // track, which reads as a broken camera.
        video={grant.canPublish}
        audio={grant.canPublish}
        onDisconnected={onDisconnect}
        data-lk-theme="default"
        style={{ height: '100%', width: '100%' }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>

      {!grant.canPublish && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-black/70 border border-white/15 backdrop-blur-sm pointer-events-none">
          <p className="text-white text-[11px] font-medium text-center">
            Estás en modo espectador · pide la palabra para activar cámara y micrófono
          </p>
        </div>
      )}
    </div>
  );
}

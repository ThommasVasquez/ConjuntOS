'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import '@livekit/components-styles';
import { api } from '@/lib/api/client';
import { useWsSubscription } from '@/hooks/useWebSocket';
import type { LiveKitTokenDto } from '@/lib/api/types';
import ConferenceStage, { type StageView } from './ConferenceStage';
import ControlBar from './ControlBar';
import PreJoin, { type JoinChoices } from './PreJoin';
import { ReactionOverlay, useReactions } from './Reactions';

interface LiveRoomProps {
  asambleaId: string;
  tokenEndpoint?: string;
  titulo?: string;
  onDisconnect?: () => void;
  onRequestFloor?: () => void;
  handRaised?: boolean;
  onOpenPanel?: (panel: 'chat' | 'personas') => void;
  chatBadge?: number;
  participantCount?: number;
}

/** Connection state banner — mirrors what users expect from Meet/Zoom. */
function ConnectionBanner() {
  const state = useConnectionState();
  if (state === ConnectionState.Connected) return null;

  const label =
    state === ConnectionState.Reconnecting
      ? 'Reconectando…'
      : state === ConnectionState.Connecting
        ? 'Conectando…'
        : state === ConnectionState.Disconnected
          ? 'Desconectado'
          : '';
  if (!label) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24] animate-pulse" />
      <span className="text-[11px] font-medium text-white/90">{label}</span>
    </div>
  );
}

/** Everything that needs to live inside the LiveKitRoom context. */
function RoomInterior({
  canPublish,
  onDisconnect,
  onRequestFloor = () => {},
  handRaised = false,
  onOpenPanel = () => {},
  chatBadge = 0,
  participantCount = 1,
}: {
  canPublish: boolean;
  onDisconnect?: () => void;
  onRequestFloor?: () => void;
  handRaised?: boolean;
  onOpenPanel?: (panel: 'chat' | 'personas') => void;
  chatBadge?: number;
  participantCount?: number;
}) {
  const [view, setView] = useState<StageView>('speaker');
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);
  const { floating, sendReaction } = useReactions();

  return (
    <div className="relative flex flex-col h-full w-full min-h-0">
      <ConnectionBanner />
      <ReactionOverlay floating={floating} />

      <div className="flex-1 min-h-0 p-2 sm:p-3">
        <ConferenceStage view={view} pinnedIdentity={pinnedIdentity} onPin={setPinnedIdentity} />
      </div>

      <div className="shrink-0 pt-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ControlBar
          canPublish={canPublish}
          view={view}
          onToggleView={() => setView((v) => (v === 'grid' ? 'speaker' : 'grid'))}
          onLeave={() => onDisconnect?.()}
          onRequestFloor={onRequestFloor}
          handRaised={handRaised}
          onOpenPanel={onOpenPanel}
          onReaction={sendReaction}
          chatBadge={chatBadge}
          participantCount={participantCount}
        />
      </div>
    </div>
  );
}

export default function LiveRoom({
  asambleaId,
  tokenEndpoint,
  titulo = 'Videollamada LiveKit',
  onDisconnect,
  onRequestFloor = () => {},
  handRaised = false,
  onOpenPanel = () => {},
  chatBadge = 0,
  participantCount = 1,
}: LiveRoomProps) {
  const [grant, setGrant] = useState<LiveKitTokenDto | null>(null);
  const [error, setError] = useState<string>('');
  const [choices, setChoices] = useState<JoinChoices | null>(null);
  // Read inside the WS handler without making the callback depend on it.
  const canPublishRef = useRef<boolean | null>(null);

  const endpoint = tokenEndpoint || `/asambleas/${asambleaId}/livekit-token`;

  const fetchToken = useCallback(
    () => api.get<LiveKitTokenDto>(endpoint),
    [endpoint],
  );

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
   * Listen for "floor_granted" so users upgrade permissions on the fly.
   */
  useWsSubscription('asambleas', (event) => {
    if (event.action !== 'floor_granted') return;
    if (canPublishRef.current === true) return; // already publishing
    fetchToken()
      .then((data) => {
        canPublishRef.current = data.canPublish;
        setGrant(data);
      })
      .catch(() => {});
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-6 text-center text-text">
        <p className="text-sm font-semibold text-[#f43f5e] mb-1">No se pudo cargar la sala</p>
        <p className="text-xs text-text/60">{error}</p>
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-text">
        <div className="w-8 h-8 border-4 border-[#57bf00] border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs font-bold text-text/70">Conectando a LiveKit...</span>
      </div>
    );
  }

  // Mandatory PreJoin check before connecting to LiveKit
  if (!choices) {
    return (
      <PreJoin
        titulo={titulo}
        canPublish={grant.canPublish}
        onJoin={(ch) => setChoices(ch)}
      />
    );
  }

  return (
    <LiveKitRoom
      serverUrl={grant.url}
      token={grant.token}
      connect
      audio={choices.audioEnabled}
      video={choices.videoEnabled}
      onDisconnected={onDisconnect}
      className="relative flex flex-col h-full w-full bg-[#0a0f0d] overflow-hidden"
    >
      <RoomInterior
        canPublish={grant.canPublish}
        onDisconnect={onDisconnect}
        onRequestFloor={onRequestFloor}
        handRaised={handRaised}
        onOpenPanel={onOpenPanel}
        chatBadge={chatBadge}
        participantCount={participantCount}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

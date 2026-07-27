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
  titulo: string;
  onDisconnect?: () => void;
  onRequestFloor: () => void;
  handRaised: boolean;
  onOpenPanel: (panel: 'chat' | 'personas') => void;
  chatBadge?: number;
  participantCount: number;
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
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      <span className="text-[11px] font-medium text-white/90">{label}</span>
    </div>
  );
}

/** Everything that needs to live inside the LiveKitRoom context. */
function RoomInterior({
  canPublish, onDisconnect, onRequestFloor, handRaised, onOpenPanel, chatBadge, participantCount,
}: {
  canPublish: boolean;
  onDisconnect?: () => void;
  onRequestFloor: () => void;
  handRaised: boolean;
  onOpenPanel: (panel: 'chat' | 'personas') => void;
  chatBadge: number;
  participantCount: number;
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

      <div className="shrink-0 pb-3 pt-1 px-2">
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
  titulo,
  onDisconnect,
  onRequestFloor,
  handRaised,
  onOpenPanel,
  chatBadge = 0,
  participantCount,
}: LiveRoomProps) {
  const [grant, setGrant] = useState<LiveKitTokenDto | null>(null);
  const [error, setError] = useState<string>('');
  const [choices, setChoices] = useState<JoinChoices | null>(null);
  // Read inside the WS handler without making the callback depend on it.
  const canPublishRef = useRef<boolean | null>(null);

  const fetchToken = useCallback(
    () => api.get<LiveKitTokenDto>(`/asambleas/${asambleaId}/livekit-token`),
    [asambleaId],
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
        // Someone just got the floor: turn their mic on so they can speak
        // without hunting for the button.
        if (data.canPublish) {
          setChoices((c) => ({ ...(c ?? { videoEnabled: false }), audioEnabled: true }));
        }
      })
      .catch(() => {
        /* keep the current session; the next event retries */
      });
  });

  if (error) {
    return (
      <div className="h-full w-full grid place-items-center p-8">
        <div className="text-center max-w-sm">
          <p className="text-white font-semibold mb-1">No pudimos conectarte a la sala</p>
          <p className="text-white/50 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!grant?.token || !grant?.url) {
    return (
      <div className="h-full w-full grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <span className="w-9 h-9 rounded-full border-2 border-white/15 border-t-white animate-spin" />
          <p className="text-white/50 text-xs tracking-wide">Preparando la sala…</p>
        </div>
      </div>
    );
  }

  // Green room first — nobody should land in an assembly mid-sentence with a
  // camera they did not check.
  if (!choices) {
    return (
      <PreJoin
        titulo={titulo}
        canPublish={grant.canPublish}
        onJoin={setChoices}
      />
    );
  }

  return (
    <LiveKitRoom
      // Remount on a new token so the room reconnects with the new grant.
      key={grant.token}
      serverUrl={grant.url}
      token={grant.token}
      connect={true}
      // Only ask for devices we are allowed to send, and only the ones chosen in
      // the green room. Requesting them without the grant lights the camera for
      // a moment before LiveKit drops the track, which reads as a broken camera.
      video={grant.canPublish && choices.videoEnabled
        ? (choices.videoDeviceId ? { deviceId: choices.videoDeviceId } : true)
        : false}
      audio={grant.canPublish && choices.audioEnabled
        ? (choices.audioDeviceId ? { deviceId: choices.audioDeviceId } : true)
        : false}
      onDisconnected={onDisconnect}
      data-lk-theme="default"
      className="h-full w-full"
      style={{ height: '100%', width: '100%' }}
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

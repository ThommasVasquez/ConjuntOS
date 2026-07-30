/**
 * LiveRoom — mobile port of web `src/components/asamblea/LiveRoom.tsx`.
 *
 * Owns the LiveKit session: mints the token, gates on the green room, publishes
 * only what the grant allows, and re-fetches the token when the floor changes
 * (the publish grant is baked into the token, so being given the palabra only
 * takes effect on a new one).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState } from '@livekit/react-native';
import { ConnectionState } from 'livekit-client';

import ConferenceStage, { type StageView } from '@/components/asamblea/ConferenceStage';
import ControlBar from '@/components/asamblea/ControlBar';
import PreJoin, { type JoinChoices } from '@/components/asamblea/PreJoin';
import { ensureMicPermission } from '@/components/asamblea/permissions';
import { ReactionOverlay, useReactions } from '@/components/asamblea/Reactions';
import { chrome, ink, scrim } from '@/components/asamblea/stageChrome';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import type { LiveKitTokenDto } from '@/lib/api/types';

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

// Register the WebRTC globals exactly once for this JS runtime (same guard as
// CallProvider — registerGlobals is safe to call again but not free).
let lkGlobalsRegistered = false;
function ensureGlobals() {
  if (lkGlobalsRegistered) return;
  try {
    registerGlobals();
    lkGlobalsRegistered = true;
  } catch (e) {
    console.warn('LiveKit registerGlobals failed:', e);
  }
}

/** Web's `border-2 border-white/15 border-t-white animate-spin` ring. */
export function Spinner({ size = 36 }: { size?: number }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: ink(0.15),
          borderTopColor: chrome.text,
        },
      ]}
    />
  );
}

/** Connection state banner — mirrors what users expect from Meet/Zoom. */
function ConnectionBanner() {
  const state = useConnectionState();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 800 }), -1, true);
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

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
    <View
      style={{
        position: 'absolute',
        top: 12,
        alignSelf: 'center',
        zIndex: 30,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: scrim(0.7),
        borderWidth: 1,
        borderColor: ink(0.15),
      }}
    >
      <Animated.View
        style={[
          dotStyle,
          { width: 6, height: 6, borderRadius: 3, backgroundColor: chrome.warning },
        ]}
      />
      <Text style={{ fontSize: 11, fontWeight: '500', color: ink(0.9) }}>{label}</Text>
    </View>
  );
}

/** Everything that needs to live inside the LiveKitRoom context. */
function RoomInterior({
  canPublish,
  onDisconnect,
  onRequestFloor,
  handRaised,
  onOpenPanel,
  chatBadge,
  participantCount,
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
    <View style={{ flex: 1, position: 'relative' }}>
      <ConnectionBanner />
      <ReactionOverlay floating={floating} />

      <View style={{ flex: 1, padding: 8 }}>
        <ConferenceStage view={view} pinnedIdentity={pinnedIdentity} onPin={setPinnedIdentity} />
      </View>

      <View style={{ paddingTop: 4, paddingHorizontal: 8, paddingBottom: 8 }}>
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
      </View>
    </View>
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
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<JoinChoices | null>(null);
  // Read inside the WS handler without making the callback depend on it.
  const canPublishRef = useRef<boolean | null>(null);

  const fetchToken = useCallback(
    () => api.get<LiveKitTokenDto>(`/asambleas/${asambleaId}/livekit-token`),
    [asambleaId],
  );

  useEffect(() => {
    let cancelled = false;
    ensureGlobals();
    AudioSession.startAudioSession().catch(() => {
      /* the room still connects; only routing may be off */
    });
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
      AudioSession.stopAudioSession().catch(() => {});
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
      .then(async (data) => {
        if (data.canPublish === canPublishRef.current) return;
        canPublishRef.current = data.canPublish;
        // Someone just got the floor: turn their mic on so they can speak
        // without hunting for the button. Only for people already IN the room —
        // `choices === null` means they are still in the green room, and filling
        // it in would throw them straight into the live assembly with a camera
        // they never checked and a mic that goes hot unannounced.
        // Android needs the RECORD_AUDIO prompt first (web gets the browser's),
        // and it must resolve BEFORE the token swap so the room remounts once.
        if (data.canPublish) {
          const micOk = await ensureMicPermission();
          setChoices((c) => (c === null ? null : { ...c, audioEnabled: micOk }));
        }
        setGrant(data);
      })
      .catch(() => {
        /* keep the current session; the next event retries */
      });
  });

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text
          style={{
            color: chrome.text,
            fontWeight: '600',
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          No pudimos conectarte a la sala
        </Text>
        <Text style={{ color: ink(0.5), fontSize: 14, textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  if (!grant?.token || !grant?.url) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Spinner size={36} />
        <Text style={{ color: ink(0.5), fontSize: 12, letterSpacing: 0.5 }}>
          Preparando la sala…
        </Text>
      </View>
    );
  }

  // Green room first — nobody should land in an assembly mid-sentence with a
  // camera they did not check.
  if (!choices) {
    return <PreJoin titulo={titulo} canPublish={grant.canPublish} onJoin={setChoices} />;
  }

  return (
    <LiveKitRoom
      // Remount on a new token so the room reconnects with the new grant.
      key={grant.token}
      serverUrl={grant.url}
      token={grant.token}
      connect
      // Only ask for devices we are allowed to send, and only the ones chosen in
      // the green room. Requesting them without the grant lights the camera for
      // a moment before LiveKit drops the track, which reads as a broken camera.
      video={
        grant.canPublish && choices.videoEnabled
          ? { facingMode: choices.facing === 'back' ? 'environment' : 'user' }
          : false
      }
      audio={grant.canPublish && choices.audioEnabled}
      onDisconnected={onDisconnect}
      options={{ adaptiveStream: { pixelDensity: 'screen' } }}
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
    </LiveKitRoom>
  );
}

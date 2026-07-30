/**
 * ParticipantTile — mobile port of web `src/components/asamblea/ParticipantTile.tsx`.
 *
 * One person (or one screen share) on the stage: their video when they publish
 * it, a deterministic initials avatar when they do not, plus the identity pill
 * (mute badge / speaking bars / screen-share + moderator icons / name), the
 * role chip on the big tile and the pin button.
 */

import { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { VideoTrack, isTrackReference, useIsSpeaking } from '@livekit/react-native';
import type { TrackReferenceOrPlaceholder } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { MicOff, Pin, ScreenShare, Shield } from 'lucide-react-native';

import { chrome, ink, scrim } from '@/components/asamblea/stageChrome';

/**
 * Metadata the backend signs into the LiveKit token
 * (see domains/asamblea/handlers.rs — livekit_token).
 */
interface ParticipantMeta {
  nombre?: string;
  rol?: string;
}

const MODERATOR_ROLES = new Set(['ADMINISTRADOR', 'SUPER_ADMIN', 'CONCEJO']);

const ROLE_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Administración',
  SUPER_ADMIN: 'Plataforma',
  CONCEJO: 'Consejo',
  PROPIETARIO: 'Propietario',
  ARRENDATARIO: 'Arrendatario',
};

/** Deterministic gradient per identity, so a person keeps the same avatar colour. */
function avatarGradient(seed: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  // Web: linear-gradient(135deg, hsl(h 18% 26%), hsl((h+40)%360 16% 14%)).
  return [`hsl(${hue}, 18%, 26%)`, `hsl(${(hue + 40) % 360}, 16%, 14%)`];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** One of the three pulsing bars web animates with `animate-[pulse_Xs]`. */
function SpeakingBar({ height, duration }: { height: number; duration: number }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: duration / 2 }), -1, true);
    return () => {
      cancelAnimation(opacity);
    };
  }, [duration, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        style,
        { width: 2, height, borderRadius: 1, backgroundColor: chrome.accent },
      ]}
    />
  );
}

/** Three animated bars, the "this person is talking" indicator. */
function SpeakingBars() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
      <SpeakingBar height={6} duration={800} />
      <SpeakingBar height={12} duration={600} />
      <SpeakingBar height={8} duration={900} />
    </View>
  );
}

export interface ParticipantTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  /** Big stage tile vs. filmstrip/grid cell — drives type scale only. */
  size?: 'lg' | 'md' | 'sm';
  pinned?: boolean;
  onPin?: () => void;
}

export default function ParticipantTile({
  trackRef,
  size = 'md',
  pinned = false,
  onPin,
}: ParticipantTileProps) {
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);
  // The badge means "this person's microphone is off": the camera track's mute
  // state would show red for a camera-off person who is talking.
  const isMuted = !participant.isMicrophoneEnabled;
  const isLocal = participant.isLocal;
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;

  const meta = useMemo<ParticipantMeta>(() => {
    try {
      return participant.metadata
        ? (JSON.parse(participant.metadata) as ParticipantMeta)
        : {};
    } catch {
      return {};
    }
  }, [participant.metadata]);

  const name = meta.nombre || participant.name || participant.identity.slice(0, 8);
  const rol = meta.rol ?? '';
  const isModerator = MODERATOR_ROLES.has(rol);

  const nameSize = size === 'lg' ? 14 : 11;
  const avatarSize = size === 'lg' ? 112 : size === 'md' ? 64 : 44;
  const avatarText = size === 'lg' ? 30 : size === 'md' ? 18 : 12;
  const [gradFrom, gradTo] = avatarGradient(participant.identity);

  const speakingGlow = isSpeaking && !isScreenShare;

  return (
    <View
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: chrome.primaryLight,
        borderWidth: 1,
        // Web: border-[#2dd4bf] + a teal ring/glow while speaking.
        borderColor: speakingGlow ? chrome.accent : ink(0.1),
        shadowColor: chrome.accent,
        shadowOpacity: speakingGlow ? 0.5 : 0,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      {isTrackReference(trackRef) && !trackRef.publication.isMuted ? (
        <VideoTrack
          trackRef={trackRef}
          style={{ flex: 1 }}
          objectFit={isScreenShare ? 'contain' : 'cover'}
          // Mirror only our own camera — never screen shares or remote video.
          mirror={isLocal && !isScreenShare}
        />
      ) : (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: chrome.primaryLight,
          }}
        >
          <LinearGradient
            colors={[gradFrom, gradTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: ink(0.1),
            }}
          >
            <Text
              style={{ fontSize: avatarText, fontWeight: '600', color: ink(0.9) }}
            >
              {initials(name)}
            </Text>
          </LinearGradient>
        </View>
      )}

      {/* Bottom-left identity pill */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          right: 8,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flexShrink: 1,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            // Web ParticipantTile.tsx:113 — bg-black/55 over the video.
            backgroundColor: scrim(0.55),
            borderWidth: 1,
            borderColor: ink(0.1),
          }}
        >
          {isMuted ? (
            <MicOff size={12} color={chrome.danger} />
          ) : isSpeaking ? (
            <SpeakingBars />
          ) : null}

          {isScreenShare ? <ScreenShare size={12} color={ink(0.8)} /> : null}
          {isModerator && !isScreenShare ? <Shield size={11} color={ink(0.7)} /> : null}

          <Text
            numberOfLines={1}
            style={{ fontSize: nameSize, fontWeight: '500', color: chrome.text, flexShrink: 1 }}
          >
            {isLocal ? 'Tú' : name}
            {isScreenShare ? ' · pantalla' : ''}
          </Text>
        </View>

        {rol && size === 'lg' && !isScreenShare ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: scrim(0.55),
              borderWidth: 1,
              borderColor: ink(0.1),
            }}
          >
            <Text
              style={{
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                color: ink(0.6),
              }}
            >
              {ROLE_LABEL[rol] ?? rol}
            </Text>
          </View>
        ) : null}
      </View>

      {onPin ? (
        <Pressable
          onPress={onPin}
          accessibilityRole="button"
          accessibilityLabel={pinned ? 'Quitar fijado' : 'Fijar participante'}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            backgroundColor: pinned ? chrome.accent : scrim(0.5),
            borderColor: pinned ? chrome.accent : ink(0.15),
          }}
        >
          <Pin size={13} color={pinned ? chrome.onAccent : ink(0.8)} />
        </Pressable>
      ) : null}
    </View>
  );
}

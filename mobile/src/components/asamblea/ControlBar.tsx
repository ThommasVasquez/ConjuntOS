/**
 * ControlBar — mobile port of web `src/components/asamblea/ControlBar.tsx`.
 *
 * The round pill every call app converged on: mic, camera, screen share (or
 * "pedir la palabra" for watch-only participants), reactions, view toggle,
 * participants, chat and hang up. Mic and camera stay on the bar even without a
 * publish grant — a locked button that explains itself beats an absent one.
 *
 * Not ported: the `DeviceMenu` chevrons (web enumerates `MediaDeviceKind`
 * devices with `useMediaDeviceSelect`; React Native has no enumerateDevices) and
 * the M/V keyboard shortcuts (no hardware keyboard on the phone).
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useLocalParticipant, useParticipants, useRoomContext } from '@livekit/react-native';
import {
  Hand,
  LayoutGrid,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  User,
  Users,
  Video as VideoIcon,
  VideoOff,
} from 'lucide-react-native';

import { ReactionPicker } from '@/components/asamblea/Reactions';
import type { StageView } from '@/components/asamblea/ConferenceStage';
import { ensureCameraPermission, ensureMicPermission } from '@/components/asamblea/permissions';
import { chrome, ink, scrim } from '@/components/asamblea/stageChrome';
import { toast } from '@/components/ui/toast';

interface ControlBarProps {
  canPublish: boolean;
  view: StageView;
  onToggleView: () => void;
  onLeave: () => void;
  onRequestFloor: () => void;
  handRaised: boolean;
  onOpenPanel: (panel: 'chat' | 'personas') => void;
  onReaction: (emoji: string) => void;
  chatBadge?: number;
  participantCount: number;
}

/** Round control button — the shape both Meet and Zoom converged on. */
function CtrlButton({
  active,
  danger,
  disabled,
  locked,
  label,
  onPress,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Present but not permitted — shows a lock and stays pressable to explain why. */
  locked?: boolean;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const background = danger
    ? chrome.danger
    : locked
      ? ink(0.04)
      : active
        ? chrome.accent
        : ink(0.1);
  const border = danger
    ? chrome.danger
    : locked
      ? ink(0.1)
      : active
        ? chrome.accent
        : ink(0.15);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active) }}
      style={({ pressed }) => ({
        position: 'relative',
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        backgroundColor: background,
        borderColor: border,
        opacity: disabled ? 0.4 : 1,
        transform: [{ scale: pressed ? 0.9 : 1 }],
      })}
    >
      {children}
      {locked ? (
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 16,
            height: 16,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: scrim(1),
            borderWidth: 1,
            borderColor: ink(0.2),
          }}
        >
          <Lock size={8} color={ink(0.6)} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** `animate-pulse` on the raised hand. */
function PulsingHand({ color }: { color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={style}>
      <Hand size={19} color={color} />
    </Animated.View>
  );
}

/** Small count badge that rides the corner of an icon. */
function CornerBadge({
  text,
  background,
  color,
}: {
  text: string;
  background: string;
  color: string;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        top: -10,
        right: -12,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background,
      }}
    >
      <Text style={{ fontSize: 9, fontWeight: '700', color }}>{text}</Text>
    </View>
  );
}

export default function ControlBar({
  canPublish,
  view,
  onToggleView,
  onLeave,
  onRequestFloor,
  handRaised,
  onOpenPanel,
  onReaction,
  chatBadge = 0,
  participantCount,
}: ControlBarProps) {
  const room = useRoomContext();
  const { width } = useWindowDimensions();
  // Web marks the view toggle and the participants button `hidden sm:grid`
  // (ControlBar.tsx:274,282): eight 44px controls do not fit a phone, and the
  // pill would push "Salir de la sala" off the screen. Same 640px breakpoint.
  const wide = width >= 640;
  // Live room membership, not the attendance register the page passes in.
  const participantsInRoom = useParticipants().length;
  const { isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, localParticipant } =
    useLocalParticipant();
  const [busy, setBusy] = useState(false);

  // Wrap every device toggle: a rejected publish or a denied permission should
  // surface as a message, not a silently dead button.
  const guard = async (fn: () => Promise<unknown>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? `${failure}: ${err.message}` : failure);
    } finally {
      setBusy(false);
    }
  };

  // Android has no implicit prompt (web relies on the browser's), so ask before
  // turning a device ON — otherwise the publish just fails.
  const toggleMic = () =>
    guard(async () => {
      if (!isMicrophoneEnabled && !(await ensureMicPermission())) {
        throw new Error('Permiso de micrófono denegado');
      }
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    }, 'No se pudo cambiar el micrófono');

  const toggleCam = () =>
    guard(async () => {
      if (!isCameraEnabled && !(await ensureCameraPermission())) {
        throw new Error('Permiso de cámara denegado');
      }
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    }, 'No se pudo cambiar la cámara');

  const toggleShare = () =>
    guard(
      () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled),
      'No se pudo compartir la pantalla',
    );

  /** Tapping a locked mic/camera should teach, not fail silently. */
  const requestFloorWithHint = () => {
    if (handRaised) {
      toast.info('Ya pediste la palabra — espera a que la administración te dé el turno');
      return;
    }
    toast.info('Pide la palabra para activar tu micrófono y cámara');
    onRequestFloor();
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 999,
          // Web ControlBar.tsx:198 — bg-black/60 border-white/10 shadow-2xl.
          backgroundColor: scrim(0.6),
          borderWidth: 1,
          borderColor: ink(0.1),
          shadowColor: scrim(1),
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <CtrlButton
          label={
            !canPublish
              ? 'Necesitas la palabra para hablar'
              : isMicrophoneEnabled
                ? 'Silenciar micrófono'
                : 'Activar micrófono'
          }
          active={canPublish && isMicrophoneEnabled}
          locked={!canPublish}
          onPress={canPublish ? toggleMic : requestFloorWithHint}
          disabled={busy}
        >
          {canPublish && isMicrophoneEnabled ? (
            <Mic size={19} color={chrome.onAccent} />
          ) : (
            <MicOff size={19} color={canPublish ? chrome.text : ink(0.6)} />
          )}
        </CtrlButton>

        <CtrlButton
          label={
            !canPublish
              ? 'Necesitas la palabra para encender la cámara'
              : isCameraEnabled
                ? 'Apagar cámara'
                : 'Encender cámara'
          }
          active={canPublish && isCameraEnabled}
          locked={!canPublish}
          onPress={canPublish ? toggleCam : requestFloorWithHint}
          disabled={busy}
        >
          {canPublish && isCameraEnabled ? (
            <VideoIcon size={19} color={chrome.onAccent} />
          ) : (
            <VideoOff size={19} color={canPublish ? chrome.text : ink(0.6)} />
          )}
        </CtrlButton>

        {canPublish ? (
          <CtrlButton
            label={isScreenShareEnabled ? 'Dejar de compartir' : 'Compartir pantalla'}
            active={isScreenShareEnabled}
            onPress={toggleShare}
            disabled={busy}
          >
            {isScreenShareEnabled ? (
              <ScreenShareOff size={19} color={chrome.onAccent} />
            ) : (
              <ScreenShare size={19} color={chrome.text} />
            )}
          </CtrlButton>
        ) : (
          <CtrlButton
            label={handRaised ? 'Mano levantada' : 'Pedir la palabra'}
            active={handRaised}
            onPress={onRequestFloor}
          >
            {handRaised ? (
              <PulsingHand color={chrome.onAccent} />
            ) : (
              <Hand size={19} color={chrome.text} />
            )}
          </CtrlButton>
        )}

        <ReactionPicker onPick={onReaction} />

        {wide ? (
          <CtrlButton
            label={view === 'grid' ? 'Vista de orador' : 'Vista de mosaico'}
            onPress={onToggleView}
          >
            {view === 'grid' ? (
              <User size={19} color={chrome.text} />
            ) : (
              <LayoutGrid size={19} color={chrome.text} />
            )}
          </CtrlButton>
        ) : null}

        {wide ? (
          <CtrlButton label="Participantes" onPress={() => onOpenPanel('personas')}>
            <View style={{ position: 'relative' }}>
              <Users size={19} color={chrome.text} />
              <CornerBadge
                text={String(participantsInRoom || participantCount)}
                background={chrome.accent}
                color={chrome.onAccent}
              />
            </View>
          </CtrlButton>
        ) : null}

        <CtrlButton label="Chat de la asamblea" onPress={() => onOpenPanel('chat')}>
          <View style={{ position: 'relative' }}>
            <MessageSquare size={19} color={chrome.text} />
            {chatBadge > 0 ? (
              <CornerBadge
                text={chatBadge > 9 ? '9+' : String(chatBadge)}
                background={chrome.danger}
                color={chrome.text}
              />
            ) : null}
          </View>
        </CtrlButton>

        <CtrlButton
          label="Salir de la sala"
          danger
          onPress={() => {
            room.disconnect().catch(() => {
              /* leaving anyway */
            });
            onLeave();
          }}
        >
          <PhoneOff size={19} color={chrome.primary} />
        </CtrlButton>
      </View>
    </View>
  );
}

'use client';

import { useEffect, useState } from 'react';
import {
  useLocalParticipant,
  useRoomContext,
  useMediaDeviceSelect,
  useParticipants,
} from '@livekit/components-react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, ScreenShareOff,
  Hand, LayoutGrid, User, PhoneOff, MessageSquare, Users, ChevronUp, Check, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePopoverA11y } from '@/hooks/useDialogA11y';
import type { StageView } from './ConferenceStage';
import { ReactionPicker } from './Reactions';

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
  active, danger, disabled, locked, label, onClick, className = '', children,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Present but not permitted — shows a lock and stays clickable to explain why. */
  locked?: boolean;
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`relative shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full grid place-items-center border transition-all duration-200 active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed ${className} ${
        danger
          ? 'bg-[#f87171] border-[#f87171] text-[#2a0707] hover:brightness-110 shadow-lg shadow-[#f87171]/25'
          : locked
            ? 'bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/10 hover:text-white/60'
            : active
              ? 'bg-[#2dd4bf] border-[#2dd4bf] text-[#04211d] hover:brightness-110'
              : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
      }`}
    >
      {children}
      {locked && (
        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-black border border-white/20 grid place-items-center">
          <Lock size={8} className="text-white/60" />
        </span>
      )}
    </button>
  );
}

/** Chevron next to mic/camera that opens the device list, exactly like Zoom. */
function DeviceMenu({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const [open, setOpen] = useState(false);
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  // Escape + outside click; closing on mousedown alone stranded keyboard users.
  const ref = usePopoverA11y(open, () => setOpen(false));

  if (devices.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Cambiar ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="w-5 h-5 rounded-full grid place-items-center bg-white/15 border border-white/20 text-white hover:bg-white/30 transition-colors"
      >
        <ChevronUp size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div role="menu" className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-60 max-h-64 overflow-y-auto rounded-2xl bg-black/90 backdrop-blur-xl border border-white/15 shadow-2xl p-1.5">
          <p className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/60">
            {label}
          </p>
          {devices.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => {
                setActiveMediaDevice(d.deviceId).catch(() =>
                  toast.error(`No se pudo cambiar ${label.toLowerCase()}`),
                );
                setOpen(false);
              }}
              role="menuitemradio"
              aria-checked={d.deviceId === activeDeviceId}
              className="w-full flex items-center gap-2 px-2.5 min-h-11 py-2 rounded-xl text-left text-[11px] text-white/80 hover:bg-white/10 transition-colors"
            >
              <span className="w-3.5 shrink-0">
                {d.deviceId === activeDeviceId && <Check size={12} className="text-white" />}
              </span>
              <span className="truncate">{d.label || label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ControlBar({
  canPublish, view, onToggleView, onLeave, onRequestFloor, handRaised,
  onOpenPanel, onReaction, chatBadge = 0, participantCount,
}: ControlBarProps) {
  const room = useRoomContext();
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

  const toggleMic = () =>
    guard(
      () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
      'No se pudo cambiar el micrófono',
    );

  const toggleCam = () =>
    guard(
      () => localParticipant.setCameraEnabled(!isCameraEnabled),
      'No se pudo cambiar la cámara',
    );

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

  // Keyboard shortcuts, matching the ones people already know from Zoom/Meet.
  useEffect(() => {
    if (!canPublish) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm') { e.preventDefault(); toggleMic(); }
      if (k === 'v') { e.preventDefault(); toggleCam(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish, isMicrophoneEnabled, isCameraEnabled, busy]);

  const canShare =
    canPublish && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Mic and camera are always on the bar. Hiding them when the caller has
            no publish grant made the app look like it lacked the feature; a
            locked button that explains itself is clearer than an absent one. */}
        <div className="flex items-end gap-1 shrink-0">
          <CtrlButton
            label={
              !canPublish
                ? 'Necesitas la palabra para hablar'
                : isMicrophoneEnabled
                  ? 'Silenciar micrófono (M)'
                  : 'Activar micrófono (M)'
            }
            active={canPublish && isMicrophoneEnabled}
            locked={!canPublish}
            onClick={canPublish ? toggleMic : requestFloorWithHint}
            disabled={busy}
          >
            {canPublish && isMicrophoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
          </CtrlButton>
          {canPublish && (
            <div className="-ml-3 mb-0.5">
              <DeviceMenu kind="audioinput" label="Micrófono" />
            </div>
          )}
        </div>

        <div className="flex items-end gap-1 shrink-0">
          <CtrlButton
            label={
              !canPublish
                ? 'Necesitas la palabra para encender la cámara'
                : isCameraEnabled
                  ? 'Apagar cámara (V)'
                  : 'Encender cámara (V)'
            }
            active={canPublish && isCameraEnabled}
            locked={!canPublish}
            onClick={canPublish ? toggleCam : requestFloorWithHint}
            disabled={busy}
          >
            {canPublish && isCameraEnabled ? <VideoIcon size={19} /> : <VideoOff size={19} />}
          </CtrlButton>
          {canPublish && (
            <div className="-ml-3 mb-0.5">
              <DeviceMenu kind="videoinput" label="Cámara" />
            </div>
          )}
        </div>

        {canPublish ? (
          <CtrlButton
            label={isScreenShareEnabled ? 'Dejar de compartir' : 'Compartir pantalla'}
            active={isScreenShareEnabled}
            onClick={toggleShare}
            disabled={busy || !canShare}
          >
            {isScreenShareEnabled ? <ScreenShareOff size={19} /> : <ScreenShare size={19} />}
          </CtrlButton>
        ) : (
          <CtrlButton
            label={handRaised ? 'Mano levantada' : 'Pedir la palabra'}
            active={handRaised}
            onClick={onRequestFloor}
          >
            <Hand size={19} className={handRaised ? 'animate-pulse' : ''} />
          </CtrlButton>
        )}

        <ReactionPicker onPick={onReaction} />

        <div className="hidden sm:block w-px h-8 bg-white/10 mx-0.5 shrink-0" />

        <CtrlButton
          label={view === 'grid' ? 'Vista de orador' : 'Vista de mosaico'}
          onClick={onToggleView}
          className="hidden sm:grid"
        >
          {view === 'grid' ? <User size={19} /> : <LayoutGrid size={19} />}
        </CtrlButton>

        <CtrlButton
          label="Participantes"
          onClick={() => onOpenPanel('personas')}
          className="hidden sm:grid"
        >
          <span className="relative">
            <Users size={19} />
            <span className="absolute -top-2.5 -right-3 min-w-4 h-4 px-1 rounded-full bg-[#2dd4bf] text-[#04211d] text-[9px] font-bold grid place-items-center">
              {participantsInRoom || participantCount}
            </span>
          </span>
        </CtrlButton>

        <CtrlButton label="Chat de la asamblea" onClick={() => onOpenPanel('chat')}>
          <span className="relative">
            <MessageSquare size={19} />
            {chatBadge > 0 && (
              <span className="absolute -top-2.5 -right-3 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                {chatBadge > 9 ? '9+' : chatBadge}
              </span>
            )}
          </span>
        </CtrlButton>

        <div className="hidden sm:block w-px h-8 bg-white/10 mx-0.5 shrink-0" />

        <CtrlButton
          label="Salir de la sala"
          danger
          onClick={() => {
            room.disconnect();
            onLeave();
          }}
        >
          <PhoneOff size={19} />
        </CtrlButton>
      </div>
    </div>
  );
}

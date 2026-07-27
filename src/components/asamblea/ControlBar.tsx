'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useLocalParticipant,
  useRoomContext,
  useMediaDeviceSelect,
} from '@livekit/components-react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, ScreenShareOff,
  Hand, LayoutGrid, User, PhoneOff, MessageSquare, Users, ChevronUp, Check,
} from 'lucide-react';
import { toast } from 'sonner';
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
  active, danger, disabled, label, onClick, children,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`relative w-12 h-12 rounded-full grid place-items-center border transition-all duration-200 active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? 'bg-red-500 border-red-400 text-white hover:bg-red-400 shadow-lg shadow-red-500/25'
          : active
            ? 'bg-white border-white text-black hover:bg-white/90'
            : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

/** Chevron next to mic/camera that opens the device list, exactly like Zoom. */
function DeviceMenu({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (devices.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Cambiar ${label}`}
        className="w-5 h-5 rounded-full grid place-items-center bg-white/15 border border-white/20 text-white hover:bg-white/30 transition-colors"
      >
        <ChevronUp size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-60 max-h-64 overflow-y-auto rounded-2xl bg-black/90 backdrop-blur-xl border border-white/15 shadow-2xl p-1.5">
          <p className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/35">
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
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-[11px] text-white/80 hover:bg-white/10 transition-colors"
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
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
        {canPublish ? (
          <>
            <div className="flex items-end gap-1">
              <CtrlButton
                label={isMicrophoneEnabled ? 'Silenciar micrófono (M)' : 'Activar micrófono (M)'}
                active={isMicrophoneEnabled}
                onClick={toggleMic}
                disabled={busy}
              >
                {isMicrophoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
              </CtrlButton>
              <div className="-ml-3 mb-0.5">
                <DeviceMenu kind="audioinput" label="Micrófono" />
              </div>
            </div>

            <div className="flex items-end gap-1">
              <CtrlButton
                label={isCameraEnabled ? 'Apagar cámara (V)' : 'Encender cámara (V)'}
                active={isCameraEnabled}
                onClick={toggleCam}
                disabled={busy}
              >
                {isCameraEnabled ? <VideoIcon size={19} /> : <VideoOff size={19} />}
              </CtrlButton>
              <div className="-ml-3 mb-0.5">
                <DeviceMenu kind="videoinput" label="Cámara" />
              </div>
            </div>

            <CtrlButton
              label={isScreenShareEnabled ? 'Dejar de compartir' : 'Compartir pantalla'}
              active={isScreenShareEnabled}
              onClick={toggleShare}
              disabled={busy || !canShare}
            >
              {isScreenShareEnabled ? <ScreenShareOff size={19} /> : <ScreenShare size={19} />}
            </CtrlButton>
          </>
        ) : (
          /* No publish grant: one clear call to action instead of three dead buttons. */
          <button
            onClick={onRequestFloor}
            className={`h-12 px-5 rounded-full flex items-center gap-2 border transition-all active:scale-95 ${
              handRaised
                ? 'bg-white text-black border-white'
                : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
            }`}
          >
            <Hand size={18} className={handRaised ? 'animate-pulse' : ''} />
            <span className="text-xs font-semibold tracking-wide whitespace-nowrap">
              {handRaised ? 'Mano levantada' : 'Pedir la palabra'}
            </span>
          </button>
        )}

        <ReactionPicker onPick={onReaction} />

        <div className="w-px h-8 bg-white/10 mx-0.5" />

        <CtrlButton
          label={view === 'grid' ? 'Vista de orador' : 'Vista de mosaico'}
          onClick={onToggleView}
        >
          {view === 'grid' ? <User size={19} /> : <LayoutGrid size={19} />}
        </CtrlButton>

        <CtrlButton label="Participantes" onClick={() => onOpenPanel('personas')}>
          <span className="relative">
            <Users size={19} />
            <span className="absolute -top-2.5 -right-3 min-w-4 h-4 px-1 rounded-full bg-white text-black text-[9px] font-bold grid place-items-center">
              {participantCount}
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

        <div className="w-px h-8 bg-white/10 mx-0.5" />

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

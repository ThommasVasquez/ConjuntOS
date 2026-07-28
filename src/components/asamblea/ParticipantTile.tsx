'use client';

import { useMemo } from 'react';
import { VideoTrack, useIsSpeaking, useIsMuted, isTrackReference } from '@livekit/components-react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { MicOff, Pin, ScreenShare, Shield } from 'lucide-react';

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
function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 18% 26%), hsl(${(hue + 40) % 360} 16% 14%))`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ParticipantTileProps {
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
  const isMuted = useIsMuted(trackRef);
  const isLocal = participant.isLocal;
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;

  const meta = useMemo<ParticipantMeta>(() => {
    try {
      return participant.metadata ? (JSON.parse(participant.metadata) as ParticipantMeta) : {};
    } catch {
      return {};
    }
  }, [participant.metadata]);

  const name = meta.nombre || participant.name || participant.identity.slice(0, 8);
  const rol = meta.rol ?? '';
  const isModerator = MODERATOR_ROLES.has(rol);

  const nameSize = size === 'lg' ? 'text-sm' : 'text-[11px]';
  const avatarSize =
    size === 'lg' ? 'w-28 h-28 text-3xl' : size === 'md' ? 'w-16 h-16 text-lg' : 'w-11 h-11 text-xs';

  return (
    <div
      className={`group relative w-full h-full overflow-hidden rounded-2xl bg-[#0b1614] border transition-all duration-300 ${
        isSpeaking && !isScreenShare
          ? 'border-[#2dd4bf] shadow-[0_0_0_1px_rgba(45,212,191,0.45),0_0_28px_-4px_rgba(45,212,191,0.5)]'
          : 'border-white/10'
      }`}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          // Mirror only our own camera — never screen shares or remote video.
          className={`w-full h-full ${isScreenShare ? 'object-contain bg-black' : 'object-cover'} ${
            isLocal && !isScreenShare ? '-scale-x-100' : ''
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b1614]">
          <div
            className={`${avatarSize} rounded-full flex items-center justify-center font-semibold text-white/90 border border-white/10 shadow-inner`}
            style={{ background: avatarGradient(participant.identity) }}
          >
            {initials(name)}
          </div>
        </div>
      )}

      {/* Bottom-left identity pill */}
      <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0 max-w-full px-2.5 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10">
          {isMuted ? (
            <MicOff size={12} className="text-[#f87171] shrink-0" />
          ) : isSpeaking ? (
            <span className="flex items-end gap-[2px] h-3 shrink-0" aria-hidden>
              <span className="w-[2px] bg-[#2dd4bf] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-1.5" />
              <span className="w-[2px] bg-[#2dd4bf] rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
              <span className="w-[2px] bg-[#2dd4bf] rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-2" />
            </span>
          ) : null}

          {isScreenShare && <ScreenShare size={12} className="text-white/80 shrink-0" />}
          {isModerator && !isScreenShare && <Shield size={11} className="text-white/70 shrink-0" />}

          <span className={`${nameSize} font-medium text-white truncate`}>
            {isLocal ? 'Tú' : name}
            {isScreenShare && ' · pantalla'}
          </span>
        </div>

        {rol && size === 'lg' && !isScreenShare && (
          <span className="shrink-0 px-2 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[9px] uppercase tracking-widest text-white/60">
            {ROLE_LABEL[rol] ?? rol}
          </span>
        )}
      </div>

      {onPin && (
        <button
          onClick={onPin}
          aria-label={pinned ? 'Quitar fijado' : 'Fijar participante'}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full grid place-items-center border transition-all ${
            pinned
              ? 'bg-[#2dd4bf] text-[#04211d] border-[#2dd4bf]'
              : 'bg-black/50 text-white/80 border-white/15 opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          <Pin size={13} />
        </button>
      )}
    </div>
  );
}

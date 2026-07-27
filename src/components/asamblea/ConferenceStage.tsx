'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTracks } from '@livekit/components-react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Users } from 'lucide-react';
import ParticipantTile from './ParticipantTile';

export type StageView = 'speaker' | 'grid';

/** Tailwind grid template per participant count — keeps tiles close to 16:9. */
function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 4) return 'grid-cols-2';
  if (count <= 6) return 'grid-cols-2 sm:grid-cols-3';
  if (count <= 9) return 'grid-cols-2 sm:grid-cols-3';
  return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
}

function trackKey(t: TrackReferenceOrPlaceholder): string {
  return `${t.participant.identity}:${t.source}:${t.publication?.trackSid ?? 'placeholder'}`;
}

interface ConferenceStageProps {
  view: StageView;
  /** Identity to keep on the main stage regardless of who is speaking. */
  pinnedIdentity: string | null;
  onPin: (identity: string | null) => void;
}

export default function ConferenceStage({ view, pinnedIdentity, onPin }: ConferenceStageProps) {
  // withPlaceholder keeps camera-off people visible as avatar tiles, the way
  // Meet and Zoom do — without it they vanish from the room entirely.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const screenShare = tracks.find((t) => t.source === Track.Source.ScreenShare);
  const cameras = useMemo(
    () => tracks.filter((t) => t.source === Track.Source.Camera),
    [tracks],
  );

  // Track the loudest recent speaker so the stage follows the conversation.
  const [activeIdentity, setActiveIdentity] = useState<string | null>(null);
  useEffect(() => {
    const speaking = cameras.find((t) => t.participant.isSpeaking && !t.participant.isLocal);
    if (speaking) setActiveIdentity(speaking.participant.identity);
  }, [cameras]);

  if (cameras.length === 0 && !screenShare) {
    return (
      <div className="h-full w-full grid place-items-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-4">
            <Users size={26} className="text-white/40" />
          </div>
          <p className="text-white/70 text-sm font-medium">Aún no hay nadie en la sala</p>
          <p className="text-white/35 text-xs mt-1">
            Los asistentes aparecerán aquí al conectarse
          </p>
        </div>
      </div>
    );
  }

  // A screen share always owns the stage — that is what people came to look at.
  const stageTrack: TrackReferenceOrPlaceholder | undefined =
    screenShare ??
    cameras.find((t) => t.participant.identity === pinnedIdentity) ??
    cameras.find((t) => t.participant.identity === activeIdentity) ??
    cameras.find((t) => !t.participant.isLocal) ??
    cameras[0];

  const showFilmstrip = view === 'speaker' || Boolean(screenShare);

  if (!showFilmstrip) {
    return (
      <div className={`grid ${gridClass(cameras.length)} gap-2 sm:gap-3 h-full w-full auto-rows-fr`}>
        {cameras.map((t) => (
          <ParticipantTile
            key={trackKey(t)}
            trackRef={t}
            size="md"
            pinned={t.participant.identity === pinnedIdentity}
            onPin={() =>
              onPin(t.participant.identity === pinnedIdentity ? null : t.participant.identity)
            }
          />
        ))}
      </div>
    );
  }

  const strip = cameras.filter(
    (t) => !stageTrack || trackKey(t) !== trackKey(stageTrack),
  );

  return (
    <div className="flex flex-col gap-2 sm:gap-3 h-full w-full min-h-0">
      <div className="flex-1 min-h-0">
        {stageTrack && (
          <ParticipantTile
            key={trackKey(stageTrack)}
            trackRef={stageTrack}
            size="lg"
            pinned={stageTrack.participant.identity === pinnedIdentity}
            onPin={() =>
              onPin(
                stageTrack.participant.identity === pinnedIdentity
                  ? null
                  : stageTrack.participant.identity,
              )
            }
          />
        )}
      </div>

      {strip.length > 0 && (
        <div className="shrink-0 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {strip.map((t) => (
            <div
              key={trackKey(t)}
              className="shrink-0 w-28 sm:w-40 aspect-video"
            >
              <ParticipantTile
                trackRef={t}
                size="sm"
                pinned={t.participant.identity === pinnedIdentity}
                onPin={() =>
                  onPin(t.participant.identity === pinnedIdentity ? null : t.participant.identity)
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

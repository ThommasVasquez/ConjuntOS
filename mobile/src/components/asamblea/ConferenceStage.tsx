/**
 * ConferenceStage — mobile port of web `src/components/asamblea/ConferenceStage.tsx`.
 *
 * Speaker view (stage tile + filmstrip) and grid view, with the same track
 * precedence web uses: screen share → pinned → active (loudest recent remote)
 * speaker → first remote → first camera. `withPlaceholder` keeps camera-off
 * people on the stage as avatar tiles instead of dropping them from the room.
 *
 * Web expresses the grid with Tailwind `grid-cols-*`; RN has no CSS grid, so the
 * same counts are laid out as rows of equal-width tiles (`auto-rows-fr` becomes
 * `flex: 1` per row).
 */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTracks } from '@livekit/react-native';
import type { TrackReferenceOrPlaceholder } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { Users } from 'lucide-react-native';

import ParticipantTile from '@/components/asamblea/ParticipantTile';
import { chrome, ink } from '@/components/asamblea/stageChrome';

export type StageView = 'speaker' | 'grid';

/**
 * Columns per participant count. Web's gridClass() base (phone) classes are
 * grid-cols-1 for 1–2 and grid-cols-2 from 3 up; the `sm:`/`lg:` variants only
 * apply to tablet/desktop widths.
 */
function columnsFor(count: number): number {
  return count <= 2 ? 1 : 2;
}

function trackKey(t: TrackReferenceOrPlaceholder): string {
  return `${t.participant.identity}:${t.source}:${t.publication?.trackSid ?? 'placeholder'}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

interface ConferenceStageProps {
  view: StageView;
  /** Identity to keep on the main stage regardless of who is speaking. */
  pinnedIdentity: string | null;
  onPin: (identity: string | null) => void;
}

export default function ConferenceStage({
  view,
  pinnedIdentity,
  onPin,
}: ConferenceStageProps) {
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: ink(0.05),
              borderWidth: 1,
              borderColor: ink(0.1),
              marginBottom: 16,
            }}
          >
            <Users size={26} color={ink(0.6)} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '500', color: ink(0.7) }}>
            Aún no hay nadie en la sala
          </Text>
          <Text style={{ fontSize: 12, color: ink(0.6), marginTop: 4 }}>
            Los asistentes aparecerán aquí al conectarse
          </Text>
        </View>
      </View>
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
    const rows = chunk(cameras, columnsFor(cameras.length));
    return (
      <View style={{ flex: 1, gap: 8 }}>
        {rows.map((row, rowIndex) => (
          <View
            key={`row-${rowIndex}`}
            style={{ flex: 1, flexDirection: 'row', gap: 8 }}
          >
            {row.map((t) => (
              <View key={trackKey(t)} style={{ flex: 1 }}>
                <ParticipantTile
                  trackRef={t}
                  size="md"
                  pinned={t.participant.identity === pinnedIdentity}
                  onPin={() =>
                    onPin(
                      t.participant.identity === pinnedIdentity
                        ? null
                        : t.participant.identity,
                    )
                  }
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  const strip = cameras.filter((t) => !stageTrack || trackKey(t) !== trackKey(stageTrack));

  return (
    <View style={{ flex: 1, gap: 8, backgroundColor: chrome.primary }}>
      <View style={{ flex: 1 }}>
        {stageTrack ? (
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
        ) : null}
      </View>

      {strip.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          style={{ flexGrow: 0 }}
        >
          {strip.map((t) => (
            <View key={trackKey(t)} style={{ width: 112, aspectRatio: 16 / 9 }}>
              <ParticipantTile
                trackRef={t}
                size="sm"
                pinned={t.participant.identity === pinnedIdentity}
                onPin={() =>
                  onPin(
                    t.participant.identity === pinnedIdentity
                      ? null
                      : t.participant.identity,
                  )
                }
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

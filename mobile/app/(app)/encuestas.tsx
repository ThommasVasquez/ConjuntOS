/**
 * ENCUESTAS - CONJUNTOSAPP (mobile port)
 * Encuestas comunitarias: participa y mira los resultados en vivo.
 *
 * Ported from web src/app/(app)/encuestas/page.tsx. Behavior preserved:
 *  - list = GET /encuestas -> EncuestaDto[]
 *  - vote = POST /encuestas/{id}/votar { opciones: [ids] } -> full DTO replace
 *  - radio (single) vs checkbox (multiple) selection per encuesta.multiple
 *  - results bars (pct = votos/total) once yaVote || cerrada
 *  - WS domain 'encuesta' delivers a full DTO -> upsert by id
 *  - countdown badge derived from cierraAt, closed badge from cerrada
 *  - Admin creation/close intentionally omitted on mobile (web-only for now).
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart3, Check, Clock, Lock } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import type { EncuestaDto, VotarEncuestaRequest } from '@/lib/api/types';

// Accent tints (accent palette only — no grays).
const ICON_COLOR = '#FFFFFF';
const INFO = '#009df2';
const SUCCESS = '#57bf00';
const INFO_BG = 'rgba(0, 157, 242, 0.15)';
const INFO_BORDER = 'rgba(0, 157, 242, 0.3)';
const SUCCESS_BG = 'rgba(87, 191, 0, 0.15)';
const SUCCESS_BORDER = 'rgba(87, 191, 0, 0.3)';

/**
 * Human countdown until `cierraAt` (e.g. "2d 4h", "3h 12m", "45m").
 * Returns null when there is no deadline or it already passed.
 */
function formatCountdown(cierraAt: string | null, now: number): string | null {
  if (!cierraAt) return null;
  const diff = new Date(cierraAt).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const mins = Math.floor(diff / 60_000);
  const days = Math.floor(mins / (60 * 24));
  const hours = Math.floor((mins % (60 * 24)) / 60);
  const minutes = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

export default function EncuestasScreen() {
  const user = useAuth((s) => s.user);

  const [encuestas, setEncuestas] = useState<EncuestaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [votingId, setVotingId] = useState<string | null>(null);
  // Minute tick so countdown badges stay fresh while the screen is open.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Initial fetch (mirrors the web page's mount effect).
  useEffect(() => {
    let active = true;
    api
      .get<EncuestaDto[]>('/encuestas')
      .then((data) => {
        if (active) setEncuestas(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Realtime — a WS 'encuesta' event carries a full DTO; upsert by id.
  useWsSubscription('encuesta', (event) => {
    const dto = event.payload as EncuestaDto | undefined;
    if (!dto || typeof dto.id !== 'string') return;
    setEncuestas((prev) => {
      const exists = prev.some((e) => e.id === dto.id);
      return exists ? prev.map((e) => (e.id === dto.id ? dto : e)) : [dto, ...prev];
    });
  });

  function toggle(encuesta: EncuestaDto, opcionId: string) {
    setSelection((prev) => {
      const cur = prev[encuesta.id] ?? [];
      if (encuesta.multiple) {
        return {
          ...prev,
          [encuesta.id]: cur.includes(opcionId)
            ? cur.filter((o) => o !== opcionId)
            : [...cur, opcionId],
        };
      }
      return { ...prev, [encuesta.id]: [opcionId] };
    });
  }

  async function votar(encuesta: EncuestaDto) {
    const sel = selection[encuesta.id] ?? [];
    if (sel.length === 0) {
      toast.error('Selecciona una opción');
      return;
    }
    setVotingId(encuesta.id);
    try {
      const body: VotarEncuestaRequest = { opciones: sel };
      const dto = await api.post<EncuestaDto>(`/encuestas/${encuesta.id}/votar`, body);
      setEncuestas((prev) => prev.map((e) => (e.id === dto.id ? dto : e)));
      toast.success('¡Voto registrado!');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'No se pudo votar');
    } finally {
      setVotingId(null);
    }
  }

  return (
    <Screen className="bg-primary">
      <View className="flex-1 gap-6 px-6 pt-4 pb-8">
        <Animated.View entering={FadeInDown.duration(500)}>
          <ProfileHeader />
        </Animated.View>

        {/* HEADER */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(500)}
          className="flex-row items-center gap-3"
        >
          <View
            className="h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: INFO_BG, borderWidth: 1, borderColor: INFO_BORDER }}
          >
            <BarChart3 size={24} color={INFO} />
          </View>
          <View>
            <Text className="text-xl font-bold text-text">Encuestas</Text>
            <Text className="text-xs text-text/70">Participa y mira los resultados en vivo</Text>
          </View>
        </Animated.View>

        {/* LIST */}
        {loading ? (
          <View className="items-center gap-4 py-8">
            <ActivityIndicator size="large" color={ICON_COLOR} />
            <Text className="text-center text-sm text-text/50">Cargando…</Text>
          </View>
        ) : encuestas.length === 0 ? (
          <Text className="py-8 text-center text-sm text-text/50">
            No hay encuestas todavía.
          </Text>
        ) : (
          encuestas.map((e, i) => {
            const mostrarResultados = e.yaVote || e.cerrada;
            const sel = selection[e.id] ?? [];
            const countdown = e.cerrada ? null : formatCountdown(e.cierraAt, now);
            return (
              <Animated.View key={e.id} entering={FadeInDown.delay(160 + i * 60).duration(450)}>
                <LiquidGlass radius={24} className="gap-3 rounded-3xl border border-border p-5">
                  {/* Card header — título + meta + countdown/closed badge */}
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <Text className="text-base font-bold text-text">{e.titulo}</Text>
                      <Text className="text-[10px] uppercase tracking-wider text-text/50">
                        {e.total} voto(s)
                        {e.anonima ? ' · anónima' : ''}
                        {e.cerrada ? ' · cerrada' : ''}
                      </Text>
                    </View>
                    {e.cerrada ? (
                      <View className="flex-row items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
                        <Lock size={11} color={ICON_COLOR} />
                        <Text className="text-[10px] font-bold uppercase tracking-wider text-text/60">
                          Cerrada
                        </Text>
                      </View>
                    ) : countdown ? (
                      <View
                        className="flex-row items-center gap-1 rounded-lg px-2 py-1"
                        style={{
                          backgroundColor: INFO_BG,
                          borderWidth: 1,
                          borderColor: INFO_BORDER,
                        }}
                      >
                        <Clock size={11} color={INFO} />
                        <Text
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: INFO }}
                        >
                          Cierra en {countdown}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {mostrarResultados ? (
                    /* RESULTS — live bars (pct = votos / total) */
                    <View className="gap-2">
                      {e.resultados.map((r) => {
                        const pct = e.total > 0 ? Math.round((r.votos / e.total) * 100) : 0;
                        return (
                          <View key={r.opcionId} className="gap-1">
                            <View className="flex-row justify-between">
                              <Text className="flex-1 pr-2 text-xs text-text">{r.texto}</Text>
                              <Text className="text-xs font-bold text-text">
                                {pct}% ({r.votos})
                              </Text>
                            </View>
                            <View className="h-2.5 overflow-hidden rounded-full bg-text/10">
                              <View
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: e.cerrada ? SUCCESS : INFO,
                                }}
                              />
                            </View>
                          </View>
                        );
                      })}
                      {e.yaVote && !e.cerrada ? (
                        <Text className="text-[10px] font-bold" style={{ color: SUCCESS }}>
                          Ya votaste · resultados en vivo
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    /* VOTE — radio (single) vs checkbox (multiple) options */
                    <View className="gap-2">
                      {e.opciones.map((o) => {
                        const checked = sel.includes(o.id);
                        return (
                          <Pressable
                            key={o.id}
                            onPress={() => toggle(e, o.id)}
                            accessibilityRole={e.multiple ? 'checkbox' : 'radio'}
                            accessibilityState={{ checked }}
                            className="flex-row items-center gap-3 rounded-2xl p-3"
                            style={{
                              borderWidth: 1,
                              borderColor: checked ? INFO_BORDER : 'rgba(255,255,255,0.14)',
                              backgroundColor: checked ? INFO_BG : 'transparent',
                            }}
                          >
                            <View
                              className={`h-5 w-5 items-center justify-center ${
                                e.multiple ? 'rounded-md' : 'rounded-full'
                              }`}
                              style={{
                                borderWidth: 1,
                                borderColor: checked ? INFO : 'rgba(255,255,255,0.3)',
                                backgroundColor: checked ? INFO : 'transparent',
                              }}
                            >
                              {checked ? <Check size={12} color={ICON_COLOR} /> : null}
                            </View>
                            <Text className="flex-1 text-sm text-text">{o.texto}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => votar(e)}
                        disabled={votingId === e.id}
                        style={({ pressed }) => ({
                          backgroundColor: INFO,
                          opacity: votingId === e.id ? 0.6 : pressed ? 0.9 : 1,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        })}
                        className="mt-1 w-full items-center justify-center rounded-2xl py-3"
                      >
                        {votingId === e.id ? (
                          <ActivityIndicator color={ICON_COLOR} />
                        ) : (
                          <Text className="text-base font-bold" style={{ color: ICON_COLOR }}>
                            Votar
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </LiquidGlass>
              </Animated.View>
            );
          })
        )}
      </View>
    </Screen>
  );
}

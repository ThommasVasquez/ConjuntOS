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
 *  - admin (ADMINISTRADOR/CONCEJO/SUPER_ADMIN): create form = POST /encuestas,
 *    per-poll close = POST /encuestas/{id}/cerrar
 *  - closure is communicated ONLY by the ` · cerrada` suffix in the meta line,
 *    exactly like web (no countdown/closed badges).
 */

import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart3, Check, Lock, Plus, X } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import type { CrearEncuestaRequest, EncuestaDto, VotarEncuestaRequest } from '@/lib/api/types';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

// Must match backend encuestas ADMIN_ROLES (Administrador, Concejo, SuperAdmin).
const ADMIN_ROLES = ['ADMINISTRADOR', 'CONCEJO', 'SUPER_ADMIN'];

export default function EncuestasScreen() {
  const user = useAuth((s) => s.user);
  const role = user?.rol;
  const isAdmin = !!role && ADMIN_ROLES.includes(role);
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const [encuestas, setEncuestas] = useState<EncuestaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [votingId, setVotingId] = useState<string | null>(null);

  // Creator form
  const [titulo, setTitulo] = useState('');
  const [opciones, setOpciones] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonima, setAnonima] = useState(false);
  // RN has no `:focus`; track the focused field to mirror web's focus:border-accent.
  const [focused, setFocused] = useState<string | null>(null);

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

  async function cerrar(id: string) {
    try {
      const dto = await api.post<EncuestaDto>(`/encuestas/${id}/cerrar`);
      setEncuestas((prev) => prev.map((e) => (e.id === dto.id ? dto : e)));
    } catch {
      toast.error('No se pudo cerrar la encuesta');
    }
  }

  async function crear() {
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!titulo.trim() || ops.length < 2) {
      toast.error('Título y al menos 2 opciones');
      return;
    }
    try {
      const body: CrearEncuestaRequest = {
        titulo: titulo.trim(),
        opciones: ops,
        multiple,
        anonima,
      };
      const dto = await api.post<EncuestaDto>('/encuestas', body);
      setEncuestas((prev) => [dto, ...prev]);
      setCreating(false);
      setTitulo('');
      setOpciones(['', '']);
      setMultiple(false);
      setAnonima(false);
      toast.success('Encuesta publicada');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'No se pudo crear');
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
          className="flex-row items-center justify-between"
        >
          <View className="flex-1 flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/20">
              <BarChart3 size={24} color={t.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-text">Encuestas</Text>
              <Text className="text-xs text-text/70">Participa y mira los resultados en vivo</Text>
            </View>
          </View>
          {isAdmin ? (
            <Pressable
              onPress={() => setCreating((v) => !v)}
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-xl bg-accent px-3 py-2"
            >
              {creating ? (
                <X size={16} color={t.onAccent} />
              ) : (
                <Plus size={16} color={t.onAccent} />
              )}
              <Text className="text-sm font-bold text-on-accent">
                {creating ? 'Cerrar' : 'Nueva'}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>

        {/* CREATOR (admin) */}
        {isAdmin && creating ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            {/* LiquidGlass applies `className` to its OUTER wrapper and `style`
                to the inner content View, so web's `p-5` + `gap-3` (20/12px)
                must travel via `style` or the blur/fill/border gets inset and
                the row gap is lost. */}
            <LiquidGlass
              radius={24}
              className="rounded-3xl border border-border"
              style={{ padding: 20, gap: 12 }}
            >
              <TextInput
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Pregunta de la encuesta"
                placeholderTextColor={t.textMuted}
                onFocus={() => setFocused('titulo')}
                onBlur={() => setFocused(null)}
                className={`w-full rounded-2xl border bg-primaryLight/50 px-4 py-3 text-sm text-text ${
                  focused === 'titulo' ? 'border-accent' : 'border-border'
                }`}
              />
              {opciones.map((o, i) => (
                <View key={i} className="flex-row gap-2">
                  <TextInput
                    value={o}
                    onChangeText={(v) =>
                      setOpciones((prev) => prev.map((p, j) => (j === i ? v : p)))
                    }
                    placeholder={`Opción ${i + 1}`}
                    placeholderTextColor={t.textMuted}
                    onFocus={() => setFocused(`op-${i}`)}
                    onBlur={() => setFocused(null)}
                    className={`flex-1 rounded-2xl border bg-primaryLight/50 px-4 py-2.5 text-sm text-text ${
                      focused === `op-${i}` ? 'border-accent' : 'border-border'
                    }`}
                  />
                  {opciones.length > 2 ? (
                    <Pressable
                      onPress={() => setOpciones((prev) => prev.filter((_, j) => j !== i))}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar opción ${i + 1}`}
                      className="items-center justify-center rounded-2xl border border-border bg-text/10 px-3"
                    >
                      <X size={14} color={t.text} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Pressable
                onPress={() => setOpciones((prev) => [...prev, ''])}
                accessibilityRole="button"
                className="self-start"
              >
                <Text className="text-xs font-bold text-accent">+ Añadir opción</Text>
              </Pressable>
              <View className="flex-row gap-4">
                <Pressable
                  onPress={() => setMultiple((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: multiple }}
                  className="flex-row items-center gap-2"
                >
                  <View
                    className={`h-4 w-4 items-center justify-center rounded border ${
                      multiple ? 'border-accent bg-accent' : 'border-text/30'
                    }`}
                  >
                    {multiple ? <Check size={10} color={t.onAccent} /> : null}
                  </View>
                  <Text className="text-xs text-text/80">Selección múltiple</Text>
                </Pressable>
                <Pressable
                  onPress={() => setAnonima((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: anonima }}
                  className="flex-row items-center gap-2"
                >
                  <View
                    className={`h-4 w-4 items-center justify-center rounded border ${
                      anonima ? 'border-accent bg-accent' : 'border-text/30'
                    }`}
                  >
                    {anonima ? <Check size={10} color={t.onAccent} /> : null}
                  </View>
                  <Text className="text-xs text-text/80">Anónima</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={crear}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
                className="w-full items-center justify-center rounded-2xl bg-accent py-3"
              >
                <Text className="text-base font-bold text-on-accent">Publicar encuesta</Text>
              </Pressable>
            </LiquidGlass>
          </Animated.View>
        ) : null}

        {/* LIST */}
        {loading ? (
          <Text className="py-8 text-center text-sm text-text/50">Cargando…</Text>
        ) : encuestas.length === 0 ? (
          <Text className="py-8 text-center text-sm text-text/50">
            No hay encuestas todavía.
          </Text>
        ) : (
          encuestas.map((e, i) => {
            const mostrarResultados = e.yaVote || e.cerrada;
            const sel = selection[e.id] ?? [];
            return (
              <Animated.View key={e.id} entering={FadeInDown.delay(160 + i * 60).duration(450)}>
                <LiquidGlass
                  radius={24}
                  className="rounded-3xl border border-border"
                  style={{ padding: 20, gap: 12 }}
                >
                  {/* Card header — título + meta + admin Cerrar */}
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <Text className="text-base font-bold text-text">{e.titulo}</Text>
                      <Text className="text-[10px] uppercase tracking-wider text-text/50">
                        {e.total} voto(s)
                        {e.anonima ? ' · anónima' : ''}
                        {e.cerrada ? ' · cerrada' : ''}
                      </Text>
                    </View>
                    {isAdmin && !e.cerrada ? (
                      <Pressable
                        onPress={() => cerrar(e.id)}
                        accessibilityRole="button"
                        className="flex-row items-center gap-1 rounded-lg border border-border px-2 py-1"
                      >
                        {/* text/60 ink — textMuted is the token for secondary text. */}
                        <Lock size={11} color={t.textMuted} />
                        <Text className="text-[10px] text-text/60">Cerrar</Text>
                      </Pressable>
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
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${pct}%` }}
                              />
                            </View>
                          </View>
                        );
                      })}
                      {e.yaVote && !e.cerrada ? (
                        <Text className="text-[10px] font-bold text-accent">
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
                            className={`flex-row items-center gap-3 rounded-2xl border p-3 ${
                              checked ? 'border-accent bg-accent/10' : 'border-border'
                            }`}
                          >
                            <View
                              className={`h-5 w-5 items-center justify-center border ${
                                e.multiple ? 'rounded-md' : 'rounded-full'
                              } ${checked ? 'border-accent bg-accent' : 'border-text/30'}`}
                            >
                              {checked ? <Check size={12} color={t.onAccent} /> : null}
                            </View>
                            <Text className="flex-1 text-sm text-text">{o.texto}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => votar(e)}
                        disabled={votingId === e.id}
                        accessibilityRole="button"
                        style={({ pressed }) => ({
                          opacity: votingId === e.id ? 0.6 : pressed ? 0.9 : 1,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        })}
                        className="mt-1 w-full items-center justify-center rounded-2xl bg-accent py-3"
                      >
                        <Text className="text-base font-bold text-on-accent">Votar</Text>
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

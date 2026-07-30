/**
 * Asistente legal (Capi / Ley 675) - CONJUNTOSAPP (mobile port)
 * Chat de consultas sobre Ley 675 y el reglamento de propiedad horizontal.
 *
 * Ported from web src/app/(app)/asistente/page.tsx. Local (non-persistent)
 * Turno[] history; POST /ai/asistente { pregunta } -> { respuesta }. On
 * ApiError the error `detail` is rendered as the assistant bubble, mirroring
 * the web behavior. The input row is pinned at the bottom, lifted above the
 * keyboard via KeyboardAvoidingView.
 */

import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Scale, Send } from 'lucide-react-native';

import { api, ApiError } from '@/lib/api/client';
import type { AsistenteRequest, AsistenteResponse } from '@/lib/api/types';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { FormatTurno } from '@/components/asistente/FormatTurno';
import { Skeleton } from '@/components/asistente/Skeleton';
import { useTheme } from '@/providers/ThemeProvider';
import { glassFor, tokensFor } from '@/theme/tokens';

interface Turno {
  pregunta: string;
  respuesta: string;
}

// UI copy — verbatim from the web page.
const SUGERENCIAS = [
  '¿Puedo tener mascotas según el reglamento?',
  '¿Qué dice la Ley 675 sobre las cuotas de administración?',
  '¿Cómo se eligen los miembros del consejo?',
  '¿Qué es el coeficiente de copropiedad?',
];

export default function Asistente() {
  const { theme } = useTheme();
  const colors = tokensFor(theme);
  const glass = glassFor(theme);
  const router = useRouter();
  const [pregunta, setPregunta] = useState('');
  const [historial, setHistorial] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function preguntar(texto: string) {
    const q = texto.trim();
    if (!q || loading) return;
    setLoading(true);
    setPregunta('');
    try {
      const body: AsistenteRequest = { pregunta: q };
      const { respuesta } = await api.post<AsistenteResponse>('/ai/asistente', body);
      setHistorial((prev) => [...prev, { pregunta: q, respuesta }]);
    } catch (e) {
      // Mirrors web: the ApiError detail becomes the assistant bubble.
      const msg = e instanceof ApiError ? e.detail : 'No se pudo consultar en este momento.';
      setHistorial((prev) => [...prev, { pregunta: q, respuesta: msg }]);
    } finally {
      setLoading(false);
    }
  }

  const canSend = !loading && pregunta.trim().length > 0;

  // Web carries `shadow-xl` on BOTH the input and the send button so the
  // composer floats over the conversation (page.tsx:145,147). RN has no
  // `shadow-*` scale, so mirror it with the scheme's glass shadow color.
  const composerShadow = {
    shadowColor: glass.shadowColor,
    shadowOpacity: theme === 'light' ? 0.12 : 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  } as const;

  return (
    <Screen scroll={false} className="bg-primary">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* CHAT AREA — scrolls; the input row below stays pinned. */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24, paddingTop: 16, gap: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          // Only follow the conversation. Firing on the FIRST layout too would
          // land the user at the disclaimer with the header scrolled off, while
          // web opens at the top of the page.
          onContentSizeChange={() => {
            if (historial.length > 0 || loading) {
              scrollRef.current?.scrollToEnd({ animated: true });
            }
          }}
        >
          <Animated.View entering={FadeInDown.duration(500)}>
            <ProfileHeader />
          </Animated.View>

          {/* HEADER */}
          <Animated.View
            entering={FadeInDown.delay(80).duration(500)}
            className="flex-row items-center gap-3"
          >
            {/* Web: `bg-accent/20 border border-accent/30 text-accent` (page.tsx:102). */}
            <View className="h-12 w-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/20">
              <Scale size={24} color={colors.accent} />
            </View>
            <View>
              <Text className="text-xl font-bold tracking-tight text-text">Asistente legal</Text>
              <Text className="text-xs text-text/70">Consultas sobre Ley 675 y el reglamento</Text>
            </View>
          </Animated.View>

          {/* SUGGESTION CHIPS — only while the conversation is empty. */}
          {historial.length === 0 ? (
            <Animated.View entering={FadeInDown.delay(160).duration(500)} className="gap-2">
              <Text className="px-1 text-xs text-text/50">Prueba con:</Text>
              {/* Web does not disable the chips while loading — `preguntar()`
                  already guards on `loading` (page.tsx:83,115). */}
              {SUGERENCIAS.map((s) => (
                <Pressable key={s} onPress={() => preguntar(s)}>
                  {({ pressed }) => (
                    // Web: `border border-border hover:border-accent/40` (page.tsx:116).
                    // LiquidGlass contract: className = box (radius/border/size),
                    // style = the INNER content view (padding/gap/direction).
                    <LiquidGlass
                      radius={16}
                      className={
                        pressed
                          ? 'rounded-2xl border border-accent/40'
                          : 'rounded-2xl border border-border'
                      }
                      style={{ padding: 12 }}
                    >
                      <Text className="text-sm text-text/90">{s}</Text>
                    </LiquidGlass>
                  )}
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          {/* CONVERSATION */}
          <View className="gap-4">
            {historial.map((t, i) => (
              <View key={i} className="gap-2">
                {/* Web: `bg-accent/20 border border-accent/30` (page.tsx:126). */}
                <View className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-accent/30 bg-accent/20 px-4 py-2.5">
                  <Text className="text-sm text-text">{t.pregunta}</Text>
                </View>
                <LiquidGlass
                  radius={16}
                  className="max-w-[90%] self-start rounded-2xl border border-border"
                  style={{ paddingHorizontal: 16, paddingVertical: 12 }}
                >
                  <FormatTurno
                    text={t.respuesta}
                    scheme={theme}
                    onNavigate={(path) => router.push(path as never)}
                  />
                </LiquidGlass>
              </View>
            ))}
            {loading ? (
              <Animated.View entering={FadeInDown.duration(300)} className="self-start">
                <LiquidGlass
                  radius={16}
                  className="rounded-2xl border border-border"
                  // Web: `flex items-center gap-2 px-4 py-3` — must go on the
                  // INNER content view, otherwise the dot and the label stack.
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  {/* Web: `<Skeleton className="w-4 h-4 rounded-full" /> Consultando…`
                      inside a `text-text/60` bubble (page.tsx:133-134). */}
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Text className="text-sm text-text/60">Consultando…</Text>
                </LiquidGlass>
              </Animated.View>
            ) : null}
          </View>

          {/* DISCLAIMER — web renders it in the page flow, below the last bubble
              and above the fixed composer (page.tsx:152-154). */}
          <Text className="text-center text-[10px] text-text/30">
            Información orientativa basada en la Ley 675. Para casos específicos, contacta a la
            administración.
          </Text>
        </ScrollView>

        {/* INPUT ROW — pinned above the tab bar / keyboard; web pins it with
            `fixed bottom-28 … shadow-xl` so it floats over the conversation. */}
        <View className="px-6 pb-2 pt-2">
          <View className="flex-row gap-2">
            <TextInput
              value={pregunta}
              onChangeText={setPregunta}
              onSubmitEditing={() => preguntar(pregunta)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="send"
              placeholder="Escribe tu consulta…"
              placeholderTextColor={colors.textMuted}
              // Web keeps the input editable while a query is in flight; only
              // the send button is disabled (page.tsx:142-146).
              // Web: `focus:border-accent` (page.tsx:145).
              style={[composerShadow, focused ? { borderColor: colors.accent } : null]}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-surface2 px-4 py-3.5 text-sm text-text"
            />
            <Pressable
              onPress={() => preguntar(pregunta)}
              disabled={!canSend}
              style={({ pressed }) => [
                composerShadow,
                {
                  opacity: !canSend ? 0.5 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              className="items-center justify-center rounded-2xl bg-accent px-5"
              accessibilityRole="button"
              accessibilityLabel="Enviar consulta"
            >
              <Send size={18} color={colors.onAccent} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

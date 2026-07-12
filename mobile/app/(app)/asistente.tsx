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
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Scale, Send } from 'lucide-react-native';

import { api, ApiError } from '@/lib/api/client';
import type { AsistenteRequest, AsistenteResponse } from '@/lib/api/types';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

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
  const [pregunta, setPregunta] = useState('');
  const [historial, setHistorial] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(false);
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
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Animated.View entering={FadeInDown.duration(500)}>
            <ProfileHeader />
          </Animated.View>

          {/* HEADER */}
          <Animated.View
            entering={FadeInDown.delay(80).duration(500)}
            className="flex-row items-center gap-3"
          >
            <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface2">
              <Scale size={24} color={colors.accent} />
            </View>
            <View>
              <Text className="text-xl font-bold tracking-tight text-text">Asistente legal</Text>
              <Text className="text-xs" style={{ color: colors.textMuted }}>
                Consultas sobre Ley 675 y el reglamento
              </Text>
            </View>
          </Animated.View>

          {/* SUGGESTION CHIPS — only while the conversation is empty. */}
          {historial.length === 0 ? (
            <Animated.View entering={FadeInDown.delay(160).duration(500)} className="gap-2">
              <Text className="px-1 text-xs" style={{ color: colors.textMuted }}>
                Prueba con:
              </Text>
              {SUGERENCIAS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => preguntar(s)}
                  disabled={loading}
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                >
                  <LiquidGlass radius={16} className="rounded-2xl border border-border p-3">
                    <Text className="text-sm text-text">{s}</Text>
                  </LiquidGlass>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          {/* CONVERSATION */}
          <View className="gap-4">
            {historial.map((t, i) => (
              <View key={i} className="gap-2">
                <View
                  className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-border bg-surface2 px-4 py-2.5"
                >
                  <Text className="text-sm text-text">{t.pregunta}</Text>
                </View>
                <LiquidGlass
                  radius={16}
                  className="max-w-[90%] self-start rounded-2xl rounded-bl-md border border-border px-4 py-3"
                >
                  <Text className="text-sm leading-relaxed text-text">{t.respuesta}</Text>
                </LiquidGlass>
              </View>
            ))}
            {loading ? (
              <Animated.View entering={FadeInDown.duration(300)} className="self-start">
                <LiquidGlass
                  radius={16}
                  className="flex-row items-center gap-2 rounded-2xl border border-border px-4 py-3"
                >
                  <ActivityIndicator size="small" color={colors.text} />
                  <Text className="text-sm" style={{ color: colors.textMuted }}>
                    Consultando…
                  </Text>
                </LiquidGlass>
              </Animated.View>
            ) : null}
          </View>
        </ScrollView>

        {/* INPUT ROW — pinned above the tab bar / keyboard. */}
        <View className="px-6 pt-2">
          <View className="flex-row gap-2">
            <TextInput
              value={pregunta}
              onChangeText={setPregunta}
              onSubmitEditing={() => preguntar(pregunta)}
              returnKeyType="send"
              placeholder="Escribe tu consulta…"
              placeholderTextColor={colors.textMuted}
              editable={!loading}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-surface2 px-4 py-3.5 text-sm text-text"
            />
            <Pressable
              onPress={() => preguntar(pregunta)}
              disabled={!canSend}
              style={({ pressed }) => ({
                opacity: !canSend ? 0.5 : pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
              className="items-center justify-center rounded-2xl bg-accent px-5"
              accessibilityRole="button"
              accessibilityLabel="Enviar consulta"
            >
              <Send size={18} color={colors.onAccent} />
            </Pressable>
          </View>

          {/* DISCLAIMER */}
          <Text className="mt-2 text-center text-[10px]" style={{ color: colors.textMuted }}>
            Información orientativa basada en la Ley 675. Para casos específicos, contacta a la
            administración.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

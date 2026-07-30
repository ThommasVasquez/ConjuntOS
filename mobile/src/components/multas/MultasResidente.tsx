import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColorScheme } from 'nativewind';
import { FileText, Gavel } from 'lucide-react-native';

import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { safeHttpUrl } from '@/lib/safe-url';
import { tokensFor } from '@/theme/tokens';
import type { MultaDto } from '@/lib/api/types';

/**
 * MultasResidente — RN port of web `src/components/multas/MultasResidente.tsx`.
 * Resident's own fines, with appeal + notice download. Renders nothing when
 * empty. Lives here (not inlined in the pagos screen) so other surfaces can
 * mount it, exactly like web.
 */

/** COP-style thousands grouping, Hermes-safe. Mirrors web `Number(m.monto).toLocaleString("es-CO")`. */
function formatCOP(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Token hex + alpha → rgba(), the runtime equivalent of web's `/10`-style
 * opacity modifiers. Needed for `style` props (icon colors, Pressable styles)
 * where a NativeWind class cannot be used.
 */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Web `ESTADO_STYLE` (MultasResidente.tsx:19-24) uses raw Tailwind tints:
 *   IMPUESTA `text-amber-300 border-amber-500/30 bg-amber-500/10`
 *   APELADA  `text-blue-300  border-blue-500/30  bg-blue-500/10`
 *   PAGADA   `text-emerald-300 border-emerald-500/30 bg-emerald-500/10`
 *   ANULADA  `text-text/50 border-border bg-text/5`
 * Ported to the semantic tokens that carry those exact meanings (warning /
 * info / success / text) so both schemes stay legible — the design system
 * forbids raw hexes in components.
 *
 * NativeWind pitfall: these must stay COMPLETE literal class strings.
 */
const ESTADO_CHIP: Record<string, string> = {
  IMPUESTA: 'border-warning/30 bg-warning/10',
  APELADA: 'border-info/30 bg-info/10',
  PAGADA: 'border-success/30 bg-success/10',
  ANULADA: 'border-border bg-text/5',
};

const ESTADO_TEXT: Record<string, string> = {
  IMPUESTA: 'text-warning',
  APELADA: 'text-info',
  PAGADA: 'text-success',
  ANULADA: 'text-text/50',
};

export default function MultasResidente() {
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');
  const [multas, setMultas] = useState<MultaDto[]>([]);

  useEffect(() => {
    api
      .get<MultaDto[]>('/multas')
      .then(setMultas)
      .catch(() => {});
  }, []);

  useWsSubscription('multa', (event) => {
    const dto = event.payload as MultaDto | undefined;
    if (!dto) return;
    setMultas((prev) =>
      prev.some((m) => m.id === dto.id)
        ? prev.map((m) => (m.id === dto.id ? dto : m))
        : [dto, ...prev],
    );
  });

  async function apelar(id: string) {
    try {
      const dto = await api.post<MultaDto>(`/multas/${id}/apelar`);
      setMultas((prev) => prev.map((m) => (m.id === id ? dto : m)));
      toast.success('Apelación registrada');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'No se pudo apelar');
    }
  }

  if (multas.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(40)} style={{ gap: 12 }}>
      {/* `text-xs font-bold uppercase tracking-widest text-text/60 px-1` */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
        <Gavel size={14} color={withAlpha(t.text, 0.6)} />
        <Text
          className="text-text/60"
          style={{
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}
        >
          Multas
        </Text>
      </View>
      {multas.map((m) => {
        const chipClass = ESTADO_CHIP[m.estado] ?? ESTADO_CHIP.ANULADA;
        const chipTextClass = ESTADO_TEXT[m.estado] ?? ESTADO_TEXT.ANULADA;
        return (
          <LiquidGlass key={m.id} radius={16} className="rounded-2xl" style={{ padding: 16 }}>
            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text className="text-text" style={{ fontSize: 14, fontWeight: '700' }}>
                    ${formatCOP(Number(m.monto))}
                  </Text>
                  <Text className="text-text/60" style={{ fontSize: 11 }}>
                    {m.motivo}
                  </Text>
                </View>
                <View
                  className={`border ${chipClass}`}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    className={chipTextClass}
                    style={{
                      fontSize: 9,
                      fontWeight: '900',
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    {m.estado}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {m.pdfUrl ? (
                  <Pressable
                    onPress={() => {
                      // http(s)-only allowlist: pdfUrl is server-provided data
                      // and must never launch tel:/sms:/app-scheme URLs.
                      const safe = safeHttpUrl(m.pdfUrl);
                      if (safe) void Linking.openURL(safe);
                    }}
                    // `bg-text/10 border border-border text-text`
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: withAlpha(t.text, 0.1),
                      borderWidth: 1,
                      borderColor: t.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <FileText size={13} color={t.text} />
                    <Text className="text-text" style={{ fontSize: 12, fontWeight: '700' }}>
                      Notificación
                    </Text>
                  </Pressable>
                ) : null}
                {m.estado === 'IMPUESTA' ? (
                  <Pressable
                    onPress={() => {
                      void apelar(m.id);
                    }}
                    // `bg-blue-500/20 border border-blue-500/30 text-blue-300`
                    // → the `info` token at the same opacities.
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: withAlpha(t.info, 0.2),
                      borderWidth: 1,
                      borderColor: withAlpha(t.info, 0.3),
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text className="text-info" style={{ fontSize: 12, fontWeight: '700' }}>
                      Apelar
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </LiquidGlass>
        );
      })}
    </Animated.View>
  );
}

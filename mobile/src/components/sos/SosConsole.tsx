/**
 * SosConsole — mobile port of web `src/components/sos/SosConsole.tsx`.
 *
 * Security console: live list of active SOS alerts. Renders nothing when the
 * queue is empty so it can sit at the top of the vigilancia dashboard
 * unobtrusively.
 *
 * Same data contract as web: a 5 s poll of `GET /sos` (the reliable fallback)
 * merged with the `sos` WebSocket fast-path, and `POST /sos/{id}/atender` |
 * `/resolver` for the two actions.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { AlertTriangle, Check, Eye } from 'lucide-react-native';

import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

import type { SosDto } from './types';

const TIPO_LABEL: Record<string, string> = {
  SEGURIDAD: '🛡️ Seguridad',
  MEDICA: '🚑 Médica',
  INCENDIO: '🔥 Incendio',
  OTRO: '⚠️ Otro',
};

export function SosConsole() {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [alertas, setAlertas] = useState<SosDto[]>([]);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // ── Poll every 5 s: reliable fallback for when WebSocket delivery is racey ──
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const fresh = await api.get<SosDto[]>('/sos');
        if (cancelled || !fresh) return;

        setAlertas((prev) => {
          // Build a map keyed by id so we merge WS-driven state with server truth
          const byId = new Map<string, SosDto>();
          for (const a of prev) byId.set(a.id, a);
          // Server is authoritative for the list of ACTIVE alerts
          const merged: SosDto[] = [];
          const freshIds = new Set<string>();
          for (const f of fresh) {
            freshIds.add(f.id);
            // Prefer our local copy if we have one (keeps WS-updated estado /
            // atendidaPorId / etc.), otherwise use the fresh server row.
            merged.push(byId.get(f.id) ?? f);
          }

          // Toast for genuinely new alerts (not seen in last poll)
          const prevIds = prevIdsRef.current;
          for (const id of freshIds) {
            if (!prevIds.has(id)) {
              const alerta = fresh.find((a) => a.id === id);
              if (alerta) {
                // Web passes `{ duration: 10000 }` to sonner; the shared toast
                // helper has no duration argument, so this one call goes
                // straight to the host (same registered glass card + type).
                Toast.show({
                  type: 'error',
                  text1: `🚨 SOS — ${alerta.usuarioNombre ?? 'Residente'}`,
                  visibilityTime: 10000,
                });
              }
            }
          }
          prevIdsRef.current = freshIds;
          return merged;
        });
      } catch {
        // network hiccup — next poll will catch up
      }
    }

    // Initial fetch
    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ── WebSocket fast-path (best-effort; polling above is the safety net) ──
  useWsSubscription('sos', (event) => {
    const dto = event.payload as SosDto | undefined;
    if (!dto) return;
    if (event.action === 'created') {
      setAlertas((prev) =>
        prev.some((a) => a.id === dto.id) ? prev : [dto, ...prev],
      );
    } else if (event.action === 'updated') {
      setAlertas((prev) =>
        dto.estado === 'RESUELTA'
          ? prev.filter((a) => a.id !== dto.id)
          : prev.map((a) => (a.id === dto.id ? dto : a)),
      );
    }
  });

  async function accion(id: string, kind: 'atender' | 'resolver') {
    try {
      const dto = await api.post<SosDto>(`/sos/${id}/${kind}`);
      setAlertas((prev) =>
        dto.estado === 'RESUELTA'
          ? prev.filter((a) => a.id !== id)
          : prev.map((a) => (a.id === id ? dto : a)),
      );
    } catch {
      toast.error('No se pudo actualizar la alerta.');
    }
  }

  if (alertas.length === 0) return null;

  return (
    <View className="flex flex-col gap-2">
      <View className="flex-row items-center gap-2 px-1">
        <AlertTriangle size={14} color={tokens.danger} />
        <Text className="text-xs font-bold uppercase tracking-widest text-danger">
          Alertas SOS activas ({alertas.length})
        </Text>
      </View>

      {alertas.map((a) => (
        <LiquidGlass
          key={a.id}
          radius={16}
          className="rounded-2xl"
          // `liquid-glass rounded-2xl p-4 border border-red-500/40 bg-red-500/10
          //  flex items-center gap-3` — the tint + border live on the content
          //  layer so they paint above the glass fill, like the web override.
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: withAlpha(tokens.danger, 0.4),
            backgroundColor: withAlpha(tokens.danger, 0.1),
          }}
        >
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-bold text-text">
              {TIPO_LABEL[a.tipo] ?? a.tipo} — {a.usuarioNombre ?? 'Residente'}
            </Text>
            <Text
              className="text-[11px]"
              style={{ color: withAlpha(tokens.text, 0.6) }}
            >
              {a.torre || a.apto ? (
                <Text
                  className="font-semibold text-accent"
                  style={{ fontSize: 11 }}
                >
                  Torre {a.torre ?? '—'} Apto {a.apto ?? '—'} ·{' '}
                </Text>
              ) : null}
              {a.ubicacion || 'Ubicación no especificada'} ·{' '}
              {a.estado === 'ATENDIDA' ? 'En atención' : 'Sin atender'}
            </Text>
          </View>

          {a.estado === 'ABIERTA' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void accion(a.id, 'atender');
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: withAlpha(tokens.warning, 0.3),
                backgroundColor: withAlpha(tokens.warning, 0.2),
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <Eye size={14} color={tokens.warning} />
              <Text
                className="text-xs font-bold"
                style={{ color: tokens.warning }}
              >
                Atender
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void accion(a.id, 'resolver');
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: withAlpha(tokens.success, 0.3),
              backgroundColor: withAlpha(tokens.success, 0.2),
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Check size={14} color={tokens.success} />
            <Text className="text-xs font-bold" style={{ color: tokens.success }}>
              Resolver
            </Text>
          </Pressable>
        </LiquidGlass>
      ))}
    </View>
  );
}

export default SosConsole;

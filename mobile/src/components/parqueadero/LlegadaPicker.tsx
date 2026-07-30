/**
 * Arrival date + time picker for the visitor-slot reservation modal.
 *
 * Web uses `<input type="datetime-local">` (page.tsx:907-916), which lets the
 * resident pick ANY day and time. RN has no such control and the project has no
 * date-picker dependency, so this reproduces the same capability with a day row
 * (today + the next 29 days) plus 15-minute / 1-hour time steppers. The value
 * stays a plain epoch-ms so the caller keeps sending
 * `new Date(value).toISOString()` exactly like web.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Calendar } from 'lucide-react-native';

import { formatDiaChip, formatFechaCorta, formatHora12 } from '@/components/parqueadero/format';
import { tokensFor } from '@/theme/tokens';

const DAYS_AHEAD = 30;

/** Midnight of `d`, as epoch ms. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function LlegadaPicker({
  valueMs,
  onChange,
}: {
  valueMs: number | null;
  onChange: (ms: number) => void;
}) {
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  const dias = useMemo(() => {
    const base = startOfDay(new Date());
    return Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(base + i * 86400000));
  }, []);

  const actual = valueMs != null ? new Date(valueMs) : null;

  const elegirDia = (dia: Date) => {
    const ref = actual ?? new Date();
    const next = new Date(
      dia.getFullYear(),
      dia.getMonth(),
      dia.getDate(),
      ref.getHours(),
      ref.getMinutes(),
      0,
      0,
    );
    onChange(next.getTime());
  };

  const ajustar = (mins: number) => {
    const ref = actual ?? new Date();
    onChange(ref.getTime() + mins * 60000);
  };

  return (
    <View className="rounded-2xl border border-border bg-surface2 p-3">
      {/* Valor actual (el icono Calendar de web, page.tsx:909). */}
      <View className="flex-row items-center gap-2">
        <Calendar size={16} color={t.textMuted} />
        <Text className="flex-1 text-sm font-bold text-text">
          {actual ? formatFechaCorta(actual) : ''}
        </Text>
      </View>

      {/* Día */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        className="mt-3"
      >
        {dias.map((dia, i) => {
          const selected =
            actual != null &&
            dia.getFullYear() === actual.getFullYear() &&
            dia.getMonth() === actual.getMonth() &&
            dia.getDate() === actual.getDate();
          const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : formatDiaChip(dia);
          return (
            <Pressable
              key={dia.getTime()}
              onPress={() => elegirDia(dia)}
              className={
                selected
                  ? 'rounded-xl border border-accent bg-accent/15 px-3 py-2'
                  : 'rounded-xl border border-border bg-surface px-3 py-2'
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text
                className={
                  selected ? 'text-xs font-bold text-accent' : 'text-xs font-bold text-text'
                }
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Hora */}
      <View className="mt-3 flex-row items-center justify-between gap-2">
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => ajustar(-60)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="rounded-xl border border-border bg-surface px-3 py-2"
          >
            <Text className="text-xs font-bold text-text">−1 h</Text>
          </Pressable>
          <Pressable
            onPress={() => ajustar(-15)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="rounded-xl border border-border bg-surface px-3 py-2"
          >
            <Text className="text-xs font-bold text-text">−15 m</Text>
          </Pressable>
        </View>

        <Text className="text-sm font-bold text-text" style={{ fontVariant: ['tabular-nums'] }}>
          {actual ? formatHora12(actual) : ''}
        </Text>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => ajustar(15)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="rounded-xl border border-border bg-surface px-3 py-2"
          >
            <Text className="text-xs font-bold text-text">+15 m</Text>
          </Pressable>
          <Pressable
            onPress={() => ajustar(60)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="rounded-xl border border-border bg-surface px-3 py-2"
          >
            <Text className="text-xs font-bold text-text">+1 h</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

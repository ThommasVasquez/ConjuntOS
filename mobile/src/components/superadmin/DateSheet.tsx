import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';

import { Sheet } from '@/components/ui/Sheet';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

/**
 * Sheet-based replacement for the web `<input type="date">` used by the
 * SuperAdmin "Fecha de la Escritura" field. Year / month / day are picked from
 * plain lists — no date-picker dependency is added (see mobile port rules).
 *
 * The value contract matches the web input exactly: a `YYYY-MM-DD` string, or
 * an empty string when unset.
 */

const MONTHS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const FIRST_YEAR = 1950;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export interface DateSheetProps {
  open: boolean;
  /** Current value as `YYYY-MM-DD`, or '' when unset. */
  value: string;
  /** Sheet title (mirrors the field label it belongs to). */
  title: string;
  onClose: () => void;
  onChange: (value: string) => void;
}

export function DateSheet({ open, value, title, onClose, onChange }: DateSheetProps) {
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());

  // Re-seed from the incoming value each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const parts = value.split('-');
    if (parts.length === 3) {
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        setYear(y);
        setMonth(Math.min(Math.max(m - 1, 0), 11));
        setDay(d);
        return;
      }
    }
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setDay(now.getDate());
  }, [open, value]);

  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(day, maxDay);

  const years: number[] = [];
  for (let y = today.getFullYear(); y >= FIRST_YEAR; y -= 1) years.push(y);

  const days: number[] = [];
  for (let d = 1; d <= maxDay; d += 1) days.push(d);

  return (
    <Sheet open={open} onClose={onClose} snapPoints={['72%']}>
      <View className="flex-1 px-5 pb-6">
        <View className="flex-row items-center justify-between py-3">
          <Text className="text-base font-bold text-text">{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={onClose}
            hitSlop={8}
          >
            <X size={20} color={t.text} />
          </Pressable>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: 24, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Año */}
          <View className="gap-2">
            <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
              Año
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {years.map((y) => {
                const selected = y === year;
                return (
                  <Pressable
                    key={y}
                    accessibilityRole="button"
                    onPress={() => setYear(y)}
                    className={`rounded-xl border px-3 py-2 ${
                      selected ? 'border-accent bg-accentSoft' : 'border-border bg-surface2'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${selected ? 'text-accent' : 'text-text'}`}
                    >
                      {y}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Mes */}
          <View className="gap-2">
            <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
              Mes
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {MONTHS.map((label, idx) => {
                const selected = idx === month;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    onPress={() => setMonth(idx)}
                    className={`rounded-xl border px-3 py-2 ${
                      selected ? 'border-accent bg-accentSoft' : 'border-border bg-surface2'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold uppercase ${
                        selected ? 'text-accent' : 'text-text'
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Día */}
          <View className="gap-2">
            <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
              Día
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {days.map((d) => {
                const selected = d === safeDay;
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    onPress={() => setDay(d)}
                    className={`h-10 w-10 items-center justify-center rounded-xl border ${
                      selected ? 'border-accent bg-accentSoft' : 'border-border bg-surface2'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${selected ? 'text-accent' : 'text-text'}`}
                    >
                      {d}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Acciones */}
          <View className="flex-row gap-3 pt-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange('');
                onClose();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              className="flex-1 items-center justify-center rounded-2xl border border-border bg-surface py-3.5"
            >
              <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                Limpiar
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange(`${year}-${pad(month + 1)}-${pad(safeDay)}`);
                onClose();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              className="flex-1 items-center justify-center rounded-2xl bg-accent py-3.5"
            >
              <Text className="text-[10px] font-black uppercase tracking-widest text-on-accent">
                Confirmar
              </Text>
            </Pressable>
          </View>
        </BottomSheetScrollView>
      </View>
    </Sheet>
  );
}

export default DateSheet;

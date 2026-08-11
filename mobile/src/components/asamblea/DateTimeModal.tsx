import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { X } from 'lucide-react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

/**
 * Modal-based replacement for the web `<input type="datetime-local">` used by
 * the "Fecha y hora" field of the Nueva asamblea form. Year / month / day /
 * hour / minute are picked from plain lists — no date-picker dependency is
 * added (see mobile port rules).
 *
 * It is a plain RN `Modal` (not the gorhom `Sheet`) because it is only ever
 * opened from inside another RN Modal, and a gorhom sheet cannot present over
 * one. Same reasoning as `PickerModal` in admin-novedades.tsx.
 *
 * The value contract matches the web input exactly: a local-time
 * `YYYY-MM-DDTHH:mm` string, or an empty string when unset.
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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export interface DateTimeModalProps {
  open: boolean;
  /** Current value as local `YYYY-MM-DDTHH:mm`, or '' when unset. */
  value: string;
  /** Modal title (mirrors the field label it belongs to). */
  title: string;
  onClose: () => void;
  onChange: (value: string) => void;
}

export function DateTimeModal({ open, value, title, onClose, onChange }: DateTimeModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());
  const [hour, setHour] = useState(today.getHours());
  const [minute, setMinute] = useState(today.getMinutes());

  // Re-seed from the incoming value each time the modal opens.
  useEffect(() => {
    if (!open) return;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (match) {
      setYear(Number(match[1]));
      setMonth(Math.min(Math.max(Number(match[2]) - 1, 0), 11));
      setDay(Number(match[3]));
      setHour(Math.min(Number(match[4]), 23));
      setMinute(Math.min(Number(match[5]), 59));
      return;
    }
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setDay(now.getDate());
    setHour(now.getHours());
    setMinute(now.getMinutes());
  }, [open, value]);

  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(day, maxDay);

  const years: number[] = [];
  for (let y = today.getFullYear() - 1; y <= today.getFullYear() + 5; y += 1) years.push(y);

  const days: number[] = [];
  for (let d = 1; d <= maxDay; d += 1) days.push(d);

  const hours: number[] = [];
  for (let h = 0; h < 24; h += 1) hours.push(h);

  const minutes: number[] = [];
  for (let m = 0; m < 60; m += 1) minutes.push(m);

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        {/* Inert backdrop (web parity): dismisses on tap but stays out of the
            accessibility tree, so the sheet content is reachable. */}
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(320)}
            className="max-h-[80%] overflow-hidden rounded-t-[32px] border border-border bg-primaryLight"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center justify-between px-5 py-4">
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}
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

              {/* Hora */}
              <View className="gap-2">
                <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                  Hora
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {hours.map((h) => {
                    const selected = h === hour;
                    return (
                      <Pressable
                        key={h}
                        accessibilityRole="button"
                        onPress={() => setHour(h)}
                        className={`h-10 w-10 items-center justify-center rounded-xl border ${
                          selected ? 'border-accent bg-accentSoft' : 'border-border bg-surface2'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${selected ? 'text-accent' : 'text-text'}`}
                        >
                          {pad(h)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Minuto */}
              <View className="gap-2">
                <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                  Minuto
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {minutes.map((m) => {
                    const selected = m === minute;
                    return (
                      <Pressable
                        key={m}
                        accessibilityRole="button"
                        onPress={() => setMinute(m)}
                        className={`h-9 w-9 items-center justify-center rounded-xl border ${
                          selected ? 'border-accent bg-accentSoft' : 'border-border bg-surface2'
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-bold ${
                            selected ? 'text-accent' : 'text-text'
                          }`}
                        >
                          {pad(m)}
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
                    onChange(
                      `${year}-${pad(month + 1)}-${pad(safeDay)}T${pad(hour)}:${pad(minute)}`,
                    );
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
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

export default DateTimeModal;

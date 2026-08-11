/**
 * Modal "Historial de Accesos" — RN port of web
 * src/app/(app)/parqueadero/page.tsx:560-608.
 *
 * The six rows are HARDCODED MOCK data on web too (the plate-recognition feed
 * does not exist yet); they are copied verbatim so both products show the same
 * screen. Web's `bg-${log.color}-500/10` template classes are purged away in
 * its own build, so the tiles map onto the semantic tokens instead:
 * emerald → success, rose → danger.
 */

import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Clock, Info, X } from 'lucide-react-native';

import { GlassCard } from '@/components/ui/GlassCard';
import { tokensFor } from '@/theme/tokens';

interface RegistroAcceso {
  tipo: 'ENTRADA' | 'SALIDA';
  placa: string;
  fecha: string;
  punto: string;
}

/** Verbatim from web page.tsx:575-581. */
const REGISTROS: RegistroAcceso[] = [
  { tipo: 'ENTRADA', placa: 'SQL-404', fecha: 'Hoy, 08:24 AM', punto: 'Portería Principal' },
  { tipo: 'SALIDA', placa: 'SQL-404', fecha: 'Ayer, 06:15 PM', punto: 'Portería Principal' },
  { tipo: 'ENTRADA', placa: 'SQL-404', fecha: '20 May, 07:11 AM', punto: 'Portería Principal' },
  { tipo: 'SALIDA', placa: 'SQL-404', fecha: '19 May, 05:45 PM', punto: 'Portería Sótano' },
  { tipo: 'ENTRADA', placa: 'SQL-404', fecha: '19 May, 08:02 AM', punto: 'Portería Principal' },
  { tipo: 'SALIDA', placa: 'SQL-404', fecha: '18 May, 06:30 PM', punto: 'Portería Principal' },
];

export function HistorialAccesosModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(450)}
            className="max-h-[92%] overflow-hidden rounded-t-[48px] border border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center justify-between p-8 pb-4">
              <View className="flex-1">
                <Text className="text-2xl font-bold tracking-tight text-text">
                  Historial de Accesos
                </Text>
                <Text className="mt-1 text-[11px] font-black uppercase tracking-widest text-text">
                  Registros Recientes
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                className="h-12 w-12 items-center justify-center rounded-full bg-text/5"
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <X size={20} color={t.text} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 32, paddingBottom: 24, gap: 16 }}
            >
              {REGISTROS.map((log, i) => {
                const entrada = log.tipo === 'ENTRADA';
                return (
                  <GlassCard key={i} className="rounded-3xl border border-border p-5">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 flex-row items-center gap-5">
                        <View
                          className={
                            entrada
                              ? 'h-12 w-12 items-center justify-center rounded-2xl border border-success/20 bg-success/10'
                              : 'h-12 w-12 items-center justify-center rounded-2xl border border-danger/20 bg-danger/10'
                          }
                        >
                          <Clock size={16} color={entrada ? t.success : t.danger} />
                          <Text
                            className={
                              entrada
                                ? 'mt-0.5 text-[7px] font-black uppercase tracking-tighter text-success'
                                : 'mt-0.5 text-[7px] font-black uppercase tracking-tighter text-danger'
                            }
                          >
                            {log.tipo}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-text">{log.placa}</Text>
                          <Text className="text-[10px] uppercase tracking-tighter text-text">
                            {log.punto}
                          </Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="mb-1 text-[10px] font-medium text-text">{log.fecha}</Text>
                        <View
                          className={
                            entrada
                              ? 'rounded-full bg-success/20 px-2 py-0.5'
                              : 'rounded-full bg-danger/20 px-2 py-0.5'
                          }
                        >
                          <Text
                            className={
                              entrada
                                ? 'text-[7px] font-black uppercase tracking-widest text-success'
                                : 'text-[7px] font-black uppercase tracking-widest text-danger'
                            }
                          >
                            Validado
                          </Text>
                        </View>
                      </View>
                    </View>
                  </GlassCard>
                );
              })}

              {/* web: mt-8 p-4 rounded-3xl bg-text/5 border border-text/20 (page.tsx:602) */}
              <View className="mt-8 flex-row items-center gap-3 rounded-3xl border border-text/20 bg-text/5 p-4">
                <Info size={16} color={t.text} />
                <Text className="flex-1 text-[10px] font-black uppercase leading-relaxed tracking-tighter text-text">
                  Registros generados automáticamente por el sistema de reconocimiento de placas.
                </Text>
              </View>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

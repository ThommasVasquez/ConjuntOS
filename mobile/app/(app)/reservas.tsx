/**
 * RESERVAS — ConjuntOS (native port)
 *
 * Reserva de zonas comunes. Browse bookable common areas, pick an available
 * day + time slot, optionally pay a deposit, confirm. Ported from the web
 * `src/app/(app)/reservas/page.tsx`, preserving the 4-step state machine
 * (GRID -> BOOKING -> PAYMENT -> SUCCESS), the client-side slot computation,
 * realtime refetch on WS `reserva`, payments gated OFF, and the Spanish copy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  QrCode,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MSG } from '@/lib/flags';
import type {
  AreaComunDto,
  CreateReservaRequest,
  SlotDto,
} from '@/lib/api/types';

const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&q=80&w=1000';

type Step = 'GRID' | 'BOOKING' | 'PAYMENT' | 'SUCCESS';

interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

/** Deposit as a number (money is a string off the wire). */
function depositOf(area: AreaComunDto | null): number {
  if (!area) return 0;
  return parseFloat(area.depositoMonto ?? '0') || 0;
}

/** "Gratis" vs "$amount" badge text. */
function priceLabel(area: AreaComunDto): string {
  const dep = depositOf(area);
  if (!area.requiereDeposito || dep === 0) return 'Gratis';
  return `$${dep.toLocaleString()}`;
}

export default function ReservasScreen() {
  const userId = useAuth((s) => s.user?.id);

  const [areas, setAreas] = useState<AreaComunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<AreaComunDto | null>(null);
  const [step, setStep] = useState<Step>('GRID');

  // Booking configurator state.
  const [availableDays, setAvailableDays] = useState<Date[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const refetchAreas = useCallback(() => {
    return api
      .get<AreaComunDto[]>('/areas-comunes')
      .then((data) => setAreas(data ?? []))
      .catch(() => {});
  }, []);

  // Realtime: a new reservation elsewhere can block slots — refetch the areas.
  // (Matches web: does NOT live-refresh an open sheet's slots.)
  useWsSubscription('reserva', () => {
    void refetchAreas();
  });

  // Initial load (keyed on userId, mirroring web).
  useEffect(() => {
    let cancelled = false;
    async function loadAreas() {
      try {
        const data = await api.get<AreaComunDto[]>('/areas-comunes');
        if (!cancelled) setAreas(data ?? []);
      } catch (e) {
        console.error('Error loading areas', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAreas();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSelectArea = (area: AreaComunDto) => {
    setSelectedArea(area);

    // Próximos ≤5 días dentro de una ventana de 15, filtrados por diasDisponibles.
    const allowedDaysStr = area.diasDisponibles || '0,1,2,3,4,5,6';
    const allowedDays = allowedDaysStr.split(',').map((d) => parseInt(d, 10));

    const days: Date[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 15 && days.length < 5; i++) {
      const cd = new Date(d);
      cd.setDate(d.getDate() + i);
      if (allowedDays.includes(cd.getDay())) {
        days.push(cd);
      }
    }
    setAvailableDays(days);
    setSelectedDay(days.length > 0 ? days[0] : null);
    setSelectedSlotIndex(null);
    setStep('BOOKING');
  };

  const loadSlotsForDay = useCallback(async (area: AreaComunDto, day: Date) => {
    try {
      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, '0');
      const dd = String(day.getDate()).padStart(2, '0');
      const ds = `${yyyy}-${mm}-${dd}`;

      const blocked = await api.get<SlotDto[]>(
        `/areas-comunes/${area.id}/slots?fecha=${ds}`,
      );

      const startH = parseInt(area.horaApertura.split(':')[0]);
      const startM = parseInt(area.horaApertura.split(':')[1]);
      const endH = parseInt(area.horaCierre.split(':')[0]);
      const endM = parseInt(area.horaCierre.split(':')[1]);
      const dur = parseInt(String(area.duracionSlot)) || 60; // mins

      const dayStart = new Date(day);
      dayStart.setHours(startH, startM, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(endH, endM, 0, 0);

      const slots: TimeSlot[] = [];
      let curr = new Date(dayStart);
      while (curr < dayEnd) {
        const slotEnd = new Date(curr.getTime() + dur * 60000);
        if (slotEnd > dayEnd) break;

        let isBlocked = false;
        for (const b of blocked ?? []) {
          const bStart = new Date(b.fechaInicio);
          const bEnd = new Date(b.fechaFin);
          if (curr < bEnd && slotEnd > bStart) {
            isBlocked = true;
            break;
          }
        }
        // Past slots (relevant when day === today) are unavailable.
        if (curr < new Date()) isBlocked = true;

        slots.push({ start: new Date(curr), end: new Date(slotEnd), available: !isBlocked });
        curr = slotEnd;
      }

      setTimeSlots(slots);
      setSelectedSlotIndex(null);
    } catch {
      console.error('Error loading slots for day');
    }
  }, []);

  useEffect(() => {
    if (selectedArea && selectedDay) {
      void loadSlotsForDay(selectedArea, selectedDay);
    }
  }, [selectedDay, selectedArea, loadSlotsForDay]);

  const resetState = useCallback(() => {
    setStep('GRID');
    setSelectedArea(null);
    setSelectedDay(null);
    setAvailableDays([]);
    setTimeSlots([]);
    setSelectedSlotIndex(null);
    setIsProcessing(false);
    void refetchAreas();
  }, [refetchAreas]);

  const proceedToBook = async () => {
    if (selectedSlotIndex === null) return;

    if (selectedArea?.requiereDeposito && depositOf(selectedArea) > 0) {
      // Payments gated OFF — keep the disabled toast.
      if (!PAYMENTS_ENABLED) {
        toast.error(PAYMENTS_DISABLED_MSG);
        return;
      }
      setStep('PAYMENT');
    } else {
      await executeBooking();
    }
  };

  const executeBooking = async () => {
    if (selectedSlotIndex === null) return;
    const slot = timeSlots[selectedSlotIndex];
    setIsProcessing(true);
    try {
      const body: CreateReservaRequest = {
        areaId: selectedArea?.id ?? '',
        fechaInicio: slot.start.toISOString(),
        fechaFin: slot.end.toISOString(),
      };
      await api.post('/reservas', body);
      setStep('SUCCESS');
    } catch {
      toast.error('Error de conexión');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-primary">
      <Screen className="bg-primary">
        <View className="gap-10 px-6 pt-4">
          <ProfileHeader />

          {/* Search + filter — visual only (not wired), matching web. */}
          <View className="flex-row gap-3">
            <View className="relative flex-1">
              <View className="absolute left-5 top-0 bottom-0 z-10 justify-center">
                <Search size={18} color="rgba(255,255,255,0.6)" />
              </View>
              <TextInput
                placeholder="Buscar servicios..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                className="rounded-[24px] border border-border bg-surface2 py-4 pl-14 pr-6 text-sm text-text"
              />
            </View>
            <Pressable
              className="h-14 w-14 items-center justify-center rounded-[22px] border border-border bg-primary-light"
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
            >
              <SlidersHorizontal size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <View className="-mt-4 mb-2 flex-col gap-2">
            <Text className="text-3xl font-bold tracking-tight text-text">Reservas</Text>
            <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
              Zonas Comunes del Conjunto
            </Text>
          </View>

          {/* GRID */}
          <View className="flex-col gap-6">
            {areas.length === 0 ? (
              <Text className="py-10 text-center text-text">
                No hay áreas activas registradas.
              </Text>
            ) : null}

            {areas.map((area, idx) => (
              <Animated.View key={area.id} entering={FadeInDown.delay(idx * 80).duration(500)}>
                <Pressable
                  onPress={() => handleSelectArea(area)}
                  style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
                >
                  <LiquidGlass variant="card" radius={32} className="overflow-hidden border border-border">
                    {/* Cover */}
                    <View className="relative h-60 w-full overflow-hidden">
                      <Image
                        source={{ uri: area.imagenUrl || PLACEHOLDER_IMG }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={400}
                      />
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']}
                        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                      />
                      <View className="absolute right-4 top-4">
                        <LiquidGlass radius={999} className="rounded-full px-4 py-2">
                          <Text className="text-sm font-bold text-text">{priceLabel(area)}</Text>
                        </LiquidGlass>
                      </View>
                    </View>

                    {/* Body */}
                    <View className="p-6">
                      <View className="mb-3 flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="mb-1 text-xl font-bold leading-tight text-text">
                            {area.nombre}
                          </Text>
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                            {area.horaApertura}-{area.horaCierre}
                          </Text>
                        </View>
                        <View className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2">
                          <MapPin size={18} color="#FFFFFF" />
                        </View>
                      </View>

                      {area.descripcion ? (
                        <Text numberOfLines={2} className="mb-6 text-xs leading-relaxed text-text">
                          {area.descripcion}
                        </Text>
                      ) : (
                        <View className="mb-6" />
                      )}

                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-1.5">
                          <Users size={12} color="#FFFFFF" />
                          <Text className="text-[10px] font-bold uppercase text-text">
                            {area.capacidadMax} Max
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <Text className="text-[11px] font-bold uppercase tracking-[2px] text-text">
                            Reservar
                          </Text>
                          <ArrowRight size={14} color="#FFFFFF" />
                        </View>
                      </View>
                    </View>
                  </LiquidGlass>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>
      </Screen>

      {/* BOOKING bottom-sheet (Modal slide-up) */}
      <Modal
        visible={step === 'BOOKING' && !!selectedArea}
        transparent
        animationType="slide"
        onRequestClose={() => setStep('GRID')}
      >
        {selectedArea ? (
          <View className="flex-1 justify-end">
            <Pressable className="absolute inset-0 bg-black/80" onPress={() => setStep('GRID')} />
            <LiquidGlass
              radius={40}
              className="rounded-t-[40px] border-t border-border"
              style={{ maxHeight: '92%' }}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
              >
                <View className="mb-6 flex-row items-center justify-between">
                  <Text className="text-2xl font-medium tracking-tight text-text">Tu Reserva</Text>
                  <Pressable
                    onPress={() => setStep('GRID')}
                    className="h-10 w-10 items-center justify-center rounded-full bg-surface2"
                  >
                    <X size={20} color="#FFFFFF" />
                  </Pressable>
                </View>

                {/* Area summary */}
                <View className="mb-6 flex-row items-center gap-4 rounded-[24px] border border-border bg-surface2 p-3">
                  <View className="h-16 w-16 overflow-hidden rounded-2xl">
                    <Image
                      source={{ uri: selectedArea.imagenUrl || PLACEHOLDER_IMG }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 text-base font-bold text-text">{selectedArea.nombre}</Text>
                    <Text className="text-xs font-bold uppercase tracking-[2px] text-text">
                      {!selectedArea.requiereDeposito
                        ? 'Gratis'
                        : `Depósito: $${depositOf(selectedArea).toLocaleString()}`}
                    </Text>
                  </View>
                </View>

                {/* Day selector */}
                <View className="mb-6 flex-col gap-3">
                  <Text className="ml-1 text-[10px] font-bold uppercase tracking-[3px] text-text">
                    Selecciona el Día
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingBottom: 8 }}
                  >
                    {availableDays.map((date, dIdx) => {
                      const isSelected =
                        selectedDay?.getDate() === date.getDate() &&
                        selectedDay?.getMonth() === date.getMonth();
                      const mos = date.toLocaleString('es-ES', { month: 'short' });
                      const dow = date.toLocaleString('es-ES', { weekday: 'short' });
                      return (
                        <Pressable
                          key={dIdx}
                          onPress={() => setSelectedDay(date)}
                          className={`min-w-[70px] items-center gap-1 rounded-2xl border py-3 ${
                            isSelected
                              ? 'border-accent bg-accent'
                              : 'border-border bg-surface2'
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-medium uppercase tracking-[2px] ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {dow}
                          </Text>
                          <Text
                            className={`text-xl font-bold ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {date.getDate()}
                          </Text>
                          <Text
                            className={`text-[9px] font-bold uppercase ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {mos}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Time-slot selector */}
                <View className="mb-8 flex-col gap-3">
                  <Text className="ml-1 text-[10px] font-bold uppercase tracking-[3px] text-text">
                    Horario ({selectedArea.duracionSlot} min)
                  </Text>
                  <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                    {timeSlots.length === 0 ? (
                      <Text className="w-full py-4 text-center text-xs text-text">
                        No hay horarios disponibles.
                      </Text>
                    ) : null}
                    {timeSlots.map((slot, index) => {
                      const st = slot.start.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const ed = slot.end.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isSel = selectedSlotIndex === index;
                      return (
                        <View key={index} style={{ width: '50%', padding: 4 }}>
                          <Pressable
                            disabled={!slot.available}
                            onPress={() => setSelectedSlotIndex(index)}
                            className={`items-center justify-center gap-0.5 rounded-xl border px-2 py-3 ${
                              !slot.available
                                ? 'border-transparent bg-surface2 opacity-30'
                                : isSel
                                  ? 'border-accent bg-accent'
                                  : 'border-border bg-surface2'
                            }`}
                          >
                            <Text
                              className={`text-[10px] ${
                                isSel ? 'text-on-accent opacity-60' : 'text-text opacity-70'
                              }`}
                            >
                              {selectedDay
                                ?.toLocaleString('es-ES', { weekday: 'short' })
                                .toUpperCase()}{' '}
                              {selectedDay?.getDate()}
                            </Text>
                            <Text
                              className={`text-xs font-bold ${
                                isSel ? 'text-on-accent' : 'text-text'
                              }`}
                            >
                              {st} - {ed}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Confirm */}
                <Pressable
                  disabled={selectedSlotIndex === null || isProcessing}
                  onPress={proceedToBook}
                  className="w-full flex-row items-center justify-center gap-3 rounded-[24px] bg-accent py-5"
                  style={({ pressed }) => ({
                    opacity: selectedSlotIndex === null || isProcessing ? 0.5 : pressed ? 0.9 : 1,
                  })}
                >
                  <Text className="font-bold text-on-accent">
                    {isProcessing
                      ? 'Procesando...'
                      : selectedArea.requiereDeposito
                        ? 'Pagar Depósito'
                        : 'Confirmar Reserva'}
                  </Text>
                  <ArrowRight size={18} color="#000000" />
                </Pressable>
              </ScrollView>
            </LiquidGlass>
          </View>
        ) : (
          <View />
        )}
      </Modal>

      {/* PAYMENT — fake gateway overlay (only reachable when PAYMENTS_ENABLED) */}
      <Modal visible={step === 'PAYMENT'} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-primary/95 p-8">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text className="mt-6 text-2xl font-medium tracking-tight text-text">
            Procesando Pago Seguro...
          </Text>
          <Text className="mt-4 text-xs text-text">Confirmando con pasarela de pago...</Text>
          <Pressable
            onPress={executeBooking}
            className="mt-8 rounded-full border border-border px-4 py-2"
          >
            <Text className="text-xs font-bold text-accent">Confirmar Pago</Text>
          </Pressable>
        </View>
      </Modal>

      {/* SUCCESS */}
      <Modal
        visible={step === 'SUCCESS' && !!selectedArea && selectedSlotIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={resetState}
      >
        {selectedArea && selectedSlotIndex !== null ? (
          <View className="flex-1 bg-primary">
            <LinearGradient
              colors={['#000000', '#141414']}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
              }}
            >
              <View className="mb-8 h-20 w-20 items-center justify-center rounded-full bg-surface2">
                <CheckCircle2 size={40} color="#FFFFFF" />
              </View>
              <Text className="mb-2 text-3xl font-bold tracking-tight text-text">
                ¡Reserva Confirmada!
              </Text>
              <Text className="mb-10 text-center text-sm text-text">
                Tu espacio ha sido separado exitosamente.
              </Text>

              <LiquidGlass radius={40} className="w-full max-w-[340px] overflow-hidden border border-border p-8">
                <View className="mb-8 flex-col gap-6">
                  <View className="flex-row items-center gap-4">
                    <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface2">
                      <MapPin size={20} color="#FFFFFF" />
                    </View>
                    <View>
                      <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
                        Espacio
                      </Text>
                      <Text className="font-bold text-text">{selectedArea.nombre}</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-4">
                    <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface2">
                      <Clock size={20} color="#FFFFFF" />
                    </View>
                    <View>
                      <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
                        Horario
                      </Text>
                      <Text className="text-sm font-bold text-text">
                        {selectedDay?.toLocaleDateString('es-ES', {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        •{' '}
                        {timeSlots[selectedSlotIndex].start.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Decorative QR */}
                <View className="aspect-square w-full items-center justify-center rounded-[32px] border border-border bg-surface2 p-4">
                  <View className="h-full w-full items-center justify-center rounded-[20px] bg-white p-4">
                    <QrCode size={180} color="#000000" />
                  </View>
                </View>
              </LiquidGlass>

              <Pressable onPress={resetState} className="mt-12">
                <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
                  Volver a Reservas
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : (
          <View />
        )}
      </Modal>
    </View>
  );
}

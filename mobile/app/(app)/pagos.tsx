import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
  Info,
  SearchX,
  X,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { PAYMENTS_DISABLED_MSG, PAYMENTS_ENABLED } from '@/lib/flags';
import type { EstadoPago, PagoDto, ReciboDto } from '@/lib/api/types';

interface Transaction {
  id: string;
  concepto: string;
  monto: number;
  estado: EstadoPago;
  fechaVencimiento: string;
  fechaPago?: string;
  metodo?: string;
}

/** COP-style thousands grouping (no decimals), Hermes-safe. Mirrors web `n.toLocaleString()`. */
function formatCOP(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Short "DD MMM" Spanish date for the row "Vence …" label. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function formatVence(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.getDate().toString().padStart(2, '0');
    return `${day} ${MESES[d.getMonth()]}`;
  } catch {
    return '';
  }
}

/** Parse the backend response into the shape the screen expects. */
function parsePagosResponse(json: { pagos?: PagoDto[]; recibos?: ReciboDto[] }): {
  pagos: Transaction[];
  totalDebt: number;
} {
  const rawPagos = json?.pagos ?? [];
  const pagos: Transaction[] = rawPagos.map((p) => ({
    id: p.id,
    concepto: p.concepto,
    monto: parseFloat(p.monto || '0'),
    estado: p.estado,
    fechaVencimiento: p.fechaVencimiento,
    fechaPago: p.fechaPago || undefined,
    metodo: p.metodo || undefined,
  }));
  // totalDebt is computed CLIENT-SIDE (sum of PENDIENTE + VENCIDO).
  const totalDebt = pagos
    .filter((p) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO')
    .reduce((sum, p) => sum + p.monto, 0);
  return { pagos, totalDebt };
}

export default function PagosPage() {
  const user = useAuth((s) => s.user);
  const userId = user?.id;
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'PENDIENTES' | 'HISTORIAL'>('PENDIENTES');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<{ pagos: Transaction[]; totalDebt: number }>({
    pagos: [],
    totalDebt: 0,
  });

  const [selectedPayment, setSelectedPayment] = useState<Transaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fetchLock = useRef(false);
  const initialFetchDone = useRef(false);

  // Silent re-fetch (used by the WS 'pago' subscription; errors swallowed).
  const doFetch = async () => {
    try {
      const json = await api.get<{ pagos?: PagoDto[]; recibos?: ReciboDto[] }>('/pagos');
      setData(parsePagosResponse(json));
    } catch {
      // silently ignore on WS refresh
    }
  };

  useWsSubscription('pago', () => {
    void doFetch();
  });

  // Initial fetch — once, guarded by user/userId + initialFetchDone + a fetchLock dedupe.
  useEffect(() => {
    if (!user || !userId || initialFetchDone.current) return;

    async function fetchPagos() {
      if (fetchLock.current) return;
      fetchLock.current = true;
      setIsLoading(true);

      try {
        const json = await api.get<{ pagos?: PagoDto[]; recibos?: ReciboDto[] }>('/pagos');
        setData(parsePagosResponse(json));
        initialFetchDone.current = true;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        toast.error(err.message || 'Error conectando con el servidor');
      } finally {
        setIsLoading(false);
        fetchLock.current = false;
      }
    }

    void fetchPagos();
  }, [user, userId]);

  const handlePayment = async () => {
    if (!selectedPayment) return;
    // Payments are flagged OFF: stop here with the disabled message.
    if (!PAYMENTS_ENABLED) {
      toast.error(PAYMENTS_DISABLED_MSG);
      return;
    }
    setIsProcessing(true);

    try {
      await api.put(`/pagos/${selectedPayment.id}/pagar`, { metodo: 'PSE' });

      // Artificial fake-gateway delay (NOT a network wait).
      await new Promise((resolve) => setTimeout(resolve, 3500));

      setIsProcessing(false);
      const paid = selectedPayment;
      setSelectedPayment(null);

      toast.success(
        '¡Pago procesado con éxito!',
        'Tu recibo ha sido generado y persistido en el sistema.',
      );

      // Optimistic local update — NO server refetch after pay.
      setData((prev) => ({
        ...prev,
        totalDebt: Math.max(0, prev.totalDebt - paid.monto),
        pagos: prev.pagos.map((p) =>
          p.id === paid.id ? { ...p, estado: 'PAGADO', fechaPago: new Date().toISOString() } : p,
        ),
      }));
    } catch (error: unknown) {
      const err = error instanceof ApiError ? error : new Error('Unknown error');
      toast.error(err.message || 'No se pudo procesar el pago');
      setIsProcessing(false);
    }
  };

  const filteredPagos = data.pagos.filter((p) => {
    if (activeTab === 'PENDIENTES') return p.estado === 'PENDIENTE' || p.estado === 'VENCIDO';
    return p.estado === 'PAGADO';
  });

  const unidadLabel = user?.torre ? `Torre ${user.torre} • Apto ${user.apto}` : 'Mi unidad';

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: 128,
          paddingHorizontal: 24,
          gap: 32,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <ProfileHeader />
        </Animated.View>

        {/* WALLET HERO CARD */}
        <Animated.View entering={FadeInDown.duration(500).delay(80)}>
          <View
            style={{
              borderRadius: 40,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
          >
            <LinearGradient
              colors={['#FFFFFF', '#0A0A0A', '#171717']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 32, minHeight: 220, justifyContent: 'space-between' }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.heroEyebrow}>Estado de Cuenta</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.heroIconChip}>
                      <CreditCard size={14} color="#FFFFFF" />
                    </View>
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', textTransform: 'lowercase' }}>
                      {unidadLabel}
                    </Text>
                  </View>
                </View>
                <View style={styles.heroBadge}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' }} />
                  <Text style={styles.heroEyebrow}>Al día</Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  marginTop: 16,
                }}
              >
                <View>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 36,
                      fontWeight: '700',
                      fontFamily: 'PlusJakartaSans_700Bold',
                      letterSpacing: -1,
                      textShadowColor: 'rgba(0,0,0,0.3)',
                      textShadowRadius: 20,
                    }}
                  >
                    $ {formatCOP(data.totalDebt)}
                  </Text>
                  <Text style={[styles.heroEyebrow, { marginTop: 4 }]}>Saldo Total Pendiente</Text>
                </View>
                <Pressable
                  onPress={() => {
                    const firstPending = data.pagos.find(
                      (p) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO',
                    );
                    if (firstPending) setSelectedPayment(firstPending);
                    else toast.info('No tienes pagos pendientes');
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: '#FFFFFF',
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                    borderRadius: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  })}
                >
                  <Text style={{ color: '#171717', fontWeight: '700', fontSize: 14 }}>Pagar Ahora</Text>
                  <ChevronRight size={16} color="#171717" />
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* TABS CONTROLS */}
        <Animated.View entering={FadeInDown.duration(500).delay(160)}>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: 'rgba(255,255,255,0.07)',
              padding: 6,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
            }}
          >
            {(['PENDIENTES', 'HISTORIAL'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 20,
                    alignItems: 'center',
                    backgroundColor: active ? 'rgba(255,255,255,0.045)' : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: 'rgba(255,255,255,0.14)',
                  }}
                >
                  <Text
                    style={{
                      color: active ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                      fontSize: 10,
                      fontWeight: '900',
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    {tab}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* TRANSACTIONS LIST */}
        <View style={{ gap: 20 }}>
          {isLoading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', gap: 16 }}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.mutedCaption}>Calculando saldos...</Text>
            </View>
          ) : filteredPagos.length === 0 ? (
            <LiquidGlass radius={32} className="rounded-[32px]" style={{ padding: 40 }}>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                  }}
                >
                  <SearchX size={32} color="rgba(255,255,255,0.55)" />
                </View>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
                  No hay movimientos en esta sección
                </Text>
                <Text style={[styles.mutedCaption, { marginTop: 8, fontStyle: 'italic', textAlign: 'center' }]}>
                  Sincronizando con administración...
                </Text>
              </View>
            </LiquidGlass>
          ) : (
            filteredPagos.map((p, i) => (
              <Animated.View key={p.id} entering={FadeInDown.duration(400).delay(i * 60)}>
                <Pressable
                  onPress={() => activeTab === 'PENDIENTES' && setSelectedPayment(p)}
                  style={({ pressed }) => ({ opacity: pressed && activeTab === 'PENDIENTES' ? 0.85 : 1 })}
                >
                  <LiquidGlass radius={32} className="rounded-[32px]" style={{ padding: 20 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                        <View
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.2)',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                          }}
                        >
                          <DollarSign size={24} color="#FFFFFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginBottom: 6 }}
                          >
                            {p.concepto}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                              $ {formatCOP(p.monto)}
                            </Text>
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                              Vence {formatVence(p.fechaVencimiento)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.2)',
                          backgroundColor: 'rgba(255,255,255,0.1)',
                        }}
                      >
                        <Text
                          style={{
                            color: '#FFFFFF',
                            fontSize: 8,
                            fontWeight: '900',
                            letterSpacing: 1.5,
                            textTransform: 'uppercase',
                          }}
                        >
                          {p.estado}
                        </Text>
                      </View>
                    </View>
                  </LiquidGlass>
                </Pressable>
              </Animated.View>
            ))
          )}
        </View>

        {/* FOOTER: HELP */}
        <Animated.View entering={FadeInDown.duration(500).delay(220)} style={{ marginTop: 'auto' }}>
          <Pressable
            onPress={() => toast.success('Conectando con Administración vía WhatsApp...')}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <LiquidGlass radius={32} className="rounded-[32px]" style={{ padding: 24 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlertCircle size={24} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>¿Dudas con tu pago?</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                      Contacta directamente con administración
                    </Text>
                  </View>
                </View>
                <ArrowRight size={20} color="rgba(255,255,255,0.55)" />
              </View>
            </LiquidGlass>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* MODAL: PAYMENT PROCESSING */}
      <Modal
        visible={selectedPayment !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isProcessing) setSelectedPayment(null);
        }}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {/* Backdrop — dismiss disabled while processing. */}
          <Pressable
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.95)' }}
            onPress={() => {
              if (!isProcessing) setSelectedPayment(null);
            }}
          />

          {selectedPayment ? (
            <View style={{ width: '100%', maxWidth: 384 }}>
              <LiquidGlass radius={40} className="rounded-[40px]" style={{ padding: 32 }}>
                <View style={{ gap: 32 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 20,
                        fontWeight: '700',
                        fontFamily: 'PlusJakartaSans_700Bold',
                      }}
                    >
                      Completar Pago
                    </Text>
                    {!isProcessing ? (
                      <Pressable
                        onPress={() => setSelectedPayment(null)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: 'rgba(255,255,255,0.07)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={18} color="rgba(255,255,255,0.55)" />
                      </Pressable>
                    ) : null}
                  </View>

                  {isProcessing ? (
                    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 24 }}>
                      <ActivityIndicator size="large" color="#FFFFFF" />
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
                          Verificando transacción
                        </Text>
                        <Text style={styles.mutedCaption}>Seguridad Wompi Activa</Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.07)',
                          borderRadius: 24,
                          padding: 24,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.14)',
                        }}
                      >
                        <View style={{ gap: 16 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottomWidth: 1,
                              borderBottomColor: 'rgba(255,255,255,0.14)',
                              paddingBottom: 16,
                            }}
                          >
                            <Text style={styles.mutedCaption}>Concepto</Text>
                            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                              {selectedPayment.concepto}
                            </Text>
                          </View>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'flex-end',
                            }}
                          >
                            <Text style={styles.mutedCaption}>Monto a Pagar</Text>
                            <Text
                              style={{
                                color: '#FFFFFF',
                                fontSize: 28,
                                fontWeight: '700',
                                fontFamily: 'PlusJakartaSans_700Bold',
                              }}
                            >
                              $ {formatCOP(selectedPayment.monto)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={{ gap: 16 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            padding: 16,
                            borderRadius: 16,
                            backgroundColor: 'rgba(255,255,255,0.07)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.2)',
                          }}
                        >
                          <CreditCard size={18} color="#FFFFFF" />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                              Tarjeta de Crédito / PSE
                            </Text>
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                              Pago seguro procesado por Wompi
                            </Text>
                          </View>
                          <CheckCircle2 size={16} color="#FFFFFF" />
                        </View>

                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            padding: 12,
                            borderRadius: 12,
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.2)',
                          }}
                        >
                          <Info size={14} color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700', flex: 1, lineHeight: 13 }}>
                            Este pago incluye el descuento por pronto pago si se realiza antes del vencimiento.
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={handlePayment}
                        style={({ pressed }) => ({
                          backgroundColor: '#FFFFFF',
                          paddingVertical: 18,
                          borderRadius: 22,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        })}
                      >
                        <Text style={{ color: '#000000', fontWeight: '700', fontSize: 16 }}>
                          Confirmar y Pagar
                        </Text>
                        <ArrowRight size={18} color="#000000" />
                      </Pressable>
                    </>
                  )}
                </View>
              </LiquidGlass>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = {
  heroEyebrow: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  heroIconChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  mutedCaption: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
};

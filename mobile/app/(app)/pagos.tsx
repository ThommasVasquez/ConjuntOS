import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useColorScheme } from 'nativewind';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
  Info,
  SearchX,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { GuestGate } from '@/components/GuestGate';
import MultasResidente from '@/components/multas/MultasResidente';
import { Skeleton } from '@/components/pagos/parts';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { PAYMENTS_DISABLED_MSG, PAYMENTS_ENABLED } from '@/lib/flags';
import { tokensFor, type ColorTokens } from '@/theme/tokens';
import type { EstadoPago, PagoDto, ReciboDto } from '@/lib/api/types';
import { BACK_CHROME_HEIGHT, BackButton, useBackChrome } from '@/components/shell/BackChrome';

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

/**
 * Token hex + alpha → rgba(), the runtime equivalent of web's `/10`-style
 * opacity modifiers. Used where a NativeWind class cannot go (icon `color=`,
 * dynamic style objects).
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
 * The hero "Al día" status dot — web pagos/page.tsx:202
 * `<span className="w-1.5 h-1.5 rounded-full bg-text/10 animate-pulse" />`.
 *
 * Local (instead of the shared `PulsingDot` from `components/pagos/parts`,
 * which paints `bg-text/10`) because the hero card's gradient is HARDCODED dark
 * in BOTH schemes (page.tsx:187), so the dot has to be pinned white too — a
 * theme-following `text` fill turns into a dark dot on a dark card in light
 * mode and vanishes. Same white/10 as `heroIconChip` / `heroBadge`, which is
 * exactly what `bg-text/10` already resolved to in the dark scheme.
 * Timing mirrors Tailwind `animate-pulse` (2s cubic-bezier(.4,0,.6,1),
 * opacity 1 → .5), same as the shared primitive.
 */
function HeroPulsingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[style, { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)' }]}
    />
  );
}

/**
 * Web `getStatusStyle` (page.tsx:165-172): every known estado resolves to
 * `bg-text/10 text-text border-text/20`, and the fallback (EN_DISPUTA) to
 * `bg-text/5 text-text border-border`. The text color is `text` in both cases.
 */
function statusChipStyle(estado: string, t: ColorTokens): {
  backgroundColor: string;
  borderColor: string;
} {
  switch (estado) {
    case 'PAGADO':
    case 'VENCIDO':
    case 'PENDIENTE':
      return { backgroundColor: withAlpha(t.text, 0.1), borderColor: withAlpha(t.text, 0.2) };
    default:
      return { backgroundColor: withAlpha(t.text, 0.05), borderColor: t.border };
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
  // CRITICAL gate: a HUESPED_TEMPORAL account is created WITH the host's
  // unidad_id, and the backend pagos handlers scope by unidad — without this
  // gate a guest reaching /pagos (deep link, pago-keyword notification) sees
  // the host unit's full debt/recibos and can drive the pagar flow.
  // Mobile-only for now: the web page has no equivalent gate (parity fix owed
  // on the web side, NOT by deleting this).
  return (
    <GuestGate>
      <PagosInner />
    </GuestGate>
  );
}

function PagosInner() {
  const user = useAuth((s) => s.user);
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  // Room for the layout's floating back button (BackChrome) — this screen
  // hand-rolls its top padding instead of using the <Screen> primitive.
  const { showBack } = useBackChrome();
  const backPad = showBack ? BACK_CHROME_HEIGHT : 0;
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const t = tokensFor(scheme);

  const [activeTab, setActiveTab] = useState<'PENDIENTES' | 'HISTORIAL'>('PENDIENTES');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<{ pagos: Transaction[]; totalDebt: number }>({
    pagos: [],
    totalDebt: 0,
  });

  const [selectedPayment, setSelectedPayment] = useState<Transaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [nequiPhone, setNequiPhone] = useState('');
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
      // The server reflects the gateway's real outcome: PAGADO (approved) or
      // PENDIENTE (Nequi push awaiting the payer's approval in their app).
      const updated = await api.put<{ estado: string; fechaPago?: string }>(
        `/pagos/${selectedPayment.id}/pagar`,
        { metodo: 'NEQUI', telefono: nequiPhone || undefined },
      );

      setIsProcessing(false);
      const paid = updated.estado === 'PAGADO';
      const pagoId = selectedPayment.id;
      const monto = selectedPayment.monto;
      setSelectedPayment(null);

      if (paid) {
        toast.success(
          '¡Pago procesado con éxito!',
          'Tu recibo ha sido generado y persistido en el sistema.',
        );
      } else {
        toast.info(
          'Revisa tu app Nequi',
          'Aprueba el pago desde la notificación de Nequi para completarlo.',
        );
      }

      setData((prev) => ({
        ...prev,
        totalDebt: paid ? Math.max(0, prev.totalDebt - monto) : prev.totalDebt,
        pagos: prev.pagos.map((p) =>
          p.id === pagoId
            ? { ...p, estado: paid ? 'PAGADO' : 'PENDIENTE', fechaPago: updated.fechaPago }
            : p,
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

  /** `text-text-muted text-[10px] font-bold uppercase tracking-widest`. */
  const mutedCaption = {
    color: t.textMuted,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  };

  // Web pairs `bg-surface-2` with a `dark:bg-[#171717]` override on the Nequi
  // row and the phone input (page.tsx:321,336) — the only two panels that do.
  const nequiPanelBg = scheme === 'dark' ? '#171717' : t.surface2;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          // web root is `min-h-screen flex flex-col` — flexGrow is what makes
          // the footer's `mt-auto` (page.tsx:360) actually push to the bottom.
          flexGrow: 1,
          paddingTop: insets.top + backPad + 24,
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

        <MultasResidente />

        {/* WALLET HERO CARD */}
        <Animated.View entering={FadeInDown.duration(500).delay(80)}>
          <View
            style={{
              borderRadius: 40,
              // `shadow-2xl` on the hero — a neutral black drop shadow, same as
              // web's default Tailwind shadow color. Kept on the OUTER view:
              // an iOS shadow is clipped away by `overflow: 'hidden'`, so the
              // rounded clip lives on the inner view instead.
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
          >
            <View style={{ borderRadius: 40, overflow: 'hidden' }}>
              {/* web page.tsx:187 hardcodes this gradient:
                  `bg-linear-to-br from-[#FFFFFF] via-[#0A0A0A] to-[#171717]
                  rounded-[40px] shadow-2xl opacity-90`, and every label on it
                  is `text-white` (page.tsx:193-212). Kept verbatim — these are
                  web literals, not palette tokens. Like web it is an absolute
                  fill BEHIND the content, so `opacity-90` fades only the
                  gradient, never the labels. */}
              <LinearGradient
                pointerEvents="none"
                colors={['#FFFFFF', '#0A0A0A', '#171717']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
              />
              {/* Decorative top-right glow — web page.tsx:188
                  `absolute -top-4 -right-4 w-32 h-32 bg-white/5 blur-2xl
                  rounded-full`. RN has no `blur-2xl`, so this is the same
                  translucent white disc, clipped by the card's rounded corners. */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -16,
                  right: -16,
                  width: 128,
                  height: 128,
                  borderRadius: 64,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }}
              />
              <View style={{ padding: 32, minHeight: 220, justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ gap: 4 }}>
                    <Text style={styles.heroEyebrow}>Estado de Cuenta</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={styles.heroIconChip}>
                        {/* `text-white` (page.tsx:196) */}
                        <CreditCard size={14} color="#FFFFFF" />
                      </View>
                      {/* `text-sm font-bold lowercase` (page.tsx:198) */}
                      <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', textTransform: 'lowercase' }}>
                        {unidadLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.heroBadge}>
                    {/* `bg-text/10 animate-pulse` (page.tsx:202) — pinned white:
                        the hero gradient is dark in BOTH schemes. */}
                    <HeroPulsingDot />
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
                        // page-local `.text-glow` (page.tsx:381)
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
                    // `bg-white text-[#171717]` (page.tsx:220) — web literals on
                    // the dark gradient, intentionally not tokens.
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
              </View>
            </View>
          </View>
        </Animated.View>

        {/* TABS CONTROLS — `bg-surface-2 p-1.5 rounded-[24px] border border-border` */}
        <Animated.View entering={FadeInDown.duration(500).delay(160)}>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: t.surface2,
              padding: 6,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            {(['PENDIENTES', 'HISTORIAL'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  // active: `bg-surface text-text border border-border`
                  // idle:   `text-text-muted`
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 20,
                    alignItems: 'center',
                    backgroundColor: active ? t.surface : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: t.border,
                  }}
                >
                  <Text
                    style={{
                      color: active ? t.text : t.textMuted,
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
              {/* `<Skeleton className="w-10 h-10 rounded-full" />` (page.tsx:245) */}
              <Skeleton style={{ width: 40, height: 40, borderRadius: 20 }} />
              <Text style={mutedCaption}>Calculando saldos...</Text>
            </View>
          ) : filteredPagos.length === 0 ? (
            /* `py-20 … gap-4 liquid-glass-card rounded-[32px] p-10 text-center`
               (page.tsx:249) — Tailwind emits `p` before `py`, so the vertical
               padding is 80 and only the horizontal one is 40. */
            <LiquidGlass
              variant="card"
              radius={32}
              className="rounded-[32px]"
              style={{ paddingVertical: 80, paddingHorizontal: 40 }}
            >
              <View style={{ alignItems: 'center', gap: 16 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: t.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                  }}
                >
                  <SearchX size={32} color={t.textMuted} />
                </View>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
                  No hay movimientos en esta sección
                </Text>
                <Text style={[mutedCaption, { marginTop: 8, fontStyle: 'italic', textAlign: 'center' }]}>
                  Sincronizando con administración...
                </Text>
              </View>
            </LiquidGlass>
          ) : (
            filteredPagos.map((p, i) => {
              const chip = statusChipStyle(p.estado, t);
              return (
                <Animated.View key={p.id} entering={FadeInDown.duration(400).delay(i * 60)}>
                  <Pressable
                    onPress={() => activeTab === 'PENDIENTES' && setSelectedPayment(p)}
                    style={({ pressed }) => ({ opacity: pressed && activeTab === 'PENDIENTES' ? 0.85 : 1 })}
                  >
                    <LiquidGlass variant="card" radius={32} className="rounded-[32px]" style={{ padding: 20 }}>
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
                              borderColor: chip.borderColor,
                              backgroundColor: chip.backgroundColor,
                            }}
                          >
                            <DollarSign size={24} color={t.text} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              numberOfLines={1}
                              style={{ color: t.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}
                            >
                              {p.concepto}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              {/* `text-accent text-xs font-bold` (page.tsx:270) */}
                              <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>
                                $ {formatCOP(p.monto)}
                              </Text>
                              <Text style={{ color: t.textMuted, fontSize: 10 }}>
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
                            borderColor: chip.borderColor,
                            backgroundColor: chip.backgroundColor,
                          }}
                        >
                          <Text
                            style={{
                              color: t.text,
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
              );
            })
          )}
        </View>

        {/* FOOTER: HELP */}
        <Animated.View entering={FadeInDown.duration(500).delay(220)} style={{ marginTop: 'auto' }}>
          <Pressable
            onPress={() => toast.success('Conectando con Administración vía WhatsApp...')}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <LiquidGlass variant="card" radius={32} className="rounded-[32px]" style={{ padding: 24 }}>
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
                      // `bg-accent/10 text-accent` (page.tsx:366)
                      backgroundColor: withAlpha(t.accent, 0.1),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlertCircle size={24} color={t.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: 14 }}>¿Dudas con tu pago?</Text>
                    <Text style={{ color: t.textMuted, fontSize: 10 }}>
                      Contacta directamente con administración
                    </Text>
                  </View>
                </View>
                <ArrowRight size={20} color={t.textMuted} />
              </View>
            </LiquidGlass>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <BackButton />

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
          {/* Backdrop — `bg-primary/95 dark:bg-[#000000]/95` (page.tsx:286); the
              dark override is a web literal. Dismiss disabled while processing. */}
          <Pressable
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.95)' : withAlpha(t.primary, 0.95),
            }}
            onPress={() => {
              if (!isProcessing) setSelectedPayment(null);
            }}
          />

          {selectedPayment ? (
            <View style={{ width: '100%', maxWidth: 384 }}>
              <LiquidGlass variant="card" radius={40} className="rounded-[40px]" style={{ padding: 32 }}>
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
                        color: t.text,
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
                        // `bg-surface-2 text-text-muted` + a 45°-rotated
                        // DollarSign as the close glyph (page.tsx:293).
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: t.surface2,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View style={{ transform: [{ rotate: '45deg' }] }}>
                          <DollarSign size={18} color={t.textMuted} />
                        </View>
                      </Pressable>
                    ) : null}
                  </View>

                  {isProcessing ? (
                    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 24 }}>
                      {/* `w-20 h-20 rounded-full animate-pulse bg-text/10` (page.tsx:299) */}
                      <Skeleton style={{ width: 80, height: 80, borderRadius: 40 }} />
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: t.text, fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
                          Verificando transacción
                        </Text>
                        <Text style={mutedCaption}>Seguridad Wompi Activa</Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View
                        style={{
                          backgroundColor: t.surface2,
                          borderRadius: 24,
                          padding: 24,
                          borderWidth: 1,
                          borderColor: t.border,
                        }}
                      >
                        <View style={{ gap: 16 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottomWidth: 1,
                              borderBottomColor: t.border,
                              paddingBottom: 16,
                            }}
                          >
                            <Text style={mutedCaption}>Concepto</Text>
                            <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>
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
                            <Text style={mutedCaption}>Monto a Pagar</Text>
                            <Text
                              style={{
                                // `text-accent text-glow` (page.tsx:315); the
                                // page-local glow is rgba(0,0,0,0.3) blur 20
                                // (page.tsx:381).
                                color: t.accent,
                                fontSize: 30,
                                fontWeight: '700',
                                fontFamily: 'PlusJakartaSans_700Bold',
                                textShadowColor: 'rgba(0,0,0,0.3)',
                                textShadowRadius: 20,
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
                            backgroundColor: nequiPanelBg,
                            borderWidth: 1,
                            // `border-accent/20` (page.tsx:321)
                            borderColor: withAlpha(t.accent, 0.2),
                          }}
                        >
                          <CreditCard size={18} color={t.accent} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>
                              Pago con Nequi
                            </Text>
                            <Text style={{ color: t.textMuted, fontSize: 10 }}>
                              Recibirás una notificación en tu app Nequi para aprobar
                            </Text>
                          </View>
                          <CheckCircle2 size={16} color={t.accent} />
                        </View>

                        <TextInput
                          value={nequiPhone}
                          onChangeText={(v) => setNequiPhone(v.replace(/\D/g, ''))}
                          placeholder="Número Nequi (ej. 3001234567)"
                          placeholderTextColor={t.textMuted}
                          keyboardType="number-pad"
                          style={{
                            width: '100%',
                            backgroundColor: nequiPanelBg,
                            borderWidth: 1,
                            borderColor: t.border,
                            borderRadius: 16,
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            fontSize: 14,
                            color: t.text,
                          }}
                        />

                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            padding: 12,
                            borderRadius: 12,
                            // `bg-text/10 border border-text/20` (page.tsx:340)
                            backgroundColor: withAlpha(t.text, 0.1),
                            borderWidth: 1,
                            borderColor: withAlpha(t.text, 0.2),
                          }}
                        >
                          <Info size={14} color={t.text} />
                          <Text style={{ color: t.text, fontSize: 9, fontWeight: '700', flex: 1, lineHeight: 13 }}>
                            Este pago incluye el descuento por pronto pago si se realiza antes del vencimiento.
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={handlePayment}
                        // `bg-accent text-primary shadow-xl shadow-accent/20`
                        // (page.tsx:348)
                        style={({ pressed }) => ({
                          backgroundColor: t.accent,
                          // `py-5` (page.tsx:348)
                          paddingVertical: 20,
                          borderRadius: 22,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          shadowColor: t.accent,
                          shadowOpacity: 0.2,
                          shadowRadius: 12,
                          shadowOffset: { width: 0, height: 8 },
                          elevation: 6,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        })}
                      >
                        {/* Ink on a FILLED accent surface → `onAccent`, the token
                            minted for exactly this pairing (web writes
                            `text-primary`, which only coincidentally reads on
                            both accents and is 2 steps weaker in contrast). */}
                        <Text style={{ color: t.onAccent, fontWeight: '700', fontSize: 16 }}>
                          Confirmar y Pagar
                        </Text>
                        <ArrowRight size={18} color={t.onAccent} />
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

/**
 * Hero-only styles. Everything here sits on the hardcoded white→black gradient
 * of web page.tsx:187, where web itself uses `text-white` / `bg-white/10` /
 * `border-white/10` literals rather than palette tokens (page.tsx:193-212).
 */
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
};

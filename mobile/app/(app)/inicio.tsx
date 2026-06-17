/**
 * INICIO DASHBOARD — role-aware Home.
 *
 * Ported from web src/app/(app)/inicio/page.tsx. One route that branches on
 * `user.rol` into five sub-screens (Residente / Vigilante / Estacionamiento /
 * Consejo / Admin). Data flow, WS subscriptions and Spanish copy mirror the web.
 *
 * Notes vs web:
 * - `showCelebration` is a dead branch on the web (never set true here); omitted.
 * - RoleSwitcher (testers) does switchRole then lets the role-driven re-render
 *   refetch — no `window.location.reload`.
 * - GSAP fade → Reanimated FadeInDown. next/image → expo-image. sonner → toast.
 * - Money strings parsed with parseFloat; COP grouping is Hermes-safe.
 * - SearchModal → @gorhom/bottom-sheet (Sheet) keeping the 600ms debounce +
 *   isQuestion heuristic + local MODULES/SUGGESTIONS filtering.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Building2,
  Calendar,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign,
  FlaskConical,
  Loader2,
  Megaphone,
  MessageSquare,
  Package,
  Search,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { getNotifTarget } from '@/lib/notif-routing';
import type {
  AnuncioDto,
  NotificacionDto,
  PagoDto,
  PagosResponse,
  ProfileResponse,
  ReciboDto,
  Rol,
} from '@/lib/api/types';

// ───────────────────────────────────────────────────────────────────────────
// Local DTOs (visitor-parking approvals / retained charges) — mirror web.
// ───────────────────────────────────────────────────────────────────────────

/** Visitor-parking request the resident (inquilino) must approve/reject. */
interface SolicitudParqueaderoMia {
  id: string;
  celdaNumero?: string;
  detalle?: string;
  solicitanteNombre?: string;
}

/** Retained-vehicle charge pending the resident's approval (most urgent). */
interface CargoParqueaderoRetenido {
  id: string;
  celdaNumero?: string;
  placa?: string | null;
  minutosCobrados?: number;
  cerradoEn?: string | null;
  montoFinal?: number | string | null;
  montoActual?: number | string | null;
}

interface ActiveAsamblea {
  id: string;
  titulo: string;
  descripcion?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/** COP-style thousands grouping (no decimals), Hermes-safe. */
function formatCOP(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function numFrom(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

const COLORS = {
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.6)',
  blue: '#009df2',
  green: '#57bf00',
  red: '#EF4444',
  yellow: '#FACC15',
  border: 'rgba(255,255,255,0.14)',
};

// ───────────────────────────────────────────────────────────────────────────
// Role router
// ───────────────────────────────────────────────────────────────────────────

export default function InicioDashboard() {
  const role = useAuth((s) => s.user?.rol);

  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') return <HomeVigilante />;
  if (role === 'ENCARGADO_PARQUEADERO') return <HomeEstacionamiento />;
  if (role === 'CONCEJO') return <HomeConsejo />;
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN') return <HomeAdmin />;

  return <HomeResidente />;
}

// ───────────────────────────────────────────────────────────────────────────
// HomeResidente
// ───────────────────────────────────────────────────────────────────────────

const CATEGORIES: { title: string; icon: ReactNode; path: string }[] = [
  { title: 'Citofonía', icon: <UserIcon size={20} color={COLORS.green} />, path: '/citofonia' },
  { title: 'Pagos', icon: <CreditCard size={20} color={COLORS.green} />, path: '/pagos' },
  { title: 'Parqueo', icon: <Car size={20} color={COLORS.green} />, path: '/parqueadero' },
  { title: 'Reservas', icon: <Calendar size={20} color={COLORS.green} />, path: '/reservas' },
  { title: 'Cartelera', icon: <Megaphone size={20} color={COLORS.green} />, path: '/cartelera' },
  { title: 'PQRS', icon: <MessageSquare size={20} color={COLORS.green} />, path: '/pqrs' },
  { title: 'Inmuebles', icon: <Building2 size={20} color={COLORS.green} />, path: '/inmobiliaria' },
  { title: 'Clasificados', icon: <ShoppingBag size={20} color={COLORS.green} />, path: '/clasificados' },
];

function HomeResidente() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const insets = useSafeAreaInsets();

  const [notificaciones, setNotificaciones] = useState<NotificacionDto[]>([]);
  const [selectedFeedItem, setSelectedFeedItem] = useState<AnuncioDto | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [financialData, setFinancialData] = useState<{
    totalDebt: number;
    pagos: PagoDto[];
    recibos: ReciboDto[];
  }>({ totalDebt: 0, pagos: [], recibos: [] });

  const [anuncios, setAnuncios] = useState<AnuncioDto[]>([]);
  const [isLoadingAnuncios, setIsLoadingAnuncios] = useState(true);
  const [userData, setUserData] = useState<ProfileResponse | null>(null);
  const [activeAsamblea, setActiveAsamblea] = useState<ActiveAsamblea | null>(null);
  const [solicitudesParqueadero, setSolicitudesParqueadero] = useState<SolicitudParqueaderoMia[]>([]);
  const [cargosRetenidos, setCargosRetenidos] = useState<CargoParqueaderoRetenido[]>([]);
  const [busyAprob, setBusyAprob] = useState<string | null>(null);

  const fetchAnuncios = useCallback(async () => {
    try {
      setIsLoadingAnuncios(true);
      const data = await api.get<AnuncioDto[]>('/anuncios');
      setAnuncios(data);
    } catch {
      /* ignore */
    } finally {
      setIsLoadingAnuncios(false);
    }
  }, []);

  const fetchNotificaciones = useCallback(async () => {
    try {
      const data = await api.get<NotificacionDto[]>('/notificaciones');
      setNotificaciones(data.filter((n) => !n.leida));
    } catch {
      /* silently ignore */
    }
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const data = await api.get<ProfileResponse>('/usuarios/me/profile');
      setUserData(data);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchSolicitudesParqueadero = useCallback(async () => {
    try {
      const data = await api.get<SolicitudParqueaderoMia[]>('/parqueadero/solicitudes/mias');
      setSolicitudesParqueadero(data ?? []);
    } catch {
      /* no aplica / sin permiso */
    }
  }, []);

  const fetchCargosRetenidos = useCallback(async () => {
    try {
      const data = await api.get<CargoParqueaderoRetenido[]>('/parqueadero/cargos/mios');
      setCargosRetenidos(data ?? []);
    } catch {
      /* no aplica / sin permiso */
    }
  }, []);

  const fetchFinance = useCallback(async () => {
    try {
      const data = await api.get<PagosResponse>('/pagos');
      const pagos = data?.pagos ?? [];
      const recibos = data?.recibos ?? [];
      const totalDebt = pagos
        .filter((p) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO')
        .reduce((sum, p) => sum + parseFloat(p.monto || '0'), 0);
      setFinancialData({ totalDebt, pagos, recibos });
    } catch {
      /* ignore */
    }
  }, []);

  const fetchActiveAsamblea = useCallback(async () => {
    try {
      const data = await api.get<{
        id: string;
        activa: boolean;
        titulo: string;
        descripcion?: string;
      }>('/asambleas/activa/session');
      if (data?.id && data?.activa) {
        setActiveAsamblea({ id: data.id, titulo: data.titulo, descripcion: data.descripcion });
      } else {
        setActiveAsamblea(null);
      }
    } catch {
      setActiveAsamblea(null);
    }
  }, []);

  const resolverCargoRetenido = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setBusyAprob(id);
    try {
      await api.post(`/parqueadero/cargos/${id}/${accion}`, {});
      toast.success(
        accion === 'aprobar'
          ? 'Cobro aprobado. El vehículo ya puede salir y el cargo quedó en tus pagos.'
          : 'Cobro rechazado. El visitante deberá pagar en portería para salir.',
      );
      void fetchCargosRetenidos();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || 'No se pudo procesar');
    } finally {
      setBusyAprob(null);
    }
  };

  const resolverSolicitudParqueadero = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setBusyAprob(id);
    try {
      await api.post(`/parqueadero/solicitudes/${id}/inquilino/${accion}`, {});
      toast.success(
        accion === 'aprobar' ? 'Parqueadero de visitante aprobado.' : 'Solicitud rechazada.',
      );
      void fetchSolicitudesParqueadero();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || 'No se pudo procesar');
    } finally {
      setBusyAprob(null);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.put('/notificaciones/leidas', { ids: [id] });
      setNotificaciones((prev) => prev.filter((n) => n.id !== id));
    } catch {
      /* silently ignore */
    }
  };

  // Real-time WebSocket subscriptions (mirror web).
  useWsSubscription('notification', () => void fetchNotificaciones());
  useWsSubscription('pago', () => void fetchFinance());
  useWsSubscription('anuncio', () => void fetchAnuncios());
  useWsSubscription('parqueadero', () => {
    void fetchSolicitudesParqueadero();
    void fetchCargosRetenidos();
  });
  useWsSubscription('asamblea', () => void fetchActiveAsamblea());

  useEffect(() => {
    if (!user) return;
    void fetchNotificaciones();
    void fetchFinance();
    void fetchUserData();
    void fetchAnuncios();
    void fetchActiveAsamblea();
    void fetchSolicitudesParqueadero();
    void fetchCargosRetenidos();
  }, [
    user,
    fetchNotificaciones,
    fetchFinance,
    fetchUserData,
    fetchAnuncios,
    fetchActiveAsamblea,
    fetchSolicitudesParqueadero,
    fetchCargosRetenidos,
  ]);

  const debtPending = financialData.totalDebt > 0;

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
        {/* HEADER GROUP */}
        <Animated.View entering={FadeInDown.duration(500)} style={{ gap: 24 }}>
          <RoleSwitcher />
          <ProfileHeader />

          {/* SEARCH BAR */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={() => setIsSearchOpen(true)}
              style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: 'rgba(255,255,255,0.045)',
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 24,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                }}
              >
                <Search size={18} color={COLORS.text} />
                <Text style={{ color: COLORS.text, fontSize: 13 }}>Buscar o preguntar algo...</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setIsSearchOpen(true)}
              style={({ pressed }) => ({
                width: 56,
                height: 56,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <Sparkles size={20} color={COLORS.text} />
            </Pressable>
          </View>
        </Animated.View>

        {/* ASSEMBLY LIVE BANNER */}
        {activeAsamblea ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Pressable
              onPress={() => router.push('/asamblea' as never)}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <LiquidGlass
                variant="card"
                radius={28}
                className="rounded-[28px]"
                style={{ minHeight: 90, padding: 16, borderColor: 'rgba(255,255,255,0.3)' }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: 'rgba(255,255,255,0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.4)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.text }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.liveEyebrow}>Sesion en Vivo</Text>
                      <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                        {activeAsamblea.titulo}
                      </Text>
                      {activeAsamblea.descripcion ? (
                        <Text style={{ color: COLORS.text, fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                          {activeAsamblea.descripcion}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.pillCta}>
                    <Text style={styles.pillCtaText}>Entrar</Text>
                    <ArrowRight size={10} color="#000000" />
                  </View>
                </View>
              </LiquidGlass>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* COBROS RETENIDOS — vehículo NO sale hasta aprobar */}
        {cargosRetenidos.length > 0 ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red }} />
              <ShieldAlert size={14} color={COLORS.red} />
              <Text style={styles.sectionAlertTitle}>Cobro por aprobar — vehículo retenido</Text>
            </View>
            <Text style={styles.alertHint}>
              El vehículo de tu visita está retenido en portería y no puede salir hasta que decidas.
              Aprueba para cargar el cobro a tu apartamento, o recházalo (el visitante pagará en
              portería).
            </Text>
            {cargosRetenidos.map((c) => (
              <LiquidGlass
                key={c.id}
                variant="card"
                radius={28}
                className="rounded-[28px]"
                style={{ padding: 20, borderColor: 'rgba(239,68,68,0.4)', gap: 16 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ gap: 4, flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>
                      Celda {c.celdaNumero}
                    </Text>
                    {c.placa ? (
                      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Placa {c.placa}</Text>
                    ) : null}
                    <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>
                      {c.minutosCobrados} min cobrables
                      {c.cerradoEn ? ` · ${formatCargoDate(c.cerradoEn)}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.montoLabel}>Monto</Text>
                    <Text style={{ color: COLORS.yellow, fontSize: 24, fontWeight: '700' }}>
                      ${formatCOP(numFrom(c.montoFinal ?? c.montoActual))}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <ApprovalButton
                    label="Rechazar"
                    variant="reject"
                    disabled={busyAprob === c.id}
                    onPress={() => resolverCargoRetenido(c.id, 'rechazar')}
                  />
                  <ApprovalButton
                    label={busyAprob === c.id ? 'Procesando...' : 'Aprobar cobro'}
                    variant="approve"
                    disabled={busyAprob === c.id}
                    onPress={() => resolverCargoRetenido(c.id, 'aprobar')}
                  />
                </View>
              </LiquidGlass>
            ))}
          </View>
        ) : null}

        {/* APROBACIONES DE PARQUEADERO DE VISITANTE */}
        {solicitudesParqueadero.length > 0 ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.yellow }} />
              <Car size={14} color={COLORS.yellow} />
              <Text style={styles.sectionAlertTitle}>Aprobación de Estacionamiento</Text>
            </View>
            <Text style={styles.alertHint}>
              Te solicitan asignarte un parqueadero de visitante. Tu aprobación es obligatoria.
            </Text>
            {solicitudesParqueadero.map((s) => (
              <LiquidGlass
                key={s.id}
                variant="card"
                radius={28}
                className="rounded-[28px]"
                style={{ padding: 20, borderColor: 'rgba(250,204,21,0.4)', gap: 16 }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>
                    Celda {s.celdaNumero}
                  </Text>
                  {s.detalle ? (
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{s.detalle}</Text>
                  ) : null}
                  {s.solicitanteNombre ? (
                    <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>
                      Solicitado por {s.solicitanteNombre}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <ApprovalButton
                    label="Rechazar"
                    variant="reject"
                    disabled={busyAprob === s.id}
                    onPress={() => resolverSolicitudParqueadero(s.id, 'rechazar')}
                  />
                  <ApprovalButton
                    label={busyAprob === s.id ? 'Procesando...' : 'Aprobar'}
                    variant="approve"
                    disabled={busyAprob === s.id}
                    onPress={() => resolverSolicitudParqueadero(s.id, 'aprobar')}
                  />
                </View>
              </LiquidGlass>
            ))}
          </View>
        ) : null}

        {/* CATEGORÍAS */}
        <View style={{ gap: 16 }}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Navegación</Text>
            <ArrowRight size={14} color={COLORS.text} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingHorizontal: 4 }}
          >
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.title}
                onPress={() => router.push(cat.path as never)}
                style={({ pressed }) => ({
                  width: 84,
                  height: 106,
                  borderRadius: 32,
                  backgroundColor: '#000000',
                  borderWidth: 1,
                  borderColor: '#333333',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  padding: 16,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                {cat.icon}
                <Text
                  numberOfLines={1}
                  style={{
                    color: COLORS.blue,
                    fontSize: 10,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}
                >
                  {cat.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* NOTIFICATIONS BANNER */}
        {notificaciones.length > 0 ? (
          <View style={{ gap: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Bell size={14} color={COLORS.text} />
                <Text style={styles.sectionAlertTitle}>Avisos Recientes</Text>
              </View>
              <Text style={{ color: COLORS.text, fontSize: 10, fontWeight: '700' }}>
                {notificaciones.length} nuevos
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 16 }}
            >
              {notificaciones.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => {
                    void markAsRead(n.id);
                    router.push(getNotifTarget(n, user?.rol) as never);
                  }}
                  style={({ pressed }) => ({
                    width: 280,
                    borderRadius: 22,
                    padding: 16,
                    gap: 8,
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>
                      {n.tipo}
                    </Text>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.text }} />
                  </View>
                  <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 14, fontWeight: '700' }}>
                    {n.titulo}
                  </Text>
                  <Text numberOfLines={2} style={{ color: COLORS.text, fontSize: 11, lineHeight: 16 }}>
                    {n.mensaje}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* WALLET HERO */}
        <View
          style={{
            borderRadius: 28,
            overflow: 'hidden',
            minHeight: 120,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
            backgroundColor: debtPending ? '#171717' : '#3b3b3b',
            padding: 20,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CreditCard size={14} color="#FFFFFF" />
              </View>
              <Text style={styles.heroEyebrow}>Mi Cuota</Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroEyebrow}>{debtPending ? 'Pendiente' : 'Paz y Salvo'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '700' }}>
                $ {formatCOP(financialData.totalDebt)}
              </Text>
              <Text style={{ color: '#FFFFFF', fontSize: 10, marginTop: 2 }}>
                {debtPending ? 'Saldo pendiente' : 'Al dia con tus pagos'}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/pagos' as never)}
              style={({ pressed }) => ({
                backgroundColor: '#FFFFFF',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 999,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <Text style={{ color: '#000000', fontSize: 11, fontWeight: '700' }}>
                {debtPending ? 'Pagar Ahora' : 'Ver Estado'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* SOCIAL FEED */}
        <View style={{ gap: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>Novedades</Text>
            <Text style={styles.sectionLabel}>Hoy</Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 16,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
            }}
          >
            <View>
              <Text style={{ color: COLORS.text, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>
                ConjuntOS v3.2
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 9, textTransform: 'uppercase' }}>
                Resident Edition
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/perfil' as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ color: COLORS.text, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                Mi Cuenta
              </Text>
              <ArrowRight size={14} color={COLORS.text} />
            </Pressable>
          </View>

          {isLoadingAnuncios ? (
            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.mutedCaption}>Cargando novedades...</Text>
            </View>
          ) : anuncios.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
              <Megaphone size={32} color={COLORS.text} />
              <Text style={styles.mutedCaption}>Sin novedades por ahora</Text>
            </View>
          ) : (
            anuncios.map((anuncio) => (
              <Pressable key={anuncio.id} onPress={() => setSelectedFeedItem(anuncio)}>
                <AnuncioCard anuncio={anuncio} />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* SEARCH MODAL */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        context={{
          userName: userData?.nombre || user?.nombre || undefined,
          totalDebt: financialData.totalDebt,
          pagos: financialData.pagos.map((p) => ({
            concepto: p.concepto,
            monto: Number(p.monto),
            estado: p.estado,
          })),
          anuncios: anuncios.map((a) => ({ titulo: a.titulo, contenido: a.contenido })),
        }}
      />

      {/* CONTENT ACTION MODAL (announcement detail — simulated, no backend) */}
      <ContentActionModal item={selectedFeedItem} onClose={() => setSelectedFeedItem(null)} />
    </View>
  );
}

function formatCargoDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const day = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${meses[d.getMonth()]}, ${hh}:${mm}`;
  } catch {
    return '';
  }
}

function ApprovalButton({
  label,
  variant,
  disabled,
  onPress,
}: {
  label: string;
  variant: 'approve' | 'reject';
  disabled?: boolean;
  onPress: () => void;
}) {
  const approve = variant === 'approve';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 12,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: approve ? COLORS.green : 'rgba(255,255,255,0.05)',
        borderWidth: approve ? 0 : 1,
        borderColor: COLORS.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: approve ? '#FFFFFF' : COLORS.text, fontSize: 14, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// AnuncioCard
// ───────────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Hace un momento';
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

function AnuncioCard({ anuncio }: { anuncio: AnuncioDto }) {
  return (
    <LiquidGlass variant="card" radius={32} className="rounded-[32px]">
      <View style={{ overflow: 'hidden', borderRadius: 32 }}>
        {/* Header */}
        <View
          style={{
            padding: 20,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.blue,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                {anuncio.tipo?.[0] || 'A'}
              </Text>
            </View>
            <View>
              <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
                {anuncio.tipo}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 10 }}>
                {timeAgo(anuncio.publicadoEn)}
                {anuncio.fijado ? ' • Fijado' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Body */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '600', marginBottom: 8, lineHeight: 24 }}>
            {anuncio.titulo}
          </Text>
          <Text numberOfLines={3} style={{ color: COLORS.text, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
            {anuncio.contenido}
          </Text>
        </View>

        {/* Image */}
        {anuncio.imagenUrl ? (
          <Image
            source={{ uri: anuncio.imagenUrl }}
            style={{ height: 224, width: '100%' }}
            contentFit="cover"
            transition={300}
          />
        ) : null}

        {/* Footer */}
        <View
          style={{
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Megaphone size={12} color={COLORS.text} />
            <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>
              {anuncio.tipo}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
              Ver más
            </Text>
            <ArrowRight size={14} color={COLORS.text} />
          </View>
        </View>
      </View>
    </LiquidGlass>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ContentActionModal — announcement detail (simulated, no backend)
// ───────────────────────────────────────────────────────────────────────────

function ContentActionModal({ item, onClose }: { item: AnuncioDto | null; onClose: () => void }) {
  return (
    <Modal visible={item !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)' }}
          onPress={onClose}
        />
        {item ? (
          <View
            style={{
              backgroundColor: '#0E0E0E',
              borderTopLeftRadius: 40,
              borderTopRightRadius: 40,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              maxHeight: '88%',
              overflow: 'hidden',
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: COLORS.blue, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>
                  {item.tipo}
                </Text>
                <Pressable
                  onPress={onClose}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={18} color={COLORS.text} />
                </Pressable>
              </View>
              <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '700', lineHeight: 30 }}>
                {item.titulo}
              </Text>
              {item.imagenUrl ? (
                <Image
                  source={{ uri: item.imagenUrl }}
                  style={{ width: '100%', height: 220, borderRadius: 24 }}
                  contentFit="cover"
                  transition={300}
                />
              ) : null}
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 22 }}>
                {item.contenido}
              </Text>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// RoleSwitcher (testers only) — switchRole then role-driven re-render refetch.
// ───────────────────────────────────────────────────────────────────────────

const ROLES: { value: Rol; label: string }[] = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
  { value: 'CONCEJO', label: 'Concejo' },
  { value: 'PROPIETARIO', label: 'Propietario' },
  { value: 'ARRENDATARIO', label: 'Arrendatario' },
  { value: 'VIGILANTE', label: 'Vigilante' },
  { value: 'SUPERVISOR_VIGILANCIA', label: 'Supervisor Vigilancia' },
  { value: 'ENCARGADO_PARQUEADERO', label: 'Encargado Parqueadero' },
];

function RoleSwitcher() {
  const user = useAuth((s) => s.user);
  const switchRole = useAuth((s) => s.switchRole);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user?.isTester) return null;

  const currentLabel = ROLES.find((r) => r.value === user.rol)?.label ?? user.rol;

  const handleSelect = async (rol: Rol) => {
    if (rol === user.rol) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await switchRole(rol);
      toast.success(`Rol cambiado a ${ROLES.find((r) => r.value === rol)?.label ?? rol}`);
      setOpen(false);
      // No hard reload on native: the role change re-renders the role router and
      // each sub-screen refetches from its own mount effect.
    } catch {
      toast.error('No se pudo cambiar de rol');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ zIndex: 60 }}>
      <Pressable
        disabled={busy}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.3)',
          opacity: busy ? 0.6 : pressed ? 0.9 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FlaskConical size={18} color={COLORS.text} />
          </View>
          <View>
            <Text style={{ color: COLORS.text, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }}>
              Modo Tester · Rol activo
            </Text>
            <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700' }}>{currentLabel}</Text>
          </View>
        </View>
        <ChevronDown
          size={18}
          color={COLORS.text}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {open ? (
        <View
          style={{
            marginTop: 8,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: '#141414',
            overflow: 'hidden',
          }}
        >
          {ROLES.map((r) => {
            const active = r.value === user.rol;
            return (
              <Pressable
                key={r.value}
                disabled={busy}
                onPress={() => handleSelect(r.value)}
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                  opacity: busy ? 0.5 : pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: active ? '700' : '400' }}>
                  {r.label}
                </Text>
                {active ? <Check size={16} color={COLORS.text} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// SearchModal — AI bottom sheet (600ms debounce + isQuestion + module filter)
// ───────────────────────────────────────────────────────────────────────────

interface SearchContext {
  userName?: string;
  totalDebt?: number;
  pagos?: { concepto: string; monto: number; estado: string }[];
  anuncios?: { titulo: string; contenido: string }[];
}

const MODULES: {
  title: string;
  desc: string;
  icon: ReactNode;
  path: string;
  keywords: string[];
}[] = [
  {
    title: 'Pagos',
    desc: 'Cuotas, recibos y sanciones',
    icon: <CreditCard size={18} color="#FFFFFF" />,
    path: '/pagos',
    keywords: ['pago', 'cuota', 'administración', 'deuda', 'recibo', 'energía', 'gas', 'agua'],
  },
  {
    title: 'Reservas',
    desc: 'Salón, cancha, gimnasio y más',
    icon: <Calendar size={18} color="#FFFFFF" />,
    path: '/reservas',
    keywords: ['reserva', 'salón', 'salon', 'cancha', 'gimnasio', 'piscina', 'bbq', 'área', 'area'],
  },
  {
    title: 'Parqueadero',
    desc: 'Estado y asignación de cupos',
    icon: <Car size={18} color="#FFFFFF" />,
    path: '/parqueadero',
    keywords: ['parqueo', 'parqueadero', 'carro', 'moto', 'vehículo', 'vehiculo', 'cupo'],
  },
  {
    title: 'Paquetería',
    desc: 'Paquetes en portería',
    icon: <Package size={18} color="#FFFFFF" />,
    path: '/paqueteria',
    keywords: ['paquete', 'encomienda', 'portería', 'porteria', 'llegó', 'llego', 'domicilio', 'envío'],
  },
  {
    title: 'PQRS',
    desc: 'Peticiones, quejas y reclamos',
    icon: <MessageSquare size={18} color="#FFFFFF" />,
    path: '/pqrs',
    keywords: ['pqr', 'queja', 'petición', 'peticion', 'problema', 'reclamo', 'solicitud'],
  },
  {
    title: 'Visitantes',
    desc: 'Autorización de ingresos',
    icon: <Users size={18} color="#FFFFFF" />,
    path: '/visitantes',
    keywords: ['visita', 'visitante', 'invitado', 'ingreso', 'acceso', 'autoriza'],
  },
  {
    title: 'Cartelera',
    desc: 'Anuncios y novedades',
    icon: <Megaphone size={18} color="#FFFFFF" />,
    path: '/cartelera',
    keywords: ['anuncio', 'novedad', 'asamblea', 'reunión', 'reunion', 'circular', 'cartelera'],
  },
  {
    title: 'Inmobiliaria',
    desc: 'Venta y arriendo en el conjunto',
    icon: <Building2 size={18} color="#FFFFFF" />,
    path: '/inmobiliaria',
    keywords: ['venta', 'arriendo', 'alquiler', 'inmueble', 'apartamento', 'apto'],
  },
];

const SUGGESTIONS: { label: string; icon: ReactNode }[] = [
  { label: '¿Cuánto debo?', icon: <AlertCircle size={14} color={COLORS.text} /> },
  { label: 'Ver paquetes', icon: <Package size={14} color={COLORS.text} /> },
  { label: 'Reservar el salón', icon: <Calendar size={14} color={COLORS.text} /> },
  { label: 'Reportar un problema', icon: <MessageSquare size={14} color={COLORS.text} /> },
  { label: 'Autorizar visita', icon: <Users size={14} color={COLORS.text} /> },
];

function isQuestion(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.endsWith('?') || trimmed.split(' ').length >= 4;
}

function filterModules(query: string) {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return MODULES.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      m.desc.toLowerCase().includes(q) ||
      m.keywords.some((k) => k.includes(q) || q.includes(k)),
  );
}

function SearchModal({
  isOpen,
  onClose,
  context = {},
}: {
  isOpen: boolean;
  onClose: () => void;
  context?: SearchContext;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<{ text: string } | null>(null);
  const [filteredModules, setFilteredModules] = useState<typeof MODULES>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest context for the debounced askAI without re-creating it.
  const contextRef = useRef(context);
  contextRef.current = context;

  // Reset on open (mirror web).
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setAiAnswer(null);
      setFilteredModules([]);
    }
  }, [isOpen]);

  const askAI = useCallback(async (q: string) => {
    setIsLoadingAI(true);
    setAiAnswer(null);
    try {
      const data = await api.post<{ answer: string }>('/search', {
        query: q,
        context: contextRef.current,
      });
      setAiAnswer({ text: data.answer });
    } catch {
      setAiAnswer({ text: 'No pude procesar tu pregunta. Intenta de nuevo.' });
    } finally {
      setIsLoadingAI(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setAiAnswer(null);
    setFilteredModules(filterModules(value));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 3 && isQuestion(value)) {
      debounceRef.current = setTimeout(() => void askAI(value), 600);
    }
  };

  const handleSuggestion = (label: string) => {
    setQuery(label);
    setFilteredModules(filterModules(label));
    void askAI(label);
  };

  const navigateTo = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as never), 300);
  };

  const handleSubmit = () => {
    if (query.trim()) void askAI(query);
  };

  const showSuggestions = !query && !aiAnswer;
  const showNoResults =
    query.trim().length >= 2 && filteredModules.length === 0 && !aiAnswer && !isLoadingAI;

  return (
    <Sheet open={isOpen} onClose={onClose} snapPoints={['85%']}>
      <View style={{ flex: 1 }}>
        {/* Header / input */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={18} color={COLORS.text} />
          </View>
          <SearchInput value={query} onChange={handleQueryChange} onSubmit={handleSubmit} />
          <Pressable
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.05)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24, gap: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* AI answer */}
          {isLoadingAI || aiAnswer ? (
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: COLORS.border,
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.03)',
              }}
            >
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.05)',
                }}
              >
                <Sparkles size={14} color={COLORS.text} />
                <Text style={{ color: COLORS.text, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>
                  Asistente IA
                </Text>
              </View>
              <View style={{ padding: 20 }}>
                {isLoadingAI ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Loader2 size={16} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontSize: 14 }}>Analizando tu pregunta...</Text>
                  </View>
                ) : aiAnswer ? (
                  <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 20 }}>{aiAnswer.text}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Module results */}
          {filteredModules.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.searchSectionLabel}>Módulos</Text>
              {filteredModules.map((mod) => (
                <Pressable
                  key={mod.path}
                  onPress={() => navigateTo(mod.path)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    padding: 16,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.05)',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View style={styles.searchModIcon}>{mod.icon}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700' }}>{mod.title}</Text>
                    <Text style={{ color: COLORS.text, fontSize: 11 }}>{mod.desc}</Text>
                  </View>
                  <ChevronRight size={16} color={COLORS.text} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Suggestions / shortcuts */}
          {showSuggestions ? (
            <>
              <View style={{ gap: 8 }}>
                <Text style={styles.searchSectionLabel}>Preguntas frecuentes</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <Pressable
                      key={s.label}
                      onPress={() => handleSuggestion(s.label)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 999,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.08)',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      {s.icon}
                      <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '600' }}>{s.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.searchSectionLabel}>Accesos Directos</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {MODULES.slice(0, 4).map((mod) => (
                    <Pressable
                      key={mod.path}
                      onPress={() => navigateTo(mod.path)}
                      style={({ pressed }) => ({
                        width: '47%',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 16,
                        borderRadius: 20,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.05)',
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <View style={styles.searchModIcon}>{mod.icon}</View>
                      <View>
                        <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>{mod.title}</Text>
                        <ArrowRight size={10} color={COLORS.text} style={{ marginTop: 2 }} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {/* No results */}
          {showNoResults ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
              <Search size={32} color={COLORS.text} />
              <Text style={{ color: COLORS.text, fontSize: 14, textAlign: 'center' }}>
                Sin resultados para &quot;{query}&quot;
              </Text>
              <Pressable
                onPress={() => void askAI(query)}
                style={({ pressed }) => ({
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Sparkles size={14} color={COLORS.text} />
                <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>
                  Preguntar al asistente IA
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 16,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.05)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 10, fontWeight: '500' }}>ConjuntOS Search</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green }} />
            <Text style={{ color: COLORS.text, fontSize: 10 }}>IA disponible</Text>
          </View>
        </View>
      </View>
    </Sheet>
  );
}

// Lives in its own component so the BottomSheet text input doesn't fight the
// sheet's gesture handler. Uses @gorhom's BottomSheetTextInput for keyboard sync.
function SearchInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <BottomSheetTextInput
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      returnKeyType="search"
      placeholder="Buscar o preguntar algo..."
      placeholderTextColor="rgba(255,255,255,0.55)"
      style={{ flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// HomeVigilante
// ───────────────────────────────────────────────────────────────────────────

function HomeVigilante() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 128, paddingHorizontal: 24, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <RoleSwitcher />
      <ProfileHeader />
      <LiquidGlass radius={24} className="rounded-3xl" style={{ padding: 24 }}>
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '700', marginBottom: 8 }}>
          Central de Guardia
        </Text>
        <Text style={{ color: COLORS.text, fontSize: 14, marginBottom: 24 }}>
          Módulo de control de acceso y paquetería.
        </Text>
        <View style={{ gap: 12 }}>
          <PrimaryRow label="Registrar Visita" onPress={() => router.push('/control-visitas' as never)} filled />
          <PrimaryRow label="Recepción de Envíos" onPress={() => router.push('/paqueteria' as never)} />
        </View>
      </LiquidGlass>
    </ScrollView>
  );
}

function PrimaryRow({ label, onPress, filled }: { label: string; onPress: () => void; filled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 16,
        backgroundColor: filled ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
        borderWidth: filled ? 0 : 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Text
        style={{
          color: filled ? '#000000' : COLORS.text,
          fontSize: 12,
          fontWeight: filled ? '900' : '700',
          textTransform: 'uppercase',
          letterSpacing: 1.5,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// HomeEstacionamiento
// ───────────────────────────────────────────────────────────────────────────

function HomeEstacionamiento() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState({ ocupacion: 0, libres: 0, ocupados: 0 });

  useEffect(() => {
    api
      .get<{ ocupacion: number; libres: number; ocupados: number }>('/parqueadero/stats')
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 128, paddingHorizontal: 24, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <RoleSwitcher />
      <ProfileHeader />
      <Pressable onPress={() => router.push('/mapa-parqueadero' as never)}>
        <LiquidGlass
          variant="card"
          radius={28}
          className="rounded-[28px]"
          style={{ padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
            <View style={styles.opIconChip}>
              <Car size={22} color={COLORS.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.opEyebrow}>Control Operativo</Text>
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>Mapa de Parqueaderos</Text>
              <Text style={{ color: COLORS.text, fontSize: 12, marginTop: 2 }}>
                Ver celdas libres, registrar ingresos/salidas y realizar rondas.
              </Text>
            </View>
          </View>
        </LiquidGlass>
      </Pressable>

      <LiquidGlass radius={28} className="rounded-[28px]" style={{ padding: 24 }}>
        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>
          Estado del Parqueadero
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatBox value={`${stats.ocupacion}%`} label="Ocupación" />
          <StatBox value={`${stats.libres}`} label="Libres" />
          <StatBox value={`${stats.ocupados}`} label="Ocupados" />
        </View>
      </LiquidGlass>
    </ScrollView>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: COLORS.text, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// HomeConsejo
// ───────────────────────────────────────────────────────────────────────────

function HomeConsejo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState({ recaudoMes: '0', reservasPendientes: 0 });

  useEffect(() => {
    api
      .get<{ recaudoMes: string; reservasPendientes: number }>('/admin/stats')
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 128, paddingHorizontal: 24, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <RoleSwitcher />
      <ProfileHeader />

      <LiquidGlass radius={24} className="rounded-3xl" style={{ padding: 24 }}>
        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
          Mesa de Monitoreo
        </Text>
        <Text style={{ color: COLORS.text, fontSize: 12 }}>
          Consejo de Administración (Órgano Consultor Ley 675/2001)
        </Text>
      </LiquidGlass>

      <View style={{ flexDirection: 'row', gap: 16 }}>
        <KpiCard
          icon={<DollarSign size={20} color={COLORS.text} />}
          title="Finanzas"
          desc="Cobros y reportes consolidados"
          onPress={() => router.push('/admin-finanzas' as never)}
        />
        <KpiCard
          icon={<Building2 size={20} color={COLORS.text} />}
          title="Cartelera"
          desc="Ver circulares y anuncios generales"
          onPress={() => router.push('/cartelera' as never)}
        />
      </View>

      <LiquidGlass radius={28} className="rounded-[28px]" style={{ padding: 24 }}>
        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>
          Informes de Gestión
        </Text>
        <View style={{ gap: 12 }}>
          <InfoRow label="Recaudación General" value={`$${formatCOP(numFrom(stats.recaudoMes))} COP`} />
          <InfoRow label="Novedades / Solicitudes" value={`${stats.reservasPendientes} Pendientes`} />
        </View>
      </LiquidGlass>
    </ScrollView>
  );
}

function KpiCard({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 140,
        borderRadius: 28,
        padding: 20,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: COLORS.border,
        justifyContent: 'space-between',
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 16,
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          borderColor: COLORS.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View>
        <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>{title}</Text>
        <Text style={{ color: COLORS.text, fontSize: 9 }}>{desc}</Text>
      </View>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '900' }}>{value}</Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// HomeAdmin
// ───────────────────────────────────────────────────────────────────────────

function HomeAdmin() {
  const router = useRouter();
  const role = useAuth((s) => s.user?.rol);
  const insets = useSafeAreaInsets();
  const [activeAsamblea, setActiveAsamblea] = useState<ActiveAsamblea | null>(null);

  useEffect(() => {
    api
      .get<{ id: string; activa: boolean; titulo: string; descripcion?: string }>('/asambleas/activa/session')
      .then((data) => {
        if (data?.id && data?.activa) {
          setActiveAsamblea({ id: data.id, titulo: data.titulo, descripcion: data.descripcion });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 128, paddingHorizontal: 24, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <RoleSwitcher />
      <ProfileHeader />

      {/* SUPER ADMIN CARD */}
      {role === 'SUPER_ADMIN' ? (
        <Pressable onPress={() => router.push('/superadmin' as never)}>
          <LiquidGlass
            variant="card"
            radius={28}
            className="rounded-[28px]"
            style={{ padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
              <View style={styles.opIconChip}>
                <Building2 size={22} color={COLORS.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.opEyebrow}>Modulo de Plataforma</Text>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>Panel SuperAdmin</Text>
                <Text style={{ color: COLORS.text, fontSize: 12, marginTop: 2 }}>
                  Registrar copropiedades y gestionar conjuntos.
                </Text>
              </View>
            </View>
            <View style={styles.pillCta}>
              <Text style={styles.pillCtaText}>Gestionar</Text>
              <ArrowRight size={10} color="#000000" />
            </View>
          </LiquidGlass>
        </Pressable>
      ) : null}

      {/* LIVE ASSEMBLY CONTROL */}
      {activeAsamblea ? (
        <Pressable onPress={() => router.push('/asamblea' as never)}>
          <LiquidGlass
            variant="card"
            radius={28}
            className="rounded-[28px]"
            style={{
              padding: 24,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderColor: 'rgba(255,255,255,0.3)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.4)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.text }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.opEyebrow}>En Vivo</Text>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
                  {activeAsamblea.titulo}
                </Text>
                {activeAsamblea.descripcion ? (
                  <Text style={{ color: COLORS.text, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {activeAsamblea.descripcion}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.pillCta}>
              <Text style={styles.pillCtaText}>Moderar</Text>
              <ArrowRight size={10} color="#000000" />
            </View>
          </LiquidGlass>
        </Pressable>
      ) : null}

      {/* QUICK ACTIONS */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <KpiCard
          icon={<UserIcon size={20} color={COLORS.text} />}
          title="Citofonía"
          desc="Llamar a unidades y portería"
          onPress={() => router.push('/citofonia' as never)}
        />
        <KpiCard
          icon={<Building2 size={20} color={COLORS.text} />}
          title="Novedades"
          desc="Crear anuncios y circulares"
          onPress={() => router.push('/admin-novedades' as never)}
        />
      </View>

      {/* GESTIÓN GENERAL */}
      <LiquidGlass radius={28} className="rounded-[28px]" style={{ padding: 24 }}>
        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
          Gestión del Conjunto
        </Text>
        <Text style={{ color: COLORS.text, fontSize: 11, lineHeight: 16, marginBottom: 24 }}>
          Accede a las herramientas de control de finanzas y parqueaderos.
        </Text>
        <View style={{ gap: 12 }}>
          <NavRow label="Ver Finanzas y Cartera" onPress={() => router.push('/admin-finanzas' as never)} />
          <NavRow label="Control de Parqueaderos" onPress={() => router.push('/admin-parqueadero' as never)} />
        </View>
      </LiquidGlass>
    </ScrollView>
  );
}

function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: COLORS.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <ArrowRight size={14} color={COLORS.text} />
    </Pressable>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────

const styles = {
  sectionHeaderRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  sectionAlertTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  alertHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    paddingHorizontal: 4,
    lineHeight: 16,
  },
  montoLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
  },
  liveEyebrow: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  pillCta: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  pillCtaText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  heroEyebrow: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  mutedCaption: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  searchSectionLabel: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    paddingHorizontal: 4,
  },
  searchModIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  opIconChip: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  opEyebrow: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginBottom: 2,
  },
};

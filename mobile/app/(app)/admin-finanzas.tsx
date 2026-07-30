/**
 * FINANZAS (ADMIN) — CONJUNTOSAPP (mobile port)
 * Dashboard financiero del conjunto. Ported 1:1 from web
 * `src/app/(app)/admin-finanzas/page.tsx`.
 *
 * Endpoints (all admin-guarded backend-side):
 *  - GET    /admin/finanzas/resumen           → KPIs del mes
 *  - GET    /admin/pagos?page&limit&estado&q  → página de pagos
 *  - GET    /admin/gastos                     → lista de gastos
 *  - POST   /admin/gastos                     → registrar gasto
 *  - PUT    /admin/gastos/{id}                → editar gasto
 *  - DELETE /admin/gastos/{id}                → eliminar gasto
 *  - GET    /admin/morosidad                  → unidades con saldo vencido
 *
 * Realtime: useWsSubscription('pago') y ('gasto') — refrescan el resumen y la
 * pestaña activa, igual que web.
 *
 * Divergencias respecto al web (bugs vivos del web, NO contratos):
 *  1. `GET /admin/pagos` devuelve `torre`/`apto` PLANOS (PagoAdminDto en
 *     backend/api/src/domains/admin_finanzas.rs:63), no `unidad {torre, numero}`.
 *     El web lee `p.unidad` y por eso siempre pinta "—". Aquí se aceptan ambas
 *     formas conservando el mismo formato `T{torre}-A{numero}`.
 *  2. `GET /admin/morosidad` devuelve `cantidadRecibosVencidos`
 *     (UnidadMorosaDto), no `recibosVencidos`. Se aceptan ambos.
 *  3. `POST/PUT /admin/gastos` esperan `fecha: DateTime<Utc>` (RFC-3339). El web
 *     manda "YYYY-MM-DD" y el backend responde 422, así que aquí se envía el
 *     instante UTC de la medianoche LOCAL del día elegido. Enviar
 *     `YYYY-MM-DDT00:00:00Z` haría que `fechaCol` (que formatea en la zona del
 *     dispositivo) pintara el día anterior en Colombia (UTC-5).
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react-native';

import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/toast';
import { Skeleton, SkeletonKpis, SkeletonRows } from '@/components/finanzas/Skeletons';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import type { EstadoPago, MetodoPago } from '@/lib/api/types';
import { tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Local DTOs for finanzas endpoints
// ---------------------------------------------------------------------------

interface FinanzasResumen {
  recaudoMes: string;
  morosidad: string;
  gastosMes: string;
  balance: string;
  unidadesAlDia: number;
  totalUnidades: number;
}

interface PagoAdminDto {
  id: string;
  unidadId: string;
  concepto: string;
  monto: string;
  estado: EstadoPago;
  metodo: MetodoPago | null;
  fechaVencimiento: string;
  fechaPago: string | null;
  /** Shape que asume el web (anidado). El backend real NO lo envía. */
  unidad?: { torre: string | null; numero: string };
  /** Shape real del backend (plano). */
  torre?: string | null;
  apto?: string;
}

/** Mirrors AdminPagosPage in backend/api/src/domains/admin_finanzas.rs:82 —
 *  the page array is `data`, not `pagos`. */
interface PagosAdminResponse {
  data: PagoAdminDto[];
  page: number;
  pages: number;
  total: number;
}

type CatGasto =
  | 'MANTENIMIENTO'
  | 'SERVICIOS_PUBLICOS'
  | 'SEGURIDAD'
  | 'ASEO'
  | 'ADMINISTRACION'
  | 'IMPUESTOS'
  | 'SEGUROS'
  | 'REPARACIONES'
  | 'JARDINERIA'
  | 'OTRO';

const CAT_GASTO_LABELS: Record<CatGasto, string> = {
  MANTENIMIENTO: 'Mantenimiento',
  SERVICIOS_PUBLICOS: 'Servicios Públicos',
  SEGURIDAD: 'Seguridad',
  ASEO: 'Aseo',
  ADMINISTRACION: 'Administración',
  IMPUESTOS: 'Impuestos',
  SEGUROS: 'Seguros',
  REPARACIONES: 'Reparaciones',
  JARDINERIA: 'Jardinería',
  OTRO: 'Otro',
};

const CAT_GASTO_OPTIONS: CatGasto[] = [
  'MANTENIMIENTO',
  'SERVICIOS_PUBLICOS',
  'SEGURIDAD',
  'ASEO',
  'ADMINISTRACION',
  'IMPUESTOS',
  'SEGUROS',
  'REPARACIONES',
  'JARDINERIA',
  'OTRO',
];

interface GastoAdminDto {
  id: string;
  categoria: CatGasto;
  descripcion: string;
  monto: string;
  proveedor: string | null;
  fecha: string;
  createdAt: string;
}

interface GastoForm {
  categoria: CatGasto;
  descripcion: string;
  monto: string;
  proveedor: string;
  fecha: string;
}

interface MorosidadDto {
  unidadId: string;
  torre: string | null;
  apto: string;
  totalAdeudado: string;
  /** Nombre que usa el web. */
  recibosVencidos?: number;
  /** Nombre real del backend (UnidadMorosaDto). */
  cantidadRecibosVencidos?: number;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const COP = (v: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(v || 0));

const fechaCol = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * `YYYY-MM-DD` de una fecha en la zona LOCAL del dispositivo.
 * (El web usa `toISOString().slice(0, 10)`, que es UTC: en Colombia, después de
 * las 19:00 devuelve el día siguiente. Aquí se calcula en local.)
 */
function localIsoDate(dt: Date): string {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** `YYYY-MM-DD` de hoy, en la zona local. */
const todayIso = () => localIsoDate(new Date());

/** `YYYY-MM-DD` local de un instante RFC-3339 devuelto por el backend. */
function localIsoFromInstant(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
  return localIsoDate(dt);
}

/** Instante RFC-3339 de la medianoche LOCAL del `YYYY-MM-DD` recibido. */
function isoDateToRfc3339(iso: string): string {
  const { y, m, d } = parseIsoParts(iso);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** Partes numéricas de un `YYYY-MM-DD` (con hoy como respaldo). */
function parseIsoParts(iso: string): { y: number; m: number; d: number } {
  const parts = iso.split('-');
  const now = new Date();
  return {
    y: Number(parts[0]) || now.getFullYear(),
    m: Number(parts[1]) || now.getMonth() + 1,
    d: Number(parts[2]) || now.getDate(),
  };
}

/** Días del mes `m` (1-12) del año `y`. */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Compone un `YYYY-MM-DD` válido, recortando el día al último del mes. */
function buildIsoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(Math.min(d, daysInMonth(y, m)))}`;
}

/** Etiqueta legible de un `YYYY-MM-DD`, con el mismo formato que `fechaCol`. */
function fechaIsoLabel(iso: string): string {
  const parts = iso.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Meses abreviados — mismo vocabulario que src/components/superadmin/DateSheet.tsx. */
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Primer año seleccionable (igual que DateSheet). */
const FIRST_YEAR = 1950;

/** Etiqueta "T{torre}-A{numero}" del pago (soporta shape anidado y plano). */
function pagoUnidadLabel(p: PagoAdminDto): string {
  if (p.unidad) return `T${p.unidad.torre || '?'}-A${p.unidad.numero}`;
  if (p.apto) return `T${p.torre || '?'}-A${p.apto}`;
  return '—';
}

function recibosVencidosDe(m: MorosidadDto): number {
  return m.recibosVencidos ?? m.cantidadRecibosVencidos ?? 0;
}

/** Chip de estado: fondo en el View, color de texto en el Text (split RN). */
const ESTADO_BADGE: Record<string, { label: string; bgClass: string; textClass: string }> = {
  PAGADO: { label: 'Pagado', bgClass: 'bg-success/20', textClass: 'text-success' },
  PENDIENTE: { label: 'Pendiente', bgClass: 'bg-warning/20', textClass: 'text-warning' },
  VENCIDO: { label: 'Vencido', bgClass: 'bg-danger/20', textClass: 'text-danger' },
  EN_DISPUTA: { label: 'En Disputa', bgClass: 'bg-text/20', textClass: 'text-text' },
};

const METODO_LABEL: Record<string, string> = {
  PSE: 'PSE',
  TARJETA: 'Tarjeta',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  EFECTIVO: 'Efectivo',
};

const ESTADO_FILTER_OPTIONS: Array<{ value: 'TODOS' | EstadoPago; label: string }> = [
  { value: 'TODOS', label: 'Todos los estados' },
  { value: 'PAGADO', label: 'Pagado' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'VENCIDO', label: 'Vencido' },
  { value: 'EN_DISPUTA', label: 'En Disputa' },
];

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN', 'CONCEJO'];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type TabFinanzas = 'KPI' | 'PAGOS' | 'GASTOS' | 'MOROSIDAD';

const TABS: Array<{ value: TabFinanzas; label: string }> = [
  { value: 'KPI', label: 'KPI' },
  { value: 'PAGOS', label: 'Pagos' },
  { value: 'GASTOS', label: 'Gastos' },
  { value: 'MOROSIDAD', label: 'Morosidad' },
];

export default function AdminFinanzas() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  // Tab
  const [tab, setTab] = useState<TabFinanzas>('KPI');

  // ------ KPI ------
  const [loadingKpi, setLoadingKpi] = useState(true);
  const [resumen, setResumen] = useState<FinanzasResumen | null>(null);

  // ------ Pagos ------
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [pagos, setPagos] = useState<PagoAdminDto[]>([]);
  const [pagosPage, setPagosPage] = useState(1);
  const [pagosPages, setPagosPages] = useState(1);
  // El total llega en la respuesta y se guarda igual que en web (que tampoco lo
  // pinta); sólo se conserva el setter para no dejar un binding sin uso.
  const [, setPagosTotal] = useState(0);
  const [pagosEstadoFilter, setPagosEstadoFilter] = useState<'TODOS' | EstadoPago>('TODOS');
  const [pagosSearch, setPagosSearch] = useState('');
  const [estadoSheetOpen, setEstadoSheetOpen] = useState(false);

  // ------ Gastos ------
  const [loadingGastos, setLoadingGastos] = useState(false);
  const [gastos, setGastos] = useState<GastoAdminDto[]>([]);
  const [gastosCatFilter, setGastosCatFilter] = useState<CatGasto | 'TODOS'>('TODOS');

  // Gasto modal
  const [showGastoModal, setShowGastoModal] = useState(false);
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null);
  const [gastoForm, setGastoForm] = useState<GastoForm>({
    categoria: 'MANTENIMIENTO',
    descripcion: '',
    monto: '',
    proveedor: '',
    fecha: todayIso(),
  });
  const [savingGasto, setSavingGasto] = useState(false);

  // Gasto delete confirm
  const [gastoToDelete, setGastoToDelete] = useState<string | null>(null);
  const [deletingGasto, setDeletingGasto] = useState(false);

  // ------ Morosidad ------
  const [loadingMorosidad, setLoadingMorosidad] = useState(false);
  const [morosidad, setMorosidad] = useState<MorosidadDto[]>([]);

  // ------ Global loading ------
  const [initialLoading, setInitialLoading] = useState(true);

  // =====================================================================
  // Data fetchers
  // =====================================================================

  const fetchResumen = useCallback(async () => {
    setLoadingKpi(true);
    try {
      const data = await api.get<FinanzasResumen>('/admin/finanzas/resumen');
      setResumen(data);
    } catch {
      // silent — show empty cards
    } finally {
      setLoadingKpi(false);
    }
  }, []);

  const fetchPagos = useCallback(
    async (page?: number) => {
      setLoadingPagos(true);
      const p = page ?? pagosPage;
      try {
        const params = new URLSearchParams();
        params.set('page', String(p));
        params.set('limit', '20');
        if (pagosEstadoFilter !== 'TODOS') params.set('estado', pagosEstadoFilter);
        if (pagosSearch.trim()) params.set('q', pagosSearch.trim());

        const res = await api.get<PagosAdminResponse>(`/admin/pagos?${params.toString()}`);
        // ?? [] so a shape change can't white-screen the page again.
        setPagos(res.data ?? []);
        setPagosPage(res.page);
        setPagosPages(res.pages);
        setPagosTotal(res.total);
      } catch {
        toast.error('Error al cargar pagos');
      } finally {
        setLoadingPagos(false);
      }
    },
    [pagosPage, pagosEstadoFilter, pagosSearch],
  );

  const fetchGastos = useCallback(async () => {
    setLoadingGastos(true);
    try {
      const data = await api.get<GastoAdminDto[]>('/admin/gastos');
      setGastos(data);
    } catch {
      toast.error('Error al cargar gastos');
    } finally {
      setLoadingGastos(false);
    }
  }, []);

  const fetchMorosidad = useCallback(async () => {
    setLoadingMorosidad(true);
    try {
      const data = await api.get<MorosidadDto[]>('/admin/morosidad');
      setMorosidad(data);
    } catch {
      toast.error('Error al cargar morosidad');
    } finally {
      setLoadingMorosidad(false);
    }
  }, []);

  // =====================================================================
  // WS subscriptions
  // =====================================================================

  useWsSubscription('pago', () => {
    void fetchResumen();
    if (tab === 'PAGOS') void fetchPagos();
    if (tab === 'MOROSIDAD') void fetchMorosidad();
  });

  useWsSubscription('gasto', () => {
    void fetchResumen();
    if (tab === 'GASTOS') void fetchGastos();
  });

  // =====================================================================
  // Auth guard + initial load
  // =====================================================================

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }

    if (!role || !ALLOWED_ROLES.includes(role)) {
      toast.error('No tienes permisos para acceder a esta sección.');
      router.replace('/(app)/inicio' as never);
      return;
    }

    // Don't await the KPI fetch here: blocking initialLoading on it meant
    // loadingKpi was already false by the first real render, so the KPI
    // skeleton was unreachable. The tab effect below owns that fetch.
    setInitialLoading(false);
  }, [user, authLoading, role, router]);

  // Lazy-load tab data
  useEffect(() => {
    if (initialLoading) return;
    // The KPI block sits above the tabs on every view, so refresh it on any
    // tab switch — that's what makes its skeleton show outside the KPI tab,
    // and it keeps the totals current after registering a gasto or pago.
    void fetchResumen();
    if (tab === 'PAGOS') void fetchPagos();
    else if (tab === 'GASTOS') void fetchGastos();
    else if (tab === 'MOROSIDAD') void fetchMorosidad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, initialLoading]);

  // Re-fetch pagos when filters change
  useEffect(() => {
    if (tab === 'PAGOS' && !initialLoading) {
      void fetchPagos(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagosEstadoFilter, pagosSearch]);

  const pagosFiltersActive = pagosSearch.trim() !== '' || pagosEstadoFilter !== 'TODOS';

  // =====================================================================
  // Gasto CRUD handlers
  // =====================================================================

  const openNewGasto = () => {
    setEditingGastoId(null);
    setGastoForm({
      categoria: 'MANTENIMIENTO',
      descripcion: '',
      monto: '',
      proveedor: '',
      fecha: todayIso(),
    });
    setShowGastoModal(true);
  };

  const openEditGasto = (g: GastoAdminDto) => {
    setEditingGastoId(g.id);
    setGastoForm({
      categoria: g.categoria,
      descripcion: g.descripcion,
      monto: g.monto,
      proveedor: g.proveedor || '',
      // El web hace `g.fecha.slice(0, 10)` (día UTC). El backend devuelve un
      // instante, así que se convierte al día LOCAL para que el formulario
      // coincida con lo que pinta `fechaCol` en la tarjeta.
      fecha: localIsoFromInstant(g.fecha),
    });
    setShowGastoModal(true);
  };

  const closeGastoModal = () => {
    setShowGastoModal(false);
    setEditingGastoId(null);
  };

  const handleSaveGasto = async () => {
    const montoNum = Number(gastoForm.monto);
    if (
      !gastoForm.descripcion.trim() ||
      !gastoForm.monto ||
      !Number.isFinite(montoNum) ||
      montoNum <= 0
    ) {
      toast.error('Descripción y monto son obligatorios');
      return;
    }
    setSavingGasto(true);
    try {
      const body = {
        ...gastoForm,
        monto: String(montoNum), // ensure string
        // El backend espera RFC-3339, no "YYYY-MM-DD" (ver cabecera del archivo).
        // Medianoche LOCAL para que el día vuelva igual al elegido.
        fecha: isoDateToRfc3339(gastoForm.fecha),
      };
      if (editingGastoId) {
        await api.put(`/admin/gastos/${editingGastoId}`, body);
        toast.success('Gasto actualizado');
      } else {
        await api.post('/admin/gastos', body);
        toast.success('Gasto registrado');
      }
      closeGastoModal();
      void fetchGastos();
      void fetchResumen();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al guardar el gasto');
    } finally {
      setSavingGasto(false);
    }
  };

  const confirmDeleteGasto = async () => {
    const id = gastoToDelete;
    if (!id) return;
    setDeletingGasto(true);
    try {
      await api.delete(`/admin/gastos/${id}`);
      toast.success('Gasto eliminado');
      setGastoToDelete(null);
      void fetchGastos();
      void fetchResumen();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al eliminar el gasto');
    } finally {
      setDeletingGasto(false);
    }
  };

  // =====================================================================
  // Filter helpers
  // =====================================================================

  const filteredGastos =
    gastosCatFilter === 'TODOS' ? gastos : gastos.filter((g) => g.categoria === gastosCatFilter);

  // =====================================================================
  // Loading state
  // =====================================================================

  if (authLoading || initialLoading) {
    return (
      <Screen className="bg-primary">
        <View className="gap-6 px-6 pt-4">
          <View className="gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-3 w-56" />
          </View>
          <Skeleton className="h-12 w-full rounded-full" />
          <SkeletonKpis />
        </View>
      </Screen>
    );
  }

  // =====================================================================
  // Render
  // =====================================================================

  const estadoFilterLabel =
    ESTADO_FILTER_OPTIONS.find((o) => o.value === pagosEstadoFilter)?.label ??
    'Todos los estados';

  return (
    <View className="flex-1 bg-primary">
      <Screen className="bg-primary">
        <View className="gap-6 px-6 pt-4">
          <ProfileHeader />

          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="flex-row items-center justify-between"
          >
            <View>
              <Text className="text-2xl font-medium tracking-wide text-text">Finanzas</Text>
              <Text className="text-sm text-text" style={{ opacity: 0.6 }}>
                Dashboard financiero del conjunto
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Actualizar"
              onPress={() => void fetchResumen()}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="rounded-full p-2"
            >
              <RefreshCw size={18} color={t.text} />
            </Pressable>
          </Animated.View>

          {/* ============================================================ */}
          {/* KPI Cards (always visible) */}
          {/* ============================================================ */}
          {loadingKpi ? (
            <SkeletonKpis />
          ) : resumen ? (
            // Sin `entering` a propósito: `loadingKpi` se pone en true en cada
            // cambio de pestaña, refresco manual y evento WS de pago/gasto, así
            // que animar la entrada re-disparaba el fade en cada refresco (el
            // web no anima nada aquí).
            <View className="flex-row flex-wrap gap-3">
              {/* Recaudación */}
              <KpiCard
                label="Recaudación"
                iconBoxClass="bg-success/10 border-success/20"
                icon={<DollarSign size={16} color={t.success} />}
              >
                <Text className="text-lg font-black text-text">{COP(resumen.recaudoMes)}</Text>
              </KpiCard>

              {/* Morosidad */}
              <KpiCard
                label="Morosidad"
                iconBoxClass="bg-danger/10 border-danger/20"
                icon={<TrendingDown size={16} color={t.danger} />}
              >
                <Text
                  className={`text-lg font-black ${
                    Number(resumen.morosidad) > 0 ? 'text-danger' : 'text-text'
                  }`}
                >
                  {COP(resumen.morosidad)}
                </Text>
              </KpiCard>

              {/* Gastos */}
              <KpiCard
                label="Gastos"
                iconBoxClass="bg-text/10 border-text/20"
                icon={<Wallet size={16} color={t.text} />}
              >
                <Text className="text-lg font-black text-text">{COP(resumen.gastosMes)}</Text>
              </KpiCard>

              {/* Balance */}
              <KpiCard
                label="Balance"
                iconBoxClass={
                  Number(resumen.balance) >= 0
                    ? 'bg-success/10 border-success/20'
                    : 'bg-danger/10 border-danger/20'
                }
                icon={
                  Number(resumen.balance) >= 0 ? (
                    <TrendingUp size={16} color={t.success} />
                  ) : (
                    <TrendingDown size={16} color={t.danger} />
                  )
                }
              >
                <Text
                  className={`text-lg font-black ${
                    Number(resumen.balance) >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {COP(resumen.balance)}
                </Text>
              </KpiCard>

              {/* Unidades al día */}
              <KpiCard
                label="Al día"
                iconBoxClass="bg-text/10 border-text/20"
                icon={<CheckCircle2 size={16} color={t.text} />}
              >
                <Text className="text-lg font-black text-text">
                  {resumen.unidadesAlDia}
                  <Text className="text-sm font-normal text-text">
                    {' '}
                    de {resumen.totalUnidades}
                  </Text>
                </Text>
              </KpiCard>
            </View>
          ) : (
            <LiquidGlass className="rounded-3xl" radius={24}>
              <View className="items-center gap-3 p-6 py-8">
                <AlertCircle size={28} color={t.text} />
                <Text className="text-center text-sm text-text">
                  No se pudieron cargar los datos financieros.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void fetchResumen()}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Text className="text-xs font-bold text-info underline">Reintentar</Text>
                </Pressable>
              </View>
            </LiquidGlass>
          )}

          {/* ============================================================ */}
          {/* Tabs */}
          {/* ============================================================ */}
          <View className="flex-row rounded-full border border-border bg-surface-2 p-1">
            {TABS.map((item) => {
              const active = tab === item.value;
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(item.value)}
                  className={`flex-1 items-center rounded-full py-3 ${active ? 'bg-info' : ''}`}
                >
                  <Text
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      active ? 'text-on-accent' : 'text-text'
                    }`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ============================================================ */}
          {/* KPI SECTION — the KPI cards themselves render above the tabs, so
              without this the tab body was blank. */}
          {/* ============================================================ */}
          {tab === 'KPI' ? (
            loadingKpi ? (
              <LiquidGlass className="rounded-3xl" radius={24}>
                <View className="items-center gap-3 p-8">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-56" />
                </View>
              </LiquidGlass>
            ) : resumen ? (
              <LiquidGlass className="rounded-3xl" radius={24}>
                <View className="items-center p-8">
                  <View className="mb-3" style={{ opacity: 0.4 }}>
                    <TrendingUp size={40} color={t.text} />
                  </View>
                  <Text className="text-center font-medium text-text">
                    Sin movimientos recientes
                  </Text>
                  <Text className="mt-1 text-center text-xs text-text" style={{ opacity: 0.5 }}>
                    Los indicadores del mes se muestran arriba.
                  </Text>
                </View>
              </LiquidGlass>
            ) : null
          ) : null}

          {/* ============================================================ */}
          {/* PAGOS SECTION */}
          {/* ============================================================ */}
          {tab === 'PAGOS' ? (
            <View className="gap-4">
              {/* Filters — hidden when there is genuinely nothing to filter, but
                  kept visible while a filter is active so a search that returns
                  nothing can still be cleared. */}
              {pagos.length > 0 || pagosFiltersActive ? (
                <View className="gap-3">
                  {/* Search */}
                  <View className="w-full flex-row items-center rounded-xl border border-border bg-surface-2 px-4 py-3">
                    <View className="mr-2" style={{ opacity: 0.5 }}>
                      <Search size={16} color={t.text} />
                    </View>
                    <TextInput
                      placeholder="Buscar por unidad"
                      placeholderTextColor={t.text}
                      value={pagosSearch}
                      onChangeText={setPagosSearch}
                      className="flex-1 p-0 text-sm text-text"
                    />
                  </View>

                  {/* Estado filter */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setEstadoSheetOpen(true)}
                    className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3"
                  >
                    <Text className="text-sm text-text">{estadoFilterLabel}</Text>
                    <ChevronDown size={18} color={t.text} />
                  </Pressable>
                </View>
              ) : null}

              {/* Table / List */}
              {loadingPagos ? (
                <SkeletonRows />
              ) : pagos.length === 0 ? (
                <LiquidGlass className="rounded-3xl" radius={24}>
                  <View className="items-center p-8">
                    <View className="mb-3" style={{ opacity: 0.4 }}>
                      <DollarSign size={40} color={t.text} />
                    </View>
                    <Text className="text-center font-medium text-text">Sin pagos</Text>
                    <Text className="mt-1 text-center text-xs text-text" style={{ opacity: 0.5 }}>
                      {pagosFiltersActive
                        ? 'No se encontraron pagos con los filtros actuales.'
                        : 'Aún no hay pagos registrados.'}
                    </Text>
                  </View>
                </LiquidGlass>
              ) : (
                <LiquidGlass className="rounded-3xl" radius={24}>
                  <View>
                    {pagos.map((p, i) => {
                      const badge = ESTADO_BADGE[p.estado];
                      return (
                        <View
                          key={p.id}
                          className={`gap-2 px-6 py-4 ${
                            i === pagos.length - 1 ? '' : 'border-b border-border'
                          }`}
                        >
                          {/* Unidad */}
                          <View className="flex-row items-center gap-1">
                            <Text className="text-xs font-bold text-text">
                              {pagoUnidadLabel(p)}
                            </Text>
                          </View>

                          {/* Concepto */}
                          <Text numberOfLines={1} className="text-xs text-text">
                            {p.concepto}
                          </Text>

                          {/* Monto */}
                          <Text className="text-sm font-black text-text">{COP(p.monto)}</Text>

                          {/* Estado badge */}
                          <View
                            className={`flex-row items-center gap-1 self-start rounded-full px-2 py-0.5 ${
                              badge?.bgClass ?? 'bg-text/10'
                            }`}
                          >
                            {p.estado === 'PENDIENTE' ? (
                              <Clock size={10} color={t.warning} />
                            ) : null}
                            {p.estado === 'PAGADO' ? (
                              <CheckCircle2 size={10} color={t.success} />
                            ) : null}
                            {p.estado === 'VENCIDO' ? (
                              <AlertCircle size={10} color={t.danger} />
                            ) : null}
                            <Text
                              className={`text-[10px] font-bold uppercase ${
                                badge?.textClass ?? 'text-text'
                              }`}
                            >
                              {badge?.label ?? p.estado}
                            </Text>
                          </View>

                          {/* Método */}
                          <Text className="text-xs text-text">
                            {p.metodo ? METODO_LABEL[p.metodo] || p.metodo : '—'}
                          </Text>

                          {/* Fecha pago */}
                          <Text className="text-xs text-text">
                            {p.fechaPago ? fechaCol(p.fechaPago) : '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </LiquidGlass>
              )}

              {/* Pagination */}
              {pagosPages > 1 ? (
                <View className="flex-row items-center justify-center gap-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Página anterior"
                    onPress={() => void fetchPagos(pagosPage - 1)}
                    disabled={pagosPage <= 1}
                    style={{ opacity: pagosPage <= 1 ? 0.3 : 1 }}
                    className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2"
                  >
                    <ChevronLeft size={18} color={t.text} />
                  </Pressable>
                  <Text className="text-xs font-bold text-text">
                    {pagosPage} / {pagosPages}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Página siguiente"
                    onPress={() => void fetchPagos(pagosPage + 1)}
                    disabled={pagosPage >= pagosPages}
                    style={{ opacity: pagosPage >= pagosPages ? 0.3 : 1 }}
                    className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2"
                  >
                    <ChevronRight size={18} color={t.text} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ============================================================ */}
          {/* GASTOS SECTION */}
          {/* ============================================================ */}
          {tab === 'GASTOS' ? (
            <View className="gap-4">
              {/* Button on its own row above the chips — sharing a row inside the
                  430px shell left no width for them and sliced them mid-word. */}
              <View className="gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={openNewGasto}
                  style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
                  className="w-full flex-row items-center justify-center gap-2 rounded-full bg-success px-5 py-3"
                >
                  <Plus size={18} color={t.onAccent} />
                  <Text className="text-sm font-bold text-on-accent">Registrar Gasto</Text>
                </Pressable>

                {/* Hidden when there is nothing to filter, but kept visible while a
                    category is selected so an empty result can still be cleared. */}
                {gastos.length > 0 || gastosCatFilter !== 'TODOS' ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setGastosCatFilter('TODOS')}
                      className={`rounded-full px-4 py-2 ${
                        gastosCatFilter === 'TODOS' ? 'bg-info' : 'border border-border bg-text/5'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold uppercase tracking-wider ${
                          gastosCatFilter === 'TODOS' ? 'text-on-accent' : 'text-text'
                        }`}
                      >
                        Todos
                      </Text>
                    </Pressable>
                    {CAT_GASTO_OPTIONS.map((cat) => {
                      const active = gastosCatFilter === cat;
                      return (
                        <Pressable
                          key={cat}
                          accessibilityRole="button"
                          onPress={() => setGastosCatFilter(cat)}
                          className={`rounded-full px-4 py-2 ${
                            active ? 'bg-info' : 'border border-border bg-text/5'
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold uppercase tracking-wider ${
                              active ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {CAT_GASTO_LABELS[cat]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>

              {/* List */}
              {loadingGastos ? (
                <SkeletonRows />
              ) : filteredGastos.length === 0 ? (
                <LiquidGlass className="rounded-3xl" radius={24}>
                  <View className="items-center p-8">
                    <View className="mb-3" style={{ opacity: 0.4 }}>
                      <Wallet size={40} color={t.text} />
                    </View>
                    <Text className="text-center font-medium text-text">
                      {gastosCatFilter !== 'TODOS'
                        ? 'Sin gastos en esta categoría'
                        : 'No hay gastos registrados'}
                    </Text>
                    <Text className="mt-1 text-center text-xs text-text" style={{ opacity: 0.5 }}>
                      Registra el primer gasto usando el botón superior.
                    </Text>
                  </View>
                </LiquidGlass>
              ) : (
                <View className="gap-3">
                  {filteredGastos.map((g) => (
                    <LiquidGlass key={g.id} className="rounded-3xl" radius={24}>
                      <View className="gap-3 p-5">
                        {/* Top row: category + date + actions */}
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 flex-row items-center gap-2 pr-2">
                            <View className="rounded-full border border-info/20 bg-info/10 px-3 py-1">
                              <Text className="text-[10px] font-bold uppercase tracking-wider text-info">
                                {CAT_GASTO_LABELS[g.categoria] || g.categoria}
                              </Text>
                            </View>
                            <Text className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                              {fechaCol(g.fecha)}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Editar gasto"
                              onPress={() => openEditGasto(g)}
                              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                              className="h-8 w-8 items-center justify-center rounded-lg border border-border bg-text/5"
                            >
                              <Pencil size={14} color={t.text} />
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Eliminar gasto"
                              onPress={() => setGastoToDelete(g.id)}
                              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                              className="h-8 w-8 items-center justify-center rounded-lg border border-border bg-text/5"
                            >
                              <Trash2 size={14} color={t.text} />
                            </Pressable>
                          </View>
                        </View>

                        {/* Description */}
                        <Text className="text-sm leading-relaxed text-text">{g.descripcion}</Text>

                        {/* Bottom row: amount + provider */}
                        <View className="flex-row items-center justify-between border-t border-border pt-2">
                          <Text className="text-lg font-black text-text">{COP(g.monto)}</Text>
                          {g.proveedor ? (
                            <Text className="text-xs text-text" style={{ opacity: 0.6 }}>
                              {g.proveedor}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </LiquidGlass>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* ============================================================ */}
          {/* MOROSIDAD SECTION */}
          {/* ============================================================ */}
          {tab === 'MOROSIDAD' ? (
            <View className="gap-4">
              {morosidad.length > 0 ? (
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-xl border border-danger/20 bg-danger/10">
                    <AlertCircle size={20} color={t.danger} />
                  </View>
                  <View>
                    <Text className="text-base font-bold text-text">
                      Unidades con saldo vencido
                    </Text>
                    <Text className="text-xs text-text" style={{ opacity: 0.5 }}>
                      Ordenado de mayor a menor deuda
                    </Text>
                  </View>
                </View>
              ) : null}

              {loadingMorosidad ? (
                <SkeletonRows />
              ) : morosidad.length === 0 ? (
                <LiquidGlass className="rounded-3xl" radius={24}>
                  <View className="items-center p-8">
                    <View className="mb-3">
                      <CheckCircle2 size={40} color={t.success} />
                    </View>
                    <Text className="text-center font-medium text-text">
                      ¡Todas las unidades están al día!
                    </Text>
                    <Text className="mt-1 text-center text-xs text-text" style={{ opacity: 0.5 }}>
                      No hay saldos vencidos registrados.
                    </Text>
                  </View>
                </LiquidGlass>
              ) : (
                <View className="gap-3">
                  {morosidad.map((m, i) => {
                    const recibos = recibosVencidosDe(m);
                    const maxDeuda = Number(morosidad[0]?.totalAdeudado) || 1;
                    const pct = Math.min(100, (Number(m.totalAdeudado) / maxDeuda) * 100);
                    return (
                      <LiquidGlass key={m.unidadId} className="rounded-3xl" radius={24}>
                        <View className="gap-3 p-5">
                          <View className="flex-row items-start justify-between">
                            {/* Unit info */}
                            <View className="flex-1 flex-row items-center gap-4 pr-2">
                              <View className="h-11 w-11 items-center justify-center rounded-xl border border-danger/20 bg-danger/10">
                                <Text className="text-sm font-black text-danger">{i + 1}</Text>
                              </View>
                              <View className="flex-1">
                                <Text className="text-sm font-bold text-text">
                                  {m.torre
                                    ? `Torre ${m.torre} - Apto ${m.apto}`
                                    : `Unidad ${m.apto}`}
                                </Text>
                                <Text className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                                  {recibos} recibo
                                  {recibos !== 1 ? 's' : ''} vencido
                                  {recibos !== 1 ? 's' : ''}
                                </Text>
                              </View>
                            </View>

                            {/* Debt amount */}
                            <Text className="text-lg font-black text-danger">
                              {COP(m.totalAdeudado)}
                            </Text>
                          </View>

                          {/* Progress bar */}
                          <View className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                            <View
                              className="h-full rounded-full bg-danger"
                              style={{ width: `${pct}%` }}
                            />
                          </View>
                        </View>
                      </LiquidGlass>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}
        </View>
      </Screen>

      {/* Estado filter sheet (web <select>) */}
      <Sheet open={estadoSheetOpen} onClose={() => setEstadoSheetOpen(false)} snapPoints={['45%']}>
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-between py-3">
            {/* Encabezado del sheet (el `<select>` del web no tiene título).
                Mismo formato que "Selecciona destinatario" en paqueteria.tsx —
                antes repetía "Todos los estados", que es la etiqueta de una
                opción y quedaba mintiendo al filtrar por otro estado. */}
            <Text className="text-base font-bold text-text">Selecciona estado</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setEstadoSheetOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={t.text} />
            </Pressable>
          </View>
          {ESTADO_FILTER_OPTIONS.map((opt) => {
            const selected = opt.value === pagosEstadoFilter;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                onPress={() => {
                  setPagosEstadoFilter(opt.value);
                  setEstadoSheetOpen(false);
                }}
                className="flex-row items-center justify-between border-b border-border py-3.5"
              >
                <Text className="flex-1 pr-2 text-sm text-text">{opt.label}</Text>
                {selected ? <CheckCircle2 size={18} color={t.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* GASTO MODAL (Create / Edit) */}
      <GastoModal
        open={showGastoModal}
        editing={!!editingGastoId}
        saving={savingGasto}
        form={gastoForm}
        onChange={setGastoForm}
        onClose={closeGastoModal}
        onSubmit={() => void handleSaveGasto()}
      />

      {/* DELETE GASTO CONFIRM MODAL */}
      <DeleteGastoModal
        open={!!gastoToDelete}
        deleting={deletingGasto}
        onCancel={() => setGastoToDelete(null)}
        onConfirm={() => void confirmDeleteGasto()}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// KPI card shell — `.liquid-glass rounded-3xl p-4 border border-border` on web.
// LiquidGlass already paints that 1px border + shadow, so no extra border class.
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  /** Background + border classes of the 32×32 icon box. */
  iconBoxClass: string;
  icon: ReactNode;
  children: ReactNode;
}

function KpiCard({ label, iconBoxClass, icon, children }: KpiCardProps) {
  return (
    // `grid-cols-2 gap-3` on web → 48%-wide items in a wrapping flex row.
    <View style={{ width: '48%' }}>
      <LiquidGlass className="rounded-3xl" radius={24}>
        <View className="gap-2 p-4">
          <View className="flex-row items-center gap-2">
            <View
              className={`h-8 w-8 items-center justify-center rounded-xl border ${iconBoxClass}`}
            >
              {icon}
            </View>
            <Text className="flex-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-text">
              {label}
            </Text>
          </View>
          {children}
        </View>
      </LiquidGlass>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Gasto modal (create / edit) — bottom sheet, mirrors the web modal exactly.
// ---------------------------------------------------------------------------

interface GastoModalProps {
  open: boolean;
  editing: boolean;
  saving: boolean;
  form: GastoForm;
  onChange: (next: GastoForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function GastoModal({ open, editing, saving, form, onChange, onClose, onSubmit }: GastoModalProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');
  const [catOpen, setCatOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  // El Modal queda montado siempre, así que sin esto las listas colapsables
  // quedaban abiertas de un uso al siguiente.
  useEffect(() => {
    if (!open) {
      setCatOpen(false);
      setDateOpen(false);
    }
  }, [open]);

  const { y: fy, m: fm, d: fd } = parseIsoParts(form.fecha);
  const years: number[] = [];
  for (let y = new Date().getFullYear() + 1; y >= FIRST_YEAR; y -= 1) years.push(y);
  const days: number[] = [];
  for (let d = 1; d <= daysInMonth(fy, fm); d += 1) days.push(d);

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
          className="absolute inset-0 bg-black/70"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(300)}
            className="max-h-[90%] overflow-hidden rounded-t-[32px] border-t border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            >
              <View className="mb-5 flex-row items-center justify-between border-b border-border pb-3">
                <Text className="text-lg font-bold text-text">
                  {editing ? 'Editar Gasto' : 'Registrar Gasto'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  onPress={onClose}
                  className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2"
                >
                  <X size={20} color={t.text} />
                </Pressable>
              </View>

              <View className="gap-4">
                {/* Categoría */}
                <View className="gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Categoría *
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setCatOpen((o) => !o)}
                    className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3"
                  >
                    <Text className="text-sm text-text">{CAT_GASTO_LABELS[form.categoria]}</Text>
                    <ChevronDown size={18} color={t.text} />
                  </Pressable>
                  {catOpen ? (
                    <View className="overflow-hidden rounded-xl border border-border bg-surface-2">
                      {CAT_GASTO_OPTIONS.map((cat, i) => {
                        const selected = form.categoria === cat;
                        return (
                          <Pressable
                            key={cat}
                            accessibilityRole="button"
                            onPress={() => {
                              onChange({ ...form, categoria: cat });
                              setCatOpen(false);
                            }}
                            className={`flex-row items-center justify-between px-4 py-3 ${
                              i === CAT_GASTO_OPTIONS.length - 1 ? '' : 'border-b border-border'
                            }`}
                          >
                            <Text className="text-sm text-text">{CAT_GASTO_LABELS[cat]}</Text>
                            {selected ? <CheckCircle2 size={16} color={t.accent} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                {/* Descripción */}
                <View className="gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Descripción *
                  </Text>
                  <TextInput
                    value={form.descripcion}
                    onChangeText={(descripcion) => onChange({ ...form, descripcion })}
                    placeholder="Ej: Pago de vigilancia mes de junio"
                    placeholderTextColor={t.text}
                    editable={!saving}
                    className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Monto */}
                <View className="gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Monto (COP) *
                  </Text>
                  <TextInput
                    value={form.monto}
                    onChangeText={(monto) => onChange({ ...form, monto })}
                    placeholder="0"
                    placeholderTextColor={t.text}
                    keyboardType="numeric"
                    editable={!saving}
                    className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Proveedor */}
                <View className="gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Proveedor
                  </Text>
                  <TextInput
                    value={form.proveedor}
                    onChangeText={(proveedor) => onChange({ ...form, proveedor })}
                    placeholder="Nombre o razón social"
                    placeholderTextColor={t.text}
                    editable={!saving}
                    className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Fecha — `<input type="date">` en web. Aquí un selector
                    Año / Mes / Día inline, con el mismo contrato de valor
                    (`YYYY-MM-DD`) y el mismo vocabulario que
                    src/components/superadmin/DateSheet.tsx. Va inline y no en un
                    Sheet porque @gorhom/bottom-sheet no se abre por encima de un
                    `Modal` de RN (ventana nativa aparte). */}
                <View className="gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Fecha *
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setDateOpen((o) => !o)}
                    className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3"
                  >
                    <Text className="text-sm text-text">{fechaIsoLabel(form.fecha)}</Text>
                    <ChevronDown size={18} color={t.text} />
                  </Pressable>
                  {dateOpen ? (
                    <View className="gap-4 rounded-xl border border-border bg-surface-2 p-4">
                      {/* Año */}
                      <View className="gap-2">
                        <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                          Año
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8 }}
                        >
                          {years.map((y) => {
                            const selected = y === fy;
                            return (
                              <Pressable
                                key={y}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => onChange({ ...form, fecha: buildIsoDate(y, fm, fd) })}
                                className={`rounded-xl border px-3 py-2 ${
                                  selected
                                    ? 'border-accent bg-accentSoft'
                                    : 'border-border bg-surface'
                                }`}
                              >
                                <Text
                                  className={`text-xs font-bold ${
                                    selected ? 'text-accent' : 'text-text'
                                  }`}
                                >
                                  {y}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>

                      {/* Mes */}
                      <View className="gap-2">
                        <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                          Mes
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {MESES.map((label, idx) => {
                            const selected = idx + 1 === fm;
                            return (
                              <Pressable
                                key={label}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() =>
                                  onChange({ ...form, fecha: buildIsoDate(fy, idx + 1, fd) })
                                }
                                className={`rounded-xl border px-3 py-2 ${
                                  selected
                                    ? 'border-accent bg-accentSoft'
                                    : 'border-border bg-surface'
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
                            const selected = d === fd;
                            return (
                              <Pressable
                                key={d}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => onChange({ ...form, fecha: buildIsoDate(fy, fm, d) })}
                                className={`h-10 w-10 items-center justify-center rounded-xl border ${
                                  selected
                                    ? 'border-accent bg-accentSoft'
                                    : 'border-border bg-surface'
                                }`}
                              >
                                <Text
                                  className={`text-xs font-bold ${
                                    selected ? 'text-accent' : 'text-text'
                                  }`}
                                >
                                  {d}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Submit */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: saving, busy: saving }}
                  disabled={saving}
                  onPress={onSubmit}
                  style={({ pressed }) => ({
                    opacity: saving ? 0.5 : pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                  className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-full bg-success py-3.5"
                >
                  {saving ? (
                    <>
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <Text className="text-sm font-bold text-on-accent">Guardando...</Text>
                    </>
                  ) : (
                    <Text className="text-sm font-bold text-on-accent">
                      {editing ? 'Guardar Cambios' : 'Registrar Gasto'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------

interface DeleteGastoModalProps {
  open: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteGastoModal({ open, deleting, onCancel, onConfirm }: DeleteGastoModalProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onCancel}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(300)}
            className="overflow-hidden rounded-t-[32px] border-t border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 24 }}
          >
            <View className="items-center gap-4 p-8">
              <View className="h-16 w-16 items-center justify-center rounded-full border border-danger/40 bg-danger/15">
                <Trash2 size={28} color={t.danger} />
              </View>
              <View className="items-center gap-1">
                <Text className="text-[10px] font-bold uppercase tracking-[0.2em] text-info">
                  Eliminar Gasto
                </Text>
                <Text className="text-2xl font-bold text-text">¿Estás seguro?</Text>
              </View>
              <Text
                className="text-center text-sm leading-relaxed text-text"
                style={{ opacity: 0.8 }}
              >
                Esta acción no se puede deshacer. El gasto se eliminará permanentemente.
              </Text>
              <View className="mt-2 w-full flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={onCancel}
                  style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                  className="flex-1 items-center rounded-2xl border border-border bg-text/5 py-4"
                >
                  <Text className="text-sm font-bold text-text">Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: deleting, busy: deleting }}
                  disabled={deleting}
                  onPress={onConfirm}
                  style={({ pressed }) => ({
                    opacity: deleting ? 0.6 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  })}
                  className="flex-1 items-center rounded-2xl bg-danger py-4"
                >
                  <Text className="text-sm font-bold text-on-accent">
                    {deleting ? 'Eliminando...' : 'Eliminar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

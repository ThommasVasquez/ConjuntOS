"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  X,
  Pencil,
  Trash2,
    RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { api, ApiError } from "@/lib/api/client";
import type { EstadoPago, MetodoPago } from "@/lib/api/types";
import { Skeleton, SkeletonKpis, SkeletonRows } from "@/components/ui/Skeleton";

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
  unidad?: { torre: string | null; numero: string };
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
  | "MANTENIMIENTO"
  | "SERVICIOS_PUBLICOS"
  | "SEGURIDAD"
  | "ASEO"
  | "ADMINISTRACION"
  | "IMPUESTOS"
  | "SEGUROS"
  | "REPARACIONES"
  | "JARDINERIA"
  | "OTRO";

const CAT_GASTO_LABELS: Record<CatGasto, string> = {
  MANTENIMIENTO: "Mantenimiento",
  SERVICIOS_PUBLICOS: "Servicios Públicos",
  SEGURIDAD: "Seguridad",
  ASEO: "Aseo",
  ADMINISTRACION: "Administración",
  IMPUESTOS: "Impuestos",
  SEGUROS: "Seguros",
  REPARACIONES: "Reparaciones",
  JARDINERIA: "Jardinería",
  OTRO: "Otro",
};

const CAT_GASTO_OPTIONS: CatGasto[] = [
  "MANTENIMIENTO",
  "SERVICIOS_PUBLICOS",
  "SEGURIDAD",
  "ASEO",
  "ADMINISTRACION",
  "IMPUESTOS",
  "SEGUROS",
  "REPARACIONES",
  "JARDINERIA",
  "OTRO",
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
  recibosVencidos: number;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const COP = (v: string | number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(v || 0));

const fechaCol = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const ESTADO_BADGE: Record<
  string,
  { label: string; classes: string }
> = {
  PAGADO: {
    label: "Pagado",
    classes: "bg-success/20 text-success",
  },
  PENDIENTE: {
    label: "Pendiente",
    classes: "bg-warning/20 text-warning",
  },
  VENCIDO: {
    label: "Vencido",
    classes: "bg-danger/20 text-danger",
  },
  EN_DISPUTA: {
    label: "En Disputa",
    classes: "bg-text/20 text-text",
  },
};

const METODO_LABEL: Record<string, string> = {
  PSE: "PSE",
  TARJETA: "Tarjeta",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  EFECTIVO: "Efectivo",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type TabFinanzas = "KPI" | "PAGOS" | "GASTOS" | "MOROSIDAD";

export default function AdminFinanzasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const containerRef = useRef<HTMLDivElement>(null);

  // Tab
  const [tab, setTab] = useState<TabFinanzas>("KPI");

  // ------ KPI ------
  const [loadingKpi, setLoadingKpi] = useState(true);
  const [resumen, setResumen] = useState<FinanzasResumen | null>(null);

  // ------ Pagos ------
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [pagos, setPagos] = useState<PagoAdminDto[]>([]);
  const [pagosPage, setPagosPage] = useState(1);
  const [pagosPages, setPagosPages] = useState(1);
  const [pagosTotal, setPagosTotal] = useState(0);
  const [pagosEstadoFilter, setPagosEstadoFilter] = useState<
    "TODOS" | EstadoPago
  >("TODOS");
  const [pagosSearch, setPagosSearch] = useState("");

  // ------ Gastos ------
  const [loadingGastos, setLoadingGastos] = useState(false);
  const [gastos, setGastos] = useState<GastoAdminDto[]>([]);
  const [gastosCatFilter, setGastosCatFilter] = useState<CatGasto | "TODOS">(
    "TODOS",
  );

  // Gasto modal
  const [showGastoModal, setShowGastoModal] = useState(false);
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null);
  const [gastoForm, setGastoForm] = useState<GastoForm>({
    categoria: "MANTENIMIENTO",
    descripcion: "",
    monto: "",
    proveedor: "",
    fecha: new Date().toISOString().slice(0, 10),
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
      const data = await api.get<FinanzasResumen>(
        "/admin/finanzas/resumen",
      );
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
        params.set("page", String(p));
        params.set("limit", "20");
        if (pagosEstadoFilter !== "TODOS")
          params.set("estado", pagosEstadoFilter);
        if (pagosSearch.trim())
          params.set("q", pagosSearch.trim());

        const res = await api.get<PagosAdminResponse>(
          `/admin/pagos?${params.toString()}`,
        );
        // ?? [] so a shape change can't white-screen the page again.
        setPagos(res.data ?? []);
        setPagosPage(res.page);
        setPagosPages(res.pages);
        setPagosTotal(res.total);
      } catch {
        toast.error("Error al cargar pagos");
      } finally {
        setLoadingPagos(false);
      }
    },
    [pagosPage, pagosEstadoFilter, pagosSearch],
  );

  const fetchGastos = useCallback(async () => {
    setLoadingGastos(true);
    try {
      const data = await api.get<GastoAdminDto[]>("/admin/gastos");
      setGastos(data);
    } catch {
      toast.error("Error al cargar gastos");
    } finally {
      setLoadingGastos(false);
    }
  }, []);

  const fetchMorosidad = useCallback(async () => {
    setLoadingMorosidad(true);
    try {
      const data = await api.get<MorosidadDto[]>("/admin/morosidad");
      setMorosidad(data);
    } catch {
      toast.error("Error al cargar morosidad");
    } finally {
      setLoadingMorosidad(false);
    }
  }, []);

  // =====================================================================
  // WS subscriptions
  // =====================================================================

  useWsSubscription("pago", () => {
    fetchResumen();
    if (tab === "PAGOS") fetchPagos();
    if (tab === "MOROSIDAD") fetchMorosidad();
  });

  useWsSubscription("gasto", () => {
    fetchResumen();
    if (tab === "GASTOS") fetchGastos();
  });

  // =====================================================================
  // Auth guard + initial load
  // =====================================================================

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    // Don't await the KPI fetch here: blocking initialLoading on it meant
    // loadingKpi was already false by the first real render, so the KPI
    // skeleton was unreachable. The tab effect below owns that fetch.
    setInitialLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  // Lazy-load tab data
  useEffect(() => {
    if (initialLoading) return;
    // The KPI block sits above the tabs on every view, so refresh it on any
    // tab switch — that's what makes its skeleton show outside the KPI tab,
    // and it keeps the totals current after registering a gasto or pago.
    fetchResumen();
    if (tab === "PAGOS") fetchPagos();
    else if (tab === "GASTOS") fetchGastos();
    else if (tab === "MOROSIDAD") fetchMorosidad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, initialLoading]);

  // Re-fetch pagos when filters change
  useEffect(() => {
    if (tab === "PAGOS" && !initialLoading) {
      fetchPagos(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagosEstadoFilter, pagosSearch]);

  const pagosFiltersActive =
    pagosSearch.trim() !== "" || pagosEstadoFilter !== "TODOS";

  // =====================================================================
  // GSAP animations
  // =====================================================================


  // =====================================================================
  // Gasto CRUD handlers
  // =====================================================================

  const openNewGasto = () => {
    setEditingGastoId(null);
    setGastoForm({
      categoria: "MANTENIMIENTO",
      descripcion: "",
      monto: "",
      proveedor: "",
      fecha: new Date().toISOString().slice(0, 10),
    });
    setShowGastoModal(true);
  };

  const openEditGasto = (g: GastoAdminDto) => {
    setEditingGastoId(g.id);
    setGastoForm({
      categoria: g.categoria,
      descripcion: g.descripcion,
      monto: g.monto,
      proveedor: g.proveedor || "",
      fecha: g.fecha.slice(0, 10),
    });
    setShowGastoModal(true);
  };

  const closeGastoModal = () => {
    setShowGastoModal(false);
    setEditingGastoId(null);
  };

  const handleSaveGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !gastoForm.descripcion.trim() ||
      !gastoForm.monto ||
      Number(gastoForm.monto) <= 0
    ) {
      toast.error("Descripción y monto son obligatorios");
      return;
    }
    setSavingGasto(true);
    try {
      const body = {
        ...gastoForm,
        monto: String(Number(gastoForm.monto)), // ensure string
      };
      if (editingGastoId) {
        await api.put(`/admin/gastos/${editingGastoId}`, body);
        toast.success("Gasto actualizado");
      } else {
        await api.post("/admin/gastos", body);
        toast.success("Gasto registrado");
      }
      closeGastoModal();
      fetchGastos();
      fetchResumen();
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError
          ? e.detail
          : "Error al guardar el gasto",
      );
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
      toast.success("Gasto eliminado");
      setGastoToDelete(null);
      fetchGastos();
      fetchResumen();
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError
          ? e.detail
          : "Error al eliminar el gasto",
      );
    } finally {
      setDeletingGasto(false);
    }
  };

  // =====================================================================
  // Filter helpers
  // =====================================================================

  const filteredGastos =
    gastosCatFilter === "TODOS"
      ? gastos
      : gastos.filter((g) => g.categoria === gastosCatFilter);

  // =====================================================================
  // Loading state
  // =====================================================================

  if (authLoading || initialLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-12 w-full rounded-full" />
        <SkeletonKpis />
      </div>
    );
  }

  // =====================================================================
  // Render
  // =====================================================================

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden"
    >
      <ProfileHeader />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-medium text-text tracking-wide">
            Finanzas
          </h1>
          <p className="text-sm text-text" style={{ opacity: 0.6 }}>
            Dashboard financiero del conjunto
          </p>
        </div>
        <button
          onClick={fetchResumen}
          className="p-2 rounded-full hover:bg-surface-2 transition-colors"
        >
          <RefreshCw size={18} className="text-text" />
        </button>
      </div>

      {/* ============================================================ */}
      {/* KPI Cards (always visible) */}
      {/* ============================================================ */}
      {loadingKpi ? (
        <SkeletonKpis />
      ) : resumen ? (
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          {/* Recaudación */}
          <div className="liquid-glass rounded-3xl p-4 border border-border shadow-2xl flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center">
                <DollarSign size={16} className="text-success" />
              </div>
              <span className="text-[10px] text-text uppercase tracking-wider font-bold min-w-0 leading-tight">
                Recaudación
              </span>
            </div>
            <span className="text-lg font-black text-text">
              {COP(resumen.recaudoMes)}
            </span>
          </div>

          {/* Morosidad */}
          <div className="liquid-glass rounded-3xl p-4 border border-border shadow-2xl flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center">
                <TrendingDown size={16} className="text-danger" />
              </div>
              <span className="text-[10px] text-text uppercase tracking-wider font-bold min-w-0 leading-tight">
                Morosidad
              </span>
            </div>
            <span
              className={`text-lg font-black ${
                Number(resumen.morosidad) > 0
                  ? "text-danger"
                  : "text-text"
              }`}
            >
              {COP(resumen.morosidad)}
            </span>
          </div>

          {/* Gastos */}
          <div className="liquid-glass rounded-3xl p-4 border border-border shadow-2xl flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-text/10 border border-text/20 flex items-center justify-center">
                <Wallet size={16} className="text-text" />
              </div>
              <span className="text-[10px] text-text uppercase tracking-wider font-bold min-w-0 leading-tight">
                Gastos
              </span>
            </div>
            <span className="text-lg font-black text-text">
              {COP(resumen.gastosMes)}
            </span>
          </div>

          {/* Balance */}
          <div className="liquid-glass rounded-3xl p-4 border border-border shadow-2xl flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-xl border flex items-center justify-center ${
                  Number(resumen.balance) >= 0
                    ? "bg-success/10 border-success/20"
                    : "bg-danger/10 border-danger/20"
                }`}
              >
                {Number(resumen.balance) >= 0 ? (
                  <TrendingUp size={16} className="text-success" />
                ) : (
                  <TrendingDown size={16} className="text-danger" />
                )}
              </div>
              <span className="text-[10px] text-text uppercase tracking-wider font-bold min-w-0 leading-tight">
                Balance
              </span>
            </div>
            <span
              className={`text-lg font-black ${
                Number(resumen.balance) >= 0
                  ? "text-success"
                  : "text-danger"
              }`}
            >
              {COP(resumen.balance)}
            </span>
          </div>

          {/* Unidades al día */}
          <div className="liquid-glass rounded-3xl p-4 border border-border shadow-2xl flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-text/10 border border-text/20 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-text" />
              </div>
              <span className="text-[10px] text-text uppercase tracking-wider font-bold min-w-0 leading-tight">
                Al día
              </span>
            </div>
            <span className="text-lg font-black text-text">
              {resumen.unidadesAlDia}
              <span className="text-sm font-normal text-text">
                {" "}
                de {resumen.totalUnidades}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="liquid-glass rounded-3xl p-6 border border-border shadow-2xl flex flex-col items-center gap-3 py-8 text-center">
          <AlertCircle size={28} className="text-text" />
          <p className="text-text text-sm">
            No se pudieron cargar los datos financieros.
          </p>
          <button
            onClick={fetchResumen}
            className="text-xs font-bold text-info underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* Tabs */}
      {/* ============================================================ */}
      <div className="flex bg-surface-2 rounded-full p-1 border border-border">
        <button
          onClick={() => setTab("KPI")}
          className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
            tab === "KPI"
              ? "bg-info text-on-accent shadow-md"
              : "text-text hover:text-text"
          }`}
        >
          KPI
        </button>
        <button
          onClick={() => setTab("PAGOS")}
          className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
            tab === "PAGOS"
              ? "bg-info text-on-accent shadow-md"
              : "text-text hover:text-text"
          }`}
        >
          Pagos
        </button>
        <button
          onClick={() => setTab("GASTOS")}
          className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
            tab === "GASTOS"
              ? "bg-info text-on-accent shadow-md"
              : "text-text hover:text-text"
          }`}
        >
          Gastos
        </button>
        <button
          onClick={() => setTab("MOROSIDAD")}
          className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
            tab === "MOROSIDAD"
              ? "bg-info text-on-accent shadow-md"
              : "text-text hover:text-text"
          }`}
        >
          Morosidad
        </button>
      </div>

      {/* ============================================================ */}
      {/* PAGOS SECTION */}
      {/* ============================================================ */}
      {/* KPI SECTION — the KPI cards themselves render above the tabs, so
          without this the tab body was blank. */}
      {/* ============================================================ */}
      {tab === "KPI" &&
        (loadingKpi ? (
          <div className="liquid-glass rounded-3xl p-8 border border-border flex flex-col items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-56" />
          </div>
        ) : resumen ? (
          <div className="liquid-glass rounded-3xl p-8 border border-border text-center">
            <TrendingUp size={40} className="mx-auto text-text mb-3" style={{ opacity: 0.4 }} />
            <p className="text-text font-medium">Sin movimientos recientes</p>
            <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
              Los indicadores del mes se muestran arriba.
            </p>
          </div>
        ) : null)}

      {/* ============================================================ */}
      {tab === "PAGOS" && (
        <div className="flex flex-col gap-4">
          {/* Filters — hidden when there is genuinely nothing to filter, but
              kept visible while a filter is active so a search that returns
              nothing can still be cleared. */}
          {(pagos.length > 0 || pagosFiltersActive) && (
            <div className="flex flex-col gap-3">
              {/* Search */}
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-text"
                  style={{ opacity: 0.5 }}
                />
                <input
                  type="text"
                  placeholder="Buscar por unidad"
                  value={pagosSearch}
                  onChange={(e) => setPagosSearch(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 pl-12 pr-4 text-sm text-text focus:outline-none focus:border-accent transition-all placeholder:text-text"
                />
              </div>

              {/* Estado filter */}
              <select
                value={pagosEstadoFilter}
                onChange={(e) =>
                  setPagosEstadoFilter(
                    e.target.value as "TODOS" | EstadoPago,
                  )
                }
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
              >
                <option value="TODOS">Todos los estados</option>
                <option value="PAGADO">Pagado</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="VENCIDO">Vencido</option>
                <option value="EN_DISPUTA">En Disputa</option>
              </select>
            </div>
          )}

          {/* Table / List */}
          {loadingPagos ? (
            <SkeletonRows />
          ) : pagos.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-8 border border-border text-center">
              <DollarSign
                size={40}
                className="mx-auto text-text mb-3"
                style={{ opacity: 0.4 }}
              />
              <p className="text-text font-medium">Sin pagos</p>
              <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                {pagosFiltersActive
                  ? "No se encontraron pagos con los filtros actuales."
                  : "Aún no hay pagos registrados."}
              </p>
            </div>
          ) : (
            <div className="liquid-glass rounded-3xl border border-border shadow-2xl overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-6 gap-3 px-6 py-3 bg-surface-2 border-b border-border text-[10px] font-black uppercase tracking-wider text-text">
                <span>Unidad</span>
                <span>Concepto</span>
                <span>Monto</span>
                <span>Estado</span>
                <span>Método</span>
                <span>Fecha Pago</span>
              </div>

              {pagos.map((p) => (
                <div
                  key={p.id}
                  className="md:grid md:grid-cols-6 gap-3 px-6 py-4 border-b border-border last:border-0 flex flex-col gap-2 hover:bg-text/5 transition-colors"
                >
                  {/* Unidad */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-text">
                      {p.unidad
                        ? `T${p.unidad.torre || "?"}-A${p.unidad.numero}`
                        : "—"}
                    </span>
                  </div>

                  {/* Concepto */}
                  <span className="text-xs text-text truncate">
                    {p.concepto}
                  </span>

                  {/* Monto */}
                  <span className="text-sm font-black text-text">
                    {COP(p.monto)}
                  </span>

                  {/* Estado badge */}
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full w-fit ${
                      ESTADO_BADGE[p.estado]?.classes ||
                      "bg-text/10 text-text"
                    }`}
                  >
                    {p.estado === "PENDIENTE" && <Clock size={10} />}
                    {p.estado === "PAGADO" && <CheckCircle2 size={10} />}
                    {p.estado === "VENCIDO" && <AlertCircle size={10} />}
                    {ESTADO_BADGE[p.estado]?.label || p.estado}
                  </span>

                  {/* Método */}
                  <span className="text-xs text-text">
                    {p.metodo ? METODO_LABEL[p.metodo] || p.metodo : "—"}
                  </span>

                  {/* Fecha pago */}
                  <span className="text-xs text-text">
                    {p.fechaPago ? fechaCol(p.fechaPago) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagosPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => fetchPagos(pagosPage - 1)}
                disabled={pagosPage <= 1}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 disabled:opacity-30 transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs text-text font-bold">
                {pagosPage} / {pagosPages}
              </span>
              <button
                onClick={() => fetchPagos(pagosPage + 1)}
                disabled={pagosPage >= pagosPages}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 disabled:opacity-30 transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* GASTOS SECTION */}
      {/* ============================================================ */}
      {tab === "GASTOS" && (
        <div className="flex flex-col gap-4">
          {/* Button on its own row above the chips — sharing a row inside the
              430px shell left no width for them and sliced them mid-word. */}
          <div className="flex flex-col gap-3">
            <button
              onClick={openNewGasto}
              className="flex items-center justify-center gap-2 w-full bg-success text-on-accent rounded-full shadow-lg shadow-success/30 px-5 py-3 text-sm font-bold active:scale-98 transition-transform"
            >
              <Plus size={18} />
              <span className="whitespace-nowrap">Registrar Gasto</span>
            </button>

            {/* Hidden when there is nothing to filter, but kept visible while a
                category is selected so an empty result can still be cleared. */}
            {(gastos.length > 0 || gastosCatFilter !== "TODOS") && (
              <div className="flex gap-2 overflow-x-auto pb-1 min-w-0">
                <button
                  onClick={() => setGastosCatFilter("TODOS")}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
                    gastosCatFilter === "TODOS"
                      ? "bg-info text-on-accent shadow-lg shadow-info/30"
                      : "bg-text/5 border border-border text-text hover:bg-text/10"
                  }`}
                >
                  Todos
                </button>
                {CAT_GASTO_OPTIONS.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setGastosCatFilter(cat)}
                    className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
                      gastosCatFilter === cat
                        ? "bg-info text-on-accent shadow-lg shadow-info/30"
                        : "bg-text/5 border border-border text-text hover:bg-text/10"
                    }`}
                  >
                    {CAT_GASTO_LABELS[cat]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* List */}
          {loadingGastos ? (
            <SkeletonRows />
          ) : filteredGastos.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-8 border border-border text-center">
              <Wallet
                size={40}
                className="mx-auto text-text mb-3"
                style={{ opacity: 0.4 }}
              />
              <p className="text-text font-medium">
                {gastosCatFilter !== "TODOS"
                  ? "Sin gastos en esta categoría"
                  : "No hay gastos registrados"}
              </p>
              <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                Registra el primer gasto usando el botón superior.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredGastos.map((g) => (
                <div
                  key={g.id}
                  className="liquid-glass rounded-3xl p-5 border border-border flex flex-col gap-3 group hover:border-accent/30 transition-all"
                >
                  {/* Top row: category + date + actions */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-info/10 border border-info/20 text-info text-[10px] font-bold uppercase tracking-wider">
                        {CAT_GASTO_LABELS[g.categoria] || g.categoria}
                      </span>
                      <span className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                        {fechaCol(g.fecha)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditGasto(g)}
                        className="w-8 h-8 rounded-lg bg-text/5 border border-border flex items-center justify-center text-text hover:bg-text/10 active:scale-95 transition-all"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setGastoToDelete(g.id)}
                        className="w-8 h-8 rounded-lg bg-text/5 border border-border flex items-center justify-center text-text hover:bg-danger/10 hover:border-danger/30 hover:text-danger active:scale-95 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-text leading-relaxed">
                    {g.descripcion}
                  </p>

                  {/* Bottom row: amount + provider */}
                  <div className="flex justify-between items-center pt-2 border-t border-border/50">
                    <span className="text-lg font-black text-text">
                      {COP(g.monto)}
                    </span>
                    {g.proveedor && (
                      <span className="text-xs text-text" style={{ opacity: 0.6 }}>
                        {g.proveedor}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MOROSIDAD SECTION */}
      {/* ============================================================ */}
      {tab === "MOROSIDAD" && (
        <div className="flex flex-col gap-4">
          {morosidad.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center">
                <AlertCircle size={20} className="text-danger" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text">
                  Unidades con saldo vencido
                </h3>
                <p className="text-xs text-text" style={{ opacity: 0.5 }}>
                  Ordenado de mayor a menor deuda
                </p>
              </div>
            </div>
          )}

          {loadingMorosidad ? (
            <SkeletonRows />
          ) : morosidad.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-8 border border-border text-center">
              <CheckCircle2
                size={40}
                className="mx-auto text-success mb-3"
              />
              <p className="text-text font-medium">
                ¡Todas las unidades están al día!
              </p>
              <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                No hay saldos vencidos registrados.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {morosidad.map((m, i) => (
                <div
                  key={m.unidadId}
                  className="liquid-glass rounded-3xl p-5 border border-border flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start">
                    {/* Unit info */}
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center text-sm font-black text-danger">
                        {i + 1}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-text">
                          {m.torre
                            ? `Torre ${m.torre} - Apto ${m.apto}`
                            : `Unidad ${m.apto}`}
                        </span>
                        <span className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                          {m.recibosVencidos} recibo
                          {m.recibosVencidos !== 1 ? "s" : ""} vencido
                          {m.recibosVencidos !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Debt amount */}
                    <span className="text-lg font-black text-danger">
                      {COP(m.totalAdeudado)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-danger"
                      style={{
                        width: `${Math.min(
                          100,
                          (Number(m.totalAdeudado) /
                            (Number(morosidad[0]?.totalAdeudado) || 1)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* GASTO MODAL (Create / Edit) */}
      {/* ============================================================ */}
      {showGastoModal && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={closeGastoModal}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[480px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
              <h3 className="text-lg font-bold text-text">
                {editingGastoId ? "Editar Gasto" : "Registrar Gasto"}
              </h3>
              <button
                onClick={closeGastoModal}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSaveGasto}
              className="flex flex-col gap-4"
            >
              {/* Categoría */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Categoría *
                </label>
                <select
                  value={gastoForm.categoria}
                  onChange={(e) =>
                    setGastoForm((prev) => ({
                      ...prev,
                      categoria: e.target.value as CatGasto,
                    }))
                  }
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                >
                  {CAT_GASTO_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {CAT_GASTO_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descripción */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Descripción *
                </label>
                <input
                  type="text"
                  required
                  value={gastoForm.descripcion}
                  onChange={(e) =>
                    setGastoForm((prev) => ({
                      ...prev,
                      descripcion: e.target.value,
                    }))
                  }
                  placeholder="Ej: Pago de vigilancia mes de junio"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
                />
              </div>

              {/* Monto */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Monto (COP) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={gastoForm.monto}
                  onChange={(e) =>
                    setGastoForm((prev) => ({
                      ...prev,
                      monto: e.target.value,
                    }))
                  }
                  placeholder="0"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
                />
              </div>

              {/* Proveedor + Fecha */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                    Proveedor
                  </label>
                  <input
                    type="text"
                    value={gastoForm.proveedor}
                    onChange={(e) =>
                      setGastoForm((prev) => ({
                        ...prev,
                        proveedor: e.target.value,
                      }))
                    }
                    placeholder="Nombre o razón social"
                    className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={gastoForm.fecha}
                    onChange={(e) =>
                      setGastoForm((prev) => ({
                        ...prev,
                        fecha: e.target.value,
                      }))
                    }
                    className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={savingGasto}
                className="w-full py-3.5 rounded-full bg-success text-on-accent font-bold text-sm shadow-lg shadow-success/30 active:scale-[0.98] transition-transform disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
              >
                {savingGasto ? (
                  <>
                    <Skeleton className="w-5 h-5 rounded-full" />
                    Guardando...
                  </>
                ) : editingGastoId ? (
                  "Guardar Cambios"
                ) : (
                  "Registrar Gasto"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DELETE GASTO CONFIRM MODAL */}
      {/* ============================================================ */}
      {gastoToDelete && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setGastoToDelete(null)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-danger/15 border border-danger/40 flex items-center justify-center">
                <Trash2 size={28} className="text-danger" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-info font-bold uppercase tracking-[0.2em]">
                  Eliminar Gasto
                </span>
                <h3 className="text-2xl font-display font-bold text-text">
                  ¿Estás seguro?
                </h3>
              </div>
              <p className="text-sm text-text leading-relaxed" style={{ opacity: 0.8 }}>
                Esta acción no se puede deshacer. El gasto se eliminará
                permanentemente.
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={() => setGastoToDelete(null)}
                  className="flex-1 py-4 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-sm hover:bg-text/10 active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingGasto}
                  onClick={confirmDeleteGasto}
                  className="flex-1 py-4 rounded-2xl bg-danger text-on-accent font-bold text-sm shadow-xl shadow-danger/20 active:scale-95 transition-all disabled:opacity-60"
                >
                  {deletingGasto ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

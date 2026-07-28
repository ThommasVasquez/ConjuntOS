"use client";

/**
 * INICIO DASHBOARD - CONJUNTOSAPP
 * Sincronización de datos reales del usuario y Panel de Notificaciones.
 */

import {
  ArrowRight, Bell, Building2, Calendar, Car, CreditCard, DollarSign,
  Megaphone, MessageSquare, MoreHorizontal, ChevronLeft, ShieldAlert,
  Search, SlidersHorizontal, ShoppingBag, User as UserIcon, Info,
  Users, Wrench, MapPin, BarChart3, Scale, CheckCircle, AlertTriangle, Clock,
  Video, FileText, Package
} from "lucide-react";

// Paleta pastel para las tarjetas de navegación (cicla por índice)
const CAT_STYLES = [
  { chip: "bg-emerald-500/15 text-emerald-500", bar: "bg-emerald-500" },
  { chip: "bg-blue-500/15 text-blue-500", bar: "bg-blue-500" },
  { chip: "bg-violet-500/15 text-violet-500", bar: "bg-violet-500" },
  { chip: "bg-orange-500/15 text-orange-500", bar: "bg-orange-500" },
];
import ProfileHeader from "@/components/shell/ProfileHeader";
import RoleSwitcher from "@/components/shell/RoleSwitcher";
import CelebrationModal from "@/components/modals/CelebrationModal";
import ContentActionModal from "@/components/modals/ContentActionModal";
import SearchModal from "@/components/search/SearchModal";
import AreaAdminDashboard from "@/components/sos/AreaAdminDashboard";
import { useEffect, useRef, useState, useCallback } from "react";

/** Solicitud de parqueadero de visitante que el inquilino debe aprobar/rechazar. */
interface SolicitudParqueaderoMia {
  id: string;
  celdaNumero?: string;
  detalle?: string;
  solicitanteNombre?: string;
}

/** Cobro de parqueadero retenido en portería, pendiente de aprobación del residente. */
interface CargoParqueaderoRetenido {
  id: string;
  celdaNumero?: string;
  placa?: string | null;
  minutosCobrados?: number;
  cerradoEn?: string | null;
  montoFinal?: number | string | null;
  montoActual?: number | string | null;
}
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import type {
  AnuncioDto,
  NotificacionDto,
  ProfileResponse,
  PagoDto,
  ReciboDto,
  PagosResponse,
  AdSpaceFeedDto,
  VisitaDto,
} from "@/lib/api/types";
import { useRouter } from "next/navigation";
import { getNotifTarget } from "@/lib/notif-routing";
import { estaEnSesion } from "@/lib/asamblea";
import { gsap } from "gsap";
import Image from "next/image";
import { toast } from "sonner";
import { useWsSubscription } from "@/hooks/useWebSocket";

function HomeResidente() {
  const router = useRouter();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [notificaciones, setNotificaciones] = useState<NotificacionDto[]>([]);
  const [showCelebration, setShowCelebration] = useState<NotificacionDto | null>(null);
  const [selectedFeedItem, setSelectedFeedItem] = useState<AnuncioDto | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [financialData, setFinancialData] = useState<{ totalDebt: number; pagos: PagoDto[]; recibos: ReciboDto[] }>({
    totalDebt: 0,
    pagos: [],
    recibos: []
  });

  const categories = [
    { title: "Citofonía", icon: <UserIcon size={20}/>, desc: "Comunicación", path: "/citofonia" },
    { title: "Pagos", icon: <CreditCard size={20}/>, desc: "Mis pagos", path: "/pagos" },
    { title: "Parqueo", icon: <Car size={20}/>, desc: "Mis vehículos", path: "/parqueadero" },
    { title: "Reservas", icon: <Calendar size={20}/>, desc: "Áreas comunes", path: "/reservas" },
    { title: "Cartelera", icon: <Megaphone size={20}/>, desc: "Anuncios", path: "/cartelera" },
    { title: "Encuestas", icon: <BarChart3 size={20}/>, desc: "Participa", path: "/encuestas" },
    { title: "Documentos", icon: <FileText size={20}/>, desc: "Gestión documental", path: "/documentos" },
    { title: "PQRS", icon: <MessageSquare size={20}/>, desc: "Solicitudes", path: "/pqrs" },
    { title: "Inmuebles", icon: <Building2 size={20}/>, desc: "Propiedades", path: "/inmobiliaria" },
    { title: "Clasificados", icon: <ShoppingBag size={20}/>, desc: "Compra y venta", path: "/clasificados" },
    { title: "Asistente", icon: <Scale size={20}/>, desc: "Normativa", path: "/asistente" },
  ];

  const [anuncios, setAnuncios] = useState<AnuncioDto[]>([]);
  const [ads, setAds] = useState<AdSpaceFeedDto[]>([]);
  const [isLoadingAnuncios, setIsLoadingAnuncios] = useState(true);
  const [userData, setUserData] = useState<ProfileResponse | null>(null);
  const [activeAsamblea, setActiveAsamblea] = useState<{ id: string; titulo: string; descripcion?: string } | null>(null);

  const fetchAnuncios = useCallback(async () => {
    try {
      setIsLoadingAnuncios(true);
      const data = await api.get<AnuncioDto[]>('/anuncios');
      setAnuncios(data);
    } catch {

    } finally {
      setIsLoadingAnuncios(false);
    }
  }, []);

  const fetchAds = useCallback(async () => {
    try {
      const data = await api.get<AdSpaceFeedDto[]>('/ad-spaces/active');
      setAds(data);
    } catch { /* silently ignore */ }
  }, []);

  const fetchNotificaciones = useCallback(async () => {
    try {
      const data = await api.get<NotificacionDto[]>('/notificaciones');
      setNotificaciones(data.filter((n) => !n.leida));
    } catch {
      // silently ignore
    }
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const data = await api.get<ProfileResponse>('/usuarios/me/profile');
      setUserData(data);
    } catch {

    }
  }, []);

  // Aprobaciones de parqueadero de visitante que este residente (inquilino) debe
  // aprobar o rechazar. Se muestran como notificación destacada en el inicio.
  const [solicitudesParqueadero, setSolicitudesParqueadero] = useState<SolicitudParqueaderoMia[]>([]);
  const [busyAprob, setBusyAprob] = useState<string | null>(null);

  const fetchSolicitudesParqueadero = useCallback(async () => {
    try {
      const data = await api.get<SolicitudParqueaderoMia[]>('/parqueadero/solicitudes/mias');
      setSolicitudesParqueadero(data ?? []);
    } catch { /* no aplica / sin permiso */ }
  }, []);

  // Cobros de parqueadero RETENIDOS: el vehículo de la visita está en portería
  // y NO puede salir hasta que este residente apruebe (o rechace) el cargo.
  // Es la alerta más urgente del inicio.
  const [cargosRetenidos, setCargosRetenidos] = useState<CargoParqueaderoRetenido[]>([]);

  const fetchCargosRetenidos = useCallback(async () => {
    try {
      const data = await api.get<CargoParqueaderoRetenido[]>('/parqueadero/cargos/mios');
      setCargosRetenidos(data ?? []);
    } catch { /* no aplica / sin permiso */ }
  }, []);

  const resolverCargoRetenido = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setBusyAprob(id);
    try {
      await api.post(`/parqueadero/cargos/${id}/${accion}`, {});
      toast.success(
        accion === 'aprobar'
          ? "Cobro aprobado. El vehículo ya puede salir y el cargo quedó en tus pagos."
          : "Cobro rechazado. El visitante deberá pagar en portería para salir.",
        { duration: 5000 },
      );
      fetchCargosRetenidos();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "No se pudo procesar");
    } finally {
      setBusyAprob(null);
    }
  };

  // Visitas PENDIENTES de aprobación: visitas no programadas registradas por vigilancia
  // que el residente debe aprobar o rechazar para que el visitante pueda ingresar.
  const [visitasPendientes, setVisitasPendientes] = useState<VisitaDto[]>([]);

  const fetchVisitasPendientes = useCallback(async () => {
    try {
      const data = await api.get<{ visitas: VisitaDto[]; paquetes: unknown[] }>("/comunicaciones");
      const pendientes = (data.visitas || []).filter(v => v.estado === 'PENDIENTE');
      setVisitasPendientes(pendientes);
    } catch { /* no aplica / sin datos */ }
  }, []);

  const resolverVisitaPendiente = async (id: string, aprobada: boolean) => {
    setBusyAprob(id);
    try {
      await api.put(`/visitas/${id}/aprobar`, { aprobada });
      toast.success(aprobada ? "Visita aprobada. El visitante puede ingresar." : "Visita rechazada.");
      fetchVisitasPendientes();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "No se pudo procesar");
    } finally {
      setBusyAprob(null);
    }
  };

  const resolverSolicitudParqueadero = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setBusyAprob(id);
    try {
      await api.post(`/parqueadero/solicitudes/${id}/inquilino/${accion}`, {});
      toast.success(accion === 'aprobar' ? "Parqueadero de visitante aprobado." : "Solicitud rechazada.");
      fetchSolicitudesParqueadero();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "No se pudo procesar");
    } finally {
      setBusyAprob(null);
    }
  };

  const markAsRead = async (id: string) => {
      try {
          await api.put('/notificaciones/leidas', { ids: [id] });
          setNotificaciones(prev => prev.filter(n => n.id !== id));
      } catch {
          // silently ignore
      }
  };

  const fetchFinance = useCallback(async () => {
    try {
      const data = await api.get<PagosResponse>('/pagos');
      const pagos = data?.pagos ?? [];
      const recibos = data?.recibos ?? [];
      const totalDebt = pagos
        .filter((p: PagoDto) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO')
        .reduce((sum: number, p: PagoDto) => sum + parseFloat(p.monto || '0'), 0);
      setFinancialData({ totalDebt, pagos, recibos });
    } catch {

    }
  }, []);

  // Real-time WebSocket subscriptions
  useWsSubscription('notification', () => fetchNotificaciones());
  useWsSubscription('pago', () => fetchFinance());
  useWsSubscription('anuncio', () => fetchAnuncios());
  useWsSubscription('parqueadero', () => { fetchSolicitudesParqueadero(); fetchCargosRetenidos(); });
  useWsSubscription('visita', () => fetchVisitasPendientes());

  const fetchActiveAsamblea = useCallback(async () => {
    try {
      const data = await api.get<{ id: string; activa: boolean; sessionState?: unknown; titulo: string; descripcion?: string }>('/asambleas/activa/session');
      // Only surface the "en vivo" card once the admin has actually started the
      // session — a created-but-scheduled assembly has nothing to join yet.
      if (data?.id && estaEnSesion(data)) {
        setActiveAsamblea({ id: data.id, titulo: data.titulo, descripcion: data.descripcion });
      } else {
        setActiveAsamblea(null);
      }
    } catch {
      setActiveAsamblea(null);
    }
  }, []);

  useWsSubscription('asamblea', () => fetchActiveAsamblea());

  useEffect(() => {
    if (user) {
      fetchNotificaciones();
      fetchFinance();
      fetchUserData();
      fetchAnuncios();
      fetchAds();
      fetchActiveAsamblea();
      fetchSolicitudesParqueadero();
      fetchCargosRetenidos();
      fetchVisitasPendientes();
    }
    // Animate only once when user loads. Do NOT use ctx.revert() on cleanup —
    // conditional React renders may have moved DOM nodes since the animation
    // started, causing "removeChild" errors. Just kill the tweens instead.
    if (!user) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-home", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.2 });
    }, containerRef);
    return () => { gsap.killTweensOf(".fade-up-home"); };
  }, [user]);

  return (
    <div ref={containerRef} className="flex flex-col gap-8 p-6 overflow-x-hidden pt-16 pb-32">
      <RoleSwitcher />
      {showCelebration && (
        <CelebrationModal 
          tipo={showCelebration.tipo as "APROBACION" | "SISTEMA"}
          titulo={showCelebration.titulo}
          mensaje={showCelebration.mensaje}
          onClose={() => {
            markAsRead(showCelebration.id);
            setShowCelebration(null);
          }}
        />
      )}

      {/* 🏛️ UNIFIED HEADER GROUP */}
      <header className="fade-up-home flex flex-col gap-6 relative z-50">
        <ProfileHeader />
        
        {/* SEARCH BAR */}
        <div className="flex gap-3">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="relative flex-1 group text-left"
          >
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-500 transition-colors" />
            <div className="w-full bg-primary-light border border-border rounded-[24px] py-4 pl-14 pr-6 text-sm text-text-muted hover:border-blue-500/30 transition-all shadow-sm cursor-pointer select-none">
              Buscar o preguntar algo...
            </div>
          </button>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-14 h-14 rounded-[22px] bg-primary-light border border-border flex items-center justify-center text-blue-500 hover:border-blue-500/30 transition-all active:scale-95 shadow-sm"
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </header>

      {activeAsamblea && (
        <div 
          onClick={() => router.push('/asamblea')}
          className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[90px] shadow-2xl border border-accent/30 group cursor-pointer hover:border-accent/50 transition-all liquid-glass-card"
        >
          <div className="absolute inset-0 p-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center border border-accent/40 animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full bg-accent" />
              </div>
              <div>
                <span className="text-[9px] text-accent font-bold uppercase tracking-widest block">
                  Sesión en Vivo
                </span>
                <h3 className="text-sm font-display font-bold text-text tracking-tight">
                  {activeAsamblea.titulo}
                </h3>
                {activeAsamblea.descripcion && (
                  <p className="text-text text-[9px] mt-0.5 line-clamp-1">{activeAsamblea.descripcion}</p>
                )}
              </div>
            </div>
            <div className="bg-accent text-on-accent text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-1">
              Entrar <ArrowRight size={10} />
            </div>
          </div>
        </div>
      )}

      {/* SEARCH MODAL */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        context={{
          userName: userData?.nombre || user?.nombre || undefined,
          totalDebt: financialData.totalDebt,
          pagos: financialData.pagos.map(p => ({ concepto: p.concepto, monto: Number(p.monto), estado: p.estado })),
          anuncios: anuncios.map(a => ({ titulo: a.titulo, contenido: a.contenido }))
        }}
      />

      {/* 🚨 COBROS RETENIDOS: el vehículo de la visita NO sale hasta aprobar */}
      {cargosRetenidos.length > 0 && (
        <section className="fade-up-home flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
            </span>
            <h2 className="text-text font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert size={14} className="text-danger" /> Cobro por aprobar — vehículo retenido
            </h2>
          </div>
          <p className="text-[11px] text-text/70 px-1 -mt-1">
            El vehículo de tu visita está retenido en portería y <b>no puede salir</b> hasta que decidas. Aprueba para cargar el cobro a tu apartamento, o recházalo (el visitante pagará en portería).
          </p>
          {cargosRetenidos.map((c) => (
            <div key={c.id} className="liquid-glass-card rounded-[28px] p-5 border border-danger/40 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-text">Celda {c.celdaNumero}</span>
                  {c.placa && <span className="text-xs text-text/80 font-mono">Placa {c.placa}</span>}
                  <span className="text-[11px] text-text/60 mt-1">
                    {c.minutosCobrados} min cobrables{c.cerradoEn ? ` · ${new Date(c.cerradoEn).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[10px] text-text/60 uppercase tracking-wider font-bold">Monto</span>
                  <span className="text-2xl font-display font-bold text-warning">
                    ${Number(c.montoFinal || c.montoActual || 0).toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  disabled={busyAprob === c.id}
                  onClick={() => resolverCargoRetenido(c.id, 'rechazar')}
                  className="flex-1 py-3 rounded-2xl bg-text/5 border border-border text-text font-bold text-sm hover:bg-danger/10 hover:border-danger/40 active:scale-95 transition-all disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  disabled={busyAprob === c.id}
                  onClick={() => resolverCargoRetenido(c.id, 'aprobar')}
                  className="flex-1 py-3 rounded-2xl bg-success text-white font-bold text-sm shadow-xl shadow-success/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {busyAprob === c.id ? "Procesando..." : "Aprobar cobro"}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 🅿️ APROBACIONES DE PARQUEADERO DE VISITANTE (acción del inquilino) */}
      {solicitudesParqueadero.length > 0 && (
        <section className="fade-up-home flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
            </span>
            <h2 className="text-text font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <Car size={14} className="text-warning" /> Aprobación de Estacionamiento
            </h2>
          </div>
          <p className="text-[11px] text-text/70 px-1 -mt-1">
            Te solicitan asignarte un parqueadero de visitante. Tu aprobación es obligatoria.
          </p>
          {solicitudesParqueadero.map((s) => (
            <div key={s.id} className="liquid-glass-card rounded-[28px] p-5 border border-warning/40 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-lg font-bold text-text">Celda {s.celdaNumero}</span>
                {s.detalle && <span className="text-xs text-text/80">{s.detalle}</span>}
                {s.solicitanteNombre && <span className="text-[11px] text-text/60 mt-1">Solicitado por {s.solicitanteNombre}</span>}
              </div>
              <div className="flex gap-3">
                <button
                  disabled={busyAprob === s.id}
                  onClick={() => resolverSolicitudParqueadero(s.id, 'rechazar')}
                  className="flex-1 py-3 rounded-2xl bg-text/5 border border-border text-text font-bold text-sm hover:bg-danger/10 hover:border-danger/40 active:scale-95 transition-all disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  disabled={busyAprob === s.id}
                  onClick={() => resolverSolicitudParqueadero(s.id, 'aprobar')}
                  className="flex-1 py-3 rounded-2xl bg-success text-white font-bold text-sm shadow-xl shadow-success/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {busyAprob === s.id ? "Procesando..." : "Aprobar"}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 🚪 VISITAS PENDIENTES DE APROBACIÓN — visitas no programadas que requieren acción del residente */}
      {visitasPendientes.length > 0 && (
        <section className="fade-up-home flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <h2 className="text-text font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <UserIcon size={14} className="text-amber-400" /> Visitas por aprobar — ingreso bloqueado
            </h2>
          </div>
          <p className="text-[11px] text-text/70 px-1 -mt-1">
            Estas visitas fueron registradas por el vigilante. El visitante <b>NO puede ingresar</b> hasta que las apruebes.
          </p>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap items-stretch">
            {visitasPendientes.map((v) => (
              <div key={v.id} className="min-w-[290px] max-w-[320px] liquid-glass-card rounded-[28px] p-5 border border-amber-500/40 flex flex-col gap-3 shrink-0">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/15 flex items-center justify-center border border-amber-500/30 shrink-0 mt-0.5">
                    <UserIcon size={20} className="text-amber-400" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-base font-bold text-text truncate">{v.nombre}</span>
                    {v.documento && <span className="text-[10px] text-text/50 font-mono truncate">{v.documento}</span>}
                    <span className="text-[10px] text-text/50 flex items-center gap-1">
                      <Clock size={10} /> {new Date(v.fecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full w-fit ${v.tipo === 'VEHICULAR' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'bg-text/10 text-text border border-text/20'}`}>
                      {v.tipo}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-auto">
                  <button
                    disabled={busyAprob === v.id}
                    onClick={() => resolverVisitaPendiente(v.id, false)}
                    className="flex-1 py-2.5 rounded-2xl bg-text/5 border border-border text-text font-bold text-xs hover:bg-danger/10 hover:border-danger/40 active:scale-95 transition-all disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    disabled={busyAprob === v.id}
                    onClick={() => resolverVisitaPendiente(v.id, true)}
                    className="flex-1 py-2.5 rounded-2xl bg-success text-white font-bold text-xs shadow-xl shadow-success/20 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {busyAprob === v.id ? "Procesando..." : "Aprobar ingreso"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 🧭 CATEGORÍAS PREMIUM */}
      <section className="fade-up-home flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
           <h2 className="text-xs font-bold uppercase tracking-widest text-text">Navegación rápida</h2>
           <span className="text-[11px] font-bold text-blue-500 flex items-center gap-1">Ver todo <ArrowRight size={12} /></span>
        </div>
        <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-1 -mx-1">
          {categories.map((cat, idx) => {
            const s = CAT_STYLES[idx % CAT_STYLES.length];
            return (
              <div
                key={idx}
                onClick={() => router.push(cat.path)}
                className="min-w-[116px] p-4 rounded-[24px] bg-primary-light border border-border shadow-sm flex flex-col items-center gap-2.5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${s.chip}`}>{cat.icon}</div>
                <div className="text-center w-full">
                  <span className="text-[11px] font-bold text-text uppercase block truncate tracking-tight">{cat.title}</span>
                  <span className="text-[9px] text-text-muted block truncate">{cat.desc}</span>
                </div>
                <span className={`h-1 w-8 rounded-full ${s.bar}`} />
              </div>
            );
          })}
        </div>
      </section>
 
      {/* NOTIFICATIONS BANNER */}
      {notificaciones.length > 0 && (
          <section className="fade-up-home flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                  <h2 className="text-text font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                      <Bell size={14} className="text-blue-500 animate-pulse" /> Avisos Recientes
                  </h2>
                  <span className="text-blue-500 text-[10px] font-bold">{notificaciones.length} nuevos</span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
                  {notificaciones.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => { markAsRead(n.id); router.push(getNotifTarget(n, user?.rol)); }}
                        className="min-w-[280px] bg-primary-light border border-border rounded-[22px] p-4 flex gap-3 cursor-pointer hover:border-blue-500/30 transition-all shadow-sm group"
                      >
                          <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                              <Info size={18} />
                          </div>
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <div className="flex justify-between items-start">
                                  <span className="text-[10px] font-black text-blue-500 uppercase tracking-wide bg-blue-500/10 px-2 py-0.5 rounded-md">{n.tipo}</span>
                                  <div className="w-2 h-2 rounded-full bg-blue-500 group-hover:scale-150 transition-transform shrink-0" />
                              </div>
                              <h3 className="text-text text-sm font-bold truncate">{n.titulo}</h3>
                              <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">{n.mensaje}</p>
                          </div>
                      </div>
                  ))}
              </div>
          </section>
      )}

      {/* WALLET HERO */}
      <section
        className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[120px] shadow-xl shadow-[#0F2137]/25 group overflow-hidden transition-all"
      >
        <div className="absolute inset-0 bg-linear-to-br from-[#16304F] via-[#0F2137] to-[#0A1626]" />
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/15">
                 <CreditCard size={14} className="text-blue-300" />
               </div>
               <span className="text-[10px] text-white/80 font-bold uppercase tracking-widest">Mi Cuota</span>
            </div>
            {financialData.totalDebt > 0 ? (
              <div className="px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-[10px] text-amber-300 font-bold uppercase animate-pulse">Pendiente</div>
            ) : (
              <div className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] text-white font-bold uppercase flex items-center gap-1.5">
                Paz y Salvo <CheckCircle size={12} className="text-emerald-400" />
              </div>
            )}
          </div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-display font-bold text-white tracking-tight">
                $ {financialData.totalDebt.toLocaleString()}
              </h2>
              <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${financialData.totalDebt > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                {financialData.totalDebt > 0 ? "Saldo pendiente" : (<><CheckCircle size={11} /> Al día con tus pagos</>)}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); router.push('/pagos'); }}
              className="bg-white text-[#0F2137] text-[11px] font-bold px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all relative z-20 flex items-center gap-1"
            >
              {financialData.totalDebt > 0 ? "Pagar Ahora" : "Ver Estado"} <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* SOCIAL FEED */}
      <section className="flex flex-col gap-6">
         <div className="flex justify-between items-end mb-1 fade-up-home">
           <h3 className="text-text font-display text-lg font-bold tracking-tight">Novedades</h3>
           <span className="text-text text-[10px] font-bold uppercase tracking-widest">Hoy</span>
         </div>
         {isLoadingAnuncios ? (
           <div className="py-10 flex flex-col items-center justify-center gap-3">
             <div className="w-8 h-8 rounded-full bg-text/10 animate-pulse" />
             <span className="text-[10px] font-bold text-text uppercase tracking-widest animate-pulse">Cargando novedades...</span>
           </div>
         ) : anuncios.length === 0 ? (
           <div className="py-10 flex flex-col items-center justify-center gap-3">
             <Megaphone size={32} className="text-text" />
             <span className="text-[10px] font-bold text-text uppercase tracking-widest">Sin novedades por ahora</span>
           </div>
         ) : (
          anuncios.map((anuncio, idx) => {
            const items = [
              <div key={anuncio.id} onClick={() => setSelectedFeedItem(anuncio)} className="cursor-pointer">
                <AnuncioCard anuncio={anuncio} />
              </div>
            ];
            // Insertar ad cada 3 anuncios
            if ((idx + 1) % 3 === 0 && ads.length > 0) {
              const ad = ads[Math.floor(idx / 3) % ads.length];
              items.push(<BannerAdCard key={`ad-${ad.id}-${idx}`} ad={ad} />);
            }
            return items;
          })
        )}
       </section>

       {/* FOOTER */}
       <section className="fade-up-home flex flex-col items-center gap-1 py-4">
          <span className="text-[10px] font-black text-text uppercase tracking-[0.35em]">Conjuntos v3.2 ⚡</span>
          <span className="text-[9px] text-text-muted">Powered by <span className="text-blue-500 font-bold">EnergySoftmedia®</span></span>
       </section>

       {selectedFeedItem && (
          <ContentActionModal 
            item={{
              title: selectedFeedItem.titulo,
              content: selectedFeedItem.contenido,
              image: selectedFeedItem.imagenUrl ?? undefined,
              category: selectedFeedItem.tipo,
              type: 'POST',
            }} 
            userData={userData ?? {}}
            onClose={() => setSelectedFeedItem(null)} 
          />
       )}
    </div>
  );
}

function AnuncioCard({ anuncio }: { anuncio: AnuncioDto }) {
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Hace un momento';
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  };

  return (
    <div className="fade-up-home liquid-glass-card rounded-[32px] flex flex-col shadow-2xl border-t border-border/20 transition-all active:scale-[0.98] relative overflow-hidden">
      <div className="p-5 flex justify-between items-center relative z-10">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center border border-border font-bold text-xs bg-info text-white">
               {anuncio.tipo?.[0] || 'A'}
            </div>
            <div>
               <h4 className="text-sm font-bold text-text leading-none mb-1">{anuncio.tipo}</h4>
               <p className="text-[10px] text-text flex items-center gap-1 font-medium">
                  {timeAgo(anuncio.publicadoEn)} {anuncio.fijado && '• Fijado'}
               </p>
            </div>
         </div>
         <MoreHorizontal size={18} className="text-text" />
      </div>

      <div className="px-5 pb-2">
         <h2 className="text-xl font-display font-semibold text-text mb-2 leading-tight">{anuncio.titulo}</h2>
         <p className="text-sm text-text leading-relaxed font-normal mb-4 line-clamp-3">{anuncio.contenido}</p>
      </div>

      {anuncio.imagenUrl && (
         <div className="relative h-56 w-full group overflow-hidden">
            <Image src={anuncio.imagenUrl} alt={anuncio.titulo} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" unoptimized />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-60" />
         </div>
      )}

      <div className="p-4 flex items-center justify-between border-t border-border bg-surface/40 backdrop-blur-xl mt-auto rounded-b-[32px]">
         <span className="text-text text-[11px] flex items-center gap-1.5 font-semibold uppercase tracking-wider">
            <Megaphone size={12} /> {anuncio.tipo}
         </span>
         <span className="text-accent text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-widest">
            Ver más <ChevronLeft size={14} className="rotate-180" />
         </span>
      </div>
    </div>
  );
}

function BannerAdCard({ ad }: { ad: AdSpaceFeedDto }) {
  const handleClick = () => {
    api.post(`/ad-spaces/${ad.id}/click`, {}).catch(() => {});
    if (ad.linkUrl) window.open(ad.linkUrl, "_blank");
  };

  // Registrar impresión al montar
  useEffect(() => {
    api.post(`/ad-spaces/${ad.id}/impress`, {}).catch(() => {});
  }, [ad.id]);

  return (
    <div
      onClick={handleClick}
      className="fade-up-home cursor-pointer rounded-[28px] overflow-hidden border border-accent/20 relative bg-surface-2"
    >
      {ad.imagenUrl ? (
        <Image
          src={ad.imagenUrl}
          alt={ad.nombre}
          width={400}
          height={200}
          className="w-full h-48 object-cover"
          unoptimized
        />
      ) : (
        <div className="w-full h-32 bg-gradient-to-r from-accent/20 to-accent/5 flex items-center justify-center">
          <span className="text-text/40 text-sm">{ad.nombre}</span>
        </div>
      )}
      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">
        Publicidad
      </div>
      {ad.empresa && (
        <div className="p-3 text-center text-[10px] text-text/60 bg-surface-2">
          {ad.empresa}
        </div>
      )}
    </div>
  );
}

function HomeVigilante() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      <div className="liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
        <h2 className="text-2xl font-bold text-text mb-2">Central de Guardia</h2>
        <p className="text-text text-sm mb-6">Módulo de control de acceso y paquetería.</p>
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => router.push('/control-visitas')}
            className="w-full py-4 px-5 rounded-2xl bg-accent text-primary text-xs font-black uppercase tracking-widest text-center shadow-lg shadow-accent/20 cursor-pointer active:scale-98 transition-transform"
          >
            Registrar Visita
          </button>
          <button 
            onClick={() => router.push('/paqueteria')}
            className="w-full py-4 px-5 rounded-2xl bg-text/5 hover:bg-text/10 border border-border/40 text-center text-xs font-bold text-text cursor-pointer active:scale-98 transition-all"
          >
            Recepción de Envíos
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeEstacionamiento() {
  const router = useRouter();
  // Mirrors ParqueaderoStatsDto in backend/api/src/domains/parqueadero/dto.rs:199 —
  // the percentage field is `porcentajeOcupacion`, not `ocupacion`.
  const [stats, setStats] = useState({ porcentajeOcupacion: 0, libres: 0, ocupados: 0 });

  useEffect(() => {
    api.get<{ porcentajeOcupacion: number; libres: number; ocupados: number }>('/parqueadero/stats')
      .then((data) => setStats({
        porcentajeOcupacion: data.porcentajeOcupacion ?? 0,
        libres: data.libres ?? 0,
        ocupados: data.ocupados ?? 0,
      }))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      <button
        onClick={() => router.push("/mapa-parqueadero")}
        className="rounded-[28px] p-5 bg-primary-light border border-border shadow-sm hover:shadow-md active:scale-98 transition-all text-left flex items-center gap-4 group"
      >
        <span
          className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)', color: 'var(--color-info)' }}
        >
          <Car size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-[9px] font-black uppercase tracking-wider block mb-0.5" style={{ color: 'var(--color-info)' }}>
            Control Operativo
          </span>
          <span className="block text-base font-display font-bold leading-tight text-text">Mapa de Parqueaderos</span>
          <span className="block text-text/55 text-[11px] mt-0.5 leading-snug">
            Celdas libres, ingresos/salidas y rondas.
          </span>
        </span>
        <ArrowRight size={18} style={{ color: 'var(--color-info)' }} className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* Estadísticas de Ocupación */}
      <div className="rounded-[28px] p-6 bg-primary-light border border-border shadow-sm">
        <h3 className="text-base font-bold text-text mb-4">Estado del Parqueadero</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: `${stats.porcentajeOcupacion}%`, label: 'Ocupación', hex: 'var(--color-info)' },
            { value: String(stats.libres), label: 'Libres', hex: 'var(--color-success)' },
            { value: String(stats.ocupados), label: 'Ocupados', hex: 'var(--color-warning)' },
          ].map((s) => (
            <div key={s.label} className="bg-surface-2 border border-border/40 rounded-2xl p-4 text-center min-w-0">
              {/* truncate on the value too — an unexpected string used to spill
                  across the neighbouring tiles instead of being clipped. */}
              <span className="block text-2xl font-black truncate" style={{ color: s.hex }}>{s.value}</span>
              <p className="text-[9px] text-text/55 uppercase font-bold mt-1 truncate">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Same inline-style approach as ADMIN_TILES below — see the note there.
const CONSEJO_TILES = [
  { href: '/admin-finanzas', icon: DollarSign, title: 'Finanzas', desc: 'Cobros y reportes consolidados', hex: 'var(--color-success)' },
  { href: '/cartelera', icon: Building2, title: 'Cartelera', desc: 'Circulares y anuncios generales', hex: 'var(--color-info)' },
  { href: '/encuestas', icon: BarChart3, title: 'Encuestas', desc: 'Crear y ver resultados en vivo', hex: '#14b8a6' },
] as const;

function HomeConsejo() {
  const router = useRouter();
  const [stats, setStats] = useState({ recaudoMes: '0', reservasPendientes: 0 });

  useEffect(() => {
    api.get<{ recaudoMes: string; reservasPendientes: number }>('/admin/stats')
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      
      <div className="rounded-[28px] p-6 bg-primary-light border border-border shadow-sm flex items-start gap-3">
        <span
          className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)', color: 'var(--color-info)' }}
        >
          <Scale size={22} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-text leading-tight">Mesa de Monitoreo</h2>
          <p className="text-text/55 text-[11px] leading-snug mt-1">
            Consejo de Administración (Órgano Consultor Ley 675/2001)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CONSEJO_TILES.map(({ href, icon: Icon, title, desc, hex }) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="group h-[132px] p-3.5 rounded-[20px] bg-primary-light border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer text-left flex flex-col"
          >
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${hex}1a`, color: hex }}
            >
              <Icon size={20} />
            </span>
            <span className="mt-auto block">
              <span className="block text-[13px] font-bold text-text leading-tight mb-0.5">{title}</span>
              <span className="flex items-end justify-between gap-1">
                <span className="text-[10px] text-text/55 leading-snug">{desc}</span>
                <ArrowRight
                  size={13}
                  style={{ color: hex }}
                  className="shrink-0 group-hover:translate-x-0.5 transition-transform"
                />
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Resumen Agregado */}
      <div className="rounded-[28px] p-6 bg-primary-light border border-border shadow-sm">
        <h3 className="text-base font-bold text-text mb-4">Informes de Gestión</h3>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center gap-3 bg-surface-2 p-4 rounded-2xl border border-border/40">
            <span className="text-[11px] text-text/55 uppercase font-bold min-w-0">Recaudación General</span>
            <span className="text-sm font-black shrink-0" style={{ color: 'var(--color-success)' }}>
              ${Number(stats.recaudoMes || 0).toLocaleString()} COP
            </span>
          </div>
          <div className="flex justify-between items-center gap-3 bg-surface-2 p-4 rounded-2xl border border-border/40">
            <span className="text-[11px] text-text/55 uppercase font-bold min-w-0">Novedades / Solicitudes</span>
            <span className="text-sm font-black shrink-0" style={{ color: 'var(--color-warning)' }}>
              {stats.reservasPendientes} Pendientes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Colors are inline styles, not Tailwind classes, so every chip renders its
// tint regardless of which utilities the CSS build happens to have generated.
// `${hex}1a` is the same 10% alpha as a `/10` class.
const ADMIN_TILES = [
  { href: '/admin-residentes', icon: Users, title: 'Residentes', desc: 'Gestionar unidades', hex: 'var(--color-success)' },
  { href: '/citofonia', icon: UserIcon, title: 'Citofonía', desc: 'Llamar a unidades', hex: 'var(--color-info)' },
  { href: '/admin-novedades', icon: Building2, title: 'Novedades', desc: 'Anuncios y trámites', hex: 'var(--color-info)' },
  { href: '/admin-pqrs', icon: Wrench, title: 'Solicitudes', desc: 'PQRS y servicios', hex: 'var(--color-warning)' },
  { href: '/admin-areas', icon: MapPin, title: 'Áreas', desc: 'Espacios comunes', hex: '#f43f5e' },
  { href: '/encuestas', icon: BarChart3, title: 'Encuestas', desc: 'Crear y ver resultados', hex: '#14b8a6' },
  { href: '/comite-convivencia', icon: Scale, title: 'Comité', desc: 'Convivencia y actas', hex: 'var(--color-info)' },
  { href: '/admin-documentos', icon: FileText, title: 'Documentos', desc: 'Gestión documental', hex: 'var(--color-warning)' },
  { href: '/reservas', icon: Calendar, title: 'Reservas', desc: 'Áreas comunes', hex: 'var(--color-success)' },
] as const;

const ADMIN_SHORTCUTS = [
  { href: '/admin-finanzas', icon: DollarSign, title: 'Finanzas y Cartera', desc: 'Facturación, pagos y cartera', hex: 'var(--color-success)' },
  { href: '/admin-parqueadero', icon: Car, title: 'Control de Parqueaderos', desc: 'Asignación y control de espacios', hex: 'var(--color-info)' },
] as const;

function HomeAdmin() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.rol;
  const [activeAsamblea, setActiveAsamblea] = useState<{ id: string; titulo: string; descripcion?: string; enSesion: boolean } | null>(null);
  // Gates the card so it does not flash "Crear asamblea" before the fetch lands.
  const [asambleaLoaded, setAsambleaLoaded] = useState(false);

  useEffect(() => {
    api.get<{ id: string; activa: boolean; sessionState?: unknown; titulo: string; descripcion?: string }>('/asambleas/activa/session')
      .then((data) => {
        // Unlike the resident card, a scheduled assembly still shows here — it
        // is the admin who has to open the panel and start the session.
        if (data?.id && data?.activa) {
          setActiveAsamblea({
            id: data.id,
            titulo: data.titulo,
            descripcion: data.descripcion,
            enSesion: estaEnSesion(data),
          });
        }
      })
      .catch(() => {})
      .finally(() => setAsambleaLoaded(true));
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      
      {/* SUPER ADMIN SPECIAL CARD */}
      {role === "SUPER_ADMIN" && (
        <div 
          onClick={() => router.push('/superadmin')}
          className="w-full liquid-glass-card rounded-[28px] p-6 border border-border shadow-2xl text-text cursor-pointer hover:border-accent/40 transition-all flex justify-between items-center group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Building2 size={22} />
            </div>
            <div>
              <span className="text-[9px] text-accent font-black uppercase tracking-widest block mb-0.5">Modulo de Plataforma</span>
              <h3 className="text-lg font-display font-bold leading-tight text-text">Panel SuperAdmin</h3>
              <p className="text-text text-xs mt-0.5">Registrar copropiedades y gestionar conjuntos.</p>
            </div>
          </div>
          <button className="bg-accent text-on-accent text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1 cursor-pointer">
            Gestionar <ArrowRight size={10} />
          </button>
        </div>
      )}

      {/* The panel is the only way to create an assembly, so this card has to
          show even when there is none — otherwise the admin has no route to it. */}
      {asambleaLoaded && (
        <div
          onClick={() => router.push('/admin-asamblea')}
          className="w-full liquid-glass-card rounded-[28px] p-6 border border-border shadow-2xl text-text cursor-pointer hover:border-accent/40 transition-all flex justify-between items-center group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Video size={22} />
            </div>
            <div>
              <span className="text-[9px] text-accent font-black uppercase tracking-widest block mb-0.5">Asambleas</span>
              <h3 className="text-lg font-display font-bold leading-tight text-text">
                {activeAsamblea ? activeAsamblea.titulo : "Crear asamblea"}
              </h3>
              <p className="text-text text-xs mt-0.5 line-clamp-1">
                {!activeAsamblea
                  ? "No hay asamblea activa — convoca una nueva"
                  : activeAsamblea.enSesion
                    ? "Sesión en vivo — entrar para moderar"
                    : "Programada — entrar para iniciar la sesión"}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(activeAsamblea ? '/asamblea' : '/admin-asamblea');
            }}
            className="bg-accent text-on-accent text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
          >
            {activeAsamblea ? "Moderar" : "Crear"} <ArrowRight size={10} />
          </button>
        </div>
      )}

      {/* QUICK ACCESSIBLE ACTIONS */}
      <div className="grid grid-cols-3 gap-3">
        {ADMIN_TILES.map(({ href, icon: Icon, title, desc, hex }) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="group h-[132px] p-3.5 rounded-[20px] bg-primary-light border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer text-left flex flex-col"
          >
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${hex}1a`, color: hex }}
            >
              <Icon size={20} />
            </span>
            <span className="mt-auto block">
              <span className="block text-[13px] font-bold text-text leading-tight mb-0.5">{title}</span>
              <span className="flex items-end justify-between gap-1">
                <span className="text-[10px] text-text/55 leading-snug">{desc}</span>
                <ArrowRight
                  size={13}
                  style={{ color: hex }}
                  className="shrink-0 group-hover:translate-x-0.5 transition-transform"
                />
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* GESTIÓN GENERAL CARD */}
      <div className="rounded-[28px] p-6 bg-primary-light border border-border shadow-sm text-text">
        <h2 className="text-base font-bold mb-1.5">Gestión del Conjunto</h2>
        <p className="text-[11px] text-text/55 leading-relaxed mb-5">
          Control de <span className="text-emerald-500 font-semibold">finanzas</span>,{' '}
          <span className="text-blue-500 font-semibold">parqueaderos</span> y{' '}
          <span className="text-violet-500 font-semibold">configuración</span>.
        </p>

        <div className="flex flex-col gap-3">
          {ADMIN_SHORTCUTS.map(({ href, icon: Icon, title, desc, hex }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="w-full py-3 px-3.5 rounded-2xl bg-surface-2 hover:bg-text/10 border border-border/40 text-left flex items-center gap-3 group active:scale-98 transition-all cursor-pointer"
            >
              <span
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${hex}1a`, color: hex }}
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-text truncate">{title}</span>
                <span className="block text-[10px] text-text/55 truncate">{desc}</span>
              </span>
              <ArrowRight
                size={14}
                style={{ color: hex }}
                className="shrink-0 group-hover:translate-x-1 transition-transform"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── HomeOperativo: dashboard real de mantenimiento y limpieza ──
function HomeOperativo() {
  const { user } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [notas, setNotas] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isMantenimiento = user?.rol === 'MANTENIMIENTO_LOCATIVO';
  const roleLabel = isMantenimiento ? '🔧 Mantenimiento Locativo' : '🧹 Operario de Limpieza';

  const fetchTickets = useCallback(async () => {
    try {
      const data = await api.get<any[]>('/solicitudes/mis-asignadas');
      setTickets(data || []);
    } catch (e) {
      console.error('Error fetching assigned tickets:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleAction = async (ticketId: string, estado: string, notasOpt?: string) => {
    setActionLoading(ticketId);
    try {
      await api.put(`/solicitudes/${ticketId}/estado`, {
        estado,
        notas: notasOpt || undefined,
      });
      toast.success(estado === 'EN_PROGRESO' ? 'Ticket aceptado. Ya puedes trabajar en él.' : 'Ticket completado exitosamente.');
      setSelectedTicket(null);
      setNotas("");
      fetchTickets();
    } catch (e: any) {
      toast.error(e?.message || 'Error al actualizar ticket');
    } finally {
      setActionLoading(null);
    }
  };

  // Tickets activos
  const activos = tickets.filter(t => t.estado === 'ASIGNADA' || t.estado === 'EN_PROGRESO');

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-6 gap-6 pt-16 pb-32">
        <ProfileHeader />
        <RoleSwitcher />
        <Clock className="text-accent animate-pulse" size={32} />
        <p className="text-text/50 text-sm">Cargando tickets asignados...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col p-4 pt-16 pb-32 gap-4">
      <ProfileHeader />
      <RoleSwitcher />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">{roleLabel}</h1>
          <p className="text-xs text-text/50">
            {activos.length} ticket{activos.length !== 1 ? 's' : ''} pendiente{activos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={fetchTickets}
          className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 text-text/70 hover:text-accent transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* Tickets list */}
      {activos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
            <CheckCircle size={32} className="text-accent" />
          </div>
          <p className="text-text/70 font-medium">Sin tickets pendientes</p>
          <p className="text-xs text-text/40 text-center max-w-xs">
            No tienes tickets de mantenimiento asignados. Cuando un administrador te asigne uno, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-3 flex-1">
          {activos.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-2xl border border-border bg-surface p-4 space-y-3"
            >
              {/* Priority badge */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  ticket.prioridad === 'URGENTE' ? 'bg-red-500/20 text-red-400' :
                  ticket.prioridad === 'ALTA' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-text/10 text-text/60'
                }`}>
                  {ticket.prioridad}
                </span>
                <span className="text-[10px] text-text/40 uppercase">{ticket.categoria}</span>
                <span className={`text-[10px] font-bold uppercase ml-auto px-2 py-0.5 rounded-full ${
                  ticket.estado === 'EN_PROGRESO' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {ticket.estado === 'EN_PROGRESO' ? 'En progreso' : 'Asignada'}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-text leading-relaxed">{ticket.descripcion}</p>

              {/* SLA */}
              {ticket.slaVencimiento && (
                <p className="text-[10px] text-text/40 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  Vence: {new Date(ticket.slaVencimiento).toLocaleDateString('es-CO')}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {ticket.estado === 'ASIGNADA' && (
                  <button
                    onClick={() => handleAction(ticket.id, 'EN_PROGRESO')}
                    disabled={actionLoading === ticket.id}
                    className="flex-1 py-2.5 rounded-xl bg-accent text-on-accent text-xs font-bold disabled:opacity-50"
                  >
                    {actionLoading === ticket.id ? 'Aceptando...' : '✅ Aceptar y empezar'}
                  </button>
                )}
                {ticket.estado === 'EN_PROGRESO' && (
                  <button
                    onClick={() => setSelectedTicket(ticket)}
                    className="flex-1 py-2.5 rounded-xl bg-green-500/20 text-green-400 text-xs font-bold"
                  >
                    ✅ Marcar como completado
                  </button>
                )}
                <button
                  onClick={() => setSelectedTicket(ticket)}
                  className="py-2.5 px-4 rounded-xl bg-surface-2 text-text/60 text-xs"
                >
                  Ver detalle
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: completar ticket */}
      {selectedTicket && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60" onClick={() => { setSelectedTicket(null); setNotas(""); }}>
          <div className="bg-primary rounded-t-[28px] p-6 w-full max-w-[430px] space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-text/20 mx-auto" />

            <div>
              <h3 className="text-lg font-bold text-text">
                {selectedTicket.estado === 'EN_PROGRESO' ? 'Completar ticket' : 'Ticket'}
              </h3>
              <p className="text-xs text-text/50 mt-1">{selectedTicket.categoria} · {selectedTicket.prioridad}</p>
            </div>

            <p className="text-sm text-text bg-surface-2 rounded-xl p-3">{selectedTicket.descripcion}</p>

            {selectedTicket.estado === 'EN_PROGRESO' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-text/40">Notas de resolución</label>
                  <textarea
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Describe brevemente qué hiciste..."
                    rows={3}
                    className="w-full bg-surface-2 border border-border rounded-xl p-3 text-sm text-text placeholder:text-text/30 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedTicket(null); setNotas(""); }}
                    className="flex-1 py-3 rounded-xl bg-surface-2 text-text/70 text-xs font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleAction(selectedTicket.id, 'RESUELTA', notas)}
                    disabled={actionLoading === selectedTicket.id}
                    className="flex-1 py-3 rounded-xl bg-green-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {actionLoading === selectedTicket.id ? 'Completando...' : '✅ Marcar completado'}
                  </button>
                </div>
              </>
            )}

            {/* Transitions timeline */}
            {selectedTicket.transiciones && selectedTicket.transiciones.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <p className="text-[10px] font-bold uppercase text-text/40">Historial</p>
                {selectedTicket.transiciones.map((tr: any) => (
                  <div key={tr.id} className="flex items-center gap-2 text-xs text-text/50">
                    <Clock size={10} />
                    <span>{tr.estadoAnterior} → {tr.estadoNuevo}</span>
                    <span className="text-text/20">·</span>
                    <span>{new Date(tr.createdAt).toLocaleString('es-CO')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InicioDashboard() {
  const { user } = useAuth();
  const role = user?.rol;
  const router = useRouter();

  // HUESPED_TEMPORAL must never see the propietario/residente dashboard
  useEffect(() => {
    if (role === 'HUESPED_TEMPORAL') {
      router.replace('/mi-estancia');
    }
    if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') {
      router.replace('/vigilancia');
    }
  }, [role, router]);

  if (role === 'HUESPED_TEMPORAL') {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
 <div className="animate-pulse bg-text/10 h-6 w-6 rounded-full" />
      </div>
    );
  }

  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
 <div className="animate-pulse bg-text/10 h-6 w-6 rounded-full" />
      </div>
    );
  }

  if (role === 'ADMINISTRADOR_PISCINA' || role === 'ADMINISTRADOR_GYM') return <AreaAdminDashboard />;
  if (role === 'MANTENIMIENTO_LOCATIVO' || role === 'OPERARIO_LIMPIEZA') return <HomeOperativo />;
  if (role === 'ENCARGADO_PARQUEADERO') return <HomeEstacionamiento />;
  if (role === 'CONCEJO') return <HomeConsejo />;
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN') return <HomeAdmin />;
  
  return <HomeResidente />;
}

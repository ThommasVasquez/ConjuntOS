"use client";

/**
 * INICIO DASHBOARD - CONJUNTOSAPP
 * Sincronización de datos reales del usuario y Panel de Notificaciones.
 */

import { 
  ArrowRight, Bell, Building2, Calendar, Car, CreditCard, DollarSign,
  Megaphone, MessageSquare, MoreHorizontal, ChevronLeft, ShieldAlert,
  Search, SlidersHorizontal, ShoppingBag, User as UserIcon,
  Users, Wrench, MapPin, BarChart3, Scale, CheckCircle, AlertTriangle, Clock
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import RoleSwitcher from "@/components/shell/RoleSwitcher";
import CelebrationModal from "@/components/modals/CelebrationModal";
import ContentActionModal from "@/components/modals/ContentActionModal";
import SearchModal from "@/components/search/SearchModal";
import SosPanicButton from "@/components/sos/SosPanicButton";
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
} from "@/lib/api/types";
import { useRouter } from "next/navigation";
import { getNotifTarget } from "@/lib/notif-routing";
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
    { title: "Citofonía", icon: <UserIcon size={20}/>, color: "from-text to-text", path: "/citofonia" },
    { title: "Pagos", icon: <CreditCard size={20}/>, color: "from-[#FFFFFF] to-[#404040]", path: "/pagos" },
    { title: "Parqueo", icon: <Car size={20}/>, color: "from-text to-text", path: "/parqueadero" },
    { title: "Reservas", icon: <Calendar size={20}/>, color: "from-text to-text", path: "/reservas" },
    { title: "Cartelera", icon: <Megaphone size={20}/>, color: "from-text to-text", path: "/cartelera" },
    { title: "Encuestas", icon: <BarChart3 size={20}/>, color: "from-text to-text", path: "/encuestas" },
    { title: "Asistente", icon: <Scale size={20}/>, color: "from-text to-text", path: "/asistente" },
    { title: "PQRS", icon: <MessageSquare size={20}/>, color: "from-text to-text", path: "/pqrs" },
    { title: "Inmuebles", icon: <Building2 size={20}/>, color: "from-text to-text", path: "/inmobiliaria" },
    { title: "Clasificados", icon: <ShoppingBag size={20}/>, color: "from-text to-text", path: "/clasificados" },
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

  const fetchActiveAsamblea = useCallback(async () => {
    try {
      const data = await api.get<{ id: string; activa: boolean; titulo: string; descripcion?: string }>('/asambleas/activa/session');
      if (data?.id && data?.activa) {
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
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-home", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.2 });
    }, containerRef);
    return () => ctx.revert();
  }, [user, fetchNotificaciones, fetchFinance, fetchUserData, fetchAnuncios, fetchAds, fetchActiveAsamblea, fetchSolicitudesParqueadero, fetchCargosRetenidos]);

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
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-text group-hover:text-accent transition-colors" />
            <div className="w-full bg-primary-light/50 border border-border rounded-[24px] py-4 pl-14 pr-6 text-sm text-text hover:border-accent/30 hover:bg-primary-light/80 transition-all shadow-inner cursor-pointer select-none">
              Buscar o preguntar algo...
            </div>
          </button>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-14 h-14 rounded-[22px] bg-primary-light/80 border border-border flex items-center justify-center text-text hover:text-accent hover:border-accent/30 transition-all active:scale-95 shadow-lg"
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </header>

      {/* PANIC / SOS — residents only (component self-gates by role) */}
      <SosPanicButton />

      {/* ASSEMBLY LIVE BANNER — only shown when there's an active assembly */}
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
                <span className="text-[9px] text-accent font-bold uppercase tracking-widest block">Sesion en Vivo</span>
                <h3 className="text-sm font-display font-bold text-text tracking-tight">{activeAsamblea.titulo}</h3>
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
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#EF4444] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
            </span>
            <h2 className="text-text font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert size={14} className="text-[#EF4444]" /> Cobro por aprobar — vehículo retenido
            </h2>
          </div>
          <p className="text-[11px] text-text/70 px-1 -mt-1">
            El vehículo de tu visita está retenido en portería y <b>no puede salir</b> hasta que decidas. Aprueba para cargar el cobro a tu apartamento, o recházalo (el visitante pagará en portería).
          </p>
          {cargosRetenidos.map((c) => (
            <div key={c.id} className="liquid-glass-card rounded-[28px] p-5 border border-[#EF4444]/40 flex flex-col gap-4">
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
                  <span className="text-2xl font-display font-bold text-[#FACC15]">
                    ${Number(c.montoFinal || c.montoActual || 0).toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  disabled={busyAprob === c.id}
                  onClick={() => resolverCargoRetenido(c.id, 'rechazar')}
                  className="flex-1 py-3 rounded-2xl bg-text/5 border border-border text-text font-bold text-sm hover:bg-[#EF4444]/10 hover:border-[#EF4444]/40 active:scale-95 transition-all disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  disabled={busyAprob === c.id}
                  onClick={() => resolverCargoRetenido(c.id, 'aprobar')}
                  className="flex-1 py-3 rounded-2xl bg-[#57bf00] text-white font-bold text-sm shadow-xl shadow-[#57bf00]/20 active:scale-95 transition-all disabled:opacity-50"
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
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FACC15] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FACC15]" />
            </span>
            <h2 className="text-text font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <Car size={14} className="text-[#FACC15]" /> Aprobación de Estacionamiento
            </h2>
          </div>
          <p className="text-[11px] text-text/70 px-1 -mt-1">
            Te solicitan asignarte un parqueadero de visitante. Tu aprobación es obligatoria.
          </p>
          {solicitudesParqueadero.map((s) => (
            <div key={s.id} className="liquid-glass-card rounded-[28px] p-5 border border-[#FACC15]/40 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-lg font-bold text-text">Celda {s.celdaNumero}</span>
                {s.detalle && <span className="text-xs text-text/80">{s.detalle}</span>}
                {s.solicitanteNombre && <span className="text-[11px] text-text/60 mt-1">Solicitado por {s.solicitanteNombre}</span>}
              </div>
              <div className="flex gap-3">
                <button
                  disabled={busyAprob === s.id}
                  onClick={() => resolverSolicitudParqueadero(s.id, 'rechazar')}
                  className="flex-1 py-3 rounded-2xl bg-text/5 border border-border text-text font-bold text-sm hover:bg-[#EF4444]/10 hover:border-[#EF4444]/40 active:scale-95 transition-all disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  disabled={busyAprob === s.id}
                  onClick={() => resolverSolicitudParqueadero(s.id, 'aprobar')}
                  className="flex-1 py-3 rounded-2xl bg-[#57bf00] text-white font-bold text-sm shadow-xl shadow-[#57bf00]/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {busyAprob === s.id ? "Procesando..." : "Aprobar"}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 🧭 CATEGORÍAS PREMIUM */}
      <section className="fade-up-home flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
           <h2 className="text-xs font-bold uppercase tracking-widest text-text">Navegación</h2>
           <ArrowRight size={14} className="text-text" />
        </div>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 px-1 -mx-1">
          {categories.map((cat, idx) => (
            <div 
              key={idx} 
              onClick={() => router.push(cat.path)}
              className="flex flex-col items-center gap-2"
            >
              <div className={`relative hover:z-10 w-[84px] h-[106px] rounded-[32px] bg-primary border border-[#333333] flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-2xl cursor-pointer p-4`}>
                  <div className="[&_svg]:!text-[#57bf00] scale-125 mb-1">{cat.icon}</div>
                  <span className="text-[10px] font-bold text-[#009df2] uppercase text-center block w-full truncate tracking-tighter">{cat.title}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
 
      {/* NOTIFICATIONS BANNER */}
      {notificaciones.length > 0 && (
          <section className="fade-up-home flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                  <h2 className="text-text font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                      <Bell size={14} className="text-accent animate-pulse" /> Avisos Recientes
                  </h2>
                  <span className="text-accent text-[10px] font-bold">{notificaciones.length} nuevos</span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
                  {notificaciones.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => { markAsRead(n.id); router.push(getNotifTarget(n, user?.rol)); }}
                        className="min-w-[280px] bg-linear-to-r from-accent/20 to-accent/5 border border-accent/30 rounded-[22px] p-4 flex flex-col gap-2 cursor-pointer hover:bg-text/5 transition-all shadow-lg shadow-accent/5 group"
                      >
                          <div className="flex justify-between items-start">
                              <span className="text-[10px] font-black text-accent uppercase tracking-tighter">{n.tipo}</span>
                              <div className="w-2 h-2 rounded-full bg-accent group-hover:scale-150 transition-transform" />
                          </div>
                          <h3 className="text-text text-sm font-bold truncate">{n.titulo}</h3>
                          <p className="text-[11px] text-text line-clamp-2 leading-relaxed">{n.mensaje}</p>
                      </div>
                  ))}
              </div>
          </section>
      )}

      {/* WALLET HERO */}
      <section 
        className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[120px] shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/10 group overflow-hidden transition-all"
      >
        <div className={`absolute inset-0 bg-linear-to-br ${financialData.totalDebt > 0 ? 'from-[#262626] via-[#171717] to-[#0A0A0A]' : 'from-[#424242] via-[#363636] to-[#525252]'} opacity-90`} />
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                 <CreditCard size={14} className="text-white" />
               </div>
               <span className="text-[10px] text-white font-bold uppercase tracking-widest">Mi Cuota</span>
            </div>
            {financialData.totalDebt > 0 ? (
              <div className="px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 text-[10px] text-accent font-bold uppercase animate-pulse">Pendiente</div>
            ) : (
              <div className="px-2.5 py-1 rounded-full bg-text/20 border border-text/40 text-[10px] text-text font-bold uppercase">Paz y Salvo</div>
            )}
          </div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-display font-bold text-white tracking-tight">
                $ {financialData.totalDebt.toLocaleString()}
              </h2>
              <p className="text-white text-[10px] mt-0.5">
                {financialData.totalDebt > 0 ? "Saldo pendiente" : "Al dia con tus pagos"}
              </p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); router.push('/pagos'); }}
              className="bg-white text-[#000000] text-[11px] font-bold px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all relative z-20"
            >
              {financialData.totalDebt > 0 ? "Pagar Ahora" : "Ver Estado"}
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
         <section className="fade-up-home flex justify-between items-center py-4 border-t border-border mt-4">
          <div className="flex flex-col">
              <span className="text-[10px] font-black text-text uppercase tracking-widest">ConjuntOS v3.2</span>
              <span className="text-[9px] text-text uppercase">Resident Edition</span>
          </div>
          <button onClick={() => router.push('/perfil')} className="flex items-center gap-2 text-text hover:text-text transition-colors">
              <span className="text-[10px] font-bold uppercase tracking-tighter">Mi Cuenta</span>
              <ArrowRight size={14} />
          </button>
      </section>
         {isLoadingAnuncios ? (
           <div className="py-10 flex flex-col items-center justify-center gap-3">
             <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
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
            <div className="w-10 h-10 rounded-full flex items-center justify-center border border-border font-bold text-xs bg-[#009df2] text-white">
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
  const [stats, setStats] = useState({ ocupacion: 0, libres: 0, ocupados: 0 });

  useEffect(() => {
    api.get<{ ocupacion: number; libres: number; ocupados: number }>('/parqueadero/stats')
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      <div 
        onClick={() => router.push("/mapa-parqueadero")}
        className="fade-up liquid-glass-card rounded-[28px] p-6 border border-border shadow-2xl text-text cursor-pointer hover:border-accent/40 transition-all flex justify-between items-center group active:scale-98"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Car size={22} />
          </div>
          <div>
            <span className="text-[9px] text-accent font-black uppercase tracking-widest block mb-0.5">Control Operativo</span>
            <h3 className="text-lg font-display font-bold leading-tight text-text">Mapa de Parqueaderos</h3>
            <p className="text-text text-xs mt-0.5">Ver celdas libres, registrar ingresos/salidas y realizar rondas.</p>
          </div>
        </div>
        <button className="bg-accent text-on-accent text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95">
          Ingresar
        </button>
      </div>

      {/* Estadísticas de Ocupación */}
      <div className="fade-up liquid-glass rounded-[28px] p-6 border border-border shadow-2xl">
        <h3 className="text-base font-bold text-text mb-4">Estado del Parqueadero</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-2 border border-border rounded-2xl p-4 text-center">
            <span className="text-2xl font-black text-text">{stats.ocupacion}%</span>
            <p className="text-[9px] text-text uppercase font-bold mt-1">Ocupación</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-2xl p-4 text-center">
            <span className="text-2xl font-black text-text">{stats.libres}</span>
            <p className="text-[9px] text-text uppercase font-bold mt-1">Libres</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-2xl p-4 text-center">
            <span className="text-2xl font-black text-text">{stats.ocupados}</span>
            <p className="text-[9px] text-text uppercase font-bold mt-1">Ocupados</p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      
      <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
        <h2 className="text-xl font-bold text-text mb-1">Mesa de Monitoreo</h2>
        <p className="text-text text-xs">Consejo de Administración (Órgano Consultor Ley 675/2001)</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* FINANZAS READ ONLY CARD */}
        <div 
          onClick={() => router.push('/admin-finanzas')}
          className="fade-up p-5 rounded-[28px] bg-linear-to-br from-text/10 to-text/10 border border-text/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <DollarSign size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text mb-0.5">Finanzas</h4>
            <p className="text-[9px] text-text">Cobros y reportes consolidados</p>
          </div>
        </div>

        {/* ANUNCIOS/CIRCULARES */}
        <div 
          onClick={() => router.push('/cartelera')}
          className="fade-up p-5 rounded-[28px] bg-linear-to-br from-text/10 to-text/10 border border-text/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <Building2 size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text mb-0.5">Cartelera</h4>
            <p className="text-[9px] text-text">Ver circulares y anuncios generales</p>
          </div>
        </div>

        {/* ENCUESTAS */}
        <div
          onClick={() => router.push('/encuestas')}
          className="fade-up p-5 rounded-[28px] bg-linear-to-br from-text/10 to-text/10 border border-text/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <BarChart3 size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text mb-0.5">Encuestas</h4>
            <p className="text-[9px] text-text">Crear y ver resultados en vivo</p>
          </div>
        </div>
      </div>

      {/* Resumen Agregado */}
      <div className="fade-up liquid-glass rounded-[28px] p-6 border border-border shadow-2xl">
        <h3 className="text-base font-bold text-text mb-4">Informes de Gestión</h3>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center bg-surface-2 p-4 rounded-2xl border border-border">
            <span className="text-xs text-text uppercase font-bold">Recaudación General</span>
            <span className="text-sm font-black text-text">${Number(stats.recaudoMes || 0).toLocaleString()} COP</span>
          </div>
          <div className="flex justify-between items-center bg-surface-2 p-4 rounded-2xl border border-border">
            <span className="text-xs text-text uppercase font-bold">Novedades / Solicitudes</span>
            <span className="text-sm font-black text-text">{stats.reservasPendientes} Pendientes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeAdmin() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.rol;
  const [activeAsamblea, setActiveAsamblea] = useState<{ id: string; titulo: string; descripcion?: string } | null>(null);

  useEffect(() => {
    api.get<{ id: string; activa: boolean; titulo: string; descripcion?: string }>('/asambleas/activa/session')
      .then((data) => {
        if (data?.id && data?.activa) {
          setActiveAsamblea({ id: data.id, titulo: data.titulo, descripcion: data.descripcion });
        }
      })
      .catch(() => {});
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

      {/* LIVE ASSEMBLY ADMIN CONTROL — only when active */}
      {activeAsamblea && (
        <div 
          onClick={() => router.push('/asamblea')}
          className="w-full liquid-glass-card rounded-[28px] p-6 border border-accent/30 shadow-2xl text-text cursor-pointer hover:border-accent/50 transition-all flex justify-between items-center group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <span className="w-3.5 h-3.5 rounded-full bg-accent animate-ping" />
            </div>
            <div>
              <span className="text-[9px] text-accent font-black uppercase tracking-widest block mb-0.5">En Vivo</span>
              <h3 className="text-lg font-display font-bold leading-tight text-text">{activeAsamblea.titulo}</h3>
              {activeAsamblea.descripcion && (
                <p className="text-text text-xs mt-0.5 line-clamp-1">{activeAsamblea.descripcion}</p>
              )}
            </div>
          </div>
          <button className="bg-accent text-on-accent text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1 cursor-pointer">
            Moderar <ArrowRight size={10} />
          </button>
        </div>
      )}

      {/* QUICK ACCESSIBLE ACTIONS */}
      <div className="grid grid-cols-3 gap-3">
        {/* RESIDENTES CARD */}
        <div 
          onClick={() => router.push('/admin-residentes')}
          className="p-4 rounded-[24px] bg-linear-to-br from-text/15 to-text/15 border border-text/20 flex flex-col justify-between h-[120px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <Users size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-text mb-0.5">Residentes</h4>
            <p className="text-[8px] text-text">Gestionar unidades</p>
          </div>
        </div>

        {/* CITOFONÍA CARD */}
        <div 
          onClick={() => router.push('/citofonia')}
          className="p-4 rounded-[24px] bg-linear-to-br from-text/15 to-text/15 border border-text/20 flex flex-col justify-between h-[120px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <UserIcon size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-text mb-0.5">Citofonía</h4>
            <p className="text-[8px] text-text">Llamar a unidades</p>
          </div>
        </div>

        {/* NOVEDADES CARD */}
        <div 
          onClick={() => router.push('/admin-novedades')}
          className="p-4 rounded-[24px] bg-linear-to-br from-text/15 to-text/15 border border-text/20 flex flex-col justify-between h-[120px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <Building2 size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-text mb-0.5">Novedades</h4>
            <p className="text-[8px] text-text">Anuncios y trámites</p>
          </div>
        </div>

        {/* PQRS CARD */}
        <div 
          onClick={() => router.push('/admin-pqrs')}
          className="p-4 rounded-[24px] bg-linear-to-br from-text/15 to-text/15 border border-text/20 flex flex-col justify-between h-[120px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <Wrench size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-text mb-0.5">Solicitudes</h4>
            <p className="text-[8px] text-text">PQRS y servicios</p>
          </div>
        </div>

        {/* ÁREAS CARD */}
        <div 
          onClick={() => router.push('/admin-areas')}
          className="p-4 rounded-[24px] bg-linear-to-br from-text/15 to-text/15 border border-text/20 flex flex-col justify-between h-[120px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <MapPin size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-text mb-0.5">Áreas</h4>
            <p className="text-[8px] text-text">Espacios comunes</p>
          </div>
        </div>

        {/* ENCUESTAS CARD */}
        <div
          onClick={() => router.push('/encuestas')}
          className="p-4 rounded-[24px] bg-linear-to-br from-text/15 to-text/15 border border-text/20 flex flex-col justify-between h-[120px] cursor-pointer hover:border-text/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-text/20 flex items-center justify-center text-text border border-text/30">
            <BarChart3 size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-text mb-0.5">Encuestas</h4>
            <p className="text-[8px] text-text">Crear y ver resultados</p>
          </div>
        </div>
      </div>

      {/* GESTIÓN GENERAL CARD */}
      <div className="liquid-glass rounded-[28px] p-6 border border-border shadow-2xl text-text">
        <h2 className="text-base font-bold mb-2">Gestión del Conjunto</h2>
        <p className="text-[11px] text-text leading-relaxed mb-6">Control de finanzas, parqueaderos y configuración.</p>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => router.push('/admin-finanzas')}
            className="w-full py-4 px-5 rounded-2xl bg-text/5 hover:bg-text/10 border border-border/40 text-left text-xs font-bold text-text flex items-center justify-between group active:scale-98 transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2"><DollarSign size={14} className="text-[#57bf00]"/> Finanzas y Cartera</span>
            <ArrowRight size={14} className="text-text group-hover:text-accent group-hover:translate-x-1 transition-all" />
          </button>
          
          <button 
            onClick={() => router.push('/admin-parqueadero')}
            className="w-full py-4 px-5 rounded-2xl bg-text/5 hover:bg-text/10 border border-border/40 text-left text-xs font-bold text-text flex items-center justify-between group active:scale-98 transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2"><Car size={14} className="text-[#009df2]"/> Control de Parqueaderos</span>
            <ArrowRight size={14} className="text-text group-hover:text-accent group-hover:translate-x-1 transition-all" />
          </button>
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
  }, [role, router]);

  if (role === 'HUESPED_TEMPORAL') {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (role === 'ADMINISTRADOR_PISCINA' || role === 'ADMINISTRADOR_GYM') return <AreaAdminDashboard />;
  if (role === 'MANTENIMIENTO_LOCATIVO' || role === 'OPERARIO_LIMPIEZA') return <HomeOperativo />;

  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') return <HomeVigilante />;
  if (role === 'ENCARGADO_PARQUEADERO') return <HomeEstacionamiento />;
  if (role === 'CONCEJO') return <HomeConsejo />;
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN') return <HomeAdmin />;
  
  return <HomeResidente />;
}

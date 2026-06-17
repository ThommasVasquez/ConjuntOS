"use client";

/**
 * INICIO DASHBOARD - CONJUNTOSAPP
 * Sincronización de datos reales del usuario y Panel de Notificaciones.
 */

import { 
  ArrowRight, Bell, Building2, Calendar, Car, CreditCard, DollarSign,
<<<<<<< Updated upstream
  Megaphone, MessageSquare, MoreHorizontal, ChevronLeft, ShieldAlert,
<<<<<<< HEAD
  Search, SlidersHorizontal, ShoppingBag, User as UserIcon
=======
  Megaphone, MessageSquare, MoreHorizontal, ChevronLeft, 
  Search, SlidersHorizontal, ShoppingBag, User as UserIcon,
  Phone, MessageCircle, Shield, Activity, Clock, Plus, X, Eye, FileText, Users, Package, Flame, ShieldAlert
>>>>>>> Stashed changes
=======
  Search, SlidersHorizontal, ShoppingBag, User as UserIcon,
  Users, Wrench, MapPin, LayoutGrid
>>>>>>> 6cb7c17 (feat: expandir módulo administrador — 4 nuevos módulos)
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import RoleSwitcher from "@/components/shell/RoleSwitcher";
import CelebrationModal from "@/components/modals/CelebrationModal";
import ContentActionModal from "@/components/modals/ContentActionModal";
import SearchModal from "@/components/search/SearchModal";
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
    { title: "PQRS", icon: <MessageSquare size={20}/>, color: "from-text to-text", path: "/pqrs" },
    { title: "Inmuebles", icon: <Building2 size={20}/>, color: "from-text to-text", path: "/inmobiliaria" },
    { title: "Clasificados", icon: <ShoppingBag size={20}/>, color: "from-text to-text", path: "/clasificados" },
  ];

  const [anuncios, setAnuncios] = useState<AnuncioDto[]>([]);
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

  const fetchNotificaciones = useCallback(async () => {
    try {
      const data = await api.get<NotificacionDto[]>('/notificaciones');
      setNotificaciones(data.filter((n) => !n.leida));
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    window.addEventListener("notifications-updated", fetchNotificaciones);
    return () => window.removeEventListener("notifications-updated", fetchNotificaciones);
  }, [fetchNotificaciones]);

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
<<<<<<< Updated upstream
      } catch {
          // silently ignore
      }
=======
          window.dispatchEvent(new Event("notifications-updated"));
      } catch (e) { console.error("Error marking as read", e); }
>>>>>>> Stashed changes
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
      fetchActiveAsamblea();
      fetchSolicitudesParqueadero();
      fetchCargosRetenidos();
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-home", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.2 });
    }, containerRef);
    return () => ctx.revert();
  }, [user, fetchNotificaciones, fetchFinance, fetchUserData, fetchAnuncios, fetchActiveAsamblea, fetchSolicitudesParqueadero, fetchCargosRetenidos]);

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
         ) : anuncios.map((anuncio) => (
            <div key={anuncio.id} onClick={() => setSelectedFeedItem(anuncio)} className="cursor-pointer">
              <AnuncioCard anuncio={anuncio} />
            </div>
          ))}
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

function HomeVigilante() {
  const router = useRouter();
  const [visitasHoy, setVisitasHoy] = useState(0);
  const [paquetesPendientes, setPaquetesPendientes] = useState(0);
  const [celdasLibres, setCeldasLibres] = useState(0);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [activeEmergency, setActiveEmergency] = useState<string | null>(null);

  const [invitaciones, setInvitaciones] = useState([
    { id: '1', nombre: "Carlos Mendoza", tipo: "Frecuente", apto: "Torre 4 Apto 1410", residentId: "cl_thommy" },
    { id: '2', nombre: "Elena Rodríguez", tipo: "Ocasional", apto: "Torre 1 Apto 502", residentId: "cl_raul" },
    { id: '3', nombre: "Rappi - Pedido #442", tipo: "Domicilio", apto: "Torre 4 Apto 740", residentId: "cl_milo" }
  ]);

  useEffect(() => {
    let mounted = true;
    async function loadStats() {
      // Fetch each stat independently — a 403 on one must never cascade to the others
      try {
        const visRes = await fetch('/api/vigilancia/visitas');
        if (visRes.ok) {
          const visData = await visRes.json();
          if (mounted && visData.success) {
            const active = visData.data.filter((v: any) => !v.fechaSalida).length;
            setVisitasHoy(active);
          }
        }
      } catch (e) { console.error("[HomeVigilante] visitas stats error", e); }

      try {
        const paqRes = await fetch('/api/vigilancia/paquetes');
        if (paqRes.ok) {
          const paqData = await paqRes.json();
          if (mounted && paqData.success) setPaquetesPendientes(paqData.data.length);
        }
      } catch (e) { console.error("[HomeVigilante] paquetes stats error", e); }

      try {
        const parkRes = await fetch('/api/parqueadero/stats');
        if (parkRes.ok) {
          const parkData = await parkRes.json();
          if (mounted && parkData.success) setCeldasLibres(parkData.data.libres);
        }
      } catch (e) { console.error("[HomeVigilante] parking stats error", e); }
    }
    loadStats();
    return () => { mounted = false; };
  }, []);

  const handleCheckInInvitation = async (inv: any) => {
    try {
      const res = await fetch('/api/vigilancia/visitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId: inv.residentId,
          nombre: inv.nombre,
          tipo: 'PEATONAL',
          observacion: `Ingreso pre-autorizado (${inv.tipo})`
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Ingreso registrado para ${inv.nombre}`);
        setInvitaciones(prev => prev.filter(item => item.id !== inv.id));
        setVisitasHoy(v => v + 1);
      } else {
        toast.error("Error al registrar");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const handleTriggerEmergency = (type: string) => {
    setActiveEmergency(type);
    setIsEmergencyModalOpen(false);
    toast.error(`⚠️ EMERGENCIA ACTIVADA: Protocolo de ${type} en curso.`);
  };

  const clearEmergency = () => {
    setActiveEmergency(null);
    toast.success("Emergencia desactivada. Estado de seguridad normalizado.");
  };

  return (
<<<<<<< Updated upstream
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      <div className="liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
        <h2 className="text-2xl font-bold text-text mb-2">Central de Guardia</h2>
        <p className="text-text text-sm mb-6">Módulo de control de acceso y paquetería.</p>
        <div className="flex flex-col gap-3">
=======
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
      
      {/* Blinking red background alert during emergency */}
      {activeEmergency && (
        <div className="absolute inset-0 bg-red-600/10 pointer-events-none z-0 animate-pulse" style={{ animationDuration: '1s' }} />
      )}

      <ProfileHeader />

      {/* EMERGENCY BANNER IF ACTIVE */}
      {activeEmergency && (
        <div className="fade-up w-full rounded-[24px] bg-red-500/25 border border-red-500 p-4 flex items-center justify-between z-10 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white">
              <ShieldAlert size={20} className="animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <div>
              <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest block">Alerta Activa</span>
              <h3 className="text-sm font-bold text-white tracking-tight">Protocolo de {activeEmergency}</h3>
            </div>
          </div>
>>>>>>> Stashed changes
          <button 
            onClick={clearEmergency}
            className="bg-white text-red-600 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full cursor-pointer hover:bg-gray-150 transition-all"
          >
            Normalizar
          </button>
        </div>
      )}

      {/* METRICS SUMMARY */}
      <section className="fade-up grid grid-cols-2 sm:grid-cols-4 gap-4 z-10">
        <div className="liquid-glass rounded-2xl p-4 border border-border flex flex-col gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center"><Users size={16}/></div>
          <div>
            <span className="text-[9px] text-text/50 font-bold uppercase tracking-wider block">Visitas Activas</span>
            <p className="text-xl font-bold text-text">{visitasHoy}</p>
          </div>
        </div>

        <div className="liquid-glass rounded-2xl p-4 border border-border flex flex-col gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><Package size={16}/></div>
          <div>
            <span className="text-[9px] text-text/50 font-bold uppercase tracking-wider block">Paquetes Lobby</span>
            <p className="text-xl font-bold text-text">{paquetesPendientes}</p>
          </div>
        </div>

        <div className="liquid-glass rounded-2xl p-4 border border-border flex flex-col gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center"><Car size={16}/></div>
          <div>
            <span className="text-[9px] text-text/50 font-bold uppercase tracking-wider block">Parqueo Visitas</span>
            <p className="text-xl font-bold text-text">{celdasLibres} Libres</p>
          </div>
        </div>

        <div className={`liquid-glass rounded-2xl p-4 border flex flex-col gap-2 transition-all ${activeEmergency ? 'border-red-500/50 bg-red-950/20' : 'border-border'}`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeEmergency ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-green-500/20 text-green-400'}`}>
            <Activity size={16}/>
          </div>
          <div>
            <span className="text-[9px] text-text/50 font-bold uppercase tracking-wider block">Estado Sistema</span>
            <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${activeEmergency ? 'text-red-400' : 'text-green-400'}`}>
              {activeEmergency ? 'Emergencia' : 'Normal'}
            </p>
          </div>
        </div>
      </section>

      {/* OPERATIONS CENTER GRID */}
      <section className="fade-up flex flex-col gap-4 z-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text/50 px-1">Centro Operativo</h2>
        <div className="grid grid-cols-2 gap-4">
          
          <div 
            onClick={() => router.push('/control-visitas')}
            className="liquid-glass p-5 rounded-[28px] border border-border flex flex-col justify-between h-[130px] cursor-pointer hover:border-accent/30 hover:bg-text/5 transition-all group active:scale-95 shadow-xl"
          >
            <div className="w-10 h-10 rounded-2xl bg-accent/20 flex items-center justify-center text-accent border border-accent/30 group-hover:scale-105 transition-transform"><Users size={20}/></div>
            <div>
              <h4 className="text-sm font-bold text-text mb-0.5">Control Acceso</h4>
              <p className="text-[9px] text-text/50">Ingreso/Salida visitantes</p>
            </div>
          </div>

          <div 
            onClick={() => router.push('/paqueteria')}
            className="liquid-glass p-5 rounded-[28px] border border-border flex flex-col justify-between h-[130px] cursor-pointer hover:border-emerald-500/30 hover:bg-text/5 transition-all group active:scale-95 shadow-xl"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform"><Package size={20}/></div>
            <div>
              <h4 className="text-sm font-bold text-text mb-0.5">Correspondencia</h4>
              <p className="text-[9px] text-text/50">Paquetes y mensajería</p>
            </div>
          </div>

          <div 
            onClick={() => router.push('/seguridad')}
            className="liquid-glass p-5 rounded-[28px] border border-border flex flex-col justify-between h-[130px] cursor-pointer hover:border-blue-500/30 hover:bg-text/5 transition-all group active:scale-95 shadow-xl"
          >
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30 group-hover:scale-105 transition-transform"><Eye size={20}/></div>
            <div>
              <h4 className="text-sm font-bold text-text mb-0.5">CCTV y Rondas</h4>
              <p className="text-[9px] text-text/50">Monitoreo cámaras de seguridad</p>
            </div>
          </div>

          <div 
            onClick={() => router.push('/novedades')}
            className="liquid-glass p-5 rounded-[28px] border border-border flex flex-col justify-between h-[130px] cursor-pointer hover:border-purple-500/30 hover:bg-text/5 transition-all group active:scale-95 shadow-xl"
          >
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 border border-purple-500/30 group-hover:scale-105 transition-transform"><FileText size={20}/></div>
            <div>
              <h4 className="text-sm font-bold text-text mb-0.5">Novedades</h4>
              <p className="text-[9px] text-text/50">Bitácora digital de turnos</p>
            </div>
          </div>

        </div>

        {/* EMERGENCY PANIC BUTTON */}
        <button 
          onClick={() => setIsEmergencyModalOpen(true)}
          className={`w-full py-4 px-5 rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 border cursor-pointer active:scale-98 transition-all shadow-lg ${
            activeEmergency 
              ? 'bg-red-600 text-white border-red-500 animate-pulse' 
              : 'bg-red-500/10 hover:bg-red-500/25 border-red-500/30 text-red-500'
          }`}
        >
          <ShieldAlert size={16} /> {activeEmergency ? "Panel de Alerta" : "Atención de Emergencias"}
        </button>
      </section>

      {/* PRE-AUTHORIZED INVITATIONS */}
      <section className="fade-up flex flex-col gap-4 z-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text/50 px-1">Invitaciones Pre-Autorizadas</h2>
        {invitaciones.length === 0 ? (
          <div className="liquid-glass p-6 rounded-2xl text-center border border-dashed border-border">
            <p className="text-xs text-text/60 italic">No hay invitaciones programadas pendientes.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {invitaciones.map((inv) => (
              <div key={inv.id} className="liquid-glass-card rounded-[22px] p-4 flex items-center justify-between border border-border/80">
                <div>
                  <h4 className="text-sm font-bold text-text leading-none mb-1.5">{inv.nombre}</h4>
                  <div className="flex items-center gap-2">
                    <span className="bg-accent/10 border border-accent/20 text-accent text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                      {inv.tipo}
                    </span>
                    <span className="text-[10px] text-text/60">Destino: {inv.apto}</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleCheckInInvitation(inv)}
                  className="px-3.5 py-2 bg-accent hover:bg-accent/80 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                >
                  Ingreso
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL: EMERGENCY CONTROL SHEET */}
      {isEmergencyModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsEmergencyModalOpen(false)} />
          <div className="liquid-glass-card rounded-[32px] p-6 w-full max-w-[400px] border border-red-500/30 relative z-10 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-red-500 animate-pulse" size={20} />
                <h3 className="text-lg font-bold text-text">Botón de Pánico / Protocolos</h3>
              </div>
              <button onClick={() => setIsEmergencyModalOpen(false)} className="w-8 h-8 rounded-full bg-text/5 flex items-center justify-center text-text/70 hover:bg-text/10 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {activeEmergency ? (
              <div className="flex flex-col gap-4 text-center py-2">
                <div className="w-16 h-16 rounded-full bg-red-600/20 border border-red-600 text-red-500 flex items-center justify-center mx-auto animate-ping">
                  <ShieldAlert size={28} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-text uppercase">Alerta de {activeEmergency} en Curso</h4>
                  <p className="text-xs text-text/60 mt-1 leading-relaxed">
                    El sistema se encuentra en estado de contingencia. Notifica inmediatamente a los servicios de rescate.
                  </p>
                </div>
                <button 
                  onClick={() => { clearEmergency(); setIsEmergencyModalOpen(false); }}
                  className="w-full py-4 bg-emerald-500 text-black rounded-xl font-bold uppercase tracking-widest text-xs mt-2"
                >
                  Desactivar Alerta
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-text/60 leading-relaxed pl-1">
                  Selecciona una categoría de emergencia para activar el protocolo del edificio y alertar a la administración.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleTriggerEmergency("INCENDIO 🧯")}
                    className="p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-center text-red-400 cursor-pointer transition-colors"
                  >
                    <Flame size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Incendio</span>
                  </button>

                  <button 
                    onClick={() => handleTriggerEmergency("URGENCIA MÉDICA 🚑")}
                    className="p-4 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-center text-blue-400 cursor-pointer transition-colors"
                  >
                    <Activity size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Médico</span>
                  </button>

                  <button 
                    onClick={() => handleTriggerEmergency("SEGURIDAD / INTRUSO 🥷")}
                    className="p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-center text-amber-400 cursor-pointer transition-colors"
                  >
                    <Shield size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Seguridad</span>
                  </button>

                  <button 
                    onClick={() => handleTriggerEmergency("EVACUACIÓN GENERAL 🚨")}
                    className="p-4 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-center text-purple-400 cursor-pointer transition-colors"
                  >
                    <ShieldAlert size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Evacuación</span>
                  </button>
                </div>

                <div className="mt-2 border-t border-border pt-4 flex flex-col gap-2">
                  <span className="text-[9px] text-text/50 uppercase tracking-widest font-black pl-1">Llamada Directa (123)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <a 
                      href="tel:123" 
                      className="py-3 bg-text/5 border border-border rounded-xl text-xs text-text font-bold text-center flex items-center justify-center gap-1.5 hover:bg-text/10"
                    >
                      <Phone size={12}/> Policía (123)
                    </a>
                    <a 
                      href="tel:119" 
                      className="py-3 bg-text/5 border border-border rounded-xl text-xs text-text font-bold text-center flex items-center justify-center gap-1.5 hover:bg-text/10"
                    >
                      <Phone size={12}/> Bomberos (119)
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
<<<<<<< Updated upstream
  const { user } = useAuth();
  const role = user?.rol;
  const [activeAsamblea, setActiveAsamblea] = useState<{ id: string; titulo: string; descripcion?: string } | null>(null);

  useEffect(() => {
    api.get<{ id: string; activa: boolean; titulo: string; descripcion?: string }>('/asambleas/activa/session')
      .then((data) => {
        if (data?.id && data?.activa) {
          setActiveAsamblea({ id: data.id, titulo: data.titulo, descripcion: data.descripcion });
=======
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const [activoLlamadas, setActivoLlamadas] = useState(true);
  const [activoMensajes, setActivoMensajes] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    fetch("/api/admin/status-config")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setActivoLlamadas(data.activoLlamadas);
          setActivoMensajes(data.activoMensajes);
>>>>>>> Stashed changes
        }
      })
      .catch(() => {});
  }, []);

<<<<<<< Updated upstream
  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      
      {/* SUPER ADMIN SPECIAL CARD */}
=======
  const toggleLlamadas = async () => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    const newValue = !activoLlamadas;
    setActivoLlamadas(newValue);
    try {
      const res = await fetch("/api/admin/status-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activoLlamadas: newValue })
      });
      const data = await res.json();
      if (!data.success) setActivoLlamadas(!newValue);
    } catch {
      setActivoLlamadas(!newValue);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const toggleMensajes = async () => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    const newValue = !activoMensajes;
    setActivoMensajes(newValue);
    try {
      const res = await fetch("/api/admin/status-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activoMensajes: newValue })
      });
      const data = await res.json();
      if (!data.success) setActivoMensajes(!newValue);
    } catch {
      setActivoMensajes(!newValue);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      {/* 🟢 AVAILABILITY TOGGLES */}
      <div className="liquid-glass rounded-[28px] p-5 border border-border/80 flex flex-col gap-4 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full ${activoLlamadas || activoMensajes ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-text/20'} transition-all`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-text/70">Mi Disponibilidad</span>
          <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full ${
            activoLlamadas || activoMensajes
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-text/5 text-text/40 border border-border'
          }`}>
            {activoLlamadas || activoMensajes ? 'En línea' : 'No disponible'}
          </span>
        </div>

        <div className="flex justify-between items-center py-1 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              activoLlamadas ? 'bg-emerald-500/15 text-emerald-400' : 'bg-text/5 text-text/30'
            }`}>
              <Phone size={14} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-text">Llamadas</span>
              <span className="text-[9px] text-text/50">Citofonía y llamadas directas</span>
            </div>
          </div>
          <button
            onClick={toggleLlamadas}
            disabled={isUpdatingStatus}
            className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative focus:outline-none cursor-pointer ${
              activoLlamadas ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-surface-3'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-all duration-300 ${
              activoLlamadas ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        <div className="flex justify-between items-center py-1">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              activoMensajes ? 'bg-emerald-500/15 text-emerald-400' : 'bg-text/5 text-text/30'
            }`}>
              <MessageCircle size={14} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-text">Mensajes</span>
              <span className="text-[9px] text-text/50">Chat con residentes</span>
            </div>
          </div>
          <button
            onClick={toggleMensajes}
            disabled={isUpdatingStatus}
            className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative focus:outline-none cursor-pointer ${
              activoMensajes ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-surface-3'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-all duration-300 ${
              activoMensajes ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      {/* 👑 SUPER ADMIN SPECIAL CARD */}
>>>>>>> Stashed changes
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

          <button 
            onClick={() => router.push('/superadmin')}
            className="w-full py-4 px-5 rounded-2xl bg-text/5 hover:bg-text/10 border border-border/40 text-left text-xs font-bold text-text flex items-center justify-between group active:scale-98 transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2"><ShieldAlert size={14} className="text-text"/> Panel SuperAdmin</span>
            <ArrowRight size={14} className="text-text group-hover:text-accent group-hover:translate-x-1 transition-all" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InicioDashboard() {
  const { user } = useAuth();
  const role = user?.rol;

  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') return <HomeVigilante />;
  if (role === 'ENCARGADO_PARQUEADERO') return <HomeEstacionamiento />;
  if (role === 'CONCEJO') return <HomeConsejo />;
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN') return <HomeAdmin />;
  
  return <HomeResidente />;
}

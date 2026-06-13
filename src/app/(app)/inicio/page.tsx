"use client";

/**
 * INICIO DASHBOARD - CONJUNTOSAPP
 * Sincronización de datos reales del usuario y Panel de Notificaciones.
 */

import { 
  ArrowRight, Bell, Building2, Calendar, Car, CreditCard, DollarSign,
  Megaphone, MessageSquare, MoreHorizontal, ChevronLeft, 
  Search, SlidersHorizontal, ShoppingBag, User as UserIcon
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import RoleSwitcher from "@/components/shell/RoleSwitcher";
import CelebrationModal from "@/components/modals/CelebrationModal";
import ContentActionModal from "@/components/modals/ContentActionModal";
import SearchModal from "@/components/search/SearchModal";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import type { AnuncioDto } from "@/lib/api/types";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import Image from "next/image";
import { toast } from "sonner";
import { useWsSubscription } from "@/hooks/useWebSocket";

function HomeResidente() {
  const router = useRouter();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [showCelebration, setShowCelebration] = useState<any>(null);
  const [selectedFeedItem, setSelectedFeedItem] = useState<AnuncioDto | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [financialData, setFinancialData] = useState<{ totalDebt: number; pagos: any[]; recibos: any[] }>({
    totalDebt: 0,
    pagos: [],
    recibos: []
  });

  const categories = [
    { title: "Citofonía", icon: <UserIcon size={20}/>, color: "from-blue-500 to-pink-500", path: "/citofonia" },
    { title: "Pagos", icon: <CreditCard size={20}/>, color: "from-[#009df2] to-[#007ac2]", path: "/pagos" },
    { title: "Parqueo", icon: <Car size={20}/>, color: "from-emerald-500 to-emerald-700", path: "/parqueadero" },
    { title: "Reservas", icon: <Calendar size={20}/>, color: "from-blue-500 to-cyan-400", path: "/reservas" },
    { title: "Cartelera", icon: <Megaphone size={20}/>, color: "from-red-500 to-orange-500", path: "/cartelera" },
    { title: "PQRS", icon: <MessageSquare size={20}/>, color: "from-blue-500 to-indigo-600", path: "/pqrs" },
    { title: "Inmuebles", icon: <Building2 size={20}/>, color: "from-amber-500 to-orange-400", path: "/inmobiliaria" },
    { title: "Clasificados", icon: <ShoppingBag size={20}/>, color: "from-blue-400 to-indigo-500", path: "/clasificados" },
  ];

  const [anuncios, setAnuncios] = useState<AnuncioDto[]>([]);
  const [isLoadingAnuncios, setIsLoadingAnuncios] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [activeAsamblea, setActiveAsamblea] = useState<{ id: string; titulo: string; descripcion?: string } | null>(null);

  const fetchAnuncios = useCallback(async () => {
    try {
      setIsLoadingAnuncios(true);
      const data = await api.get<AnuncioDto[]>('/anuncios');
      setAnuncios(data);
    } catch (e) {
      
    } finally {
      setIsLoadingAnuncios(false);
    }
  }, []);

  const fetchNotificaciones = useCallback(async () => {
    try {
      const data = await api.get<import('@/lib/api/types').NotificacionDto[]>('/notificaciones');
      setNotificaciones(data.filter((n) => !n.leida));
    } catch {
      // silently ignore
    }
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const data = await api.get<import('@/lib/api/types').ProfileResponse>('/usuarios/me/profile');
      setUserData(data);
    } catch (e) { 
       
    }
  }, []);

  const markAsRead = async (id: string) => {
      try {
          await api.put('/notificaciones/marcar-leidas', { ids: [id] });
          setNotificaciones(prev => prev.filter(n => n.id !== id));
      } catch {
          // silently ignore
      }
  };

  const fetchFinance = useCallback(async () => {
    try {
      const data = await api.get<{ pagos: any[]; recibos: any[] }>('/pagos');
      const pagos = data?.pagos ?? [];
      const recibos = data?.recibos ?? [];
      const totalDebt = pagos
        .filter((p: any) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO')
        .reduce((sum: number, p: any) => sum + parseFloat(p.monto || '0'), 0);
      setFinancialData({ totalDebt, pagos, recibos });
    } catch (e) {
      
    }
  }, []);

  // Real-time WebSocket subscriptions
  useWsSubscription('notification', () => fetchNotificaciones());
  useWsSubscription('pago', () => fetchFinance());
  useWsSubscription('anuncio', () => fetchAnuncios());

  const fetchActiveAsamblea = useCallback(async () => {
    try {
      const data = await api.get<any>('/asambleas/activa/session');
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
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-home", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.2 });
    }, containerRef);
    return () => ctx.revert();
  }, [user, fetchNotificaciones, fetchFinance, fetchUserData, fetchAnuncios, fetchActiveAsamblea]);

  return (
    <div ref={containerRef} className="flex flex-col gap-8 p-6 overflow-x-hidden pt-16 pb-32">
      <RoleSwitcher />
      {showCelebration && (
        <CelebrationModal 
          tipo={showCelebration.tipo}
          titulo={showCelebration.titulo}
          mensaje={showCelebration.mensaje}
          onClose={() => {
            markAsRead(showCelebration.id);
            setShowCelebration(null);
          }}
        />
      )}

      {/* 🏛️ UNIFIED HEADER GROUP */}
      <header className="fade-up-home flex flex-col gap-6">
        <ProfileHeader />
        
        {/* SEARCH BAR */}
        <div className="flex gap-3">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="relative flex-1 group text-left"
          >
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-text/50 group-hover:text-accent transition-colors" />
            <div className="w-full bg-primary-light/50 border border-border rounded-[24px] py-4 pl-14 pr-6 text-sm text-text/50 hover:border-accent/30 hover:bg-primary-light/80 transition-all shadow-inner cursor-pointer select-none">
              Buscar o preguntar algo...
            </div>
          </button>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-14 h-14 rounded-[22px] bg-primary-light/80 border border-border flex items-center justify-center text-text/60 hover:text-accent hover:border-accent/30 transition-all active:scale-95 shadow-lg"
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </header>

      {/* ASSEMBLY LIVE BANNER — only shown when there's an active assembly */}
      {activeAsamblea && (
        <div 
          onClick={() => router.push('/asamblea')}
          className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[90px] shadow-[0_15px_30px_rgba(239,68,68,0.2)] border border-red-500/20 group cursor-pointer hover:border-red-500/40 transition-all"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-red-950/80 via-blue-950/70 to-red-950/80 opacity-95" />
          <div className="absolute inset-0 p-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/40 animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              </div>
              <div>
                <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest block">Sesion en Vivo</span>
                <h3 className="text-sm font-display font-bold text-white tracking-tight">{activeAsamblea.titulo}</h3>
                {activeAsamblea.descripcion && (
                  <p className="text-white/60 text-[9px] mt-0.5 line-clamp-1">{activeAsamblea.descripcion}</p>
                )}
              </div>
            </div>
            <div className="bg-red-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-1">
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
          pagos: financialData.pagos,
          anuncios: anuncios.map(a => ({ titulo: a.titulo, contenido: a.contenido }))
        }}
      />

      {/* 🧭 CATEGORÍAS PREMIUM */}
      <section className="fade-up-home flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
           <h2 className="text-xs font-bold uppercase tracking-widest text-text/50">Navegación</h2>
           <ArrowRight size={14} className="text-text/45" />
        </div>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 px-1 -mx-1">
          {categories.map((cat, idx) => (
            <div 
              key={idx} 
              onClick={() => router.push(cat.path)}
              className="flex flex-col items-center gap-2"
            >
              <div className={`w-[84px] h-[106px] rounded-[32px] bg-gradient-to-br ${cat.color} flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-2xl cursor-pointer p-4`}>
                  <div className="text-white scale-125 mb-1">{cat.icon}</div>
                  <span className="text-[10px] font-bold text-white uppercase text-center block w-full truncate tracking-tighter opacity-90">{cat.title}</span>
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
                        onClick={() => markAsRead(n.id)}
                        className="min-w-[280px] bg-linear-to-r from-accent/20 to-accent/5 border border-accent/30 rounded-[22px] p-4 flex flex-col gap-2 cursor-pointer hover:bg-text/5 transition-all shadow-lg shadow-accent/5 group"
                      >
                          <div className="flex justify-between items-start">
                              <span className="text-[10px] font-black text-accent uppercase tracking-tighter">{n.tipo}</span>
                              <div className="w-2 h-2 rounded-full bg-accent group-hover:scale-150 transition-transform" />
                          </div>
                          <h3 className="text-text text-sm font-bold truncate">{n.titulo}</h3>
                          <p className="text-[11px] text-text/60 line-clamp-2 leading-relaxed">{n.mensaje}</p>
                      </div>
                  ))}
              </div>
          </section>
      )}

      {/* WALLET HERO */}
      <section 
        className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[120px] shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/10 group overflow-hidden transition-all"
      >
        <div className={`absolute inset-0 bg-linear-to-br ${financialData.totalDebt > 0 ? 'from-[#3f3f46] via-[#27272A] to-[#18181B]' : 'from-[#065F46] via-[#064E3B] to-[#047857]'} opacity-90`} />
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                 <CreditCard size={14} className="text-white/70" />
               </div>
               <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Mi Cuota</span>
            </div>
            {financialData.totalDebt > 0 ? (
              <div className="px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 text-[10px] text-accent font-bold uppercase animate-pulse">Pendiente</div>
            ) : (
              <div className="px-2.5 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-[10px] text-green-400 font-bold uppercase">Paz y Salvo</div>
            )}
          </div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-display font-bold text-white tracking-tight">
                $ {financialData.totalDebt.toLocaleString()}
              </h2>
              <p className="text-white/60 text-[10px] mt-0.5">
                {financialData.totalDebt > 0 ? "Saldo pendiente" : "Al dia con tus pagos"}
              </p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); router.push('/pagos'); }}
              className="bg-white text-[#0A0A0B] text-[11px] font-bold px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all relative z-20"
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
           <span className="text-text/60 text-[10px] font-bold uppercase tracking-widest">Hoy</span>
         </div>
         <section className="fade-up-home flex justify-between items-center py-4 border-t border-border mt-4">
          <div className="flex flex-col">
              <span className="text-[10px] font-black text-text/50 uppercase tracking-widest">ConjuntOS v3.2</span>
              <span className="text-[9px] text-text/40 uppercase">Resident Edition</span>
          </div>
          <button onClick={() => router.push('/perfil')} className="flex items-center gap-2 text-text/60 hover:text-text transition-colors">
              <span className="text-[10px] font-bold uppercase tracking-tighter">Mi Cuenta</span>
              <ArrowRight size={14} />
          </button>
      </section>
         {isLoadingAnuncios ? (
           <div className="py-10 flex flex-col items-center justify-center gap-3">
             <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
             <span className="text-[10px] font-bold text-text/30 uppercase tracking-widest animate-pulse">Cargando novedades...</span>
           </div>
         ) : anuncios.length === 0 ? (
           <div className="py-10 flex flex-col items-center justify-center gap-3">
             <Megaphone size={32} className="text-text/30" />
             <span className="text-[10px] font-bold text-text/30 uppercase tracking-widest">Sin novedades por ahora</span>
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
              image: selectedFeedItem.imagenUrl,
              category: selectedFeedItem.tipo,
              type: 'POST',
            }} 
            userData={userData}
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
            <div className="w-10 h-10 rounded-full flex items-center justify-center border border-border font-bold text-xs bg-linear-to-tr from-blue-500 to-pink-500 text-white">
               {anuncio.tipo?.[0] || 'A'}
            </div>
            <div>
               <h4 className="text-sm font-bold text-text leading-none mb-1">{anuncio.tipo}</h4>
               <p className="text-[10px] text-text/60 flex items-center gap-1 font-medium">
                  {timeAgo(anuncio.publicadoEn)} {anuncio.fijado && '• Fijado'}
               </p>
            </div>
         </div>
         <MoreHorizontal size={18} className="text-text/60" />
      </div>

      <div className="px-5 pb-2">
         <h2 className="text-xl font-display font-semibold text-text mb-2 leading-tight">{anuncio.titulo}</h2>
         <p className="text-sm text-text/80 leading-relaxed font-normal mb-4 line-clamp-3">{anuncio.contenido}</p>
      </div>

      {anuncio.imagenUrl && (
         <div className="relative h-56 w-full group overflow-hidden">
            <Image src={anuncio.imagenUrl} alt={anuncio.titulo} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" unoptimized />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-60" />
         </div>
      )}

      <div className="p-4 flex items-center justify-between border-t border-border bg-surface/40 backdrop-blur-xl mt-auto rounded-b-[32px]">
         <span className="text-text/60 text-[11px] flex items-center gap-1.5 font-semibold uppercase tracking-wider">
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
  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <RoleSwitcher />
      <ProfileHeader />
      <div className="liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
        <h2 className="text-2xl font-bold text-text mb-2">Central de Guardia</h2>
        <p className="text-text/50 text-sm mb-6">Módulo de control de acceso y paquetería.</p>
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
        className="fade-up bg-linear-to-r from-blue-950 via-slate-900 to-blue-950 rounded-[28px] p-6 border border-blue-500/20 shadow-2xl text-white cursor-pointer hover:border-blue-500/40 transition-all flex justify-between items-center group active:scale-98"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300">
            <Car size={22} />
          </div>
          <div>
            <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest block mb-0.5">Control Operativo</span>
            <h3 className="text-lg font-display font-bold leading-tight">Mapa de Parqueaderos</h3>
            <p className="text-white/60 text-xs mt-0.5">Ver celdas libres, registrar ingresos/salidas y realizar rondas.</p>
          </div>
        </div>
        <button className="bg-blue-500 text-primary text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all cursor-pointer">
          Ingresar
        </button>
      </div>

      {/* Estadísticas de Ocupación */}
      <div className="fade-up liquid-glass rounded-[28px] p-6 border border-border shadow-2xl">
        <h3 className="text-base font-bold text-text mb-4">Estado del Parqueadero</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-2 border border-border rounded-2xl p-4 text-center">
            <span className="text-2xl font-black text-text">{stats.ocupacion}%</span>
            <p className="text-[9px] text-text/60 uppercase font-bold mt-1">Ocupación</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-2xl p-4 text-center">
            <span className="text-2xl font-black text-emerald-500">{stats.libres}</span>
            <p className="text-[9px] text-text/60 uppercase font-bold mt-1">Libres</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-2xl p-4 text-center">
            <span className="text-2xl font-black text-amber-500">{stats.ocupados}</span>
            <p className="text-[9px] text-text/60 uppercase font-bold mt-1">Ocupados</p>
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
        <p className="text-text/60 text-xs">Consejo de Administración (Órgano Consultor Ley 675/2001)</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* FINANZAS READ ONLY CARD */}
        <div 
          onClick={() => router.push('/admin-finanzas')}
          className="fade-up p-5 rounded-[28px] bg-linear-to-br from-emerald-600/10 to-teal-600/10 border border-emerald-500/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-emerald-500/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-300 border border-emerald-500/30">
            <DollarSign size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text mb-0.5">Finanzas</h4>
            <p className="text-[9px] text-text/50">Cobros y reportes consolidados</p>
          </div>
        </div>

        {/* ANUNCIOS/CIRCULARES */}
        <div 
          onClick={() => router.push('/cartelera')}
          className="fade-up p-5 rounded-[28px] bg-linear-to-br from-blue-600/10 to-pink-600/10 border border-blue-500/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-blue-500/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-300 border border-blue-500/30">
            <Building2 size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text mb-0.5">Cartelera</h4>
            <p className="text-[9px] text-text/50">Ver circulares y anuncios generales</p>
          </div>
        </div>
      </div>

      {/* Resumen Agregado */}
      <div className="fade-up liquid-glass rounded-[28px] p-6 border border-border shadow-2xl">
        <h3 className="text-base font-bold text-text mb-4">Informes de Gestión</h3>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center bg-surface-2 p-4 rounded-2xl border border-border">
            <span className="text-xs text-text/70 uppercase font-bold">Recaudación General</span>
            <span className="text-sm font-black text-emerald-500">${Number(stats.recaudoMes || 0).toLocaleString()} COP</span>
          </div>
          <div className="flex justify-between items-center bg-surface-2 p-4 rounded-2xl border border-border">
            <span className="text-xs text-text/70 uppercase font-bold">Novedades / Solicitudes</span>
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
    api.get<any>('/asambleas/activa/session')
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
          className="w-full bg-linear-to-r from-blue-950 via-indigo-950 to-blue-950 rounded-[28px] p-6 border border-blue-500/30 shadow-2xl text-white cursor-pointer hover:border-blue-500/50 transition-all flex justify-between items-center group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300">
              <Building2 size={22} />
            </div>
            <div>
              <span className="text-[9px] text-blue-300 font-black uppercase tracking-widest block mb-0.5">Modulo de Plataforma</span>
              <h3 className="text-lg font-display font-bold leading-tight text-white">Panel SuperAdmin</h3>
              <p className="text-white/60 text-xs mt-0.5">Registrar copropiedades y gestionar conjuntos.</p>
            </div>
          </div>
          <button className="bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1 group-hover:bg-blue-500 cursor-pointer">
            Gestionar <ArrowRight size={10} />
          </button>
        </div>
      )}

      {/* LIVE ASSEMBLY ADMIN CONTROL — only when active */}
      {activeAsamblea && (
        <div 
          onClick={() => router.push('/asamblea')}
          className="w-full bg-linear-to-r from-blue-950 via-blue-900 to-blue-950 rounded-[28px] p-6 border border-accent/20 shadow-2xl text-white cursor-pointer hover:border-accent/40 transition-all flex justify-between items-center group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <span className="w-3.5 h-3.5 rounded-full bg-accent animate-ping" />
            </div>
            <div>
              <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest block mb-0.5">En Vivo</span>
              <h3 className="text-lg font-display font-bold leading-tight text-white">{activeAsamblea.titulo}</h3>
              {activeAsamblea.descripcion && (
                <p className="text-white/60 text-xs mt-0.5 line-clamp-1">{activeAsamblea.descripcion}</p>
              )}
            </div>
          </div>
          <button className="bg-accent text-primary text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1 group-hover:bg-accent/80 cursor-pointer">
            Moderar <ArrowRight size={10} />
          </button>
        </div>
      )}

      {/* QUICK ACCESSIBLE ACTIONS */}
      <div className="grid grid-cols-2 gap-4">
        {/* CITOFONÍA CARD */}
        <div 
          onClick={() => router.push('/citofonia')}
          className="p-5 rounded-[28px] bg-linear-to-br from-blue-600/15 to-pink-600/15 border border-blue-500/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-blue-500/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-300 border border-blue-500/30">
            <UserIcon size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text mb-0.5">Citofonía</h4>
            <p className="text-[9px] text-text/50">Llamar a unidades y portería</p>
          </div>
        </div>

        {/* NOVEDADES CARD */}
        <div 
          onClick={() => router.push('/admin-novedades')}
          className="p-5 rounded-[28px] bg-linear-to-br from-emerald-600/15 to-teal-600/15 border border-emerald-500/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-emerald-500/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-300 border border-emerald-500/30">
            <Building2 size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text mb-0.5">Novedades</h4>
            <p className="text-[9px] text-text/50">Crear anuncios y circulares</p>
          </div>
        </div>
      </div>

      {/* GESTIÓN GENERAL CARD */}
      <div className="liquid-glass rounded-[28px] p-6 border border-border shadow-2xl text-text">
        <h2 className="text-base font-bold mb-2">Gestión del Conjunto</h2>
        <p className="text-[11px] text-text/60 leading-relaxed mb-6">Accede a las herramientas de control de finanzas y parqueaderos.</p>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => router.push('/admin-finanzas')}
            className="w-full py-4 px-5 rounded-2xl bg-text/5 hover:bg-text/10 border border-border/40 text-left text-xs font-bold text-text flex items-center justify-between group active:scale-98 transition-all cursor-pointer"
          >
            <span>Ver Finanzas y Cartera</span>
            <ArrowRight size={14} className="text-text/45 group-hover:text-accent group-hover:translate-x-1 transition-all" />
          </button>
          
          <button 
            onClick={() => router.push('/admin-parqueadero')}
            className="w-full py-4 px-5 rounded-2xl bg-text/5 hover:bg-text/10 border border-border/40 text-left text-xs font-bold text-text flex items-center justify-between group active:scale-98 transition-all cursor-pointer"
          >
            <span>Control de Parqueaderos</span>
            <ArrowRight size={14} className="text-text/45 group-hover:text-accent group-hover:translate-x-1 transition-all" />
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

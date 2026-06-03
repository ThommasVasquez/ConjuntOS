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
import CelebrationModal from "@/components/modals/CelebrationModal";
import ContentActionModal from "@/components/modals/ContentActionModal";
import SearchModal from "@/components/search/SearchModal";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import Image from "next/image";
import { toast } from "sonner";

interface FeedItem {
  id: number;
  type: 'POST' | 'AD';
  category?: string;
  brand?: string;
  title: string;
  content: string;
  image?: string;
  tag: string;
  icon?: React.ReactNode;
  cta?: string;
}

function HomeResidente() {
  const router = useRouter();
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [showCelebration, setShowCelebration] = useState<any>(null);
  const [selectedFeedItem, setSelectedFeedItem] = useState<FeedItem | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [financialData, setFinancialData] = useState<{ totalDebt: number; pagos: any[]; recibos: any[] }>({
    totalDebt: 0,
    pagos: [],
    recibos: []
  });

  const categories = [
    { title: "Citofonía", icon: <UserIcon size={20}/>, color: "from-purple-500 to-pink-500", path: "/citofonia" },
    { title: "Pagos", icon: <CreditCard size={20}/>, color: "from-[#D946EF] to-[#9333EA]", path: "/pagos" },
    { title: "Parqueo", icon: <Car size={20}/>, color: "from-emerald-500 to-emerald-700", path: "/parqueadero" },
    { title: "Reservas", icon: <Calendar size={20}/>, color: "from-blue-500 to-cyan-400", path: "/reservas" },
    { title: "Cartelera", icon: <Megaphone size={20}/>, color: "from-red-500 to-orange-500", path: "/cartelera" },
    { title: "PQRS", icon: <MessageSquare size={20}/>, color: "from-blue-500 to-indigo-600", path: "/pqrs" },
    { title: "Inmuebles", icon: <Building2 size={20}/>, color: "from-amber-500 to-orange-400", path: "/inmobiliaria" },
    { title: "Clasificados", icon: <ShoppingBag size={20}/>, color: "from-blue-400 to-indigo-500", path: "/clasificados" },
  ];

  const allFeedItems: FeedItem[] = [
    {
      id: 1,
      type: 'POST',
      category: 'Administración',
      title: 'Asamblea Extraordinaria',
      content: 'Estimados copropietarios: Se les convoca a la reunión este domingo a las 9:00 AM en el lobby principal para tratar temas de seguridad y convivencia.',
      image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1000',
      tag: 'Importante',
      icon: <Megaphone className="text-yellow-400" size= {16} />
    },
    {
      id: 2,
      type: 'AD',
      brand: 'Premium Car Wash',
      title: 'Tu vehículo como nuevo',
      content: 'Descuento especial del 20% para residentes de EnConjunto. ¡Agitá tu vida, no tu auto!',
      image: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&q=80&w=1000',
      tag: 'Patrocinado',
      cta: 'Ver Oferta'
    },
    {
      id: 8,
      type: 'AD',
      brand: 'Pizza Now',
      title: 'Noche de Pizzas',
      content: '2x1 en pizzas familiares solo para pedidos dentro del conjunto. ¡Llegamos en 20 minutos!',
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=1000',
      tag: 'Cena'
    },
    {
      id: 3,
      type: 'POST',
      category: 'Seguridad',
      title: 'Nuevos Refuerzos en Portería',
      content: 'Damos la bienvenida al nuevo equipo de seguridad que estará apoyando las labores de vigilancia 24/7 desde el próximo lunes.',
      image: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&q=80&w=1000',
      tag: 'Informativo'
    },
    {
      id: 4,
      type: 'POST',
      category: 'Eventos',
      title: 'Cine bajo las Estrellas',
      content: 'Acompañanos este viernes en la zona social para una noche de película familiar. Trae tu manta y nosotros ponemos las palomitas.',
      image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&w=1000',
      tag: 'Social'
    },
    {
      id: 5,
      type: 'AD',
      brand: 'FitHealth Gym',
      title: 'Entrená cerca de casa',
      content: 'Inscríbete hoy y recibe el primer mes gratis. Ubicados a solo 5 minutos del conjunto.',
      image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=1000',
      tag: 'Patrocinado'
    },
    {
      id: 6,
      type: 'POST',
      category: 'Mantenimiento',
      title: 'Lavado de Tanques',
      content: 'Se realizará el mantenimiento preventivo de los tanques de agua el próximo miércoles de 8:00 AM a 2:00 PM. Se recomienda almacenar agua.',
      image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=1000',
      tag: 'Mantenimiento'
    },
    {
      id: 7,
      type: 'POST',
      category: 'Comunidad',
      title: 'Mercadillo de Emprendedores',
      content: 'Este sábado tendremos la feria de emprendimiento de vecinos en el parque central. ¡Ven a apoyar el talento local!',
      image: 'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&q=80&w=1000',
      tag: 'Eventos'
    },
    {
      id: 9,
      type: 'POST',
      category: 'Admin',
      title: 'Actualización de Datos',
      content: 'Por favor actualiza tu información de contacto en el perfil para recibir las circulares digitales y notificaciones de paquetería.',
      image: 'https://images.unsplash.com/photo-1454165833767-0208170669f4?auto=format&fit=crop&q=80&w=1000',
      tag: 'Perfil'
    },
    {
      id: 10,
      type: 'POST',
      category: 'Seguridad',
      title: 'Control de Mascotas',
      content: 'Recordamos a todos los dueños el uso obligatorio de correa en zonas comunes y la limpieza de desechos. Mantengamos el conjunto limpio.',
      image: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&q=80&w=1000',
      tag: 'Convivencia'
    }
  ];

  const [visibleItems, setVisibleItems] = useState<FeedItem[]>(allFeedItems.slice(0, 5));
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  const loadMoreItems = useCallback(() => {
    if (isLoadingMore || visibleItems.length >= allFeedItems.length) return;
    setIsLoadingMore(true);
    
    // Simular un retardo para mostrar la carga premium
    setTimeout(() => {
      const nextPage = currentPage + 1;
      const nextBatch = allFeedItems.slice(0, nextPage * 5);
      setVisibleItems(nextBatch);
      setCurrentPage(nextBatch.length / 5); // Correct page calculation
      setIsLoadingMore(false);
    }, 1200);
  }, [isLoadingMore, visibleItems.length, allFeedItems.length, currentPage]);

  const fetchNotificaciones = useCallback(async () => {
    try {
      const res = await fetch('/api/notificaciones');
      const data = await res.json();
      if (data.success) {
        setNotificaciones(data.data.filter((n: any) => !n.leida));
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const res = await fetch('/api/user/profile');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.success) setUserData(data.data);
    } catch (e) { 
      console.error("Error fetching user data"); 
    }
  }, []);

  const triggerMockDelivery = useCallback((itemName: string) => {
     // 1. Guardar Notificación en el estado y LocalStorage
     const mockNotif = {
        id: `mock_${Date.now()}`,
        tipo: 'SISTEMA',
        titulo: '¡Pedido en Portería!',
        mensaje: `Tu pedido de "${itemName}" ya está en la portería del conjunto.`,
        creadoEn: new Date().toISOString(),
        leida: false
     };
     setNotificaciones(prev => [mockNotif, ...prev]);

     // 2. Guardar el PAQUETE en LocalStorage para persistencia
     const mockPackage = {
        id: `pkg_${Date.now()}`,
        origen: itemName.includes("Pizza") ? "Pizza Now" : "Comercio Local",
        remitente: itemName,
        guia: `SIM-${Math.floor(Math.random()*9000)+1000}`,
        estado: "EN_PORTERIA",
        fechaLlegada: new Date().toISOString()
     };
     
     const stored = JSON.parse(localStorage.getItem('conjuntos_sim_paquetes') || '[]');
     localStorage.setItem('conjuntos_sim_paquetes', JSON.stringify([mockPackage, ...stored]));

     toast.info("¡Nueva notificación en portería!");
  }, []);

  const triggerRandomServientrega = useCallback(() => {
    const mockNotif = {
      id: `servi_${Date.now()}`,
      tipo: 'NORMAL',
      titulo: '📦 Nuevo Paquete (Cali)',
      mensaje: `Ha llegado un paquete de Cali vía Servientrega destinado a tu apartamento.`,
      creadoEn: new Date().toISOString(),
      leida: false
    };
    setNotificaciones(prev => [mockNotif, ...prev]);

    const mockPackage = {
      id: `pkg_servi_${Date.now()}`,
      origen: "Cali",
      remitente: "Servientrega",
      guia: `7788${Math.floor(Math.random()*1000000)}`,
      estado: "EN_PORTERIA",
      fechaLlegada: new Date().toISOString()
    };
    const stored = JSON.parse(localStorage.getItem('conjuntos_sim_paquetes') || '[]');
    localStorage.setItem('conjuntos_sim_paquetes', JSON.stringify([mockPackage, ...stored]));

    toast.success("📦 ¡Acaba de llegar un paquete de Cali!", { duration: 5000 });
  }, []);

  const markAsRead = async (id: string) => {
      try {
          await fetch('/api/notificaciones', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, leida: true })
          });
          setNotificaciones(prev => prev.filter(n => n.id !== id));
      } catch (e) { console.error("Error marking as read", e); }
  };

  const fetchFinance = useCallback(async () => {
    try {
      const res = await fetch('/api/user/pagos');
      if (!res.ok) throw new Error("Finance API error");
      const data = await res.json();
      if (data.success) setFinancialData(data.data);
    } catch (e) {
      console.error("Error fetching finance data", e);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchNotificaciones();
      fetchFinance();
      fetchUserData();

      // SIMULACIÓN ALEATORIA: Paquete de Cali
      const timer = setTimeout(() => {
        const alreadyHappened = sessionStorage.getItem('sim_servi_done');
        if (!alreadyHappened) {
           triggerRandomServientrega();
           sessionStorage.setItem('sim_servi_done', 'true');
        }
      }, 30000); // 30 segundos de espera para el efecto sorpresa

      return () => clearTimeout(timer);
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-home", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.2 });
    }, containerRef);
    return () => ctx.revert();
  }, [session, fetchNotificaciones, fetchFinance, fetchUserData, triggerRandomServientrega]);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMoreItems();
      }
    }, { threshold: 0.1 });

    observer.observe(loader);
    return () => observer.disconnect();
  }, [loadMoreItems]);

  return (
    <div ref={containerRef} className="flex flex-col gap-8 p-6 overflow-x-hidden pt-16 pb-32">
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

      {/* 🔴 ASSEMBLY LIVE BANNER */}
      <div 
        onClick={() => router.push('/asamblea')}
        className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[90px] shadow-[0_15px_30px_rgba(239,68,68,0.2)] border border-red-500/20 group cursor-pointer hover:border-red-500/40 transition-all"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-950/80 via-purple-950/70 to-red-950/80 opacity-95" />
        <div className="absolute inset-0 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/40 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
            <div>
              <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest block">Sesión en Vivo</span>
              <h3 className="text-sm font-display font-bold text-white tracking-tight">Asamblea General Ordinaria</h3>
              <p className="text-white/60 text-[9px] mt-0.5">Únete y participa en la votación del presupuesto 2026</p>
            </div>
          </div>
          <div className="bg-red-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-1">
            Entrar <ArrowRight size={10} />
          </div>
        </div>
      </div>

      {/* SEARCH MODAL */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        context={{
          userName: userData?.nombre || session?.user?.name || undefined,
          totalDebt: financialData.totalDebt,
          pagos: financialData.pagos,
          anuncios: allFeedItems.filter(f => f.type === 'POST').map(f => ({ titulo: f.title, contenido: f.content }))
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
                        className="min-w-[280px] bg-linear-to-r from-accent/20 to-purple-500/10 border border-accent/30 rounded-[22px] p-4 flex flex-col gap-2 cursor-pointer hover:bg-text/5 transition-all shadow-lg shadow-accent/5 group"
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
        <div className={`absolute inset-0 bg-linear-to-br ${financialData.totalDebt > 0 ? 'from-[#4C1D95] via-[#331A4D] to-[#BE185D]' : 'from-[#065F46] via-[#064E3B] to-[#047857]'} opacity-90`} />
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
                {financialData.totalDebt > 0 ? "Vence en 4 days • Abril 2026" : "Corte al día • Abril 2026"}
              </p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); router.push('/pagos'); }}
              className="bg-white text-[#05020a] text-[11px] font-bold px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all relative z-20"
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
         {visibleItems.map((post) => (
            <div key={post.id} onClick={() => setSelectedFeedItem(post)} className="cursor-pointer">
              <PostCard post={post} />
            </div>
          ))}
          
          {/* LOADER / SPINNER */}
          <div ref={loaderRef} className="py-10 flex flex-col items-center justify-center gap-3">
             {isLoadingMore ? (
               <>
                 <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
                 <span className="text-[10px] font-bold text-text/30 uppercase tracking-widest animate-pulse">Cargando novedades...</span>
               </>
             ) : (
               <div className="w-1.5 h-1.5 rounded-full bg-border" />
             )}
          </div>
       </section>

       {selectedFeedItem && (
         <ContentActionModal 
           item={selectedFeedItem} 
           userData={userData}
           onClose={() => setSelectedFeedItem(null)} 
           onActionComplete={(itemName) => triggerMockDelivery(itemName)}
         />
       )}
    </div>
  );
}

function PostCard({ post }: { post: FeedItem }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="fade-up-home liquid-glass-card rounded-[32px] flex flex-col shadow-2xl border-t border-border/20 transition-all active:scale-[0.98] relative overflow-hidden">
      
      {/* AD INDICATOR (Badge) */}
      {post.type === 'AD' && (
         <div className="absolute top-4 right-14 z-20 px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-[9px] font-black text-accent uppercase tracking-widest">
            Patrocinado
         </div>
      )}

      <div className="p-5 flex justify-between items-center relative z-10">
         <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border border-border font-bold text-xs ${post.type === 'AD' ? 'bg-accent text-primary' : 'bg-linear-to-tr from-purple-500 to-pink-500 text-white'}`}>
               {post.type === 'AD' ? 'AD' : (post.category?.[0] || 'A')}
            </div>
            <div>
               <h4 className="text-sm font-bold text-text leading-none mb-1">{post.type === 'AD' ? post.brand : post.category}</h4>
               <p className="text-[10px] text-text/60 flex items-center gap-1 font-medium">
                  {post.type === 'AD' ? 'Publicidad' : `Hace ${post.id} horas`} • {post.tag}
               </p>
            </div>
         </div>
         <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-8 h-8 rounded-full flex items-center justify-center text-text/60 hover:text-text">
            <MoreHorizontal size={18} />
         </button>
      </div>

      <div className="px-5 pb-2">
         <h2 className="text-xl font-display font-semibold text-text mb-2 leading-tight">{post.title}</h2>
         <p className="text-sm text-text/80 leading-relaxed font-normal mb-4">{post.content}</p>
         
         {post.type === 'AD' && post.cta && (
            <button className="mb-4 px-6 py-2.5 rounded-full bg-accent text-primary font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-lg shadow-accent/20">
               {post.cta}
            </button>
         )}
      </div>

      {post.image && (
         <div className="relative h-56 w-full group overflow-hidden">
            <Image src={post.image} alt={post.title} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" unoptimized />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-60" />
         </div>
      )}

      <div className="p-4 flex items-center justify-between border-t border-border bg-surface/40 backdrop-blur-xl mt-auto rounded-b-[32px]">
         <button className="text-text/60 text-[11px] flex items-center gap-1.5 hover:text-text transition-colors font-semibold uppercase tracking-wider">
            {post.type === 'AD' ? 'Más Info' : '¿Dudas?'} <Bell size={12} />
         </button>
         <button className="text-accent text-[11px] font-bold flex items-center gap-1.5 hover:accent-glow transition-all uppercase tracking-widest">
            {post.type === 'AD' ? 'Contactar' : 'Ver Circular'} <ChevronLeft size={14} className="rotate-180" />
         </button>
      </div>
    </div>
  );
}

function HomeVigilante() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
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
    fetch("/api/parqueadero/stats")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setStats(json.data);
      })
      .catch((err) => console.error("Error fetching parking stats:", err));
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
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
  const [stats, setStats] = useState({ recaudado: 0, novedadesPendientes: 0 });

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setStats(json.data);
      })
      .catch((err) => console.error("Error fetching council stats:", err));
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
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
          className="fade-up p-5 rounded-[28px] bg-linear-to-br from-purple-600/10 to-pink-600/10 border border-purple-500/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-purple-500/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-300 border border-purple-500/30">
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
            <span className="text-sm font-black text-emerald-500">${stats.recaudado.toLocaleString()} COP</span>
          </div>
          <div className="flex justify-between items-center bg-surface-2 p-4 rounded-2xl border border-border">
            <span className="text-xs text-text/70 uppercase font-bold">Novedades / Solicitudes</span>
            <span className="text-sm font-black text-text">{stats.novedadesPendientes} Pendientes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeAdmin() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />
      
      {/* 👑 SUPER ADMIN SPECIAL CARD */}
      {role === "SUPER_ADMIN" && (
        <div 
          onClick={() => router.push('/superadmin')}
          className="w-full bg-linear-to-r from-violet-950 via-indigo-950 to-purple-950 rounded-[28px] p-6 border border-violet-500/30 shadow-2xl text-white cursor-pointer hover:border-violet-500/50 transition-all flex justify-between items-center group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300">
              <Building2 size={22} className="animate-pulse" />
            </div>
            <div>
              <span className="text-[9px] text-violet-300 font-black uppercase tracking-widest block mb-0.5">Módulo de Plataforma</span>
              <h3 className="text-lg font-display font-bold leading-tight text-white">Panel SuperAdmin</h3>
              <p className="text-white/60 text-xs mt-0.5">Registrar copropiedades y personería jurídica bajo la Ley 675.</p>
            </div>
          </div>
          <button className="bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1 group-hover:bg-violet-500 cursor-pointer">
            Gestionar <ArrowRight size={10} />
          </button>
        </div>
      )}

      {/* 🔴 LIVE ASSEMBLY ADMIN CONTROL CARD */}
      <div 
        onClick={() => router.push('/asamblea')}
        className="w-full bg-linear-to-r from-purple-950 via-purple-900 to-purple-950 rounded-[28px] p-6 border border-accent/20 shadow-2xl text-white cursor-pointer hover:border-accent/40 transition-all flex justify-between items-center group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
            <span className="w-3.5 h-3.5 rounded-full bg-accent animate-ping" />
          </div>
          <div>
            <span className="text-[9px] text-fuchsia-400 font-black uppercase tracking-widest block mb-0.5">Control de Reunión</span>
            <h3 className="text-lg font-display font-bold leading-tight text-white">Asamblea General Activa</h3>
            <p className="text-white/60 text-xs mt-0.5">Abre la mesa de discusión, administra turnos y lee sugerencias de la IA.</p>
          </div>
        </div>
        <button className="bg-accent text-primary text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1 group-hover:bg-accent/80 cursor-pointer">
          Moderar <ArrowRight size={10} />
        </button>
      </div>

      {/* QUICK ACCESSIBLE ACTIONS */}
      <div className="grid grid-cols-2 gap-4">
        {/* CITOFONÍA CARD */}
        <div 
          onClick={() => router.push('/citofonia')}
          className="p-5 rounded-[28px] bg-linear-to-br from-purple-600/15 to-pink-600/15 border border-purple-500/20 flex flex-col justify-between h-[140px] cursor-pointer hover:border-purple-500/40 transition-all shadow-xl group active:scale-95"
        >
          <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-300 border border-purple-500/30">
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
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') return <HomeVigilante />;
  if (role === 'ENCARGADO_PARQUEADERO') return <HomeEstacionamiento />;
  if (role === 'CONCEJO') return <HomeConsejo />;
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN') return <HomeAdmin />;
  
  return <HomeResidente />;
}

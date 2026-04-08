"use client";

/**
 * INICIO DASHBOARD - CONJUNTOSAPP
 * Sincronización de datos reales del usuario y Panel de Notificaciones.
 */

import { 
  Building2, Calendar, Megaphone, Bell, 
  Car, ArrowRight, CreditCard, User as UserIcon, MessageSquare,
  MoreHorizontal, ChevronLeft, Search, SlidersHorizontal, ShoppingBag
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
      setCurrentPage(nextPage);
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
     // 1. Guardar Notificación en el estado y LocalStorage (Stage 68.13)
     const mockNotif = {
        id: `mock_${Date.now()}`,
        tipo: 'SISTEMA',
        titulo: '¡Pedido en Portería!',
        mensaje: `Tu pedido de "${itemName}" ya está en la portería del conjunto.`,
        creadoEn: new Date().toISOString(),
        leida: false
     };
     setNotificaciones(prev => [mockNotif, ...prev]);

     // 2. Guardar el PAQUETE en LocalStorage para persistencia (Stage 68.13)
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

      // SIMULACIÓN ALEATORIA: Paquete de Cali (Stage 68.13)
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

      <ProfileHeader className="fade-up-home" />

      {/* SEARCH BAR */}
      <section className="fade-up-home flex gap-3 -mt-2">
        <button
          onClick={() => setIsSearchOpen(true)}
          className="relative flex-1 group text-left"
        >
          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-hover:text-accent transition-colors" />
          <div className="w-full bg-[#1a1333] border border-white/5 rounded-[24px] py-4 pl-14 pr-6 text-sm text-white/30 hover:border-accent/30 hover:bg-[#1f1640] transition-all shadow-inner cursor-pointer select-none">
            Buscar o preguntar algo...
          </div>
        </button>
        <button
          onClick={() => setIsSearchOpen(true)}
          className="w-14 h-14 rounded-[22px] bg-[#241a4a] border border-white/5 flex items-center justify-center text-white/60 hover:text-accent hover:border-accent/30 transition-all active:scale-95 shadow-lg"
        >
          <SlidersHorizontal size={20} />
        </button>
      </section>

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
           <h2 className="text-xs font-bold uppercase tracking-widest text-white/30">Navegación</h2>
           <ArrowRight size={14} className="text-white/20" />
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
                  <h2 className="text-white font-display text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                      <Bell size={14} className="text-accent animate-pulse" /> Avisos Recientes
                  </h2>
                  <span className="text-accent text-[10px] font-bold">{notificaciones.length} nuevos</span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
                  {notificaciones.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => markAsRead(n.id)}
                        className="min-w-[280px] bg-linear-to-r from-accent/20 to-purple-500/10 border border-accent/30 rounded-[22px] p-4 flex flex-col gap-2 cursor-pointer hover:bg-white/5 transition-all shadow-lg shadow-accent/5 group"
                      >
                          <div className="flex justify-between items-start">
                              <span className="text-[10px] font-black text-accent uppercase tracking-tighter">{n.tipo}</span>
                              <div className="w-2 h-2 rounded-full bg-accent group-hover:scale-150 transition-transform" />
                          </div>
                          <h3 className="text-white text-sm font-bold truncate">{n.titulo}</h3>
                          <p className="text-[11px] text-white/60 line-clamp-2 leading-relaxed">{n.mensaje}</p>
                      </div>
                  ))}
              </div>
          </section>
      )}

      {/* WALLET HERO */}
      <section 
        onClick={() => router.push('/perfil')}
        className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[120px] shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/10 group cursor-pointer active:scale-95 transition-all"
      >
        <div className={`absolute inset-0 bg-linear-to-br ${financialData.totalDebt > 0 ? 'from-[#4C1D95] via-[#331A4D] to-[#BE185D]' : 'from-[#065F46] via-[#064E3B] to-[#047857]'} opacity-90`} />
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                 <CreditCard size={14} className="text-white/70" />
               </div>
               <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Mi Cuota</span>
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
              <p className="text-white/40 text-[10px] mt-0.5">
                {financialData.totalDebt > 0 ? "Vence en 4 días • Abril 2026" : "Corte al día • Abril 2026"}
              </p>
            </div>
            <button 
              className="bg-white text-primary text-[11px] font-bold px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              {financialData.totalDebt > 0 ? "Pagar Ahora" : "Ver Estado"}
            </button>
          </div>
        </div>
      </section>

      {/* SOCIAL FEED */}
      <section className="flex flex-col gap-6">
         <div className="flex justify-between items-end mb-1 fade-up-home">
           <h3 className="text-white font-display text-lg font-bold tracking-tight">Novedades</h3>
           <span className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Hoy</span>
         </div>
         <section className="fade-up-home flex justify-between items-center py-4 border-t border-white/5 mt-4">
          <div className="flex flex-col">
              <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">ConjuntOS v3.2</span>
              <span className="text-[9px] text-white/10 uppercase">Resident Edition</span>
          </div>
          <button onClick={() => router.push('/perfil')} className="flex items-center gap-2 text-white/30 hover:text-white transition-colors">
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
                 <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest animate-pulse">Cargando novedades...</span>
               </>
             ) : (
               <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
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
    <div className="fade-up-home liquid-glass-card rounded-[32px] flex flex-col shadow-2xl border-t border-white/20 transition-all active:scale-[0.98] relative overflow-hidden">
      
      {/* AD INDICATOR (Badge) */}
      {post.type === 'AD' && (
         <div className="absolute top-4 right-14 z-20 px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-[9px] font-black text-accent uppercase tracking-widest">
            Patrocinado
         </div>
      )}

      <div className="p-5 flex justify-between items-center relative z-10">
         <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border border-white/10 font-bold text-xs text-white ${post.type === 'AD' ? 'bg-accent text-primary' : 'bg-linear-to-tr from-purple-500 to-pink-500'}`}>
               {post.type === 'AD' ? 'AD' : (post.category?.[0] || 'A')}
            </div>
            <div>
               <h4 className="text-sm font-bold text-white leading-none mb-1">{post.type === 'AD' ? post.brand : post.category}</h4>
               <p className="text-[10px] text-white/40 flex items-center gap-1 font-medium">
                  {post.type === 'AD' ? 'Publicidad' : `Hace ${post.id} horas`} • {post.tag}
               </p>
            </div>
         </div>
         <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white">
            <MoreHorizontal size={18} />
         </button>
      </div>

      <div className="px-5 pb-2">
         <h2 className="text-xl font-display font-semibold text-white mb-2 leading-tight">{post.title}</h2>
         <p className="text-sm text-white/70 leading-relaxed font-light mb-4">{post.content}</p>
         
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

      <div className="p-4 flex items-center justify-between border-t border-white/5 bg-white/5 backdrop-blur-xl mt-auto rounded-b-[32px]">
         <button className="text-white/50 text-[11px] flex items-center gap-1.5 hover:text-white transition-colors font-semibold uppercase tracking-wider">
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
      <div className="liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2">Central de Guardia</h2>
        <p className="text-white/50 text-sm mb-6">Módulo de control de acceso y paquetería.</p>
      </div>
    </div>
  );
}

function HomeAdmin() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />
      <div className="liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl text-white">
        <h2 className="text-2xl font-bold mb-2">Panel Administrativo</h2>
        <button onClick={() => router.push('/admin-novedades')} className="mt-4 bg-accent text-primary px-6 py-3 rounded-2xl font-bold">Gestionar Novedades</button>
      </div>
    </div>
  );
}

export default function InicioDashboard() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  if (role === 'VIGILANTE') return <HomeVigilante />;
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN') return <HomeAdmin />;
  
  return <HomeResidente />;
}

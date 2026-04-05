"use client";

/**
 * INICIO DASHBOARD - CONJUNTOAPP
 * Sincronización de datos reales del usuario y Panel de Notificaciones.
 */

import { 
  Search, SlidersHorizontal, 
  User as UserIcon, MessageSquare, CreditCard,
  Building2, Calendar, Megaphone, PlusCircle, MinusCircle, Bookmark, Bell, Info, Code, XCircle, ShieldAlert, MoreHorizontal, ExternalLink, ChevronLeft,
  Car, ArrowRight
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface FeedItem {
  id: number;
  type: 'POST' | 'AD';
  category?: string;
  brand?: string;
  title: string;
  content: string;
  image?: string;
  tag?: string;
  icon?: React.ReactNode;
  cta?: string;
}

function HomeResidente() {
  const router = useRouter();
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const categories = [
    { title: "Citofonía", icon: <UserIcon size={20}/>, color: "from-purple-500 to-pink-500", path: "/citofonia" },
    { title: "Pagos", icon: <CreditCard size={20}/>, color: "from-[#D946EF] to-[#9333EA]", path: "/pagos" },
    { title: "Parqueo", icon: <Car size={20}/>, color: "from-emerald-500 to-emerald-700", path: "/parqueadero" },
    { title: "Reservas", icon: <Calendar size={20}/>, color: "from-blue-500 to-cyan-400", path: "/reservas" },
    { title: "Cartelera", icon: <Megaphone size={20}/>, color: "from-red-500 to-orange-500", path: "/cartelera" },
    { title: "PQRS", icon: <MessageSquare size={20}/>, color: "from-blue-500 to-indigo-600", path: "/pqrs" },
    { title: "Inmuebles", icon: <Building2 size={20}/>, color: "from-amber-500 to-orange-400", path: "/inmobiliaria" },
  ];

  const feedItems: FeedItem[] = [
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
      brand: 'Pizzería Di Amélie',
      title: '¡Sábado de Pizza - 20% Dto!',
      content: 'Pide tu pizza gourmet favorita y recibe un descuento exclusivo por ser residente de ConjuntoApp. ¡No te lo pierdas!',
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=1000',
      cta: 'Pedir por WhatsApp'
    },
    {
      id: 3,
      type: 'POST',
      category: 'Mantenimiento',
      title: 'Lavado de Tanques',
      content: 'El servicio de agua se suspenderá temporalmente mañana de 10:00 AM a 2:00 PM por labores de mantenimiento preventivo.',
      tag: 'Técnico',
      icon: <Calendar className="text-sky-400" size={16} />
    }
  ];

  const [visibleItems, setVisibleItems] = useState<FeedItem[]>(feedItems);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const loadMoreItems = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleItems(prev => {
        const nextId = prev.length + 1;
        const newItems: FeedItem[] = [
          {
            id: nextId,
            type: 'POST',
            category: 'Comunidad',
            title: `Novedad # ${nextId}`,
            content: 'Más información sobre los eventos y noticias del conjunto residencial. ¡Mantente conectado!',
            tag: 'Actualización'
          },
          {
            id: nextId + 1,
            type: 'POST',
            category: 'Cine Foro',
            title: 'Noche de Película',
            content: 'El viernes proyectaremos un clásico en la terraza.',
            image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=1000',
            tag: 'Evento'
          }
        ];
        return [...prev, ...newItems];
      });
      setIsLoadingMore(false);
    }, 1500);
  }, [isLoadingMore]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isLoadingMore) loadMoreItems();
    }, { threshold: 0.1 });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [loadMoreItems, isLoadingMore]);

  useEffect(() => {
    if (session) {
      // Logic for session if needed
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-home", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.2 });
    }, containerRef);
    return () => ctx.revert();
  }, [session]);

  return (
    <div ref={containerRef} className="flex flex-col gap-8 p-6 overflow-x-hidden pt-16 pb-32">
      <ProfileHeader className="fade-up-home" />

      {/* SEARCH BAR */}
      <section className="fade-up-home flex gap-3">
        <div className="relative flex-1 group">
           <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
           <input type="text" placeholder="Buscar novedades..." className="w-full bg-[#1a1333] border border-white/5 rounded-[24px] py-4 pl-14 pr-6 text-sm text-white focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner" />
        </div>
        <button onClick={() => toast.info("Filtros avanzados próximamente")} className="w-14 h-14 rounded-[22px] bg-[#241a4a] border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95 shadow-lg">
           <SlidersHorizontal size={20} />
        </button>
      </section>

      {/* CATEGORIES */}
      <section className="fade-up-home flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
           <h2 className="text-white font-display text-lg font-bold tracking-tight">Categorías</h2>
           <button onClick={() => toast.info("Explora los módulos desde el menú inferior")} className="text-accent text-xs font-bold uppercase tracking-widest hover:underline underline-offset-4">Ver Todo</button>
        </div>
        <div className="flex gap-4 overflow-x-auto pt-2 pb-4 -mx-6 px-6 hide-scrollbar flex-nowrap">
           {categories.map((cat, i) => (
             <div key={i} onClick={() => router.push(cat.path)} className="flex flex-col items-center gap-4 shrink-0 group cursor-pointer">
               <div className="w-[84px] h-[106px] rounded-[42px] bg-[#1a0b2e] border border-white/5 shadow-xl flex flex-col items-center justify-center gap-3 transition-all group-hover:bg-[#241a4a] overflow-hidden relative">
                  <div className="w-12 h-12 rounded-full liquid-glass border border-white/10 flex items-center justify-center text-white/80 transition-transform group-hover:scale-110">
                     {cat.icon}
                  </div>
                  <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider group-hover:text-white transition-colors">{cat.title}</span>
               </div>
             </div>
           ))}
        </div>
      </section>

      {/* WALLET HERO */}
      <section className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[120px] shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/10 group cursor-pointer active:scale-95 transition-all">
        <div className="absolute inset-0 bg-linear-to-br from-[#4C1D95] via-[#331A4D] to-[#BE185D] opacity-90" />
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                 <CreditCard size={14} className="text-white/70" />
               </div>
               <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Mi Cuota</span>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 text-[10px] text-accent font-bold uppercase animate-pulse">Pendiente</div>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-display font-bold text-white tracking-tight">$ 250.000</h2>
              <p className="text-white/40 text-[10px] mt-0.5">Vence en 4 días • Abril 2026</p>
            </div>
            <button 
              onClick={() => router.push('/pagos')}
              className="bg-white text-primary text-[11px] font-bold px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              Pagar Ahora
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
         {visibleItems.map((post) => <PostCard key={post.id} post={post} />)}
      </section>

      <div ref={loaderRef} className="h-20 flex items-center justify-center" />
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

  const menuOptions = [
    { icon: <PlusCircle size={18}/>, label: "Me interesa", sub: "Verás más publicaciones como esta." },
    { icon: <MinusCircle size={18}/>, label: "No me interesa", sub: "Verás menos publicaciones como esta." },
    { icon: <Bookmark size={18}/>, label: "Guardar publicación", sub: "Agregar a tus elementos guardados.", border: true },
    { icon: <Bell size={18}/>, label: "Activar notificaciones" },
    { icon: <Info size={18}/>, label: "¿Por qué veo esto?" },
    { icon: <Code size={18}/>, label: "Insertar", border: true },
    { icon: <XCircle size={18}/>, label: "Ocultar publicación" },
    { icon: <ShieldAlert size={18}/>, label: "Reportar publicación", color: "text-red-400" },
  ];

  return (
    <div className={`fade-up-home liquid-glass-card rounded-[32px] flex flex-col shadow-2xl border-t border-white/20 transition-all active:scale-[0.98] relative ${isMenuOpen ? 'z-40' : 'z-10'}`}>
      <div className="p-5 flex justify-between items-center relative z-10">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-linear-to-tr from-primary to-accent flex items-center justify-center border border-white/10 font-bold text-xs text-white">
               {post.type === 'AD' ? 'AD' : (post.category?.[0] || 'A')}
            </div>
            <div>
               <h4 className="text-sm font-bold text-white leading-none mb-1">{post.type === 'AD' ? post.brand : post.category}</h4>
               <p className="text-[10px] text-white/40 flex items-center gap-1 font-medium">
                  {post.type === 'AD' && <span className="text-[8px] bg-white/10 px-1 py-0.5 rounded border border-white/10 text-white/60 font-bold uppercase">PUBLICIDAD</span>}
                  Hace {post.id} horas • {post.type === 'AD' ? 'Patrocinado' : post.tag}
               </p>
            </div>
         </div>
         <div className="relative" ref={menuRef}>
           <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isMenuOpen ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white'}`}>
              <MoreHorizontal size={18} />
           </button>
           {isMenuOpen && (
             <div className="absolute top-10 right-0 w-[280px] liquid-glass rounded-3xl shadow-2xl border border-white/10 overflow-hidden z-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex flex-col py-2 max-h-[60vh] overflow-y-auto hide-scrollbar">
                   {menuOptions.map((opt, idx) => (
                     <button key={idx} onClick={() => { setIsMenuOpen(false); toast.info(opt.label); }} className={`w-full px-5 py-3.5 flex items-start gap-4 hover:bg-white/10 transition-colors text-left group ${opt.border ? 'border-b border-white/10 mb-1 pb-2' : ''} ${opt.color || 'text-white'}`}>
                        <div className={`mt-0.5 shrink-0 ${opt.color || 'text-white/70 group-hover:text-white'}`}>{opt.icon}</div>
                        <div className="flex flex-col">
                           <span className="text-sm font-semibold tracking-tight leading-tight">{opt.label}</span>
                           {opt.sub && <span className="text-[10px] text-white/40 font-medium leading-tight mt-1">{opt.sub}</span>}
                        </div>
                     </button>
                   ))}
                </div>
             </div>
           )}
         </div>
      </div>
      <div className="px-5 pb-2">
         <h2 className="text-xl font-display font-semibold text-white mb-2 leading-tight">{post.title}</h2>
         <p className="text-sm text-white/70 leading-relaxed font-light mb-4">{post.content}</p>
      </div>
      {post.image && (
         <div className="relative h-56 w-full group overflow-hidden">
            <Image src={post.image} alt={post.title} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" unoptimized />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-60" />
            {post.type === 'AD' && (
               <div className="absolute bottom-4 right-4 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); toast.success("Abriendo WhatsApp del comercio..."); }} className="bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-white/20 transition-all font-bold">
                     {post.cta || 'Saber Más'} <ExternalLink size={12} />
                  </button>
               </div>
            )}
         </div>
      )}
      <div className="p-4 flex items-center justify-between border-t border-white/5 bg-white/5 backdrop-blur-xl mt-auto rounded-b-[32px]">
         <button className="text-white/50 text-[11px] flex items-center gap-1.5 hover:text-white transition-colors font-semibold uppercase tracking-wider">¿Dudas? <Bell size={12} /></button>
         {post.type !== 'AD' && <button onClick={() => toast.info("Visualizando circular oficial...")} className="text-accent text-[11px] font-bold flex items-center gap-1.5 hover:accent-glow transition-all uppercase tracking-widest">Ver Circular <ChevronLeft size={14} className="rotate-180" /></button>}
      </div>
    </div>
  );
}

function HomeVigilante() {
  const router = useRouter();
  const [stats, setStats] = useState({ visitasHoy: 0, paquetesPendientes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch('/api/vigilancia/stats');
        const data = await res.json();
        if (data.success) {
           setStats(data.data);
        }
      } catch (e) {
        console.error("Error loading stats", e);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />
      <div className="liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2">Central de Guardia</h2>
        <p className="text-white/50 text-sm mb-6">Módulo de control de acceso y paquetería.</p>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
            {loading ? <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div> :
             <span className="text-4xl font-black text-accent text-glow">{stats.visitasHoy}</span>}
            <span className="text-xs uppercase font-bold text-white/40 tracking-widest text-center">Visitas Hoy</span>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
            {loading ? <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div> :
             <span className="text-4xl font-black text-emerald-400 text-glow">{stats.paquetesPendientes}</span>}
            <span className="text-xs uppercase font-bold text-white/40 tracking-widest text-center">Paquetes P.</span>
          </div>
        </div>
      </div>

      {/* VIGILANTE ACTIONS */}
      <section className="flex flex-col gap-3">
        <h3 className="text-white font-display font-medium text-lg tracking-wide px-2 mb-1">Operaciones</h3>
        
        <button onClick={() => router.push('/control-visitas')} className="w-full p-5 liquid-glass rounded-[28px] flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all shadow-xl active:scale-95">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                 <ShieldAlert size={22} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white">Registrar Visita</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Control vehicular y peatonal</span>
              </div>
           </div>
           <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors" />
        </button>

        <button onClick={() => router.push('/paqueteria')} className="w-full p-5 liquid-glass rounded-[28px] flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all shadow-xl active:scale-95">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                 <Bookmark size={22} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white">Gestión de Paquetes</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Entrega y recepción</span>
              </div>
           </div>
           <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors" />
        </button>
      </section>
    </div>
  );
}

function HomeParqueadero() {
  const router = useRouter();
  const [stats, setStats] = useState({ ocupacion: 0, libres: 0, ocupados: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch('/api/parqueadero/stats');
        const data = await res.json();
        if (data.success) {
           setStats(data.data);
        }
      } catch (e) {
        console.error("Error loading stats", e);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />
      <div className="liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2">Control de Parqueadero</h2>
        <p className="text-white/50 text-sm mb-6">Módulo de capacidad en tiempo real.</p>
        
        <div className="w-full max-w-[200px] mx-auto relative aspect-square rounded-full border-10 border-white/5 flex items-center justify-center bg-black/20">
           {/* Static visual representation for aesthetics */}
           <div className="absolute inset-0 rounded-full border-10 border-accent" style={{clipPath: `polygon(0 0, 100% 0, 100% ${stats.ocupacion}%, 0 ${stats.ocupacion}%)`}} />
           <div className="flex flex-col items-center text-center">
              {loading ? <div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div> :
               <span className="text-5xl font-black text-white text-glow">{stats.ocupacion}%</span>}
              <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest mt-1">Ocupación</span>
           </div>
        </div>
        <div className="flex justify-between mt-8">
           <div className="text-center"><p className="text-white font-bold">{stats.libres}</p><p className="text-[10px] text-white/40 uppercase">Libres</p></div>
           <div className="text-center"><p className="text-accent font-bold">{stats.ocupados}</p><p className="text-[10px] text-accent/40 uppercase">Ocupados</p></div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-white font-display font-medium text-lg tracking-wide px-2 mb-1">Operaciones</h3>
        
        <button onClick={() => router.push('/mapa-parqueadero')} className="w-full p-5 liquid-glass rounded-[28px] flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all shadow-xl active:scale-95">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                 <Building2 size={22} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white">Mapa e Historial</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Gestión y Rondas Diarias</span>
              </div>
           </div>
           <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors" />
        </button>
      </section>
    </div>
  );
}

function HomeAdmin() {
  const router = useRouter();
  const [stats, setStats] = useState({ recaudado: 0, novedadesPendientes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (data.success) {
           setStats(data.data);
        }
      } catch (e) {
        console.error("Error loading stats", e);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />
      <div className="liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2">Panel Administrativo</h2>
        <p className="text-white/50 text-sm mb-6">Resumen financiero y operario.</p>
        
        <div className="bg-linear-to-r from-emerald-600/30 to-emerald-900/30 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl" />
           <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Recaudo Mensual Mto.</p>
           {loading ? <div className="w-8 h-8 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin mt-2"></div> :
            <p className="text-4xl font-display font-medium text-white relative z-10 text-glow">
              ${stats.recaudado.toLocaleString()}
            </p>}
        </div>

        <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
            <div>
               <p className="text-white font-bold">Novedades y Aprobaciones</p>
               <p className="text-white/40 text-xs">Peticiones de residentes pendientes</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/30 text-accent flex items-center justify-center font-black">
               {loading ? "..." : stats.novedadesPendientes}
            </div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-white font-display font-medium text-lg tracking-wide px-2 mb-1">Gestión Central</h3>
        
        <button onClick={() => router.push('/admin-finanzas')} className="w-full p-5 liquid-glass rounded-[28px] flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all shadow-xl active:scale-95">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                 <CreditCard size={22} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white">Reportes Financieros</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Recaudo y Cartera</span>
              </div>
           </div>
           <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors" />
        </button>

        <button onClick={() => router.push('/admin-novedades')} className="w-full p-5 liquid-glass rounded-[28px] flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all shadow-xl active:scale-95">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                 <Info size={22} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white">Novedades de Unidad</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Gestión de residentes</span>
              </div>
           </div>
           <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors" />
        </button>

        <button onClick={() => router.push('/admin-parqueadero')} className="w-full p-5 liquid-glass rounded-[28px] flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all shadow-xl active:scale-95">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                 <ShieldAlert size={22} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white">Auditoría de Parqueo</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Historial de vigilantes</span>
              </div>
           </div>
           <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors" />
        </button>
      </section>
    </div>
  );
}

export default function InicioDashboard() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') return <HomeVigilante />;
  if (role === 'ENCARGADO_PARQUEADERO') return <HomeParqueadero />;
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN' || role === 'CONCEJO') return <HomeAdmin />;
  
  return <HomeResidente />;
}

"use client";

/**
 * INICIO DASHBOARD - CONJUNTOAPP
 * Sincronización de datos reales del usuario y Panel de Notificaciones.
 */

import { 
  Plus, Search, MoreHorizontal, ChevronLeft, Bell, ExternalLink, Calendar, 
  Megaphone, PlusCircle, MinusCircle, Bookmark, Info, Code, XCircle, 
  Clock, UserMinus, ShieldAlert, UserX, SlidersHorizontal, 
  User as UserIcon, MessageSquare, CreditCard, Package, CheckCircle2, AlertTriangle,
  Building2
} from "lucide-react";
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

interface Notification {
  id: number;
  title: string;
  desc: string;
  time: string;
  icon: React.ReactNode;
  color: string;
  isUnread: boolean;
}

export default function InicioDashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  // Real User Data States
  const [profilePic, setProfilePic] = useState<string>("https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1000");
  const [userData, setUserData] = useState({ name: "Cargando...", apto: "Apto 000", gender: "femenino" });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasStory, setHasStory] = useState(false);

  // Sync data from Database & LocalStorage
  useEffect(() => {
    async function loadData() {
      try {
        const fetchRes = await fetch("/api/user/profile", { cache: 'no-store' });
        const res = await fetchRes.json();
        
        if (res.success && res.data) {
          const u = res.data;
          const mapped = {
            name: u.nombre,
            apto: u.unidad?.numero || "Apto 000",
            gender: u.genero || "femenino"
          };
          setUserData(mapped);
          if (u.avatar) setProfilePic(u.avatar);
          
          // Persistence for faster reloads (Isolated by User)
          if (userId) {
            localStorage.setItem(`conjunto_app_profile_data_${userId}`, JSON.stringify(mapped));
            if (u.avatar) localStorage.setItem(`conjunto_app_profile_pic_${userId}`, u.avatar);
          }
        } else {
          throw new Error("No success");
        }
      } catch (error) {
        console.warn("⚠️ Fallback a LocalStorage:", error);
        // Fallback robusto a localStorage (Isolated)
        if (userId) {
          const savedPic = localStorage.getItem(`conjunto_app_profile_pic_${userId}`);
          if (savedPic) setProfilePic(savedPic);

          const savedData = localStorage.getItem(`conjunto_app_profile_data_${userId}`);
          if (savedData) {
            setUserData(JSON.parse(savedData));
            return;
          }
        }
        
        // Fallback final
        setUserData({ name: "Amélie Thommy", apto: "Apto 301", gender: "femenino" });
      }
    }

    if (session) {
      loadData();
    }

    // Story Logic
    const savedStory = localStorage.getItem("conjunto_app_active_story");
    if (savedStory) {
      const { createdAt } = JSON.parse(savedStory);
      if (Date.now() - createdAt < 24 * 60 * 60 * 1000) {
        setHasStory(true);
      } else {
        localStorage.removeItem("conjunto_app_active_story");
      }
    }

    // Click outside notifications
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [session, userId]);

  const categories = [
    { title: "Reservas", icon: <Calendar size={20}/>, color: "from-blue-500 to-cyan-400", path: "/reservas" },
    { title: "Inmuebles", icon: <Building2 size={20}/>, color: "from-amber-500 to-orange-400", path: "/inmobiliaria" },
    { title: "Visitantes", icon: <UserIcon size={20}/>, color: "from-purple-500 to-pink-500", path: "/visitantes" },
    { title: "Cartelera", icon: <Megaphone size={20}/>, color: "from-red-500 to-orange-500", path: "/cartelera" },
    { title: "PQRS", icon: <MessageSquare size={20}/>, color: "from-orange-500 to-yellow-500", path: "/pqrs" },
    { title: "Mercadito", icon: <Plus size={20}/>, color: "from-green-500 to-emerald-500", path: "/mercadito" },
  ];

  const notifications: Notification[] = [
    { 
      id: 1, 
      title: "Pago Recibido", 
      desc: "Administración Abril 2026 ha sido procesado.", 
      time: "Hace 5m", 
      icon: <CheckCircle2 size={16} />, 
      color: "text-emerald-400", 
      isUnread: true 
    },
    { 
      id: 2, 
      title: "Paquete en Portería", 
      desc: "Tienes un envío de Mercado Libre esperando.", 
      time: "Hace 1h", 
      icon: <Package size={16} />, 
      color: "text-amber-400", 
      isUnread: true 
    },
    { 
      id: 3, 
      title: "Mantenimiento", 
      desc: "Lavado de tanques mañana a las 10:00 AM.", 
      time: "Hace 2h", 
      icon: <AlertTriangle size={16} />, 
      color: "text-primary", 
      isUnread: false 
    },
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
      icon: <Megaphone className="text-yellow-400" size={16} />
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

  // Simulation: Load more items
  const loadMoreItems = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    
    // Simulate API delay
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
            tag: 'Actualización',
            icon: <PlusCircle className="text-accent" size={16} />
          },
          {
            id: nextId + 1,
            type: 'POST',
            category: 'Cine Foro',
            title: 'Noche de Película',
            content: 'El viernes proyectaremos un clásico en la terraza. ¡Entrada libre!',
            image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=1000',
            tag: 'Evento',
            icon: <Calendar className="text-purple-400" size={16} />
          }
        ];
        return [...prev, ...newItems];
      });
      setIsLoadingMore(false);
    }, 1500);
  }, [isLoadingMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          loadMoreItems();
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [loadMoreItems, isLoadingMore]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-home", 
        { opacity: 0, y: 30 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.6, 
          stagger: 0.1, 
          ease: "power2.out",
          delay: 0.2
        }
      );
    }, containerRef);
    
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-8 p-6 overflow-x-hidden pt-16 pb-32">
      
      {/* 1. WELCOME HEADER (SYNCED DATA) */}
      <section className="fade-up-home flex justify-between items-center relative z-100">
        <div className="flex items-center gap-4 group cursor-pointer active:scale-95 transition-transform">
          <div className={`w-14 h-14 rounded-full p-[3px] transition-all duration-500 relative ${hasStory ? 'liquid-story-ring' : 'border border-white/20 bg-white/5'}`}>
             <div className="w-full h-full rounded-full overflow-hidden relative shadow-xl backdrop-blur-xl">
                <Image src={profilePic} alt="User Avatar" width={56} height={56} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" unoptimized />
                <div className="absolute inset-0 border border-white/10 rounded-full pointer-events-none" />
             </div>
             {hasStory && (
               <div className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-[#0d041a] z-20 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
               </div>
             )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
               <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">
                 {userData.gender === 'masculino' ? 'Bienvenido' : userData.gender === 'neutro' ? 'Bienvenide' : 'Bienvenida'} 👋
               </span>
            </div>
            <h1 className="text-white text-xl font-display font-bold tracking-tight text-glow">{userData.name || 'Residente'}</h1>
          </div>
        </div>

        {/* NOTIFICATIONS TRIGGER */}
        <div className="relative" ref={notificationsRef}>
          <button 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl group border border-white/10 active:scale-95 ${isNotificationsOpen ? 'bg-accent text-white border-accent/50' : 'liquid-glass text-white/80 hover:text-white'}`}
          >
             <Bell size={22} className={isNotificationsOpen ? 'animate-none' : 'group-hover:rotate-12 transition-transform'} />
             <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 bg-accent rounded-full border-2 border-[#1a0b2e] shadow-[0_0_10px_rgba(217,70,239,0.8)]"></span>
          </button>

          {/* NOTIFICATIONS DROPDOWN */}
          {isNotificationsOpen && (
            <div className="absolute top-14 right-0 w-[300px] liquid-glass backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden z-200 animate-in fade-in zoom-in-95 duration-200">
               <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                  <span className="text-sm font-bold text-white tracking-wide">Notificaciones</span>
                  <button className="text-[10px] text-accent font-bold uppercase hover:underline">Limpiar Todo</button>
               </div>
               <div className="flex flex-col max-h-[350px] overflow-y-auto hide-scrollbar">
                  {notifications.map((notif) => (
                    <button 
                      key={notif.id}
                      className="w-full px-5 py-4 flex items-start gap-4 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0 relative group"
                    >
                       {notif.isUnread && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_5px_rgba(217,70,239,0.5)]"></span>}
                       <div className={`mt-0.5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center ${notif.color}`}>
                          {notif.icon}
                       </div>
                       <div className="flex flex-col flex-1">
                          <div className="flex justify-between items-center mb-0.5">
                             <span className="text-xs font-bold text-white group-hover:text-glow transition-all">{notif.title}</span>
                             <span className="text-[9px] text-white/30 font-medium">{notif.time}</span>
                          </div>
                          <p className="text-[11px] text-white/50 leading-snug">{notif.desc}</p>
                       </div>
                    </button>
                  ))}
               </div>
               <button className="w-full py-3 bg-white/5 text-[10px] text-white/40 font-bold uppercase hover:text-white transition-colors border-t border-white/5">
                  Ver todas las notificaciones
               </button>
            </div>
          )}
        </div>
      </section>

      {/* 2. SEARCH BAR */}
      <section className="fade-up-home flex gap-3">
        <div className="relative flex-1 group">
           <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
           <input 
             type="text" 
             placeholder="Buscar novedades, servicios..." 
             className="w-full bg-[#1a1333] border border-white/5 rounded-[24px] py-4 pl-14 pr-6 text-sm text-white focus:outline-hidden focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner"
           />
        </div>
        <button className="w-14 h-14 rounded-[22px] bg-[#241a4a] border border-white/5 flex items-center justify-center text-white/60 hover:text-white hover:border-white/10 transition-all active:scale-95 shadow-lg">
           <SlidersHorizontal size={20} />
        </button>
      </section>

      {/* 3. CATEGORIES */}
      <section className="fade-up-home flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
           <h2 className="text-white font-display text-lg font-bold tracking-tight">Categorías</h2>
           <button className="text-accent text-xs font-bold uppercase tracking-widest hover:underline underline-offset-4">Ver Todo</button>
        </div>
        <div className="flex gap-4 overflow-x-auto pt-2 pb-4 -mx-6 px-6 hide-scrollbar flex-nowrap">
           {categories.map((cat, i) => (
             <div 
               key={i} 
               onClick={() => router.push(cat.path)}
               className="flex flex-col items-center gap-4 shrink-0 group cursor-pointer"
             >
               <div className="w-[84px] h-[106px] rounded-[42px] bg-[#1a0b2e] border border-white/5 shadow-xl flex flex-col items-center justify-center gap-3 transition-all group-hover:bg-[#241a4a] group-hover:border-accent/20 group-active:scale-95 group-hover:-translate-y-1 overflow-hidden relative">
                  <div className={`w-12 h-12 rounded-full bg-linear-to-br ${cat.color} opacity-20 absolute top-2 left-2 -z-10 blur-xl`} />
                  <div className="w-12 h-12 rounded-full liquid-glass border border-white/10 flex items-center justify-center text-white/80 group-hover:text-white shadow-inner transition-transform group-hover:scale-110">
                     {cat.icon}
                  </div>
                  <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider group-hover:text-white transition-colors">{cat.title}</span>
               </div>
             </div>
           ))}
        </div>
      </section>

      {/* 4. WALLET HERO */}
      <section className="fade-up-home w-full rounded-[28px] relative overflow-hidden h-[120px] shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/10 group cursor-pointer active:scale-95 transition-all">
        <div className="absolute inset-0 bg-linear-to-br from-[#4C1D95] via-[#331A4D] to-[#BE185D] opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
        
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
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
            <button className="bg-white text-primary text-[11px] font-bold px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all">Pagar Ahora</button>
          </div>
        </div>
      </section>

      {/* 5. SOCIAL FEED */}
      <section className="flex flex-col gap-6">
         <div className="flex justify-between items-end mb-1 fade-up-home">
           <h3 className="text-white font-display text-lg font-bold tracking-tight">Novedades</h3>
           <span className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Hoy</span>
         </div>

         {visibleItems.map((post) => (
           <PostCard key={post.id} post={post} />
         ))}
      </section>

      <section className="fade-up-home py-10 text-center">
         <p className="text-white/20 text-[10px] uppercase tracking-widest font-bold font-mono">Eso es todo por ahora • 🔥</p>
      </section>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .text-glow { text-shadow: 0 0 20px rgba(217,70,239,0.5); }

        @keyframes story-shimmer {
          0% { border-color: #D946EF; box-shadow: 0 0 15px #D946EF, 0 0 30px rgba(217,70,239,0.5), inset 0 0 10px #D946EF; }
          50% { border-color: #8B5CF6; box-shadow: 0 0 25px #8B5CF6, 0 0 50px rgba(139,92,246,0.6), inset 0 0 15px #8B5CF6; }
          100% { border-color: #D946EF; box-shadow: 0 0 15px #D946EF, 0 0 30px rgba(217,70,239,0.5), inset 0 0 10px #D946EF; }
        }

        .liquid-story-ring {
          position: relative;
          background: linear-gradient(45deg, #D946EF, #8B5CF6, #D946EF);
          background-size: 200% 200%;
          animation: story-shimmer 3s infinite ease-in-out, shimmer-bg 5s infinite linear;
          padding: 3px;
        }

        @keyframes shimmer-bg {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}} />
    </div>
  );
}

function PostCard({ post }: { post: FeedItem }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const menuOptions = [
    { icon: <PlusCircle size={18}/>, label: "Me interesa", sub: "Verás más publicaciones como esta." },
    { icon: <MinusCircle size={18}/>, label: "No me interesa", sub: "Verás menos publicaciones como esta." },
    { icon: <Bookmark size={18}/>, label: "Guardar publicación", sub: "Agregar a tus elementos guardados.", border: true },
    { icon: <Bell size={18}/>, label: "Activar notificaciones de esta publicación" },
    { icon: <Info size={18}/>, label: "¿Por qué veo esta publicación?" },
    { icon: <Code size={18}/>, label: "Insertar", border: true },
    { icon: <XCircle size={18}/>, label: "Ocultar publicación", sub: "Ver menos publicaciones como esta." },
    { icon: <Clock size={18}/>, label: `Ocultar a ${post.brand || post.category} durante 30 días`, sub: "Dejar de ver publicaciones temporalmente." },
    { icon: <UserMinus size={18}/>, label: `Dejar de seguir a ${post.brand || post.category}`, sub: "Dejar de ver publicaciones de esta página..." },
    { icon: <ShieldAlert size={18}/>, label: "Reportar publicación", sub: "No le diremos a nadie quién envió el reporte.", color: "text-red-400" },
    { icon: <UserX size={18}/>, label: `Bloquear el perfil de ${post.brand || post.category}`, sub: "Ya no podrán verse ni contactarse.", color: "text-red-400" },
  ];

  return (
    <div className={`fade-up-home liquid-glass-card rounded-[32px] flex flex-col shadow-2xl border-t border-white/20 transition-all active:scale-[0.98] relative ${isMenuOpen ? 'z-40' : 'z-10'}`}>
      
      {/* Post Header */}
      <div className="p-5 flex justify-between items-center relative z-10">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-linear-to-tr from-primary to-accent flex items-center justify-center border border-white/10 overflow-hidden shadow-inner uppercase font-bold text-xs pointer-events-none">
               {post.type === 'AD' ? 'AD' : (post.category?.[0] || 'A')}
            </div>
            <div>
               <h4 className="text-sm font-bold text-white leading-none mb-1">
                  {post.type === 'AD' ? post.brand : post.category}
               </h4>
               <p className="text-[10px] text-white/40 flex items-center gap-1 font-medium">
                  {post.type === 'AD' && <span className="text-[8px] bg-white/10 px-1 py-0.5 rounded border border-white/10 text-white/60 font-bold uppercase">PUBLICIDAD</span>}
                  Hace {post.id} horas • {post.type === 'AD' ? 'Patrocinado' : post.tag}
               </p>
            </div>
         </div>
         
         {/* TRIGGER MENU 3 PUNTOS */}
         <div className="relative" ref={menuRef}>
           <button 
             onClick={() => setIsMenuOpen(!isMenuOpen)}
             className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isMenuOpen ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white'}`}
           >
              <MoreHorizontal size={18} />
           </button>

           {isMenuOpen && (
             <div className="absolute top-10 right-0 w-[280px] sm:w-[320px] liquid-glass backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden z-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex flex-col py-2 max-h-[60vh] overflow-y-auto hide-scrollbar">
                   {menuOptions.map((opt, idx) => (
                     <button 
                       key={idx}
                       onClick={() => { setIsMenuOpen(false); toast.info(opt.label); }}
                       className={`w-full px-5 py-3.5 flex items-start gap-4 hover:bg-white/10 transition-colors text-left group ${opt.border ? 'border-b border-white/10 mb-1 pb-2' : ''} ${opt.color || 'text-white'}`}
                     >
                        <div className={`mt-0.5 shrink-0 ${opt.color || 'text-white/70 group-hover:text-white'}`}>
                          {opt.icon}
                        </div>
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

      {/* Post Content */}
      <div className="px-5 pb-2">
         <h2 className="text-xl font-display font-semibold text-white text-glow mb-2 leading-tight">{post.title}</h2>
         <p className="text-sm text-white/70 leading-relaxed font-light mb-4">{post.content}</p>
      </div>

      {/* Post Image (Full bleed) */}
      {post.image && (
         <div className="relative h-56 w-full mx-0 mb-0 shadow-inner group overflow-hidden">
            <Image 
              src={post.image} 
              alt={post.title} 
              fill
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-60" />
            
            {post.type === 'AD' && (
               <div className="absolute bottom-4 right-4 flex gap-2">
                  <button className="bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-white/20 transition-all font-bold">
                     {post.cta || 'Saber Más'} <ExternalLink size={12} />
                  </button>
               </div>
            )}
         </div>
      )}

      {/* Interaction Bar (Minimalist) */}
      <div className="p-4 flex items-center justify-between border-t border-white/5 bg-white/5 backdrop-blur-xl mt-auto rounded-b-[32px]">
         <div className="flex items-center gap-4">
            <button className="text-white/50 text-[11px] flex items-center gap-1.5 hover:text-white transition-colors font-semibold uppercase tracking-wider">
               ¿Dudas? <Bell size={12} />
            </button>
         </div>
         {post.type !== 'AD' && (
            <button className="text-accent text-[11px] font-bold flex items-center gap-1.5 hover:accent-glow transition-all uppercase tracking-widest">
               Ver Circular <ChevronLeft size={14} className="rotate-180" />
            </button>
         )}
      </div>

    </div>
  );
}

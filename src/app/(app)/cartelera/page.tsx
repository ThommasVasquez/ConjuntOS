"use client";

/**
 * CARTELERA - CONJUNTOAPP
 * Tablón de anuncios oficiales de la administración.
 */

import { 
  Megaphone, ShieldAlert, Wrench, Calendar, Info, 
  ChevronLeft, Bell, Clock, 
  ArrowRight, X, Download, Share2, CheckCircle2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useRouter } from "next/navigation";

interface Notice {
  id: string;
  title: string;
  content: string;
  category: 'SEGURIDAD' | 'MANTENIMIENTO' | 'EVENTO' | 'CONVIVENCIA';
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  date: string;
  author: string;
  image?: string;
}

export default function CarteleraPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [profilePic, setProfilePic] = useState("/images/avatar-placeholder.png");
  const [userData, setUserData] = useState({ name: "Residente", gender: "femenino" });
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [hasStory, setHasStory] = useState(false);

  const notifications = [
    { id: 1, title: "Nuevo Aviso", desc: "Se ha publicado el acta de la asamblea.", time: "Hace 10m", icon: <CheckCircle2 size={16} />, color: "text-accent", isUnread: true },
    { id: 2, title: "Mantenimiento", desc: "Recordatorio: Corte de agua mañana.", time: "Hace 2h", icon: <Wrench size={16} />, color: "text-orange-400" },
  ];

  const notices: Notice[] = [
    {
      id: '1',
      title: "Corte de Agua Programado",
      content: "Se informa a todos los residentes que el próximo jueves 2 de abril se realizará un mantenimiento preventivo en el tanque principal. El servicio será suspendido de 8:00 AM a 2:00 PM. Recomendamos tomar las precauciones necesarias.",
      category: 'MANTENIMIENTO',
      priority: 'ALTA',
      date: "31 Mar, 2026",
      author: "Administración",
      image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=1000"
    },
    {
      id: '2',
      title: "Actualización de Protocolos de Seguridad",
      content: "A partir del lunes, todos los visitantes deberán presentar su documento de identidad físico en portería, sin excepción. Esta medida busca reforzar la seguridad de nuestra comunidad.",
      category: 'SEGURIDAD',
      priority: 'MEDIA',
      date: "30 Mar, 2026",
      author: "Seguridad Privada"
    },
    {
      id: '3',
      title: "Gran Bazar de Verano",
      content: "¡Ven y comparte con tus vecinos! Tendremos música en vivo, feria gastronómica y actividades para niños en la zona social de la Torre B. ¡No faltes!",
      category: 'EVENTO',
      priority: 'BAJA',
      date: "28 Mar, 2026",
      author: "Comité Social",
      image: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&q=80&w=1000"
    },
    {
      id: '4',
      title: "Recordatorio: Horarios de Basura",
      content: "Recordamos que los horarios para depositar residuos en el shut son únicamente de 6:00 PM a 10:00 PM. Evite multas y mantengamos el conjunto limpio.",
      category: 'CONVIVENCIA',
      priority: 'BAJA',
      date: "25 Mar, 2026",
      author: "Administración"
    }
  ];

  useEffect(() => {
    // Sync UI with local storage
    const savedPic = localStorage.getItem("conjunto_app_profile_pic");
    if (savedPic) setProfilePic(savedPic);

    const savedData = localStorage.getItem("conjunto_app_profile_data");
    if (savedData) {
      try { setUserData(JSON.parse(savedData)); } catch (e) { console.error(e); }
    }

    const savedStory = localStorage.getItem("conjunto_app_user_story");
    if (savedStory) {
       const storyData = JSON.parse(savedStory);
       const now = new Date().getTime();
       if (now < storyData.expiresAt) setHasStory(true);
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 30 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.7, 
          stagger: 0.1,
          ease: "back.out(1.2)" 
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const filteredNotices = selectedCategory === 'TODOS' 
    ? notices 
    : notices.filter(n => n.category === selectedCategory);

  const getNoticeIcon = (cat: string) => {
    switch(cat) {
      case 'SEGURIDAD': return <ShieldAlert size={18} />;
      case 'MANTENIMIENTO': return <Wrench size={18} />;
      case 'EVENTO': return <Calendar size={18} />;
      case 'CONVIVENCIA': return <Info size={18} />;
      default: return <Megaphone size={18} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'ALTA': return 'bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]';
      case 'MEDIA': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'BAJA': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-white/10 text-white/50 border-white/10';
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      
      {/* BACKGROUND AMBIENT GLOW */}
      <div className="fixed top-[-10%] right-[-10%] w-full h-[50%] bg-[#BE185D]/10 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-full h-[50%] bg-[#4C1D95]/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

      {/* 1. HEADER (ESTILO INICIO) */}
      <section className="fade-up flex justify-between items-center relative z-20">
        <div className="flex items-center gap-4 group cursor-pointer active:scale-95 transition-transform" onClick={() => router.push('/perfil')}>
           <div className={`w-14 h-14 rounded-full p-[3px] transition-all duration-500 relative ${hasStory ? 'liquid-story-ring' : 'border border-white/20 bg-white/5'}`}>
              <div className="w-full h-full rounded-full overflow-hidden border border-white/10 shadow-2xl relative z-10">
                 <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
              </div>
              {hasStory && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-[#0d041a] z-20 flex items-center justify-center">
                   <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                </div>
              )}
           </div>
           <div className="flex flex-col">
             <div className="flex items-center gap-1.5">
                <button 
                  onClick={(e) => { e.stopPropagation(); router.back(); }}
                  className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 mr-1"
                >
                   <ChevronLeft size={12} />
                </button>
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

          {isNotificationsOpen && (
            <div className="absolute top-14 right-0 w-[280px] liquid-glass backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden z-200 animate-in fade-in zoom-in-95 duration-200">
               <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                  <span className="text-sm font-bold text-white tracking-wide">Notificaciones</span>
               </div>
               <div className="flex flex-col max-h-[300px] overflow-y-auto hide-scrollbar">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="w-full px-5 py-4 flex items-start gap-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 relative group">
                       <div className="mt-0.5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-accent">
                          {notif.icon}
                       </div>
                       <div className="flex flex-col flex-1">
                          <span className="text-xs font-bold text-white mb-0.5">{notif.title}</span>
                          <p className="text-[10px] text-white/50 leading-snug">{notif.desc}</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. FILTER TABS */}
      <section className="fade-up flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
         {['TODOS', 'MANTENIMIENTO', 'SEGURIDAD', 'EVENTO', 'CONVIVENCIA'].map((cat) => (
           <button 
             key={cat}
             onClick={() => setSelectedCategory(cat)}
             className={`shrink-0 px-5 py-2.5 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}
           >
              {cat}
           </button>
         ))}
      </section>

      {/* 3. NOTICES FEED */}
      <section className="flex flex-col gap-6">
         {filteredNotices.map((notice) => (
           <div 
             key={notice.id} 
             onClick={() => setSelectedNotice(notice)}
             className="fade-up liquid-glass-card rounded-[32px] overflow-hidden border border-white/10 hover:border-white/20 transition-all active:scale-[0.98] cursor-pointer group shadow-2xl"
           >
              {notice.image && (
                <div className="h-40 w-full overflow-hidden relative">
                   <img src={notice.image} alt={notice.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                   <div className="absolute inset-0 bg-linear-to-t from-[#140628] to-transparent opacity-60" />
                </div>
              )}
              
              <div className="p-6 flex flex-col gap-4">
                 <div className="flex justify-between items-start">
                    <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${getPriorityColor(notice.priority)}`}>
                       Prioridad {notice.priority}
                    </div>
                    <span className="text-[10px] text-white/30 font-bold">{notice.date}</span>
                 </div>

                 <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-accent">
                       {getNoticeIcon(notice.category)}
                       <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{notice.category}</span>
                    </div>
                    <h3 className="text-white text-lg font-bold leading-snug group-hover:text-accent transition-colors">{notice.title}</h3>
                    <p className="text-white/40 text-xs line-clamp-2 leading-relaxed">{notice.content}</p>
                 </div>

                 <div className="flex justify-between items-center pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/60">
                          <Megaphone size={12} />
                       </div>
                       <span className="text-[10px] text-white/50 font-medium">Por: {notice.author}</span>
                    </div>
                    <div className="flex items-center gap-1 text-accent text-[10px] font-bold uppercase tracking-widest group-hover:gap-2 transition-all">
                       Leer más <ArrowRight size={14} />
                    </div>
                 </div>
              </div>
           </div>
         ))}
      </section>

      {/* MODAL: NOTICE DETAIL */}
      {selectedNotice && (
        <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedNotice(null)} />
           
           <div className="relative w-full max-w-lg bg-[#0d041a] rounded-t-[40px] sm:rounded-[40px] border-t sm:border border-white/20 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in slide-in-from-bottom-20 duration-400">
              <div className="max-h-[85vh] overflow-y-auto hide-scrollbar">
                 {selectedNotice.image && (
                   <div className="h-56 w-full relative">
                      <img src={selectedNotice.image} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-linear-to-t from-[#0d041a] to-transparent" />
                      <button 
                        onClick={() => setSelectedNotice(null)}
                        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"
                      >
                         <X size={20} />
                      </button>
                   </div>
                 )}
                 
                 <div className="p-8 flex flex-col gap-6">
                    {!selectedNotice.image && (
                      <div className="flex justify-end">
                         <button 
                          onClick={() => setSelectedNotice(null)}
                          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40"
                        >
                           <X size={20} />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col gap-3">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-white shadow-lg">
                             {getNoticeIcon(selectedNotice.category)}
                          </div>
                          <div>
                             <span className="text-[10px] text-accent font-bold uppercase tracking-widest">{selectedNotice.category}</span>
                             <h2 className="text-2xl font-display font-bold text-white tracking-tight leading-none mt-1">{selectedNotice.title}</h2>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-4 text-white/30 text-[10px] font-bold uppercase tracking-widest mt-2">
                          <div className="flex items-center gap-1.5"><Clock size={12} /> {selectedNotice.date}</div>
                          <div className="flex items-center gap-1.5"><Megaphone size={12} /> {selectedNotice.author}</div>
                       </div>
                    </div>

                    <div className="text-white/70 text-base leading-relaxed space-y-4">
                       <p>{selectedNotice.content}</p>
                       <p>Para mayor información, puede contactar a la oficina de administración en los horarios de atención habituales o a través de la sección de PQRS en esta aplicación.</p>
                    </div>

                    <div className="flex flex-col gap-4 pt-6 border-t border-white/10">
                       <div className="flex items-center gap-2">
                          <Info size={16} className="text-accent" />
                          <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Documentos Adjuntos</span>
                       </div>
                       <button className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-all text-left group">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                                <ShieldAlert size={18} />
                             </div>
                             <div>
                                <p className="text-white text-sm font-bold">Circular_Informativa_P01.pdf</p>
                                <p className="text-white/20 text-[10px] uppercase font-bold tracking-tighter">PDF • 1.2 MB • Firmado Digitalmente</p>
                             </div>
                          </div>
                          <Download size={18} className="text-white/40 group-hover:text-accent group-hover:scale-110 transition-all" />
                       </button>
                    </div>

                    <div className="flex gap-3 mt-4">
                       <button className="flex-1 bg-accent py-4 rounded-2xl font-bold text-white shadow-xl shadow-accent/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                          <Share2 size={18} /> Compartir
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

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

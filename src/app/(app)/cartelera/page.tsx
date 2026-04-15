"use client";

/**
 * CARTELERA - CONJUNTOSAPP
 * Tablón de anuncios oficiales de la administración.
 */

import { 
  Megaphone, ShieldAlert, Wrench, Calendar, Info, 
  Clock, ArrowRight, X, Download, Share2, Building2,
  Play, Users, MessageSquare, Vote, FileText
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Anuncio } from "@prisma/client";

interface Notice {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  date: string;
  author: string;
  image?: string;
  fijado?: boolean;
}

export default function CarteleraPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoadingNotices, setIsLoadingNotices] = useState(true);
  const [showLiveSession, setShowLiveSession] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(true); // Always active for simulation
  const [simulatedChat, setSimulatedChat] = useState<{user: string, msg: string, time: string}[]>([]);
  const [userMsg, setUserMsg] = useState("");

  useEffect(() => {
    async function initData() {
      try {
        const anunciosFetch = await fetch("/api/user/anuncios", { cache: 'no-store' });
        const anunciosRes = await anunciosFetch.json();

        if (anunciosRes.success && anunciosRes.data) {
          const apiMapped: Notice[] = anunciosRes.data.map((a: Anuncio) => ({
            id: a.id,
            title: a.titulo,
            content: a.contenido,
            category: a.tipo,
            priority: a.tipo === 'URGENTE' ? 'ALTA' : (a.tipo === 'MANTENIMIENTO' ? 'MEDIA' : 'BAJA'),
            date: new Date(a.publicadoEn).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
            author: "Administración",
            image: a.imagenUrl || undefined,
            fijado: a.fijado
          }));
          
          const mockNotices: Notice[] = [
            {
              id: "mock-1",
              title: "Reunión Ordinaria de Consejo",
              content: "Se convoca a todos los miembros del consejo de administración para la revisión de estados financieros de Mayo. Asistencia obligatoria.",
              category: "ADMINISTRACION",
              priority: "ALTA",
              date: "Próximo Lunes",
              author: "Consejo de Admón.",
              fijado: true
            },
            {
              id: "mock-2",
              title: "Asamblea Extraordinaria: Presupuesto 2024",
              content: "Citación a asamblea extraordinaria para la aprobación del rubro de impermeabilización de fachadas y cuotas extras.",
              category: "EVENTO",
              priority: "ALTA",
              date: "25 May, 2024",
              author: "Administración"
            },
            {
              id: "licit-1",
              title: "Licitación: Mantenimiento de Piscinas",
              content: "Apertura de pliegos para la contratación de servicio de mantenimiento preventivo y correctivo de piscinas y zonas húmedas.",
              category: "LICITACION",
              priority: "MEDIA",
              date: "Abierta",
              author: "Admón. ConjuntOS"
            },
            {
              id: "licit-2",
              title: "Licitación: Servicio de Aseo y Cafetería",
              content: "Se buscan empresas con experiencia en servicios de aseo para zonas comunes y suministros.",
              category: "LICITACION",
              priority: "MEDIA",
              date: "Abierta",
              author: "Admón. ConjuntOS"
            },
            {
              id: "licit-3",
              title: "Licitación: Contaduría y Revisoría Fiscal",
              content: "Convocatoria para profesionales en Contaduría Pública para el periodo 2024-2025.",
              category: "LICITACION",
              priority: "MEDIA",
              date: "Abierta",
              author: "Consejo de Admón."
            },
            {
              id: "licit-4",
              title: "Licitación: Administración de Propiedad Horizontal",
              content: "Convocatoria pública para la prestación de servicios de Administración de Propiedad Horizontal para el ConjuntOS®.",
              category: "LICITACION",
              priority: "ALTA",
              date: "Abierta",
              author: "Asamblea General"
            }
          ];

          setNotices([...mockNotices, ...apiMapped]);
        }
      } catch (error) {
        console.error("❌ Error initializing Cartelera:", error);
      } finally {
        setIsLoadingNotices(false);
      }
    }

    // SIMULATED CHAT FEED
    const chatInterval = setInterval(() => {
      const msgs = [
        "¿Cuándo se vota el punto 3?",
        "Buenas tardes a todos los vecinos.",
        "Yo estoy de acuerdo con el presupuesto propuesto.",
        "¿Habrá cuota extraordinaria este año?",
        "¡Qué buena iniciativa esta asamblea virtual!",
        "La conexión se ve excelente, gracias admin.",
        "Torre 4 Apto 102 presente."
      ];
      if (showLiveSession) {
        const rand = msgs[Math.floor(Math.random() * msgs.length)];
        setSimulatedChat(prev => [...prev.slice(-15), { user: `Residente ${Math.floor(Math.random()*900)+100}`, msg: rand, time: "Ahora" }]);
      }
    }, 4000);

    if (session) initData();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: "back.out(1.2)" });
    }, containerRef);
    return () => {
      ctx.revert();
      clearInterval(chatInterval);
    };
  }, [session, userId, showLiveSession]);

  const filteredNotices = selectedCategory === 'TODOS' ? notices : notices.filter((n: Notice) => n.category === selectedCategory);

  const getNoticeIcon = (cat: string) => {
    switch(cat) {
      case 'URGENTE': return <ShieldAlert size={18} />;
      case 'MANTENIMIENTO': return <Wrench size={18} />;
      case 'EVENTO': return <Calendar size={18} />;
      case 'LICITACION': return <FileText size={18} />;
      case 'ADMINISTRACION': return <Building2 size={18} />;
      default: return <Megaphone size={18} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'ALTA': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'MEDIA': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'BAJA': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-white/10 text-white/50 border-white/10';
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      <ProfileHeader className="fade-up" />

      {/* LIVE SESSION BANNER (Simulated) */}
      {isLiveActive && (
        <section className="fade-up w-full">
           <div className="liquid-glass-card rounded-[32px] p-6 border border-red-500/20 bg-linear-to-br from-red-500/5 to-transparent relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl group-hover:bg-red-500/20 transition-all duration-700" />
              
              <div className="flex justify-between items-center mb-4">
                 <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500 text-white text-[9px] font-black uppercase tracking-widest animate-pulse">
                       <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> EN VIVO
                    </div>
                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Asamblea General 2024</span>
                 </div>
                 <div className="flex items-center gap-1.5 text-white/60">
                    <Users size={12} />
                    <span className="text-[10px] font-mono">154</span>
                 </div>
              </div>

              <div className="flex flex-col gap-1 mb-5">
                 <h2 className="text-xl font-display font-bold text-white tracking-tight">Decisiones Conjuntas: Presupuesto Anual</h2>
                 <p className="text-xs text-white/40">Participa en tiempo real y ejerce tu voto.</p>
              </div>

              <button 
                onClick={() => setShowLiveSession(true)}
                className="w-full bg-red-500 py-4 rounded-2xl flex items-center justify-center gap-3 text-sm font-bold text-white shadow-xl shadow-red-500/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                 <Play size={18} fill="currentColor" /> Unirse a la Sesión
              </button>
           </div>
        </section>
      )}

      {/* FILTER TABS */}
      <section className="fade-up flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
         {['TODOS', 'ADMINISTRACION', 'LICITACION', 'SEGURIDAD', 'EVENTO', 'MANTENIMIENTO'].map((cat) => (
           <button key={cat} onClick={() => setSelectedCategory(cat)} className={`shrink-0 px-5 py-2.5 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-accent border-accent text-white shadow-lg' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
              {cat}
           </button>
         ))}
      </section>

      {/* NOTICES FEED */}
      <section className="flex flex-col gap-6">
         {isLoadingNotices ? (
           <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Sincronizando Cartelera...</p>
           </div>
         ) : filteredNotices.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 gap-4 liquid-glass-card rounded-[32px] border border-white/5 p-10">
              <Megaphone size={32} className="text-white/20 mb-2" />
              <p className="text-white/60 text-sm font-bold">No hay avisos publicados</p>
           </div>
         ) : filteredNotices.map((notice: Notice) => (
           <div key={notice.id} onClick={() => setSelectedNotice(notice)} className="fade-up liquid-glass-card rounded-[32px] overflow-hidden border border-white/10 hover:border-white/20 transition-all active:scale-[0.98] cursor-pointer group shadow-2xl">
              {notice.image && (
                <div className="h-40 w-full overflow-hidden relative">
                   <Image src={notice.image} alt={notice.title} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" unoptimized />
                   <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-60" />
                </div>
              )}
              <div className="p-6 flex flex-col gap-4">
                 <div className="flex justify-between items-start">
                    <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${getPriorityColor(notice.priority)}`}>Prioridad {notice.priority}</div>
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
                       <Megaphone size={12} className="text-white/30" />
                       <span className="text-[10px] text-white/50">{notice.author}</span>
                    </div>
                    <div className="flex items-center gap-1 text-accent text-[10px] font-bold uppercase group-hover:gap-2 transition-all">Leer más <ArrowRight size={14} /></div>
                 </div>
              </div>
           </div>
         ))}
      </section>

      {/* MODAL: LIVE ASSEMBLY SIMULATION */}
      {showLiveSession && (
        <div className="fixed inset-0 z-200 bg-black flex flex-col animate-in fade-in duration-500 overflow-hidden">
           {/* Header Sesión */}
           <div className="p-6 flex justify-between items-center border-b border-white/10 bg-linear-to-b from-black/80 to-transparent fixed top-0 w-full z-10">
              <div className="flex items-center gap-3">
                 <div className="px-2 py-0.5 rounded bg-red-500 text-[8px] font-black text-white uppercase tracking-tighter">LIVE</div>
                 <h3 className="text-sm font-bold text-white tracking-tight">Asamblea General - ConjuntOS</h3>
              </div>
              <button 
                onClick={() => setShowLiveSession(false)}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/20 transition-all"
              >
                 <X size={20} />
              </button>
           </div>

           {/* Video Mockup (Cinematric Gradient Animation) */}
           <div className="flex-1 relative flex items-center justify-center bg-[#050110]">
              <div className="absolute inset-0 bg-linear-to-br from-indigo-900/40 via-purple-900/40 to-black/80 animate-pulse" />
              <div className="relative z-10 flex flex-col items-center gap-6 p-8 text-center max-w-sm">
                 <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center text-accent ring-4 ring-accent/20 animate-bounce">
                    <Users size={40} />
                 </div>
                 <div className="space-y-2">
                    <h4 className="text-lg font-bold text-white">Administrador en Línea</h4>
                    <p className="text-xs text-white/40 leading-relaxed italic">"Presentando el informe de gestión 2023 y proyecciones presupuestarias para el periodo 2024..."</p>
                 </div>
                 <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center">
                       <span className="text-[8px] text-white/30 uppercase font-black">Quórum</span>
                       <span className="text-lg font-bold text-emerald-400">84.2%</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center text-accent">
                        <Vote size={14} className="mb-1" />
                        <span className="text-[10px] font-black uppercase">Votar</span>
                    </div>
                 </div>
              </div>

              {/* Bottom UI Controls */}
              <div className="absolute bottom-40 left-6 right-6 flex items-center gap-3">
                  <div className="flex-1 h-12 bg-white/10 rounded-2xl flex items-center px-4 border border-white/10">
                    <span className="text-xs text-white/20 italic">Enlace a documento adjunto...</span>
                  </div>
                  <button className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white/40"><MessageSquare size={18} /></button>
              </div>
           </div>

           {/* Live Chat Overlay (Simulated) */}
           <div className="h-[35vh] bg-black/40 backdrop-blur-3xl border-t border-white/10 flex flex-col">
              <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
                 <span className="text-[10px] text-white/30 uppercase font-black tracking-widest">Participación en Vivo</span>
                 <span className="text-[10px] text-emerald-400/60 font-mono">Chat Activado</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                 {simulatedChat.map((chat, i) => (
                   <div key={i} className="flex flex-col gap-1 animate-in fade-in slide-in-from-left duration-300">
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-black text-accent/80 uppercase">{chat.user}</span>
                         <span className="text-[8px] text-white/20 font-mono">{chat.time}</span>
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed">{chat.msg}</p>
                   </div>
                 ))}
                 <div className="h-4" />
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!userMsg) return;
                  setSimulatedChat(prev => [...prev, { user: session?.user?.name || "Tú", msg: userMsg, time: "Ahora" }]);
                  setUserMsg("");
                }}
                className="p-4 border-t border-white/5 flex gap-3 bg-black"
              >
                 <input 
                   type="text" 
                   value={userMsg}
                   onChange={(e) => setUserMsg(e.target.value)}
                   placeholder="Escribe un mensaje..."
                   className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-accent" 
                 />
                 <button type="submit" className="px-6 bg-accent rounded-xl text-[10px] font-black text-white uppercase tracking-widest active:scale-95 transition-all">Enviar</button>
              </form>
           </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}

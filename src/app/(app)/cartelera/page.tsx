"use client";

/**
 * CARTELERA - CONJUNTOSAPP
 * Tablón de anuncios oficiales de la administración.
 */

import { 
  Megaphone, ShieldAlert, Wrench, Calendar, Info, 
  Clock, ArrowRight, X, Download, Share2, Building2,
  Play, Users, MessageSquare, Vote, FileText, MessageCircle
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
  const [isAdminOnline, setIsAdminOnline] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{mensaje: string, esDeAdmin: boolean, creadoEn: string}[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(false);

  // Random Admin Status Simulation
  useEffect(() => {
    const statusInterval = setInterval(() => {
      setIsAdminOnline(prev => Math.random() > 0.4);
    }, 12000);
    return () => clearInterval(statusInterval);
  }, []);

  // Fetch Chat History
  const fetchChat = async () => {
    try {
      const res = await fetch("/api/user/chat");
      const data = await res.json();
      if (data.success) setChatMessages(data.data);
    } catch (err) {
      console.error("Error fetching chat:", err);
    }
  };

  useEffect(() => {
    if (isChatOpen) {
      fetchChat();
    }
  }, [isChatOpen]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending) return;
    setIsSending(true);
    
    // Optimistic update
    const tempMsg = { mensaje: newMessage, esDeAdmin: false, creadoEn: new Date().toISOString() };
    setChatMessages(prev => [...prev, tempMsg]);
    setNewMessage("");

    try {
      const res = await fetch("/api/user/chat", {
        method: "POST",
        body: JSON.stringify({ mensaje: tempMsg.mensaje })
      });
      const data = await res.json();
      if (!data.success) {
        toast.error("Error al enviar mensaje");
      }
    } catch (err) {
      toast.error("Error de conexión");
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    async function initData() {
      if (isInitialLoad.current) return;
      isInitialLoad.current = true;

      try {
        const mockNotices: Notice[] = [
          {
            id: "mock-1",
            title: "Reunión de Consejo de Administración",
            content: "Sesión mensual para la revisión del presupuesto operacional y seguimiento a proyectos de mantenimiento del segundo trimestre. Los copropietarios pueden enviar sus inquietudes previas al correo de administración.",
            category: "ADMINISTRACION",
            priority: "ALTA",
            date: "18 Jun, 2024",
            author: "Consejo de Admón.",
            image: "https://images.unsplash.com/photo-1577416414929-7a7c850e816a?auto=format&fit=crop&q=80&w=1000",
            fijado: true
          },
          {
            id: "mock-2",
            title: "Asamblea Extraordinaria Presencial",
            content: "Citación obligatoria para tratar la aprobación de la cuota extraordinaria para la modernización de los sistemas de seguridad y CCTV. Se requiere quórum del 51%.",
            category: "EVENTO",
            priority: "ALTA",
            date: "25 May, 2024",
            author: "Administración",
            image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80&w=1000"
          },
          {
            id: "licit-1",
            title: "Licitación: Mantenimiento de Piscinas",
            content: "Invitación pública para empresas especializadas en el tratamiento físico-químico y mantenimiento técnico de piscinas y zonas húmedas. Pliegos disponibles en oficina.",
            category: "LICITACION",
            priority: "MEDIA",
            date: "Cierre: 30 Mayo",
            author: "Admón. ConjuntOS",
            image: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&q=80&w=1000"
          },
          {
            id: "licit-2",
            title: "Licitación: Servicio de Aseo y Cafetería",
            content: "Convocatoria para la prestación integral de servicios de limpieza, desinfección y mantenimiento de áreas comunes. Se evaluará certificación en procesos bioseguros.",
            category: "LICITACION",
            priority: "MEDIA",
            date: "Abierta",
            author: "Admón. ConjuntOS",
            image: "https://images.unsplash.com/photo-1581578731548-c64695cc6954?auto=format&fit=crop&q=80&w=1000"
          },
          {
            id: "licit-3",
            title: "Convocatoria: Contaduría General",
            content: "Se requiere Contador(a) Público con experiencia mínima de 5 años en propiedad horizontal para el manejo integral de la contabilidad bajo normas NIIF.",
            category: "LICITACION",
            priority: "MEDIA",
            date: "En curso",
            author: "Consejo de Admón."
          },
          {
            id: "licit-4",
            title: "Convocatoria: Revisoría Fiscal",
            content: "Búsqueda de Revisor Fiscal para el periodo 2024-2025. Los candidatos deben presentar su propuesta técnica y económica detallando el alcance de sus auditorías.",
            category: "LICITACION",
            priority: "MEDIA",
            date: "En curso",
            author: "Consejo de Admón."
          },
          {
            id: "licit-5",
            title: "Licitación: Administración de PH",
            content: "Convocatoria pública para la prestación de servicios de Administración de Propiedad Horizontal para el ConjuntOS®. Se busca gestión orientada a resultados y transparencia.",
            category: "LICITACION",
            priority: "ALTA",
            date: "Urgente",
            author: "Asamblea General",
            image: "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&q=80&w=1000"
          }
        ];

        try {
          const anunciosFetch = await fetch("/api/user/anuncios", { cache: 'no-store' });
          const anunciosRes = await anunciosFetch.json();

          let apiMapped: Notice[] = [];
          if (anunciosRes.success && anunciosRes.data) {
            apiMapped = anunciosRes.data.map((a: any) => ({
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
          }
          setNotices([...mockNotices, ...apiMapped]);
        } catch (apiErr) {
          console.warn("API fallida, usando mocks únicamente");
          setNotices(mockNotices);
        }
      } catch (error) {
        console.error("❌ Error initializing Cartelera:", error);
      } finally {
        setIsLoadingNotices(false);
      }
    }

    if (session) initData();

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
  }, [session, userId]);

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
      case 'ALTA': return 'bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/20 dark:border-red-500/30';
      case 'MEDIA': return 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/20 dark:border-orange-500/30';
      case 'BAJA': return 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/20 dark:border-blue-500/30';
      default: return 'bg-surface-2 text-text-muted border-border';
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      <ProfileHeader className="fade-up" />

      {/* LIVE SESSION BANNER (Simulated) */}
      {isLiveActive && (
        <section className="fade-up w-full">
           <div className="liquid-glass-card rounded-[32px] p-6 border border-emerald-500/20 bg-linear-to-br from-emerald-500/5 to-transparent relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-700" />
              
              <div className="flex justify-between items-center mb-4">
                 <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest animate-pulse">
                       <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> EN VIVO
                    </div>
                    <span className="text-[10px] text-white/60 font-bold uppercase tracking-widest">Asamblea General 2024</span>
                 </div>
                 <div className="flex items-center gap-1.5 text-white/80">
                    <Users size={12} />
                    <span className="text-[10px] font-mono">154</span>
                 </div>
              </div>

              <div className="flex flex-col gap-1 mb-5">
                 <h2 className="text-xl font-display font-bold text-white tracking-tight">Decisiones Conjuntas: Presupuesto Anual</h2>
                 <p className="text-xs text-white/60">Participa en tiempo real y ejerce tu voto.</p>
              </div>

              <button 
                onClick={() => setShowLiveSession(true)}
                className="w-full bg-emerald-500 py-4 rounded-2xl flex items-center justify-center gap-3 text-sm font-bold text-white shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                 <Play size={18} fill="currentColor" /> Unirse a la Sesión
              </button>
           </div>
        </section>
      )}

      {/* FILTER TABS */}
      <section className="fade-up flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
         {['TODOS', 'ADMINISTRACION', 'LICITACION', 'SEGURIDAD', 'EVENTO', 'MANTENIMIENTO'].map((cat) => (
           <button key={cat} onClick={() => setSelectedCategory(cat)} className={`shrink-0 px-5 py-2.5 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-accent border-accent text-primary shadow-lg' : 'bg-surface-2 border-border text-text-muted hover:bg-surface-2/80'}`}>
              {cat}
           </button>
         ))}
      </section>

      {/* NOTICES FEED */}
      <section className="flex flex-col gap-6">
         {isLoadingNotices ? (
           <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
              <p className="text-text-muted text-xs font-bold uppercase tracking-widest">Sincronizando Cartelera...</p>
           </div>
         ) : filteredNotices.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 gap-4 liquid-glass-card rounded-[32px] border border-border p-10">
              <Megaphone size={32} className="text-text-muted mb-2" />
              <p className="text-text-muted text-sm font-bold">No hay avisos publicados</p>
           </div>
         ) : filteredNotices.map((notice: Notice) => (
           <div key={notice.id} onClick={() => setSelectedNotice(notice)} className="fade-up liquid-glass-card rounded-[32px] overflow-hidden border border-border hover:border-accent/30 transition-all active:scale-[0.98] cursor-pointer group shadow-2xl">
              {notice.image && (
                <div className="h-40 w-full overflow-hidden relative">
                   <Image src={notice.image} alt={notice.title} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" unoptimized />
                   <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-60" />
                </div>
              )}
              <div className="p-6 flex flex-col gap-4">
                 <div className="flex justify-between items-start">
                    <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${getPriorityColor(notice.priority)}`}>Prioridad {notice.priority}</div>
                    <span className="text-[10px] text-text-muted font-bold">{notice.date}</span>
                 </div>
                 <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-accent">
                       {getNoticeIcon(notice.category)}
                       <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{notice.category}</span>
                    </div>
                    <h3 className="text-text text-lg font-bold leading-snug group-hover:text-accent transition-colors">{notice.title}</h3>
                    <p className="text-text-muted text-xs line-clamp-2 leading-relaxed">{notice.content}</p>
                 </div>
                 <div className="flex justify-between items-center pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                       <Megaphone size={12} className="text-text-muted" />
                       <span className="text-[10px] text-text-muted">{notice.author}</span>
                    </div>
                    <div className="flex items-center gap-1 text-accent text-[10px] font-bold uppercase group-hover:gap-2 transition-all">Leer más <ArrowRight size={14} /></div>
                 </div>
              </div>
           </div>
         ))}
      </section>

      {/* MODAL: LIVE ASSEMBLY SIMULATION */}
      {showLiveSession && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-in fade-in duration-500 overflow-hidden items-center isolate">
           {/* Header Sesión */}
           <div className="p-6 flex justify-between items-center border-b border-white/10 bg-linear-to-b from-black/80 to-transparent fixed top-0 w-full max-w-[430px] z-10">
              <div className="flex items-center gap-3">
                 <div className="px-2 py-0.5 rounded bg-emerald-500 text-[8px] font-black text-white uppercase tracking-tighter">LIVE</div>
                 <h3 className="text-sm font-bold text-white tracking-tight">Asamblea General</h3>
              </div>
              <button 
                onClick={() => setShowLiveSession(false)}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/20 transition-all"
              >
                 <X size={20} />
              </button>
           </div>

           {/* Video Mockup (Cinematric Gradient Animation) */}
           <div className="flex-1 w-full max-w-[430px] relative flex items-center justify-center bg-[#050110]">
              <div className="absolute inset-0 bg-linear-to-br from-indigo-900/40 via-purple-900/40 to-black/80 animate-pulse" />
              <div className="relative z-10 flex flex-col items-center gap-6 p-8 text-center max-w-sm">
                 <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center text-accent ring-4 ring-accent/20 animate-bounce">
                    <Users size={40} />
                 </div>
                 <div className="space-y-2">
                    <h4 className="text-lg font-bold text-white">Administrador en Línea</h4>
                    <p className="text-xs text-white/60 leading-relaxed italic">"Presentando el informe de gestión 2023 y proyecciones presupuestarias para el periodo 2024..."</p>
                 </div>
                 <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="p-3 rounded-2xl bg-surface-2 border border-border flex flex-col items-center">
                       <span className="text-[8px] text-text-muted uppercase font-black">Quórum</span>
                       <span className="text-lg font-bold text-emerald-400">84.2%</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-surface-2 border border-border flex flex-col items-center text-accent">
                        <Vote size={14} className="mb-1" />
                        <span className="text-[10px] font-black uppercase">Votar</span>
                    </div>
                 </div>
              </div>

              {/* Bottom UI Controls */}
              <div className="absolute bottom-40 left-6 right-6 flex items-center gap-3">
                  <div className="flex-1 h-12 bg-surface-2 rounded-2xl flex items-center px-4 border border-border">
                    <span className="text-xs text-white/60 italic">Enlace a documento adjunto...</span>
                  </div>
                  <button className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-text-muted/80"><MessageSquare size={18} /></button>
              </div>
           </div>

           {/* Live Chat Overlay (Simulated) */}
           <div className="h-[35vh] bg-black/40 backdrop-blur-3xl border-t border-white/10 flex flex-col w-full max-w-[430px]">
              <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
                 <span className="text-[10px] text-white/60 uppercase font-black tracking-widest">Participación en Vivo</span>
                 <span className="text-[10px] text-emerald-400/60 font-mono">Chat Activado</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                 {simulatedChat.map((chat, i) => (
                   <div key={i} className="flex flex-col gap-1 animate-in fade-in slide-in-from-left duration-300">
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-black text-accent/80 uppercase">{chat.user}</span>
                         <span className="text-[8px] text-white/40 font-mono">{chat.time}</span>
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
                   className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-accent placeholder:text-white/40" 
                 />
                 <button type="submit" className="px-6 bg-accent rounded-xl text-[10px] font-black text-white uppercase tracking-widest active:scale-95 transition-all">Enviar</button>
              </form>
           </div>
        </div>
      )}

      {selectedNotice && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center animate-in fade-in duration-300 isolate">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedNotice(null)} />
           <div className="relative w-full max-w-[430px] bg-primary dark:bg-[#0d041a] rounded-t-[40px] sm:rounded-[40px] border-t sm:border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-400">
              <div className="max-h-[85vh] overflow-y-auto hide-scrollbar">
                 {selectedNotice.image && (
                   <div className="h-56 w-full relative">
                      <Image src={selectedNotice.image} alt="" fill className="w-full h-full object-cover" unoptimized />
                      <div className="absolute inset-0 bg-linear-to-t from-primary dark:from-[#0d041a] to-transparent" />
                      <button onClick={() => setSelectedNotice(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"><X size={20} /></button>
                   </div>
                 )}
                 <div className="p-8 flex flex-col gap-6">
                    {!selectedNotice.image && <div className="flex justify-end"><button onClick={() => setSelectedNotice(null)} className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text-muted/60"><X size={20} /></button></div>}
                    <div className="flex flex-col gap-3">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-primary">{getNoticeIcon(selectedNotice.category)}</div>
                          <div>
                             <span className="text-[10px] text-accent font-bold uppercase tracking-widest">{selectedNotice.category}</span>
                             <h2 className="text-2xl font-display font-bold text-text tracking-tight leading-none mt-1">{selectedNotice.title}</h2>
                          </div>
                       </div>
                       <div className="flex items-center gap-4 text-text-muted text-[10px] font-bold uppercase tracking-widest mt-2">
                          <div className="flex items-center gap-1.5"><Clock size={12} /> {selectedNotice.date}</div>
                          <div className="flex items-center gap-1.5"><Megaphone size={12} /> {selectedNotice.author}</div>
                       </div>
                    </div>
                    <p className="text-text/70 text-base leading-relaxed">{selectedNotice.content}</p>
                    <div className="flex flex-col gap-4 pt-6 border-t border-border">
                       <div className="flex items-center gap-2"><Info size={16} className="text-accent" /><span className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Documentos Adjuntos</span></div>
                       <button 
                         onClick={() => {
                            toast.loading("Generando descarga...");
                            setTimeout(() => toast.success("Documento descargado con éxito"), 2000);
                         }}
                         className="w-full bg-surface-2 border border-border rounded-2xl p-4 flex items-center justify-between hover:bg-surface-2/85 transition-all text-left group"
                       >
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400"><ShieldAlert size={18} /></div>
                             <div>
                                 <p className="text-text text-sm font-bold">Circular_Informativa.pdf</p>
                                 <p className="text-text-muted text-[10px] uppercase font-bold tracking-tighter">PDF • 1.2 MB</p>
                             </div>
                          </div>
                          <Download size={18} className="text-text-muted/60 group-hover:text-accent transition-all" />
                       </button>
                    </div>
                    <button 
                      onClick={() => {
                         if (navigator.share) {
                           navigator.share({
                             title: selectedNotice.title,
                             text: selectedNotice.content,
                             url: window.location.href,
                           }).catch(() => toast.info("Link copiado al portapapeles"));
                         } else {
                           navigator.clipboard.writeText(window.location.href);
                           toast.success("Link copiado al portapapeles");
                         }
                      }}
                      className="w-full bg-accent py-4 rounded-2xl font-bold text-white shadow-xl shadow-accent/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      <Share2 size={18} /> Compartir
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
      
      {/* FLOATING ACTION BUTTON: CHAT WITH ADMIN */}
      <div className="fixed bottom-36 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-6 pointer-events-none z-100">
         <div className="flex justify-end w-full">
            <button 
              onClick={() => setIsChatOpen(true)}
              className="pointer-events-auto w-16 h-16 rounded-full bg-emerald-500 shadow-[0_15px_40px_rgba(16,185,129,0.3)] flex items-center justify-center text-white relative active:scale-95 hover:scale-105 transition-all group overflow-visible"
            >
               <MessageCircle size={28} />
               
               {/* Status Indicator Dot */}
               <div className={`absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full border-4 border-primary flex items-center justify-center ${isAdminOnline ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  {isAdminOnline && <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />}
               </div>
               
               {/* Floating Label (Appears on Hover) */}
               <div className="absolute right-full mr-4 bg-surface-2 backdrop-blur-xl border border-border px-4 py-2 rounded-2xl opacity-0 group-hover:opacity-100 transition-all text-text text-[10px] font-bold uppercase tracking-widest whitespace-nowrap pointer-events-none translate-x-4 group-hover:translate-x-0">
                  Chat Administrativo
               </div>
            </button>
         </div>
      </div>

      {/* MODAL: ADMINISTRATIVE CHAT */}
      {isChatOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-md flex items-end justify-center animate-in fade-in duration-300 isolate">
           <div className="w-full max-w-[430px] h-[90vh] bg-primary dark:bg-[#0c0816] rounded-t-[40px] border-t border-border flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-500 shadow-2xl">
              
              {/* Chat Header */}
              <div className="p-6 flex justify-between items-center border-b border-border bg-surface-2 backdrop-blur-2xl">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 relative">
                       <Building2 size={24} className="text-emerald-500" />
                       <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-primary dark:border-[#0c0816] ${isAdminOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                    </div>
                    <div className="flex flex-col">
                       <h3 className="text-sm font-bold text-text tracking-tight">Atención al Copropietario</h3>
                       <span className="text-[10px] text-text-muted font-medium uppercase tracking-widest flex items-center gap-1.5">
                          {isAdminOnline ? (
                            <>
                              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                              Disponible
                            </>
                          ) : 'Ausente'}
                       </span>
                    </div>
                 </div>
                 <button 
                   onClick={() => setIsChatOpen(false)}
                   className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-text-muted hover:bg-surface-2/80 transition-all active:scale-90"
                 >
                    <X size={20} />
                 </button>
              </div>

              {/* Chat Body (Messages) */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scroll-smooth hide-scrollbar bg-linear-to-b from-transparent to-black/20">
                 {chatMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-text-muted/40">
                       <MessageCircle size={48} className="text-emerald-500/50" />
                       <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-center max-w-[200px] leading-relaxed">
                          Envía un mensaje para iniciar una conversación directa con la administración
                       </p>
                    </div>
                 ) : chatMessages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                       <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed ${
                         m.esDeAdmin 
                           ? 'bg-surface-2 border border-border text-text rounded-tl-none shadow-sm' 
                           : 'bg-emerald-500 text-white rounded-tr-none shadow-lg shadow-emerald-500/10 font-medium'
                       }`}>
                          {m.mensaje}
                          <div className={`text-[8px] mt-2 opacity-40 flex items-center gap-1 ${m.esDeAdmin ? 'justify-start text-text-muted' : 'justify-end font-normal text-white'}`}>
                             {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                       </div>
                    </div>
                 ))}
                 <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-6 bg-surface-2 border-t border-border pb-10">
                 <div className="flex items-center gap-3">
                    <div className="flex-1 min-h-[56px] bg-primary border border-border rounded-[28px] flex items-center px-6 transition-all focus-within:border-emerald-500/50 focus-within:bg-primary/80 shadow-inner">
                       <input 
                         type="text"
                         value={newMessage}
                         onChange={(e) => setNewMessage(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                         placeholder="Describe tu solicitud o duda..."
                         className="w-full bg-transparent border-none text-text text-sm focus:ring-0 placeholder:text-text-muted/60"
                       />
                    </div>
                    <button 
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || isSending}
                      className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-[0_10px_25px_rgba(16,185,129,0.3)] active:scale-90 transition-all disabled:opacity-50 disabled:scale-100 group"
                    >
                       {isSending ? <Loader2 size={24} className="animate-spin" /> : <ArrowRight size={24} className="group-hover:translate-x-0.5 transition-transform" />}
                    </button>
                 </div>
                 <div className="mt-4 flex items-center justify-center gap-2 text-text-muted/60">
                    <ShieldAlert size={10} />
                    <p className="text-[9px] font-bold uppercase tracking-widest">Conexión Segura & Encriptada</p>
                 </div>
              </div>

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

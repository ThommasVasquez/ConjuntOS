"use client";

/**
 * CARTELERA - CONJUNTOSAPP
 * Tablón de anuncios oficiales de la administración.
 */

import { 
  Megaphone, ShieldAlert, Wrench, Calendar, Info, 
  Clock, ArrowRight, X, Download, Share2, Building2,
  FileText, MessageCircle
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import type { AnuncioDto } from "@/lib/api/types";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useWsSubscription } from "@/hooks/useWebSocket";

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
  const { user } = useAuth();
  const userId = user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoadingNotices, setIsLoadingNotices] = useState(true);
  const [isAdminOnline] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{mensaje: string, esDeAdmin: boolean, creadoEn: string}[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(false);

  // Real-time WebSocket subscription for anuncios
  useWsSubscription('anuncio', () => {
    api.get<AnuncioDto[]>('/anuncios').then((anunciosData) => {
      if (anunciosData) {
        const apiMapped = anunciosData.map((a) => ({
          id: a.id,
          title: a.titulo,
          content: a.contenido,
          category: a.tipo,
          priority: a.tipo === 'URGENTE' ? 'ALTA' as const : (a.tipo === 'MANTENIMIENTO' ? 'MEDIA' as const : 'BAJA' as const),
          date: new Date(a.publicadoEn).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          author: "Administración",
          image: a.imagenUrl || undefined,
          fijado: a.fijado
        }));
        setNotices(apiMapped);
      }
    }).catch(() => {});
  });
  // Fetch Chat History
  const fetchChat = async () => {
    try {
      const data = await api.get<{mensaje: string, esDeAdmin: boolean, creadoEn: string}[]>('/chat');
      setChatMessages(data);
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
      await api.post('/chat', { mensaje: tempMsg.mensaje });
    } catch {
      // Roll back the optimistic message and restore the draft instead of leaving
      // a message the server never received stuck in the thread.
      setChatMessages(prev => prev.filter(m => m !== tempMsg));
      setNewMessage(tempMsg.mensaje);
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
        const anunciosData = await api.get<AnuncioDto[]>('/anuncios');

        let apiMapped: Notice[] = [];
        if (anunciosData) {
          apiMapped = anunciosData.map((a) => ({
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
        setNotices(apiMapped);
      } catch (error) {
        console.error("Error initializing Cartelera:", error);
        setNotices([]);
      } finally {
        setIsLoadingNotices(false);
      }
    }

    if (user) initData();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: "back.out(1.2)" });
    }, containerRef);
    return () => {
      ctx.revert();
    };
  }, [user, userId]);

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
      case 'ALTA': return 'bg-text/10 dark:bg-text/20 text-text dark:text-text border-text/20 dark:border-text/30';
      case 'MEDIA': return 'bg-text/10 dark:bg-text/20 text-text dark:text-text border-text/20 dark:border-text/30';
      case 'BAJA': return 'bg-text/10 dark:bg-text/20 text-text dark:text-text border-text/20 dark:border-text/30';
      default: return 'bg-surface-2 text-text border-border';
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      <ProfileHeader className="fade-up" />

      {/* FILTER TABS */}
      <section className="fade-up flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
         {['TODOS', 'ADMINISTRACION', 'LICITACION', 'SEGURIDAD', 'EVENTO', 'MANTENIMIENTO'].map((cat) => (
           <button key={cat} onClick={() => setSelectedCategory(cat)} className={`shrink-0 px-5 py-2.5 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-accent border-accent text-primary shadow-lg' : 'bg-surface-2 border-border text-text hover:bg-surface-2/80'}`}>
              {cat}
           </button>
         ))}
      </section>

      {/* NOTICES FEED */}
      <section className="flex flex-col gap-6">
         {isLoadingNotices ? (
           <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
              <p className="text-text text-xs font-bold uppercase tracking-widest">Sincronizando Cartelera...</p>
           </div>
         ) : filteredNotices.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 gap-4 liquid-glass-card rounded-[32px] border border-border p-10">
              <Megaphone size={32} className="text-text mb-2" />
              <p className="text-text text-sm font-bold">No hay avisos publicados</p>
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
                    <span className="text-[10px] text-text font-bold">{notice.date}</span>
                 </div>
                 <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-accent">
                       {getNoticeIcon(notice.category)}
                       <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{notice.category}</span>
                    </div>
                    <h3 className="text-text text-lg font-bold leading-snug group-hover:text-accent transition-colors">{notice.title}</h3>
                    <p className="text-text text-xs line-clamp-2 leading-relaxed">{notice.content}</p>
                 </div>
                 <div className="flex justify-between items-center pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                       <Megaphone size={12} className="text-text" />
                       <span className="text-[10px] text-text">{notice.author}</span>
                    </div>
                    <div className="flex items-center gap-1 text-accent text-[10px] font-bold uppercase group-hover:gap-2 transition-all">Leer más <ArrowRight size={14} /></div>
                 </div>
              </div>
           </div>
         ))}
      </section>

      {selectedNotice && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center animate-in fade-in duration-300 isolate">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedNotice(null)} />
           <div className="relative w-full max-w-[430px] bg-primary dark:bg-[#000000] rounded-t-[40px] sm:rounded-[40px] border-t sm:border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-400">
              <div className="max-h-[85vh] overflow-y-auto hide-scrollbar">
                 {selectedNotice.image && (
                   <div className="h-56 w-full relative">
                      <Image src={selectedNotice.image} alt="" fill className="w-full h-full object-cover" unoptimized />
                      <div className="absolute inset-0 bg-linear-to-t from-primary dark:from-[#000000] to-transparent" />
                      <button onClick={() => setSelectedNotice(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"><X size={20} /></button>
                   </div>
                 )}
                 <div className="p-8 flex flex-col gap-6">
                    {!selectedNotice.image && <div className="flex justify-end"><button onClick={() => setSelectedNotice(null)} className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text"><X size={20} /></button></div>}
                    <div className="flex flex-col gap-3">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-primary">{getNoticeIcon(selectedNotice.category)}</div>
                          <div>
                             <span className="text-[10px] text-accent font-bold uppercase tracking-widest">{selectedNotice.category}</span>
                             <h2 className="text-2xl font-display font-bold text-text tracking-tight leading-none mt-1">{selectedNotice.title}</h2>
                          </div>
                       </div>
                       <div className="flex items-center gap-4 text-text text-[10px] font-bold uppercase tracking-widest mt-2">
                          <div className="flex items-center gap-1.5"><Clock size={12} /> {selectedNotice.date}</div>
                          <div className="flex items-center gap-1.5"><Megaphone size={12} /> {selectedNotice.author}</div>
                       </div>
                    </div>
                    <p className="text-text text-base leading-relaxed">{selectedNotice.content}</p>
                    <div className="flex flex-col gap-4 pt-6 border-t border-border">
                       <div className="flex items-center gap-2"><Info size={16} className="text-accent" /><span className="text-text text-[10px] font-bold uppercase tracking-widest">Documentos Adjuntos</span></div>
                       <button 
                         onClick={() => {
                            toast.loading("Generando descarga...");
                            setTimeout(() => toast.success("Documento descargado con éxito"), 2000);
                         }}
                         className="w-full bg-surface-2 border border-border rounded-2xl p-4 flex items-center justify-between hover:bg-surface-2/85 transition-all text-left group"
                       >
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-text/10 flex items-center justify-center text-text"><ShieldAlert size={18} /></div>
                             <div>
                                 <p className="text-text text-sm font-bold">Circular_Informativa.pdf</p>
                                 <p className="text-text text-[10px] uppercase font-bold tracking-tighter">PDF • 1.2 MB</p>
                             </div>
                          </div>
                          <Download size={18} className="text-text group-hover:text-accent transition-all" />
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
                      className="w-full bg-accent py-4 rounded-2xl font-bold text-on-accent shadow-xl shadow-accent/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
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
              className="pointer-events-auto w-16 h-16 rounded-full bg-text/10 shadow-[0_15px_40px_rgba(128,128,128,0.3)] flex items-center justify-center text-white relative active:scale-95 hover:scale-105 transition-all group overflow-visible"
            >
               <MessageCircle size={28} />
               
               {/* Status Indicator Dot */}
               <div className={`absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full border-4 border-primary flex items-center justify-center ${isAdminOnline ? 'bg-text/10' : 'bg-text/10'}`}>
                  {isAdminOnline && <div className="absolute inset-0 rounded-full bg-text/10 animate-ping opacity-40" />}
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
           <div className="w-full max-w-[430px] h-[90vh] bg-primary dark:bg-[#0B0B0B] rounded-t-[40px] border-t border-border flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-500 shadow-2xl">
              
              {/* Chat Header */}
              <div className="p-6 flex justify-between items-center border-b border-border bg-surface-2 backdrop-blur-2xl">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-text/20 flex items-center justify-center border border-text/30 relative">
                       <Building2 size={24} className="text-text" />
                       <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-primary dark:border-[#0B0B0B] ${isAdminOnline ? 'bg-text/10 shadow-[0_0_10px_rgba(128,128,128,0.5)]' : 'bg-text/10'}`} />
                    </div>
                    <div className="flex flex-col">
                       <h3 className="text-sm font-bold text-text tracking-tight">Atención al Copropietario</h3>
                       <span className="text-[10px] text-text font-medium uppercase tracking-widest flex items-center gap-1.5">
                          {isAdminOnline ? (
                            <>
                              <span className="w-1 h-1 rounded-full bg-text/10 animate-pulse" />
                              Disponible
                            </>
                          ) : 'Ausente'}
                       </span>
                    </div>
                 </div>
                 <button 
                   onClick={() => setIsChatOpen(false)}
                   className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-text hover:bg-surface-2/80 transition-all active:scale-90"
                 >
                    <X size={20} />
                 </button>
              </div>

              {/* Chat Body (Messages) */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scroll-smooth hide-scrollbar bg-linear-to-b from-transparent to-black/20">
                 {chatMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-text">
                       <MessageCircle size={48} className="text-text/50" />
                       <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-center max-w-[200px] leading-relaxed">
                          Envía un mensaje para iniciar una conversación directa con la administración
                       </p>
                    </div>
                 ) : chatMessages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                       <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed ${
                         m.esDeAdmin 
                           ? 'bg-surface-2 border border-border text-text rounded-tl-none shadow-sm' 
                           : 'bg-text/10 text-white rounded-tr-none shadow-lg shadow-black/10 font-medium'
                       }`}>
                          {m.mensaje}
                          <div className={`text-[8px] mt-2 opacity-40 flex items-center gap-1 ${m.esDeAdmin ? 'justify-start text-text' : 'justify-end font-normal text-white'}`}>
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
                    <div className="flex-1 min-h-[56px] bg-primary border border-border rounded-[28px] flex items-center px-6 transition-all focus-within:border-text/50 focus-within:bg-primary/80 shadow-inner">
                       <input 
                         type="text"
                         value={newMessage}
                         onChange={(e) => setNewMessage(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                         placeholder="Describe tu solicitud o duda..."
                         className="w-full bg-transparent border-none text-text text-sm focus:ring-0 placeholder:text-text"
                       />
                    </div>
                    <button 
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || isSending}
                      className="w-14 h-14 rounded-full bg-text/10 flex items-center justify-center text-white shadow-[0_10px_25px_rgba(128,128,128,0.3)] active:scale-90 transition-all disabled:opacity-50 disabled:scale-100 group"
                    >
                       {isSending ? <Loader2 size={24} className="animate-spin" /> : <ArrowRight size={24} className="group-hover:translate-x-0.5 transition-transform" />}
                    </button>
                 </div>
                 <div className="mt-4 flex items-center justify-center gap-2 text-text">
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

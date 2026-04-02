"use client";

/**
 * CARTELERA - CONJUNTOAPP
 * Tablón de anuncios oficiales de la administración.
 */

import { 
  Megaphone, ShieldAlert, Wrench, Calendar, Info, 
  Clock, ArrowRight, X, Download, Share2
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { gsap } from "gsap";
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

  useEffect(() => {
    async function initData() {
      try {
        const anunciosFetch = await fetch("/api/user/anuncios", { cache: 'no-store' });
        const anunciosRes = await anunciosFetch.json();

        if (anunciosRes.success && anunciosRes.data) {
          const mapped: Notice[] = anunciosRes.data.map((a: Anuncio) => ({
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
          setNotices(mapped);
        }
      } catch (error) {
        console.error("❌ Error initializing Cartelera:", error);
      } finally {
        setIsLoadingNotices(false);
      }
    }

    if (session) initData();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: "back.out(1.2)" });
    }, containerRef);
    return () => ctx.revert();
  }, [session, userId]);

  const filteredNotices = selectedCategory === 'TODOS' ? notices : notices.filter(n => n.category === selectedCategory);

  const getNoticeIcon = (cat: string) => {
    switch(cat) {
      case 'URGENTE': return <ShieldAlert size={18} />;
      case 'MANTENIMIENTO': return <Wrench size={18} />;
      case 'EVENTO': return <Calendar size={18} />;
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

      {/* FILTER TABS */}
      <section className="fade-up flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar flex-nowrap">
         {['TODOS', 'MANTENIMIENTO', 'SEGURIDAD', 'EVENTO', 'CONVIVENCIA'].map((cat) => (
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
         ) : filteredNotices.map((notice) => (
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

      {/* MODAL: NOTICE DETAIL */}
      {selectedNotice && (
        <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedNotice(null)} />
           <div className="relative w-full max-w-lg bg-[#0d041a] rounded-t-[40px] sm:rounded-[40px] border-t sm:border border-white/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-400">
              <div className="max-h-[85vh] overflow-y-auto hide-scrollbar">
                 {selectedNotice.image && (
                   <div className="h-56 w-full relative">
                      <Image src={selectedNotice.image} alt="" fill className="w-full h-full object-cover" unoptimized />
                      <div className="absolute inset-0 bg-linear-to-t from-[#0d041a] to-transparent" />
                      <button onClick={() => setSelectedNotice(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"><X size={20} /></button>
                   </div>
                 )}
                 <div className="p-8 flex flex-col gap-6">
                    {!selectedNotice.image && <div className="flex justify-end"><button onClick={() => setSelectedNotice(null)} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40"><X size={20} /></button></div>}
                    <div className="flex flex-col gap-3">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-white">{getNoticeIcon(selectedNotice.category)}</div>
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
                    <p className="text-white/70 text-base leading-relaxed">{selectedNotice.content}</p>
                    <div className="flex flex-col gap-4 pt-6 border-t border-white/10">
                       <div className="flex items-center gap-2"><Info size={16} className="text-accent" /><span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Documentos Adjuntos</span></div>
                       <button className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-all text-left group">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400"><ShieldAlert size={18} /></div>
                             <div>
                                <p className="text-white text-sm font-bold">Circular_Informativa.pdf</p>
                                <p className="text-white/20 text-[10px] uppercase font-bold tracking-tighter">PDF • 1.2 MB</p>
                             </div>
                          </div>
                          <Download size={18} className="text-white/40 group-hover:text-accent transition-all" />
                       </button>
                    </div>
                    <button className="w-full bg-accent py-4 rounded-2xl font-bold text-white shadow-xl shadow-accent/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"><Share2 size={18} /> Compartir</button>
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

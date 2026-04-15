"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Search, ArrowRight, User, ChevronLeft, Building2, CheckCheck, Loader2, X, Phone, Car, Dog, ShieldCheck, Info } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

interface Conversation {
  usuarioId: string;
  usuarioNombre: string;
  usuarioAvatar: string | null;
  usuarioTorre: string | null;
  usuarioApto: string | null;
  mensaje: string;
  creadoEn: string;
  leido: boolean;
  esDeAdmin: boolean;
}

interface Message {
  id: string;
  mensaje: string;
  esDeAdmin: boolean;
  creadoEn: string;
  leido: boolean;
}

interface ResidentInfo {
  profile: {
    id: string;
    nombre: string;
    email: string;
    telefono: string | null;
    rol: string;
    torre: string | null;
    apto: string | null;
    avatar: string | null;
  } | null;
  vehicles: {
    placa: string;
    marca: string | null;
    modelo: string | null;
    tipo: string;
  }[];
  pets: {
    nombre: string;
    tipo: string;
    raza: string | null;
    fotoUrl: string | null;
  }[];
}

export default function AdminMensajesPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [residentInfo, setResidentInfo] = useState<ResidentInfo | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/admin/chat");
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
      }
    } catch {
      toast.error("Error al sincronizar");
    } finally {
      setLoading(false);
    }
  };

  const fetchChatHistory = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/chat/${userId}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.data);
        setResidentInfo(data.residentInfo);
      }
    } catch {
      toast.error("Error de sincronización");
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUserId || sending) return;
    setSending(true);
    
    const temp: Message = {
        id: `temp_${Date.now()}`,
        mensaje: newMessage,
        esDeAdmin: true,
        creadoEn: new Date().toISOString(),
        leido: false
    };
    setMessages(prev => [...prev, temp]);
    setNewMessage("");

    try {
      const res = await fetch(`/api/admin/chat/${selectedUserId}`, {
        method: "POST",
        body: JSON.stringify({ mensaje: temp.mensaje })
      });
      const data = await res.json();
      if (!data.success) toast.error("Error al enviar");
      fetchChatHistory(selectedUserId);
    } catch {
      toast.error("Fallo de red");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: any;
    if (selectedUserId) {
      setShowInfoPanel(false);
      fetchChatHistory(selectedUserId);
      interval = setInterval(() => fetchChatHistory(selectedUserId), 10000);
      
      // Animation for the modal
      if (modalRef.current) {
        gsap.fromTo(modalRef.current, { y: '100%', opacity: 0 }, { y: '0%', opacity: 1, duration: 0.5, ease: "power4.out" });
      }
    }
    return () => clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading && conversations.length > 0) {
      gsap.fromTo(".conv-card", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, stagger: 0.04, duration: 0.4, ease: "power2.out" });
    }
  }, [loading]);

  const filteredConversations = conversations.filter(c => 
    c.usuarioNombre.toLowerCase().includes(search.toLowerCase()) ||
    c.usuarioApto?.includes(search)
  ).sort((a,b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());

  const activeConv = conversations.find(c => c.usuarioId === selectedUserId);

  return (
    <div ref={containerRef} className="flex flex-col min-h-screen bg-transparent text-white font-sans overflow-x-hidden">
      
      {/* MAIN VIEW: CONVERSATION LIST */}
      <div className="flex-1 w-full max-w-[430px] mx-auto px-6 pt-24 pb-32">
        <div className="flex justify-between items-end mb-8">
           <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 italic">Administración</span>
              <h1 className="text-4xl font-black tracking-tight text-white uppercase italic leading-none">Mensajes</h1>
           </div>
           <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-500 shadow-glow">
              <MessageCircle size={20} />
           </div>
        </div>

        <div className="relative mb-8 group">
           <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" />
           <input 
             type="text" 
             placeholder="Buscar unidad o nombre..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             className="w-full bg-white/5 border border-white/10 rounded-[28px] py-4 pl-14 pr-6 text-sm outline-none focus:bg-white/10 focus:border-emerald-500/30 transition-all placeholder:text-white/10"
           />
        </div>

        <div className="space-y-3">
          {loading ? (
             <div className="py-20 flex flex-col items-center gap-4 opacity-20">
                <Loader2 className="animate-spin" size={32} />
                <p className="text-[10px] font-black uppercase tracking-widest">Cargando Inbox...</p>
             </div>
          ) : filteredConversations.length === 0 ? (
             <div className="py-20 text-center opacity-20 flex flex-col items-center gap-6">
                <div className="w-20 h-20 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center"><X size={32} /></div>
                <p className="text-[10px] font-black uppercase tracking-widest">Bandeja de entrada vacía</p>
             </div>
          ) : filteredConversations.map((c) => (
             <button
               key={c.usuarioId}
               onClick={() => setSelectedUserId(c.usuarioId)}
               className={`conv-card w-full p-5 rounded-[32px] flex items-center gap-4 transition-all active:scale-[0.97] border relative group
                 ${selectedUserId === c.usuarioId ? 'bg-emerald-500 border-emerald-400' : 'bg-white/[0.03] border-white/5 hover:bg-white/5'}`}
             >
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 relative overflow-hidden flex-shrink-0">
                   {c.usuarioAvatar ? <img src={c.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={24} className="text-white/20" />}
                   {!c.leido && !c.esDeAdmin && <div className="absolute top-1 right-1 w-3 h-3 bg-red-500 border-2 border-[#0c0816] rounded-full animate-pulse" />}
                </div>
                <div className="flex-1 text-left min-w-0">
                   <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[13px] font-black uppercase tracking-tight truncate max-w-[140px] italic">{c.usuarioNombre}</span>
                      <span className="text-[9px] font-bold opacity-30">{new Date(c.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   </div>
                   <div className="flex items-center justify-between gap-2">
                      <p className={`text-[11px] truncate leading-none ${!c.leido && !c.esDeAdmin ? 'text-white font-bold' : 'opacity-40'}`}>
                         {c.esDeAdmin && <span className="opacity-50">Tú: </span>}{c.mensaje}
                      </p>
                      <span className="text-[9px] px-2 py-0.5 rounded-lg bg-white/5 font-black text-white/30 tracking-tighter">T{c.usuarioTorre}-{c.usuarioApto}</span>
                   </div>
                </div>
             </button>
          ))}
        </div>
      </div>

      {/* IMMERSIVE CHAT MODAL */}
      {selectedUserId && (
        <div className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-3xl flex items-end justify-center animate-in fade-in duration-300 isolate">
           <div ref={modalRef} className="w-full max-w-[430px] h-full sm:h-[95vh] bg-[#0c0816] sm:rounded-t-[40px] flex flex-col overflow-hidden shadow-[0_-20px_100px_rgba(0,0,0,0.5)] border-t border-white/10">
              
              {/* MODAL HEADER */}
              <div className="p-6 flex justify-between items-center border-b border-white/5 bg-white/[0.02] backdrop-blur-2xl z-50">
                 <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setShowInfoPanel(!showInfoPanel)}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedUserId(null); }} 
                      className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/10"
                    >
                       <ChevronLeft size={22} />
                    </button>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 relative overflow-hidden shadow-inner group-hover:border-emerald-500/40 transition-all">
                       {activeConv?.usuarioAvatar ? <img src={activeConv.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={24} className="text-emerald-500/40" />}
                       <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-[3px] border-[#0c0816] bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="flex flex-col">
                       <h3 className="text-sm font-black text-white tracking-tight leading-none group-hover:text-emerald-400 transition-colors uppercase italic flex items-center gap-2">
                         {activeConv?.usuarioNombre}
                         <Info size={12} className="text-white/20 group-hover:text-emerald-500 transition-colors" />
                       </h3>
                       <div className="flex items-center gap-2 mt-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse outline outline-2 outline-emerald-500/20" />
                          <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.1em]">
                             Apto {activeConv?.usuarioTorre}-{activeConv?.usuarioApto} • En Línea
                          </span>
                       </div>
                    </div>
                 </div>
                 <button 
                    onClick={() => setSelectedUserId(null)}
                    className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all active:scale-90"
                 >
                    <X size={20} />
                 </button>
              </div>

              {/* CHAT BODY */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 hide-scrollbar bg-linear-to-b from-transparent via-transparent to-black/40 pt-8">
                 {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-8 opacity-20">
                       <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/5 animate-pulse"><MessageCircle size={48} /></div>
                       <p className="text-[11px] font-black uppercase tracking-[0.3em] text-center max-w-[240px] leading-relaxed">Inicia un canal de comunicación seguro con el residente</p>
                    </div>
                 ) : messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-400`}>
                       <div className={`max-w-[82%] px-5 py-4 rounded-[28px] text-[14px] leading-relaxed shadow-2xl relative
                         ${m.esDeAdmin 
                           ? 'bg-emerald-500 text-white rounded-tr-none shadow-emerald-500/20 font-medium' 
                           : 'bg-white/10 border border-white/10 text-white rounded-tl-none backdrop-blur-xl'
                         }`}>
                          {m.mensaje}
                          <div className={`text-[8px] mt-2.5 font-bold opacity-30 uppercase tracking-widest flex items-center gap-1.5 
                            ${m.esDeAdmin ? 'justify-end' : 'justify-start'}`}>
                             {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             {m.esDeAdmin && <CheckCheck size={11} className="text-white ml-1" />}
                          </div>
                       </div>
                    </div>
                 ))}
                 <div ref={chatEndRef} className="h-10" />
              </div>

              {/* RESIDENT INTEL OVERLAY */}
              {showInfoPanel && residentInfo?.profile && (
                 <div className="absolute inset-x-0 top-[88px] bottom-0 z-[60] bg-black/95 backdrop-blur-3xl animate-in slide-in-from-top-10 duration-500 overflow-y-auto hide-scrollbar border-t border-white/10">
                    <div className="p-8 space-y-10">
                       <div className="flex justify-between items-start">
                          <div className="space-y-1">
                             <div className="flex items-center gap-2 text-emerald-500 font-black text-[10px] uppercase tracking-widest italic mb-2">
                                <ShieldCheck size={14} /> Inteligencia Residencial
                             </div>
                             <h2 className="text-3xl font-black text-white italic leading-tight uppercase">{residentInfo.profile.nombre}</h2>
                             <p className="text-xs font-medium text-white/30">{residentInfo.profile.email}</p>
                          </div>
                          <button 
                            onClick={() => setShowInfoPanel(false)}
                            className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all hover:bg-white/10"
                          >
                             <ChevronLeft size={24} className="rotate-90" />
                          </button>
                       </div>

                       {/* DOSSIER CARDS */}
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 group hover:bg-white/[0.05] transition-all">
                             <Building2 size={18} className="text-white/20 mb-3" />
                             <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Identificación Unidad</span>
                             <p className="text-sm font-black text-white uppercase italic mt-1">Torre {residentInfo.profile.torre} • Apto {residentInfo.profile.apto}</p>
                          </div>
                          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 group hover:bg-white/[0.05] transition-all">
                             <ShieldCheck size={18} className="text-white/20 mb-3" />
                             <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Estado Jurídico</span>
                             <p className="text-sm font-black text-emerald-400 uppercase italic mt-1">{residentInfo.profile.rol}</p>
                          </div>
                          <a href={`tel:${residentInfo.profile.telefono}`} className="col-span-full p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 active:scale-95 transition-all flex items-center justify-between">
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/60 leading-none mb-1">Contacto Directo</span>
                                <p className="text-[20px] font-black text-emerald-400 italic leading-none">{residentInfo.profile.telefono || "CONSULTAR..."}</p>
                             </div>
                             <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/40">
                                <Phone size={22} fill="currentColor" />
                             </div>
                          </a>
                       </div>

                       {/* ASSET LISTS */}
                       <div className="space-y-4">
                          <div className="flex items-center gap-3 opacity-30"><Car size={20} /><h5 className="text-[11px] font-black uppercase tracking-[0.2em]">Vehículos ({residentInfo.vehicles.length})</h5></div>
                          <div className="grid gap-3">
                             {residentInfo.vehicles.length === 0 ? <DashedEmpty label="Sin registros vehiculares" /> : residentInfo.vehicles.map((v, i) => (
                               <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center group hover:bg-white/[0.08] transition-all">
                                  <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white/40 font-black text-sm uppercase italic border border-white/5">{v.placa.slice(0,2)}</div>
                                     <div><p className="text-base font-black text-white tracking-widest">{v.placa}</p><p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em]">{v.marca} {v.modelo}</p></div>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="space-y-4 pb-20">
                          <div className="flex items-center gap-3 opacity-30"><Dog size={20} /><h5 className="text-[11px] font-black uppercase tracking-[0.2em]">Mascotas ({residentInfo.pets.length})</h5></div>
                          <div className="grid gap-4">
                             {residentInfo.pets.length === 0 ? <DashedEmpty label="Sin mascotas registradas" /> : residentInfo.pets.map((p, i) => (
                               <div key={i} className="p-5 bg-white/5 rounded-[32px] border border-white/10 flex gap-5 items-center group hover:border-emerald-500/30 transition-all">
                                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner"><Dog size={24} /></div>
                                  <div className="min-w-0">
                                     <p className="text-lg font-black text-white leading-none uppercase italic mb-1.5">{p.nombre}</p>
                                     <span className="text-[10px] px-3 py-1 rounded-full bg-white/5 text-white/40 font-black uppercase tracking-widest">{p.tipo} • {p.raza || "Cruce"}</span>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                 </div>
              )}

              {/* CHAT INPUT AREA */}
              <div className="p-6 bg-white/[0.02] border-t border-white/5 pb-11 backdrop-blur-3xl pt-6">
                 <div className="max-w-[700px] mx-auto flex items-center gap-4">
                    <div className="flex-1 min-h-[64px] bg-white/5 border border-white/10 rounded-[32px] flex items-center px-8 transition-all focus-within:border-emerald-500/40 focus-within:bg-white/10 shadow-2xl group">
                       <input 
                         type="text"
                         value={newMessage}
                         onChange={(e) => setNewMessage(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                         placeholder="Emitir respuesta administrativa..."
                         className="w-full bg-transparent border-none text-white text-sm focus:ring-0 placeholder:text-white/10 font-medium"
                       />
                    </div>
                    <button 
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sending}
                      className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-[0_20px_50px_rgba(16,185,129,0.3)] active:scale-90 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 group flex-shrink-0 border-[6px] border-white/5"
                    >
                       {sending ? <Loader2 size={28} className="animate-spin" /> : <ArrowRight size={32} className="group-hover:translate-x-1 transition-transform" />}
                    </button>
                 </div>
                 <div className="mt-6 flex items-center justify-center gap-3 opacity-10 select-none">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white italic">Comunicación Segura • ConjuntOS Engine</p>
                 </div>
              </div>

           </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .shadow-glow { box-shadow: 0 0 20px rgba(16, 185, 129, 0.15); }
      `}} />
    </div>
  );
}

function DashedEmpty({ label }: { label: string }) {
  return (
    <div className="p-8 rounded-[32px] bg-white/[0.01] border border-dashed border-white/10 flex flex-col items-center justify-center gap-4">
       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/10 italic">{label}</span>
    </div>
  );
}

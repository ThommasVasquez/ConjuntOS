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
  const sidebarRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  
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
      
      // Smooth reveal of the chat window
      gsap.fromTo(chatWindowRef.current, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" });
    }
    return () => clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Entrance Animations
  useEffect(() => {
    if (conversations.length > 0) {
      gsap.fromTo(".conv-item", { opacity: 0, y: 15 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.5, ease: "power2.out" });
    }
  }, [loading]);

  const filteredConversations = conversations.filter(c => 
    c.usuarioNombre.toLowerCase().includes(search.toLowerCase()) ||
    c.usuarioApto?.includes(search)
  ).sort((a,b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());

  const activeConv = conversations.find(c => c.usuarioId === selectedUserId);

  return (
    <div ref={containerRef} className="flex flex-col h-screen md:h-[calc(100vh-80px)] bg-transparent overflow-hidden isolate relative text-white font-sans">
      
      <div className="flex flex-1 w-full h-full relative">
        
        {/* SIDEBAR: CONVERSATIONS LIST */}
        <div ref={sidebarRef} className={`flex-col h-full bg-transparent transition-all duration-300 relative z-20
          ${selectedUserId ? 'hidden md:flex md:w-[380px] border-r border-white/5' : 'flex w-full md:w-[380px] border-r border-white/5'}`}>
          
          <div className="pt-8 pb-4 px-6">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Mensajería</h1>
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                   <MessageCircle size={14} className="text-emerald-500" />
                </div>
              </div>
            </div>
            
            <div className="relative group">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar por nombre o unidad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-[13px] outline-none focus:bg-white/10 focus:border-emerald-500/30 transition-all placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-2 hide-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-20">
                <Loader2 className="animate-spin" size={24} />
                <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
               <div className="py-20 text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <X size={24} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest">Sin resultados</p>
               </div>
            ) : filteredConversations.map((c) => (
              <button
                key={c.usuarioId}
                onClick={() => setSelectedUserId(c.usuarioId)}
                className={`conv-item w-full p-4 rounded-[24px] flex items-center gap-4 transition-all active:scale-[0.97] border relative overflow-hidden group
                  ${selectedUserId === c.usuarioId ? 'bg-emerald-500 text-white border-emerald-400 shadow-xl shadow-emerald-500/20' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-inner transition-transform group-hover:scale-105
                   ${selectedUserId === c.usuarioId ? 'bg-white/20' : 'bg-white/5 border border-white/10'}`}>
                   {c.usuarioAvatar ? <img src={c.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={20} className={selectedUserId === c.usuarioId ? 'text-white' : 'text-white/20'} />}
                   {!c.leido && !c.esDeAdmin && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-emerald-500 rounded-full" />}
                </div>
                
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold truncate leading-none uppercase tracking-tight">{c.usuarioNombre}</span>
                    <span className={`text-[9px] font-bold ${selectedUserId === c.usuarioId ? 'text-white/60' : 'text-white/20'}`}>
                      {new Date(c.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate leading-none ${!c.leido && !c.esDeAdmin ? 'text-white font-black' : (selectedUserId === c.usuarioId ? 'text-white/80' : 'text-white/40')}`}>
                      {c.esDeAdmin && <span className="opacity-50 font-normal">Tú: </span>}{c.mensaje}
                    </p>
                    {c.usuarioApto && (
                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${selectedUserId === c.usuarioId ? 'bg-white/20 text-white' : 'bg-white/5 text-white/30'}`}>
                        {c.usuarioTorre}-{c.usuarioApto}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* MAIN CHAT WINDOW */}
        <div ref={chatWindowRef} className={`flex-1 flex flex-col h-full relative z-10 transition-all duration-500
          ${!selectedUserId ? 'hidden md:flex items-center justify-center bg-transparent' : 'flex w-full bg-[#0c0816] md:bg-transparent'}`}>
          
          {!selectedUserId ? (
            <div className="text-center space-y-8 opacity-20 select-none px-6">
               <div className="w-24 h-24 bg-white/5 rounded-[40px] flex items-center justify-center mx-auto border border-white/5 shadow-2xl relative">
                  <Building2 size={40} className="text-white/40" />
                  <div className="absolute inset-0 bg-emerald-500/5 blur-3xl rounded-full" />
               </div>
               <div className="space-y-2">
                  <h3 className="text-base font-black uppercase tracking-[0.3em] leading-none mb-2">Central de Operaciones</h3>
                  <p className="text-[10px] text-white/40 font-medium max-w-[240px] mx-auto leading-relaxed">Selecciona un residente para acceder al historial de comunicación e inteligencia predictiva.</p>
               </div>
            </div>
          ) : (
            <div className="flex flex-col h-full w-full relative overflow-hidden md:rounded-l-[40px] md:bg-[#0c0816] md:border-l md:border-white/5 shadow-2xl shadow-black/50">
               
               {/* CHAT HEADER: PREMIUM GLASS */}
               <div className="p-4 md:p-6 flex justify-between items-center border-b border-white/5 bg-white/5 backdrop-blur-3xl z-50 sticky top-0 w-full">
                  <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setShowInfoPanel(!showInfoPanel)}>
                     <button onClick={(e) => { e.stopPropagation(); setSelectedUserId(null); }} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 md:hidden transition-all active:scale-90">
                        <ChevronLeft size={18} className="text-white" />
                     </button>
                     <div className="w-11 h-11 md:w-13 md:h-13 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 relative overflow-hidden group-hover:border-emerald-500/30 transition-all shadow-inner">
                        {activeConv?.usuarioAvatar ? <img src={activeConv.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={22} className="text-white/20" />}
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-[3px] border-[#0c0816] bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                     </div>
                     <div className="flex flex-col">
                        <h3 className="text-[15px] font-black text-white tracking-tight leading-none group-hover:text-emerald-400 transition-colors uppercase flex items-center gap-2">
                          {activeConv?.usuarioNombre}
                          <Info size={12} className="text-white/20 group-hover:text-emerald-500 transition-colors" />
                        </h3>
                        <div className="flex items-center gap-2 mt-2">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[9px] text-white/40 font-black uppercase tracking-[0.1em]">
                             Residente {activeConv?.usuarioTorre && `• Torre ${activeConv.usuarioTorre} • Apt ${activeConv.usuarioApto}`}
                           </span>
                        </div>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedUserId(null)}
                      className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-white/10 transition-all active:scale-90"
                    >
                       <X size={18} />
                    </button>
                  </div>
               </div>

               {/* MESSAGES BODY: IMMERSIVE CHAT */}
               <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 hide-scrollbar bg-linear-to-b from-transparent to-black/40">
                  {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 opacity-20">
                       <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/5"><MessageCircle size={32} /></div>
                       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center max-w-[200px] leading-relaxed">Sin mensajes previos encriptados</p>
                    </div>
                  ) : messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-end' : 'justify-start'} group`}>
                       <div className={`max-w-[82%] px-5 py-4 rounded-[28px] text-[13.5px] leading-[1.6] shadow-2xl transition-transform active:scale-[0.99] relative
                         ${m.esDeAdmin 
                           ? 'bg-emerald-500 text-white rounded-tr-none shadow-emerald-500/20 font-medium' 
                           : 'bg-white/5 border border-white/10 text-white rounded-tl-none backdrop-blur-xl'
                         }`}>
                          {m.mensaje}
                          <div className={`text-[8px] mt-2.5 font-bold opacity-40 uppercase tracking-widest flex items-center gap-1.5 
                            ${m.esDeAdmin ? 'justify-end' : 'justify-start forced-colors:opacity-100'}`}>
                             {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             {m.esDeAdmin && <CheckCheck size={11} className="text-white" />}
                          </div>
                       </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} className="h-4" />
               </div>

               {/* INFO PANEL OVERLAY */}
               {showInfoPanel && residentInfo?.profile && (
                 <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="h-full bg-linear-to-b from-[#0f0a1d] to-[#05020a] border-b border-white/5 flex flex-col animate-in slide-in-from-top-20 duration-500 overflow-y-auto hide-scrollbar">
                       
                       <div className="p-8 border-b border-white/5 flex justify-between items-end">
                          <div className="space-y-1">
                             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Inteligencia Residencial</span>
                             <h2 className="text-3xl font-black text-white italic truncate max-w-[300px]">{residentInfo.profile.nombre}</h2>
                             <p className="text-xs font-bold text-white/30 uppercase tracking-tight">{residentInfo.profile.email}</p>
                          </div>
                          <button onClick={() => setShowInfoPanel(false)} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/60 border border-white/10 active:scale-90 transition-all"><X size={24} /></button>
                       </div>

                       <div className="p-8 space-y-10">
                          {/* GRID INFO */}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                             <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 space-y-1">
                                <Building2 size={16} className="text-white/20 mb-2" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Ubicación</span>
                                <p className="text-sm font-bold text-white uppercase italic">T{residentInfo.profile.torre} • A{residentInfo.profile.apto}</p>
                             </div>
                             <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 space-y-1">
                                <ShieldCheck size={16} className="text-white/20 mb-2" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Estado</span>
                                <p className="text-sm font-bold text-emerald-400 uppercase italic">{residentInfo.profile.rol}</p>
                             </div>
                             <a href={`tel:${residentInfo.profile.telefono}`} className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 space-y-1 group active:scale-95 transition-all">
                                <Phone size={16} className="text-emerald-500/50 mb-2" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/50">Llamada Directa</span>
                                <p className="text-sm font-bold text-emerald-400 uppercase italic group-hover:underline">{residentInfo.profile.telefono || "N/A"}</p>
                             </a>
                          </div>

                          {/* VEHICLES */}
                          <div className="space-y-4">
                             <div className="flex items-center gap-3 opacity-30"><Car size={18} /><h5 className="text-[11px] font-black uppercase tracking-[0.2em]">Parque Automotor ({residentInfo.vehicles.length})</h5></div>
                             <div className="grid gap-3">
                                {residentInfo.vehicles.length === 0 ? <div className="p-6 rounded-3xl bg-white/[0.01] border border-dashed border-white/10 text-center text-[10px] text-white/20 uppercase font-black">Sin registros vehiculares</div> : residentInfo.vehicles.map((v, i) => (
                                  <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center group hover:bg-white/10 transition-all">
                                     <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 font-black text-xs uppercase">{v.tipo[0]}</div>
                                        <div><p className="text-sm font-black text-white">{v.placa}</p><p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{v.marca} • {v.modelo}</p></div>
                                     </div>
                                     <ArrowRight size={14} className="text-white/10" />
                                  </div>
                                ))}
                             </div>
                          </div>

                          {/* PETS */}
                          <div className="space-y-4">
                             <div className="flex items-center gap-3 opacity-30"><Dog size={18} /><h5 className="text-[11px] font-black uppercase tracking-[0.2em]">Censo de Mascotas ({residentInfo.pets.length})</h5></div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {residentInfo.pets.length === 0 ? <div className="col-span-full p-6 rounded-3xl bg-white/[0.01] border border-dashed border-white/10 text-center text-[10px] text-white/20 uppercase font-black">Sin mascotas registradas</div> : residentInfo.pets.map((p, i) => (
                                  <div key={i} className="p-4 bg-white/5 rounded-3xl border border-white/10 flex gap-4 items-center group hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all">
                                     <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-inner group-hover:scale-105 transition-transform"><Dog size={20} /></div>
                                     <div className="min-w-0">
                                        <p className="text-sm font-black text-white truncate leading-none uppercase">{p.nombre}</p>
                                        <p className="text-[9px] text-white/30 uppercase font-bold tracking-widest mt-1.5">{p.tipo} • {p.raza || "Cruce"}</p>
                                     </div>
                                  </div>
                                ))}
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
               )}

               {/* CHAT INPUT AREA: IMMERSIVE */}
               <div className="p-6 bg-white/5 border-t border-white/5 pb-12 md:pb-10 backdrop-blur-2xl">
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
                       className="w-15 h-15 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-[0_20px_50px_rgba(16,185,129,0.3)] active:scale-90 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 group flex-shrink-0 border-4 border-white/5"
                     >
                        {sending ? <Loader2 size={24} className="animate-spin" /> : <ArrowRight size={28} className="group-hover:translate-x-1 transition-transform" />}
                     </button>
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-3 opacity-10 select-none">
                     <ShieldCheck size={12} className="text-emerald-500" />
                     <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Canal Seguro • Antigravity Engine</p>
                  </div>
               </div>

            </div>
          )}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}} />
    </div>
  );
}
/>
    </div>
  );
}

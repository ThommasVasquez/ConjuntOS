"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { MessageCircle, Search, Send, User, ChevronLeft, Building2, Clock, CheckCheck, Loader2 } from "lucide-react";
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

export default function AdminMensajesPage() {
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const [errorCount, setErrorCount] = useState(0);

  const fetchConversations = async () => {
    if (errorCount > 3) return; // Stop polling if too many errors
    try {
      const res = await fetch("/api/admin/chat");
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
        setErrorCount(0);
      } else {
        console.error("API Error Details:", data);
        setErrorCount(prev => prev + 1);
      }
    } catch (e) {
      setErrorCount(prev => prev + 1);
      toast.error("Error al cargar conversaciones");
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
      }
    } catch {
      toast.error("Error al cargar historial");
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUserId || sending) return;
    setSending(true);
    
    // Optimistic
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
      // Refresh to get actual DB record
      fetchChatHistory(selectedUserId);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 12000); // Polling conversations (Increased interval)
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: any;
    if (selectedUserId) {
      fetchChatHistory(selectedUserId);
      interval = setInterval(() => fetchChatHistory(selectedUserId), 8000); // Polling active chat (Optimized)
    }
    return () => clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Animations (Optimized to run only on meaningful changes)
  const animTrigger = useRef(false);
  useEffect(() => {
    if (conversations.length === 0 || animTrigger.current) return;
    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray(".fade-in");
      if (targets.length > 0) {
        gsap.fromTo(targets, { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.4, ease: "power2.out" });
        animTrigger.current = true; // Only animate list once per session/reset
      }
    }, containerRef);
    return () => ctx.revert();
  }, [conversations.length]);

  const filteredConversations = conversations.filter(c => 
    c.usuarioNombre.toLowerCase().includes(search.toLowerCase()) ||
    c.usuarioApto?.includes(search)
  );

  const activeConv = conversations.find(c => c.usuarioId === selectedUserId);
  return (
    <div ref={containerRef} className="flex flex-col h-full bg-transparent overflow-hidden isolate relative">
      {/* Background orbs handled by AppShell - redundant orbs removed */}

      <div className="flex-1 flex max-w-[1240px] mx-auto w-full relative">
        
        {/* Sidebar: Conversations List (Mobile: Full screen if no active chat) */}
        <div className={`flex-col h-full transition-all duration-500 bg-transparent md:border-r md:border-white/5 
          ${selectedUserId ? 'hidden md:flex md:w-96' : 'flex w-full md:w-96'}`}>
          
          <div className="pt-6 pb-4 px-6">
            <h1 className="text-xl font-black tracking-tighter mb-4 text-white/90">Mensajes</h1>
            <div className="relative group">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar residente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm outline-none focus:bg-white/10 focus:border-emerald-500/30 transition-all placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-1 hide-scrollbar">
            {loading ? (
              <div className="flex justify-center py-20 opacity-20"><Loader2 className="animate-spin" /></div>
            ) : filteredConversations.length === 0 ? (
               <div className="py-20 text-center opacity-20 flex flex-col items-center gap-4">
                  <MessageCircle size={32} />
                  <p className="text-[10px] font-black uppercase tracking-widest">Bandeja de entrada vacía</p>
               </div>
            ) : filteredConversations.map((c) => (
              <button
                key={c.usuarioId}
                onClick={() => setSelectedUserId(c.usuarioId)}
                className={`fade-in w-full p-4 rounded-[20px] flex items-center gap-3 transition-all active:scale-[0.98] border 
                  ${selectedUserId === c.usuarioId ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/10 border-emerald-400/50' : 'bg-transparent border-transparent hover:bg-white/5'}`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-inner
                   ${selectedUserId === c.usuarioId ? 'bg-white/20' : 'bg-white/5'}`}>
                   {c.usuarioAvatar ? <img src={c.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={18} className={selectedUserId === c.usuarioId ? 'text-white' : 'text-white/20'} />}
                   <div className="absolute bottom-0.5 right-0.5 w-2 h-2 bg-emerald-500 border-2 border-[#05020a] rounded-full" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[13px] font-bold truncate leading-none">{c.usuarioNombre}</span>
                    <span className={`text-[8px] font-medium ${selectedUserId === c.usuarioId ? 'text-white/70' : 'text-white/30'}`}>
                      {new Date(c.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-[10px] truncate flex-1 leading-none ${!c.leido && !c.esDeAdmin ? 'text-white font-black' : (selectedUserId === c.usuarioId ? 'text-white/70' : 'text-white/30')}`}>
                      {c.esDeAdmin && "Tú: "}{c.mensaje}
                    </p>
                    {(!c.leido && !c.esDeAdmin) && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content: Chat Window (Full screen on mobile if active) */}
        <div className={`flex-1 flex flex-col bg-transparent h-full transition-all duration-500 relative
          ${!selectedUserId ? 'hidden md:flex items-center justify-center' : 'flex w-full'}`}>
          
          {!selectedUserId ? (
            <div className="text-center space-y-6 max-w-xs px-6 opacity-20 select-none animate-in fade-in zoom-in duration-1000">
               <div className="w-20 h-20 bg-white/5 rounded-[32px] flex items-center justify-center mx-auto border border-white/5 rotate-6">
                  <Building2 size={32} className="text-white/40 -rotate-6" />
               </div>
               <div className="space-y-1">
                  <h3 className="text-base font-black tracking-tighter">Centro de Gestión</h3>
                  <p className="text-[8px] leading-relaxed uppercase tracking-[0.2em] font-black">
                    Selecciona un residente para iniciar la comunicación.
                  </p>
               </div>
            </div>
          ) : (
            <div className="flex flex-col h-full w-full relative">
               {/* Mobile/Desktop Chat Header (Strictly below TopBar or covering it) */}
               <div className="py-4 px-6 border-b border-white/5 bg-[#05020a]/60 backdrop-blur-3xl z-40 sticky top-0">
                  <div className="flex items-center gap-3">
                     <button onClick={() => setSelectedUserId(null)} className="p-2 -ml-2 rounded-full bg-white/5 hover:bg-white/10 md:hidden active:scale-90 transition-all">
                        <ChevronLeft size={20} />
                     </button>
                     <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 overflow-hidden">
                        {activeConv?.usuarioAvatar ? <img src={activeConv.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={20} className="opacity-20" />}
                     </div>
                     <div className="min-w-0">
                        <h3 className="text-[13px] font-black tracking-tight truncate leading-tight">{activeConv?.usuarioNombre}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[8px] text-white/30 uppercase tracking-[0.1em] font-black truncate">
                             Residente {activeConv?.usuarioTorre ? `• T${activeConv.usuarioTorre} A${activeConv.usuarioApto}` : (activeConv as any)?.usuarioEmail}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Messages Area */}
               <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 hide-scrollbar">
                  <div className="flex flex-col gap-6 pb-24">
                    {messages.map((m, idx) => (
                       <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                          <div className={`max-w-[78%] p-4 rounded-[24px] text-sm leading-relaxed shadow-lg ${
                             m.esDeAdmin 
                               ? 'bg-emerald-500 text-white rounded-tr-none shadow-emerald-500/10 font-medium' 
                               : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none backdrop-blur-sm'
                          }`}>
                             {m.mensaje}
                             <div className={`text-[8px] mt-2 font-black uppercase tracking-widest opacity-30 flex items-center gap-1 ${m.esDeAdmin ? 'justify-end' : 'justify-start'}`}>
                                {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {m.esDeAdmin && <CheckCheck size={10} className="ml-1 opacity-50" />}
                             </div>
                          </div>
                       </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
               </div>

               {/* FIXED BOTTOM INPUT AREA (Positioned above BottomNav mb-[80px]) */}
               <div className="absolute bottom-0 left-0 right-0 p-4 pb-4 bg-linear-to-t from-[#05020a] to-transparent z-50 pointer-events-none">
                  <div className="flex items-center gap-3 pointer-events-auto">
                     <div className="flex-1 min-h-[50px] liquid-glass border border-white/10 rounded-[25px] flex items-center px-5 focus-within:border-emerald-500/40 transition-all focus-within:bg-white/10">
                        <textarea 
                          rows={1}
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }}
                          placeholder="Respuesta..."
                          className="w-full bg-transparent border-none text-[14px] text-white focus:ring-0 placeholder:text-white/20 py-3 resize-none hide-scrollbar"
                        />
                     </div>
                     <button 
                       onClick={sendMessage}
                       disabled={!newMessage.trim() || sending}
                       className="w-[50px] h-[50px] rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 active:scale-90 transition-all disabled:opacity-30 flex-shrink-0 group"
                     >
                        {sending ? <Loader2 size={24} className="animate-spin" /> : <Send size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" /> }
                     </button>
                  </div>
               </div>
            </div>
          )}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}

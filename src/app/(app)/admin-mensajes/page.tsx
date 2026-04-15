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
    <div ref={containerRef} className="flex flex-col h-screen overflow-hidden isolate relative px-4 pb-20 pt-2">
      {/* Background Orbs (Premium Design System) */}
      <div className="fixed inset-0 pointer-events-none -z-1 overflow-hidden bg-[#05020a]">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[70%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-15%] left-[-15%] w-[60%] h-[70%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="flex-1 flex max-w-[1240px] mx-auto w-full gap-6 overflow-hidden relative">
        
        {/* Sidebar: Conversations List */}
        <div className={`flex flex-col liquid-glass rounded-[40px] overflow-hidden transition-all duration-500 border border-white/5 
          ${selectedUserId ? 'hidden md:flex md:w-80' : 'flex w-full md:w-80'}`}>
          <div className="p-8 pb-6">
            <h1 className="text-2xl font-black tracking-tighter mb-6 bg-linear-to-r from-white to-white/60 bg-clip-text text-transparent">Mensajes</h1>
            <div className="relative group">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar residente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm outline-none focus:bg-white/10 transition-all placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2 hide-scrollbar">
            {loading ? (
              <div className="flex justify-center py-20 opacity-20"><Loader2 className="animate-spin" /></div>
            ) : filteredConversations.length === 0 ? (
               <div className="py-32 text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
                    <MessageCircle size={32} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">Bandeja vacía</p>
               </div>
            ) : filteredConversations.map((c) => (
              <button
                key={c.usuarioId}
                onClick={() => setSelectedUserId(c.usuarioId)}
                className={`fade-in w-full p-4 rounded-3xl flex items-center gap-4 transition-all hover:bg-white/5 border 
                  ${selectedUserId === c.usuarioId ? 'bg-emerald-500 text-white shadow-[0_20px_40px_rgba(16,185,129,0.15)] border-emerald-400/50' : 'border-transparent'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold overflow-hidden relative shadow-inner
                   ${selectedUserId === c.usuarioId ? 'bg-white/20' : 'bg-white/5'}`}>
                   {c.usuarioAvatar ? <img src={c.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={20} className={selectedUserId === c.usuarioId ? 'text-white' : 'text-white/20'} />}
                   <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0c0c0c] rounded-full" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[13px] font-bold truncate tracking-tight">{c.usuarioNombre}</span>
                    <span className={`text-[9px] ${selectedUserId === c.usuarioId ? 'text-white/60' : 'text-white/20'}`}>
                      {new Date(c.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-[11px] truncate flex-1 leading-none ${!c.leido && !c.esDeAdmin ? 'text-white font-black' : (selectedUserId === c.usuarioId ? 'text-white/70' : 'text-white/30')}`}>
                      {c.esDeAdmin && "Tú: "}{c.mensaje}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content: Chat Window */}
        <div className={`flex-1 flex flex-col liquid-glass rounded-[40px] overflow-hidden transition-all duration-500 border border-white/5 relative
          ${!selectedUserId ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
          {!selectedUserId ? (
            <div className="text-center space-y-8 max-w-sm px-10 animate-in fade-in zoom-in duration-1000">
               <div className="w-24 h-24 bg-white/5 rounded-[40px] flex items-center justify-center mx-auto border border-white/5 rotate-12">
                  <Building2 size={40} className="text-white/10 -rotate-12" />
               </div>
               <div className="space-y-3">
                  <h3 className="text-xl font-black tracking-tighter text-white/60">Canal Directo</h3>
                  <p className="text-[10px] leading-relaxed uppercase tracking-[0.3em] font-black text-white/20">
                    Selecciona un residente para iniciar la plataforma de comunicación oficial.
                  </p>
               </div>
            </div>
          ) : (
            <>
               {/* Chat Header */}
               <div className="p-8 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-5">
                     <button onClick={() => setSelectedUserId(null)} className="p-3 -ml-4 rounded-2xl bg-white/5 hover:bg-white/10 md:hidden active:scale-90 transition-all">
                        <ChevronLeft size={20} />
                     </button>
                     <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 font-bold overflow-hidden shadow-xl">
                        {activeConv?.usuarioAvatar ? <img src={activeConv.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={28} className="opacity-20" />}
                     </div>
                     <div>
                        <h3 className="text-base font-black tracking-tighter">{activeConv?.usuarioNombre}</h3>
                        <div className="flex items-center gap-2.5 mt-1">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]" />
                           <span className="text-[9px] text-white/30 uppercase tracking-[0.15em] font-black">
                             Residente {activeConv?.usuarioTorre ? `• T${activeConv.usuarioTorre} A${activeConv.usuarioApto}` : (activeConv as any)?.usuarioEmail}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Messages Area */}
               <div className="flex-1 overflow-y-auto p-8 space-y-6 hide-scrollbar">
                  {messages.map((m, idx) => (
                     <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                        <div className={`max-w-[80%] p-5 rounded-[32px] text-sm leading-relaxed shadow-lg ${
                           m.esDeAdmin 
                             ? 'bg-emerald-500 text-white rounded-tr-none shadow-emerald-500/10' 
                             : 'bg-white/5 border border-white/5 text-white/90 rounded-tl-none backdrop-blur-md'
                        }`}>
                           {m.mensaje}
                           <div className={`text-[8px] mt-3 font-black uppercase tracking-widest opacity-40 flex items-center gap-1.5 ${m.esDeAdmin ? 'justify-end' : 'justify-start'}`}>
                              <Clock size={10} />
                              {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {m.esDeAdmin && <CheckCheck size={12} className="ml-1" />}
                           </div>
                        </div>
                     </div>
                  ))}
                  <div ref={chatEndRef} />
               </div>

               {/* Input Area */}
               <div className="p-8 bg-white/5 backdrop-blur-3xl border-t border-white/5">
                  <div className="flex items-center gap-4">
                     <div className="flex-1 min-h-[64px] bg-white/5 border border-white/10 rounded-[32px] flex items-center px-8 focus-within:bg-white/10 transition-all">
                        <textarea 
                          rows={1}
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }}
                          placeholder="Responder mensaje..."
                          className="w-full bg-transparent border-none text-[15px] text-white focus:ring-0 placeholder:text-white/10 py-5 resize-none hide-scrollbar font-medium"
                        />
                     </div>
                     <button 
                       onClick={sendMessage}
                       disabled={!newMessage.trim() || sending}
                       className="w-16 h-16 rounded-[28px] bg-emerald-500 flex items-center justify-center text-white shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-30 group"
                     >
                        {sending ? <Loader2 size={24} className="animate-spin" /> : <Send size={22} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" /> }
                     </button>
                  </div>
               </div>
            </>
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

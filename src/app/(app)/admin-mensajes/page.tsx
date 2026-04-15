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
    const interval = setInterval(fetchConversations, 10000); // Polling conversations
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: any;
    if (selectedUserId) {
      fetchChatHistory(selectedUserId);
      interval = setInterval(() => fetchChatHistory(selectedUserId), 5000); // Polling active chat
    }
    return () => clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Animations
  useEffect(() => {
    if (conversations.length === 0) return;
    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray(".fade-in");
      if (targets.length > 0) {
        gsap.fromTo(targets, { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.4 });
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
    <div ref={containerRef} className="flex flex-col h-screen bg-[#05020a] text-white overflow-hidden isolate relative">
      {/* Dynamic Glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none -z-1" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none -z-1" />

      <ProfileHeader />

      <div className="flex-1 flex max-w-[1200px] mx-auto w-full pt-16 pb-8 px-4 gap-6 overflow-hidden">
        
        {/* Sidebar: Conversations List */}
        <div className={`flex-col bg-white/5 border border-white/10 rounded-[32px] overflow-hidden transition-all duration-500 ${selectedUserId ? 'hidden md:flex w-80' : 'flex w-full md:w-80'}`}>
          <div className="p-6 border-b border-white/5 bg-white/5 backdrop-blur-xl">
            <h1 className="text-xl font-bold tracking-tight mb-4">Mensajes</h1>
            <div className="relative group">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-emerald-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar residente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:border-emerald-500/40 focus:bg-white/10 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 hide-scrollbar">
            {loading ? (
              <div className="flex justify-center py-10 scale-75 opacity-50"><Loader2 className="animate-spin" /></div>
            ) : filteredConversations.length === 0 ? (
               <div className="py-20 text-center opacity-30 flex flex-col items-center gap-3">
                  <MessageCircle size={40} />
                  <p className="text-[10px] font-bold uppercase tracking-widest">No hay conversaciones</p>
               </div>
            ) : filteredConversations.map((c) => (
              <button
                key={c.usuarioId}
                onClick={() => setSelectedUserId(c.usuarioId)}
                className={`fade-in w-full p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-white/5 border ${selectedUserId === c.usuarioId ? 'bg-white/10 border-white/20 shadow-lg' : 'border-transparent'}`}
              >
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 text-emerald-400 font-bold overflow-hidden relative">
                   {c.usuarioAvatar ? <img src={c.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={20} />}
                   {/* Online Signal Simulation (Fixed for demo) */}
                   <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0c0c0c] rounded-full" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-sm font-bold truncate">{c.usuarioNombre}</span>
                    <span className="text-[10px] text-white/30">{new Date(c.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-white/40 font-black uppercase tracking-tighter">
                       {c.usuarioTorre ? `T${c.usuarioTorre}-A${c.usuarioApto}` : (c as any).usuarioEmail || 'Residente'}
                    </span>
                    <p className={`text-[11px] truncate flex-1 ${!c.leido && !c.esDeAdmin ? 'text-emerald-400 font-bold' : 'text-white/40'}`}>
                      {c.esDeAdmin && "Tú: "}{c.mensaje}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content: Chat Window */}
        <div className={`flex-1 bg-white/5 border border-white/10 rounded-[32px] overflow-hidden flex flex-col transition-all duration-500 relative ${!selectedUserId ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
          {!selectedUserId ? (
            <div className="text-center space-y-6 max-w-sm px-6 opacity-40">
               <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
                  <Building2 size={32} className="text-white/40" />
               </div>
               <div>
                  <h3 className="text-lg font-bold tracking-tight">Panel de Mensajería</h3>
                  <p className="text-xs mt-2 leading-relaxed uppercase tracking-[0.2em] font-medium">Selecciona un residente para iniciar la comunicación directa.</p>
               </div>
            </div>
          ) : (
            <>
               {/* Chat Header */}
               <div className="p-6 border-b border-white/5 bg-white/5 backdrop-blur-2xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <button onClick={() => setSelectedUserId(null)} className="p-2 -ml-2 rounded-full hover:bg-white/5 md:hidden">
                        <ChevronLeft size={20} />
                     </button>
                     <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20 text-emerald-400 font-bold overflow-hidden">
                        {activeConv?.usuarioAvatar ? <img src={activeConv.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={24} />}
                     </div>
                     <div>
                        <h3 className="text-sm font-bold tracking-tight">{activeConv?.usuarioNombre}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[10px] text-white/40 uppercase tracking-widest font-black">Residente • T{activeConv?.usuarioTorre} A{activeConv?.usuarioApto}</span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Messages Area */}
               <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar bg-linear-to-b from-transparent to-black/20">
                  {messages.map((m, idx) => (
                     <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`max-w-[75%] p-4 rounded-3xl text-sm leading-relaxed ${
                           m.esDeAdmin 
                             ? 'bg-emerald-500 text-white rounded-tr-none shadow-xl shadow-emerald-500/10 font-medium' 
                             : 'bg-white/5 border border-white/10 text-white rounded-tl-none'
                        }`}>
                           {m.mensaje}
                           <div className={`text-[8px] mt-2 opacity-40 flex items-center gap-1 ${m.esDeAdmin ? 'justify-end' : 'justify-start'}`}>
                              <Clock size={8} />
                              {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {m.esDeAdmin && <CheckCheck size={10} className="ml-1 text-white/40" />}
                           </div>
                        </div>
                     </div>
                  ))}
                  <div ref={chatEndRef} />
               </div>

               {/* Input Area */}
               <div className="p-6 bg-[#0a0611] border-t border-white/5">
                  <div className="flex items-center gap-3">
                     <div className="flex-1 min-h-[56px] bg-white/5 border border-white/10 rounded-3xl flex items-center px-6 focus-within:border-emerald-500/30 transition-all focus-within:bg-white/10">
                        <textarea 
                          rows={1}
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }}
                          placeholder="Responder al residente..."
                          className="w-full bg-transparent border-none text-sm text-white focus:ring-0 placeholder:text-white/20 py-4 resize-none hide-scrollbar"
                        />
                     </div>
                     <button 
                       onClick={sendMessage}
                       disabled={!newMessage.trim() || sending}
                       className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 active:scale-90 transition-all disabled:opacity-30 group"
                     >
                        {sending ? <Loader2 size={24} className="animate-spin" /> : <Send size={20} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" /> }
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

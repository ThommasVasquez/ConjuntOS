"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Search, ArrowRight, User, ChevronLeft, Building2, CheckCheck, Loader2, X, Phone, Car, Dog, ShieldCheck, Info, Mic, Play, Pause, Music, Trash2 } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

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
  audioUrl?: string | null;
  transcripcion?: string | null;
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
  const { user, loading: authLoading } = useAuth();
  const role = user?.rol;
  const router = useRouter();

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
  
  // Voice Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const fetchConversations = async () => {
    try {
      const data = await api.get<Conversation[]>('/admin/chat');
      setConversations(data);
    } catch {
      toast.error("Error al sincronizar");
    } finally {
      setLoading(false);
    }
  };

  // Real-time WebSocket subscription for chat messages
  useWsSubscription('chat', (event) => {
    fetchConversations();
    if (event.action === 'message' && selectedUserId) {
      fetchChatHistory(selectedUserId);
    }
  });

  const fetchChatHistory = async (userId: string) => {
    try {
      const data = await api.get<{ mensajes: Message[]; residentInfo: ResidentInfo }>(`/admin/chat/${userId}`);
      setMessages(data.mensajes);
      setResidentInfo(data.residentInfo);
    } catch {
      toast.error("Error de sincronización");
    }
  };

  const sendMessage = async (audioData?: { url: string, text: string }) => {
    if (!selectedUserId) return;
    if (!audioData && (!newMessage.trim() || sending)) return;
    setSending(true);
    
    const temp: Message = {
        id: `temp_${Date.now()}`,
        mensaje: audioData ? "Mensaje de voz" : newMessage,
        audioUrl: audioData?.url || null,
        transcripcion: audioData?.text || null,
        esDeAdmin: true,
        creadoEn: new Date().toISOString(),
        leido: false
    };
    setMessages(prev => [...prev, temp]);
    if (!audioData) setNewMessage("");

    try {
      await api.post(`/admin/chat/${selectedUserId}`, { 
          mensaje: temp.mensaje,
          audioUrl: temp.audioUrl,
          transcripcion: temp.transcripcion
        });
      fetchChatHistory(selectedUserId);
    } catch {
      toast.error("Fallo de red");
    } finally {
      setSending(false);
    }
  };

  // Voice Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        handleUploadAndSend(blob);
      };

      // Real-time Transcription Setup
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.lang = 'es-ES';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e: any) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) {
            text += e.results[i][0].transcript;
          }
          setTranscription(text);
        };
        recognitionRef.current = rec;
        rec.start();
      }

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setTranscription("");
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);

    } catch (err) {
      toast.error("Error al acceder al micrófono");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    if (recognitionRef.current) {
        recognitionRef.current.stop();
    }
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const handleUploadAndSend = async (blob: Blob) => {
    if (!selectedUserId) return;
    setSending(true);

    try {
      // Convert blob to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Strip the data:audio/webm;base64, prefix
          const b64 = result.split(",")[1] || result;
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Optimistic UI
      const temp: typeof messages[0] = {
        id: `temp_${Date.now()}`,
        mensaje: "[audio]",
        audioUrl: URL.createObjectURL(blob),
        transcripcion: transcription || null,
        esDeAdmin: true,
        creadoEn: new Date().toISOString(),
        leido: false,
      };
      setMessages((prev) => [...prev, temp]);

      await api.post(`/admin/chat/${selectedUserId}`, {
        mensaje: transcription.trim() || undefined,
        audioBase64: base64,
        transcripcion: transcription.trim() || undefined,
      });

      toast.success("Nota de voz enviada");
      setTranscription("");
      setAudioBlob(null);
      fetchChatHistory(selectedUserId);
    } catch (err) {
      toast.error("Error al enviar nota de voz");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ['ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [user, authLoading, role, router]);

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
    <div ref={containerRef} className="flex flex-col min-h-screen bg-transparent text-text font-sans overflow-x-hidden">
      
      {/* MAIN VIEW: CONVERSATION LIST */}
      <div className="flex-1 w-full max-w-[430px] mx-auto px-6 pt-24 pb-32">
        <div className="flex justify-between items-end mb-8">
           <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 italic">Administración</span>
              <h1 className="text-4xl font-black tracking-tight text-text uppercase italic leading-none">Mensajes</h1>
           </div>
           <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-emerald-500 shadow-glow">
              <MessageCircle size={20} />
           </div>
        </div>

        <div className="relative mb-8 group">
           <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-emerald-500 transition-colors" />
           <input 
             type="text" 
             placeholder="Buscar unidad o nombre..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             className="w-full bg-surface-2 border border-border rounded-[28px] py-4 pl-14 pr-6 text-sm outline-none focus:bg-surface focus:border-emerald-500/30 transition-all placeholder:text-text/50"
           />
        </div>

        <div className="space-y-3">
          {loading ? (
             <div className="py-20 flex flex-col items-center gap-4 opacity-40">
                <Loader2 className="animate-spin text-text" size={32} />
                <p className="text-[10px] text-text font-black uppercase tracking-widest">Cargando Inbox...</p>
             </div>
          ) : filteredConversations.length === 0 ? (
             <div className="py-20 text-center opacity-40 flex flex-col items-center gap-6">
                <div className="w-20 h-20 rounded-[32px] bg-surface-2 border border-border flex items-center justify-center text-text"><X size={32} /></div>
                <p className="text-[10px] text-text font-black uppercase tracking-widest">Bandeja de entrada vacía</p>
             </div>
          ) : filteredConversations.map((c) => (
             <button
               key={c.usuarioId}
               onClick={() => setSelectedUserId(c.usuarioId)}
               className={`conv-card w-full p-5 rounded-[32px] flex items-center gap-4 transition-all active:scale-[0.97] border relative group
                 ${selectedUserId === c.usuarioId ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-surface-2 border-border hover:bg-surface'}`}
             >
                <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center border border-border relative overflow-hidden flex-shrink-0">
                   {c.usuarioAvatar ? <img src={c.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={24} className="text-text/60" />}
                   {!c.leido && !c.esDeAdmin && <div className="absolute top-1 right-1 w-3 h-3 bg-red-500 border-2 border-primary rounded-full animate-pulse" />}
                </div>
                <div className="flex-1 text-left min-w-0">
                   <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[13px] font-black uppercase tracking-tight truncate max-w-[140px] italic">{c.usuarioNombre}</span>
                      <span className="text-[9px] font-bold opacity-70">{new Date(c.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   </div>
                   <div className="flex items-center justify-between gap-2">
                      <p className={`text-[11px] truncate leading-none ${!c.leido && !c.esDeAdmin ? 'text-text font-bold' : 'opacity-80'}`}>
                         {c.esDeAdmin && <span className="opacity-70">Tú: </span>}{c.mensaje}
                      </p>
                      <span className="text-[9px] px-2 py-0.5 rounded-lg bg-surface font-black text-text/80 bg-text/10 tracking-tighter">T{c.usuarioTorre}-{c.usuarioApto}</span>
                   </div>
                </div>
             </button>
          ))}
        </div>
      </div>

      {/* IMMERSIVE CHAT MODAL */}
      {selectedUserId && (
        <div className="fixed inset-0 z-[10000] bg-primary/95 backdrop-blur-3xl flex items-end justify-center animate-in fade-in duration-300 isolate">
           <div ref={modalRef} className="w-full max-w-[430px] h-full sm:h-[95vh] bg-primary sm:rounded-t-[40px] flex flex-col overflow-hidden shadow-[0_-20px_100px_rgba(0,0,0,0.5)] border-t border-border">
              
              {/* MODAL HEADER */}
              <div className="p-6 flex justify-between items-center border-b border-border bg-surface/50 backdrop-blur-2xl z-50">
                 <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setShowInfoPanel(!showInfoPanel)}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedUserId(null); }} 
                      className="w-10 h-10 rounded-2xl bg-surface flex items-center justify-center text-text active:scale-90 transition-all hover:bg-surface-2"
                    >
                       <ChevronLeft size={22} />
                    </button>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 relative overflow-hidden shadow-inner group-hover:border-emerald-500/40 transition-all">
                       {activeConv?.usuarioAvatar ? <img src={activeConv.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={24} className="text-emerald-500" />}
                       <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-[3px] border-primary bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="flex flex-col">
                       <h3 className="text-sm font-black text-text tracking-tight leading-none group-hover:text-emerald-400 transition-colors uppercase italic flex items-center gap-2">
                         {activeConv?.usuarioNombre}
                         <Info size={12} className="text-text/60 group-hover:text-emerald-500 transition-colors" />
                       </h3>
                       <div className="flex items-center gap-2 mt-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse outline outline-2 outline-emerald-500/20" />
                          <span className="text-[9px] text-text/70 font-black uppercase tracking-[0.1em]">
                             Apto {activeConv?.usuarioTorre}-{activeConv?.usuarioApto} • En Línea
                          </span>
                       </div>
                    </div>
                 </div>
                 <button 
                    onClick={() => setSelectedUserId(null)}
                    className="w-10 h-10 rounded-2xl bg-surface border border-border flex items-center justify-center text-text-muted hover:text-text transition-all active:scale-90"
                 >
                    <X size={20} />
                 </button>
              </div>

              {/* CHAT BODY */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 hide-scrollbar bg-linear-to-b from-transparent via-transparent to-surface-2/40 pt-8">
                 {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-8 opacity-65">
                       <div className="w-24 h-24 bg-surface-2 rounded-full flex items-center justify-center border border-border animate-pulse text-text"><MessageCircle size={48} /></div>
                       <p className="text-[11px] font-black uppercase tracking-[0.3em] text-center max-w-[240px] leading-relaxed text-text">Inicia un canal de comunicación seguro con el residente</p>
                    </div>
                 ) : messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-400`}>
                       <div className={`max-w-[82%] px-5 py-4 rounded-[28px] text-[14px] leading-relaxed shadow-2xl relative
                         ${m.esDeAdmin 
                           ? 'bg-emerald-500 text-white rounded-tr-none shadow-emerald-500/20 font-medium' 
                           : 'bg-surface-2 border border-border text-text rounded-tl-none backdrop-blur-xl'
                         }`}>
                          
                          {m.audioUrl ? (
                            <AudioMessage url={m.audioUrl} transcription={m.transcripcion} />
                          ) : (
                            m.mensaje
                          )}
                          
                          <div className={`text-[8px] mt-2.5 font-bold uppercase tracking-widest flex items-center gap-1.5 
                            ${m.esDeAdmin ? 'justify-end text-white/50' : 'justify-start text-text/70'}`}>
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
                 <div className="absolute inset-x-0 top-[88px] bottom-0 z-[60] bg-primary/95 backdrop-blur-3xl animate-in slide-in-from-top-10 duration-500 overflow-y-auto hide-scrollbar border-t border-border">
                    <div className="p-8 space-y-10">
                       <div className="flex justify-between items-start">
                          <div className="space-y-1">
                             <div className="flex items-center gap-2 text-emerald-500 font-black text-[10px] uppercase tracking-widest italic mb-2">
                                <ShieldCheck size={14} /> Inteligencia Residencial
                             </div>
                             <h2 className="text-3xl font-black text-text italic leading-tight uppercase">{residentInfo.profile.nombre}</h2>
                             <p className="text-xs font-medium text-text/75">{residentInfo.profile.email}</p>
                          </div>
                          <button 
                            onClick={() => setShowInfoPanel(false)}
                            className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center text-text border border-border active:scale-90 transition-all hover:bg-surface-2"
                          >
                             <ChevronLeft size={24} className="rotate-90" />
                          </button>
                       </div>

                       {/* DOSSIER CARDS */}
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-5 rounded-3xl bg-surface border border-border group hover:bg-surface-2 transition-all">
                             <Building2 size={18} className="text-text/60 mb-3" />
                             <span className="text-[9px] font-black uppercase tracking-widest text-text/60">Identificación Unidad</span>
                             <p className="text-sm font-black text-text uppercase italic mt-1">Torre {residentInfo.profile.torre} • Apto {residentInfo.profile.apto}</p>
                          </div>
                          <div className="p-5 rounded-3xl bg-surface border border-border group hover:bg-surface-2 transition-all">
                             <ShieldCheck size={18} className="text-text/60 mb-3" />
                             <span className="text-[9px] font-black uppercase tracking-widest text-text/60">Estado Jurídico</span>
                             <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase italic mt-1">{residentInfo.profile.rol}</p>
                          </div>
                          <a href={`tel:${residentInfo.profile.telefono}`} className="col-span-full p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 active:scale-95 transition-all flex items-center justify-between">
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 leading-none mb-1">Contacto Directo</span>
                                <p className="text-[20px] font-black text-emerald-700 dark:text-emerald-400 italic leading-none">{residentInfo.profile.telefono || "CONSULTAR..."}</p>
                             </div>
                             <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/40">
                                <Phone size={22} fill="currentColor" />
                             </div>
                          </a>
                       </div>

                       {/* ASSET LISTS */}
                       <div className="space-y-4">
                          <div className="flex items-center gap-3 opacity-70"><Car size={20} className="text-text" /><h5 className="text-[11px] text-text font-black uppercase tracking-[0.2em]">Vehículos ({residentInfo.vehicles.length})</h5></div>
                          <div className="grid gap-3">
                             {residentInfo.vehicles.length === 0 ? <DashedEmpty label="Sin registros vehiculares" /> : residentInfo.vehicles.map((v, i) => (
                               <div key={i} className="p-4 bg-surface border border-border rounded-2xl flex justify-between items-center group hover:bg-surface-2 transition-all">
                                  <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-text/60 font-black text-sm uppercase italic border border-border">{v.placa.slice(0,2)}</div>
                                     <div><p className="text-base font-black text-text tracking-widest">{v.placa}</p><p className="text-[10px] font-bold text-text/70 uppercase tracking-[0.15em]">{v.marca} {v.modelo}</p></div>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="space-y-4 pb-20">
                          <div className="flex items-center gap-3 opacity-70"><Dog size={20} className="text-text" /><h5 className="text-[11px] text-text font-black uppercase tracking-[0.2em]">Mascotas ({residentInfo.pets.length})</h5></div>
                          <div className="grid gap-4">
                             {residentInfo.pets.length === 0 ? <DashedEmpty label="Sin mascotas registradas" /> : residentInfo.pets.map((p, i) => (
                               <div key={i} className="p-5 bg-surface rounded-[32px] border border-border flex gap-5 items-center group hover:border-emerald-500/30 transition-all">
                                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner"><Dog size={24} /></div>
                                  <div className="min-w-0">
                                     <p className="text-lg font-black text-text leading-none uppercase italic mb-1.5">{p.nombre}</p>
                                     <span className="text-[10px] px-3 py-1 rounded-full bg-surface-2 text-text/80 font-black uppercase tracking-widest">{p.tipo} • {p.raza || "Cruce"}</span>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                 </div>
              )}

              {/* CHAT INPUT AREA */}
              <div className="p-6 bg-surface/50 border-t border-border pb-11 backdrop-blur-3xl pt-6">
                <div className="max-w-[700px] mx-auto flex items-center gap-4 relative">
                    {isRecording ? (
                      <div className="flex-1 h-16 bg-red-500/10 border border-red-500/20 rounded-[32px] flex items-center px-8 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                        <span className="text-sm font-black text-red-400 tabular-nums">
                          {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                        </span>
                        <div className="flex-1 flex items-center gap-1.5 overflow-hidden">
                          {[...Array(12)].map((_, i) => (
                            <div key={i} className="w-1 bg-red-500/30 rounded-full animate-bounce" style={{ height: `${Math.random() * 20 + 10}px`, animationDelay: `${i * 0.1}s`, animationDuration: '0.6s' }} />
                          ))}
                        </div>
                        <button 
                          onClick={stopRecording}
                          className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white shadow-lg active:scale-90 transition-all"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-[64px] bg-surface border border-border rounded-[32px] flex items-center px-8 transition-all focus-within:border-emerald-500/40 focus-within:bg-surface-2 shadow-2xl group">
                         <input 
                           type="text"
                           value={newMessage}
                           onChange={(e) => setNewMessage(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                           placeholder="Emitir respuesta administrativa..."
                           className="flex-1 bg-transparent border-none text-text text-sm focus:ring-0 placeholder:text-text/50 font-medium"
                         />
                         <button 
                           onClick={startRecording}
                           className="w-10 h-10 rounded-2xl bg-surface-2 flex items-center justify-center text-text/80 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all border border-transparent hover:border-emerald-500/20"
                         >
                            <Mic size={20} />
                         </button>
                      </div>
                    )}
                    
                    {!isRecording && (
                      <button 
                        onClick={sendMessage as any}
                        disabled={(!newMessage.trim() && !audioBlob) || sending}
                        className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-[0_20px_50px_rgba(16,185,129,0.3)] active:scale-90 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 group flex-shrink-0 border-[6px] border-surface-2"
                      >
                         {sending ? <Loader2 size={28} className="animate-spin" /> : <ArrowRight size={32} className="group-hover:translate-x-1 transition-transform" />}
                      </button>
                    )}
                 </div>
                 <div className="mt-6 flex items-center justify-center gap-3 opacity-70 select-none">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text italic">Comunicación Segura • ConjuntOS Engine</p>
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
    <div className="p-8 rounded-[32px] bg-surface border border-dashed border-border flex flex-col items-center justify-center gap-4">
       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text/65 italic">{label}</span>
    </div>
  );
}

function AudioMessage({ url, transcription }: { url: string, transcription?: string | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex flex-col gap-3 min-w-[200px]">
      <div className="flex items-center gap-3">
        <button 
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-text hover:bg-surface-3 transition-all border border-border"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
        </button>
        <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden relative">
           <div className={`absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-300 ${isPlaying ? 'w-full animate-pulse' : 'w-0'}`} />
        </div>
        <Music size={14} className="opacity-40" />
      </div>
      
      {transcription && (
        <div className="pt-2 border-t border-border mt-1">
          {!showTranscription ? (
            <button 
              onClick={() => setShowTranscription(true)}
              className="text-[9px] font-black uppercase tracking-widest text-text/85 hover:text-text transition-colors"
            >
              Ver transcripción
            </button>
          ) : (
            <p className="text-[11px] leading-relaxed italic opacity-85 text-text animate-in fade-in duration-500">
              "{transcription}"
            </p>
          )}
        </div>
      )}
      <audio ref={audioRef} src={url} onEnded={() => setIsPlaying(false)} className="hidden" />
    </div>
  );
}

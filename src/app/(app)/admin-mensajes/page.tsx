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
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [residentInfo, setResidentInfo] = useState<ResidentInfo | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const [errorCount, setErrorCount] = useState(0);

  const fetchConversations = async () => {
    if (errorCount > 3) return;
    try {
      const res = await fetch("/api/admin/chat");
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
        setErrorCount(0);
      } else {
        setErrorCount(prev => prev + 1);
      }
    } catch {
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
        setResidentInfo(data.residentInfo);
      }
    } catch {
      toast.error("Error al cargar historial");
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
      toast.error("Error de conexión");
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
    }
    return () => clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const animTrigger = useRef(false);
  useEffect(() => {
    if (conversations.length === 0 || animTrigger.current) return;
    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray(".fade-in");
      if (targets.length > 0) {
        gsap.fromTo(targets, { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.4, ease: "power2.out" });
        animTrigger.current = true;
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
      <div className="flex-1 flex max-w-[1240px] mx-auto w-full relative h-full">
        
        {/* SIDEBAR: CONVERSATIONS */}
        <div className={`flex-col h-full bg-transparent md:border-r md:border-white/5 
          ${selectedUserId ? 'hidden md:flex md:w-80 lg:w-96' : 'flex w-full md:w-80 lg:w-96'}`}>
          <div className="pt-6 pb-4 px-6 md:pt-10">
            <h1 className="text-xl font-bold tracking-tighter mb-4 text-white/90">Mensajes Administrativos</h1>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
              <input 
                type="text" 
                placeholder="Buscar residente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-xs outline-none focus:bg-white/10 focus:border-emerald-500/30 transition-all placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-1 hide-scrollbar">
            {loading ? (
              <div className="flex justify-center py-20 opacity-20"><Loader2 className="animate-spin" /></div>
            ) : filteredConversations.length === 0 ? (
               <div className="py-20 text-center opacity-20 flex flex-col items-center gap-4">
                  <MessageCircle size={32} />
                  <p className="text-[10px] font-bold uppercase tracking-widest">Bandeja Vacía</p>
               </div>
            ) : filteredConversations.map((c) => (
              <button
                key={c.usuarioId}
                onClick={() => setSelectedUserId(c.usuarioId)}
                className={`fade-in w-full p-4 rounded-3xl flex items-center gap-3 transition-all active:scale-[0.98] border 
                  ${selectedUserId === c.usuarioId ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-transparent border-transparent hover:bg-white/5'}`}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-inner
                   ${selectedUserId === c.usuarioId ? 'bg-white/20' : 'bg-white/5'}`}>
                   {c.usuarioAvatar ? <img src={c.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={18} className={selectedUserId === c.usuarioId ? 'text-white' : 'text-white/20'} />}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[13px] font-bold truncate leading-none">{c.usuarioNombre}</span>
                    <span className={`text-[8px] font-medium ${selectedUserId === c.usuarioId ? 'text-white/70' : 'text-white/30'}`}>
                      {new Date(c.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className={`text-[10px] truncate leading-none ${!c.leido && !c.esDeAdmin ? 'text-white font-black' : (selectedUserId === c.usuarioId ? 'text-white/70' : 'text-white/30')}`}>
                    {c.esDeAdmin && "Tú: "}{c.mensaje}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* MAIN CHAT WINDOW */}
        <div className={`flex-1 flex flex-col bg-transparent h-full transition-all duration-500 relative
          ${!selectedUserId ? 'hidden md:flex items-center justify-center' : 'flex w-full'}`}>
          
          {!selectedUserId ? (
            <div className="text-center space-y-6 opacity-20 select-none animate-in fade-in zoom-in duration-1000">
               <div className="w-20 h-20 bg-white/5 rounded-[32px] flex items-center justify-center mx-auto border border-white/5">
                  <Building2 size={32} className="text-white/40" />
               </div>
               <div className="space-y-1">
                  <h3 className="text-sm font-bold uppercase tracking-widest leading-none">Gestión Residencial</h3>
                  <p className="text-[9px] text-white/40">Selecciona una conversación activa.</p>
               </div>
            </div>
          ) : (
            <div className="flex flex-col h-full w-full relative bg-[#0c0816] md:bg-transparent overflow-hidden">
               
               {/* CHAT HEADER (Resident Side Style) */}
               <div className="p-4 md:p-6 flex justify-between items-center border-b border-white/5 bg-white/5 backdrop-blur-2xl z-40 fixed top-0 w-full md:relative">
                  <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setShowInfoPanel(!showInfoPanel)}>
                     <button onClick={(e) => { e.stopPropagation(); setSelectedUserId(null); }} className="p-2 -ml-2 rounded-full bg-white/5 hover:bg-white/10 md:hidden transition-all">
                        <ChevronLeft size={20} className="text-white" />
                     </button>
                     <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 relative overflow-hidden group-hover:border-emerald-500/30 transition-all">
                        {activeConv?.usuarioAvatar ? <img src={activeConv.usuarioAvatar} className="w-full h-full object-cover" alt="" /> : <User size={20} className="text-white/20" />}
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0c0816] bg-emerald-500" />
                     </div>
                     <div className="flex flex-col">
                        <h3 className="text-sm font-bold text-white tracking-tight leading-none group-hover:text-emerald-400 transition-colors uppercase flex items-center gap-2">
                          {activeConv?.usuarioNombre}
                          <Info size={12} className="text-white/20 group-hover:text-emerald-500 transition-colors" />
                        </h3>
                        <span className="text-[9px] text-white/40 font-medium uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                           <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                           Residente {activeConv?.usuarioTorre && `• T${activeConv.usuarioTorre} A${activeConv.usuarioApto}`}
                        </span>
                     </div>
                  </div>
                  <button 
                    onClick={() => setSelectedUserId(null)}
                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-white/10 transition-all active:scale-90"
                  >
                     <X size={18} />
                  </button>
               </div>

               {/* MESSAGES BODY */}
               <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 hide-scrollbar bg-linear-to-b from-transparent to-black/20 pt-24 md:pt-6">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.esDeAdmin ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                       <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed shadow-lg ${
                         m.esDeAdmin 
                           ? 'bg-emerald-500 text-white rounded-tr-none shadow-emerald-500/10 font-medium' 
                           : 'bg-white/5 border border-white/10 text-white rounded-tl-none backdrop-blur-sm'
                       }`}>
                          {m.mensaje}
                          <div className={`text-[8px] mt-2 opacity-40 flex items-center gap-1 ${m.esDeAdmin ? 'justify-end' : 'justify-start'}`}>
                             {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             {m.esDeAdmin && <CheckCheck size={10} className="ml-1" />}
                          </div>
                       </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
               </div>

               {/* RESIDENT INFO PANEL (Slide Down from Header) */}
               {showInfoPanel && residentInfo?.profile && (
                 <div className="absolute inset-0 z-50 animate-in fade-in duration-300 bg-black/60 backdrop-blur-md pt-20 overflow-y-auto">
                    <div className="bg-[#0f0a1d] border-b border-white/10 p-8 flex flex-col gap-8 rounded-b-[40px] shadow-2xl animate-in slide-in-from-top-10 duration-500">
                       <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1">
                             <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Expediente de Residente</h4>
                             <h2 className="text-2xl font-black text-white">{residentInfo.profile.nombre}</h2>
                             <span className="text-xs text-white/40">{residentInfo.profile.email}</span>
                          </div>
                          <button onClick={() => setShowInfoPanel(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40"><X size={20} /></button>
                       </div>

                       <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                          <div className="liquid-glass-card rounded-2xl p-4 border border-white/5 flex flex-col gap-2">
                             <div className="flex items-center gap-2 text-white/20"><Building2 size={14} /><span className="text-[9px] font-black uppercase tracking-widest">Ubicación</span></div>
                             <p className="text-xs font-bold text-white">Torre {residentInfo.profile.torre} • Apto {residentInfo.profile.apto}</p>
                          </div>
                          <div className="liquid-glass-card rounded-2xl p-4 border border-white/5 flex flex-col gap-2">
                             <div className="flex items-center gap-2 text-white/20"><ShieldCheck size={14} /><span className="text-[9px] font-black uppercase tracking-widest">Estado</span></div>
                             <p className="text-xs font-bold text-white uppercase">{residentInfo.profile.rol}</p>
                          </div>
                          <a href={`tel:${residentInfo.profile.telefono}`} className="liquid-glass-card rounded-2xl p-4 border border-white/5 flex flex-col gap-2 bg-emerald-500/10 border-emerald-500/20 active:scale-95 transition-all">
                             <div className="flex items-center gap-2 text-emerald-500/60"><Phone size={14} /><span className="text-[9px] font-black uppercase tracking-widest">Teléfono</span></div>
                             <p className="text-xs font-bold text-emerald-400">{residentInfo.profile.telefono || "Sin registrar"}</p>
                          </a>
                       </div>

                       <div className="space-y-4">
                          <div className="flex items-center gap-2 opacity-30"><Car size={16} /><h5 className="text-[10px] font-black uppercase tracking-widest">Vehículos Registrados ({residentInfo.vehicles.length})</h5></div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                             {residentInfo.vehicles.length === 0 ? <p className="text-[10px] text-white/20 italic">No registra vehículos</p> : residentInfo.vehicles.map((v, i) => (
                               <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center">
                                  <span className="text-xs font-bold text-white">{v.placa}</span>
                                  <span className="text-[8px] text-white/30 uppercase font-black">{v.tipo} • {v.marca}</span>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="space-y-4">
                          <div className="flex items-center gap-2 opacity-30"><Dog size={16} /><h5 className="text-[10px] font-black uppercase tracking-widest">Mascotas ({residentInfo.pets.length})</h5></div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                             {residentInfo.pets.length === 0 ? <p className="text-[10px] text-white/20 italic">No registra mascotas</p> : residentInfo.pets.map((p, i) => (
                               <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/5 flex gap-3 items-center">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500"><Dog size={14} /></div>
                                  <div>
                                     <p className="text-xs font-bold text-white leading-none">{p.nombre}</p>
                                     <p className="text-[8px] text-white/30 uppercase font-black tracking-widest mt-1">{p.tipo} • {p.raza || "Cruce"}</p>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                 </div>
               )}

               {/* CHAT INPUT AREA */}
               <div className="p-6 bg-white/5 border-t border-white/5 pb-12 md:pb-8">
                  <div className="flex items-center gap-3">
                     <div className="flex-1 min-h-[56px] bg-white/5 border border-white/10 rounded-[28px] flex items-center px-6 transition-all focus-within:border-emerald-500/50 focus-within:bg-white/10 shadow-inner group">
                        <input 
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                          placeholder="Responde a esta solicitud..."
                          className="w-full bg-transparent border-none text-white text-sm focus:ring-0 placeholder:text-white/20"
                        />
                     </div>
                     <button 
                       onClick={sendMessage}
                       disabled={!newMessage.trim() || sending}
                       className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-[0_10px_25px_rgba(16,185,129,0.3)] active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 group flex-shrink-0"
                     >
                        {sending ? <Loader2 size={24} className="animate-spin" /> : <ArrowRight size={24} className="group-hover:translate-x-0.5 transition-transform" />}
                     </button>
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-2 opacity-10">
                     <ShieldCheck size={10} className="text-emerald-500" />
                     <p className="text-[9px] font-bold uppercase tracking-widest text-white">Administración ConjuntOS • Gestión Segura</p>
                  </div>
               </div>

            </div>
          )}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .liquid-glass-card { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); }
      `}} />
    </div>
  );
}

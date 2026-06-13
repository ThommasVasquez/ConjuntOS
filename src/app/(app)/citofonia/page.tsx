"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Phone, PhoneOff, Users, Package, 
  MapPin, Clock, 
  Plus, Info, 
  ShieldCheck, 
  X, Loader2, Car, Bike
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { gsap } from "gsap";
import ProfileHeader from "@/components/shell/ProfileHeader";

type Tab = "CITOFONIA" | "VISITAS" | "RECEPCION";

interface IVisita {
  id: string;
  nombre: string;
  tipo: string;
  vehiculoTipo?: string;
  placa?: string;
  fecha: string;
}

interface IPaquete {
  id: string;
  descripcion: string;
  remitente: string;
  fechaLlegada: string;
}

import { useCall } from "@/components/providers/CallContext";

export default function CitofoniaPage() {
  const [activeTab, setActiveTab] = useState<Tab>("CITOFONIA");
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const prevCallStateRef = useRef<string>("IDLE");
  
  const {
    callState,
    callerName,
    callTime,
    lastSpeechResponse,
    dialNum,
    setDialNum,
    startCall,
    endCall,
    answerCall,
    rejectCall,
    handleOptionClick,
    getCallOptions
  } = useCall();
  
  const [visitas, setVisitas] = useState<IVisita[]>([]);
  const [paquetes, setPaquetes] = useState<IPaquete[]>([]);
  const [parking, setParking] = useState({ carros: 0, motos: 0 });
  const [isAddingVisita, setIsAddingVisita] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power2.out" });
      }, containerRef);
      return () => {
        ctx.revert();
      };
    }
  }, [isLoading]);

  useEffect(() => {
    // Regresar a la pantalla anterior cuando finalice la llamada
    if (prevCallStateRef.current !== "IDLE" && callState === "IDLE") {
      if (typeof window !== "undefined") {
        if (window.history.state && window.history.state.idx > 0) {
          router.back();
        } else {
          router.push("/inicio");
        }
      }
    }
    prevCallStateRef.current = callState;
  }, [callState, router]);

  async function fetchData() {
    setIsLoading(true);
    try {
      const json = await api.get<{ visitas: IVisita[]; paquetes: IPaquete[]; parqueadero?: { carrosDisponibles: number; motosDisponibles: number } }>('/comunicaciones');
      setVisitas(json.visitas ?? []);
      setPaquetes(json.paquetes ?? []);
      setParking({ 
        carros: json.parqueadero?.carrosDisponibles ?? 0, 
        motos: json.parqueadero?.motosDisponibles ?? 0 
      });
    } catch (err) {
      console.error("Error fetching communications:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleDial = (num: string) => {
    if (dialNum.length < 8) setDialNum(dialNum + num);
  };

  const handleCall = (targetNum?: string) => {
    const num = targetNum !== undefined ? targetNum : dialNum;
    if (callState === "IDLE") {
      startCall(num || "P");
    } else {
      endCall();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-6">
      <ProfileHeader className="fade-up" />

      {/* CALL SCREEN OVERLAY */}
      {callState !== "IDLE" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-primary/98 backdrop-blur-2xl p-8 animate-in fade-in duration-300">
           <div className="w-full flex flex-col items-center gap-2 mt-16">
              <span className="text-[10px] font-black text-accent uppercase tracking-widest animate-pulse">
                 {callState === "RINGING" ? "LLAMADA ENTRANTE..." : (callState === "OUTGOING" ? "LLAMANDO..." : "CONEXIÓN SEGURA")}
              </span>
              <h2 className="text-3xl font-display font-black text-text text-center mt-2">{callerName}</h2>
              <span className="text-text/60 text-xs font-bold mt-1">
                 {callState === "RINGING" ? "Recibiendo llamada entrante..." : (callState === "OUTGOING" ? "Marcando canal digital..." : `${formatTime(callTime)} • EN LÍNEA`)}
              </span>
           </div>

           {/* Pulse Animation */}
           <div className="flex flex-col items-center justify-center my-4">
              <div className="relative w-32 h-32 flex items-center justify-center mb-6">
                 {callState === "RINGING" || callState === "OUTGOING" ? (
                   <>
                     <div className="absolute inset-0 rounded-full bg-accent/10 animate-ping duration-1000" />
                     <div className="absolute inset-4 rounded-full bg-accent/20 animate-pulse duration-700" />
                   </>
                 ) : (
                   <>
                     <div className="absolute -inset-2 rounded-full bg-neutral-500/10 animate-ping duration-1000 scale-125" />
                     <div className="absolute inset-2 rounded-full bg-neutral-500/20 animate-pulse duration-700" />
                   </>
                 )}
                 <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl border border-white/10 ${callState === "RINGING" || callState === "OUTGOING" ? "bg-linear-to-tr from-accent to-secondary animate-pulse" : "bg-linear-to-tr from-neutral-500 to-neutral-400"}`}>
                    <Phone size={36} className="text-white" />
                 </div>
              </div>

              {/* Equalizer animation when connected */}
              {(callState === "CONNECTED" || callState === "FALLBACK") && (
                 <div className="flex items-center gap-1.5 h-10 justify-center">
                    <span className="w-1 bg-accent rounded-full animate-pulse" style={{ height: '40%', animationDuration: '0.6s' }} />
                    <span className="w-1 bg-accent rounded-full animate-pulse" style={{ height: '90%', animationDuration: '0.4s' }} />
                    <span className="w-1 bg-accent rounded-full animate-pulse" style={{ height: '60%', animationDuration: '0.5s' }} />
                    <span className="w-1 bg-accent rounded-full animate-pulse" style={{ height: '100%', animationDuration: '0.3s' }} />
                    <span className="w-1 bg-accent rounded-full animate-pulse" style={{ height: '50%', animationDuration: '0.7s' }} />
                    <span className="w-1 bg-accent rounded-full animate-pulse" style={{ height: '80%', animationDuration: '0.45s' }} />
                 </div>
              )}
           </div>

           {/* Dialogue box */}
           {(callState === "CONNECTED" || callState === "FALLBACK") && (
              <div className="w-full max-w-sm bg-text/5 border border-border rounded-3xl p-6 text-center my-2 animate-in zoom-in-95 duration-300">
                 <p className="text-[10px] font-black uppercase text-accent tracking-widest mb-2">RESPUESTA RECIBIDA</p>
                 <p className="text-xs text-text/80 italic font-medium leading-relaxed">
                    "{lastSpeechResponse || (callState === "CONNECTED" ? "Habla por el micrófono..." : "Escuchando...")}"
                 </p>
              </div>
           )}

           {/* Interactive speech options */}
           {callState === "FALLBACK" && (
              <div className="w-full max-w-md flex flex-col gap-3 px-4 my-2">
                 <span className="text-[9px] font-black text-text/50 uppercase tracking-widest text-center mb-1">
                    OPCIONES DE DIÁLOGO
                 </span>
                 <div className="flex flex-col gap-2.5 max-h-[160px] overflow-y-auto pr-1">
                    {getCallOptions().map((opt, idx) => (
                       <button
                          key={idx}
                          onClick={() => handleOptionClick(opt.label, opt.reply)}
                          className="w-full py-3.5 px-5 rounded-2xl bg-text/5 hover:bg-text/10 border border-border text-left text-xs font-bold text-text flex items-center justify-between group active:scale-98 transition-all cursor-pointer"
                       >
                          <span>"{opt.label}"</span>
                          <span className="text-[9px] font-black text-accent uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Hablar</span>
                       </button>
                    ))}
                 </div>
              </div>
           )}

           {/* Action Buttons */}
           <div className="w-full max-w-xs mb-8 flex justify-center gap-6">
             {callState === "RINGING" ? (
               <>
                 <button
                    onClick={rejectCall}
                    className="w-16 h-16 rounded-full bg-neutral-500/20 hover:bg-neutral-500/30 border border-neutral-500/40 flex items-center justify-center text-neutral-500 shadow-2xl active:scale-90 transition-all cursor-pointer"
                 >
                    <PhoneOff size={28} />
                 </button>
                 <button
                    onClick={answerCall}
                    className="w-16 h-16 rounded-full bg-neutral-500 hover:bg-neutral-600 flex items-center justify-center text-white shadow-2xl hover:shadow-neutral-500/20 active:scale-90 transition-all cursor-pointer animate-bounce"
                    style={{ animationDuration: '2s' }}
                 >
                    <Phone size={28} />
                 </button>
               </>
             ) : (
               <button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-neutral-500 hover:bg-neutral-600 flex items-center justify-center text-white shadow-2xl hover:shadow-neutral-500/20 active:scale-90 transition-all cursor-pointer animate-bounce"
                  style={{ animationDuration: '3s' }}
               >
                  <PhoneOff size={28} />
               </button>
             )}
           </div>
        </div>
      )}

      {/* COMPACT DASHBOARD HEADER */}
      <section className="fade-up w-full liquid-glass-card rounded-[32px] p-5 border border-border flex flex-col gap-4">
         <div className="flex justify-between items-center px-2">
            <h2 className="text-xl font-display font-bold text-text tracking-tight">Centro de Control</h2>
            <div className="flex gap-2">
               <div className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-500/10 rounded-full border border-neutral-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
                  <span className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">En Línea</span>
               </div>
            </div>
         </div>

         {/* TAB SELECTOR */}
         <div className="flex bg-text/5 p-1 rounded-2xl border border-border">
            {[
              { id: "CITOFONIA", icon: Phone, label: "Portería" },
              { id: "VISITAS", icon: Users, label: "Visitas" },
              { id: "RECEPCION", icon: Package, label: "Recibir" }
            ].map((t) => (
              <button 
                key={t.id}
                onClick={() => setActiveTab(t.id as Tab)}
                className={`flex-1 flex flex-col items-center py-2.5 rounded-xl transition-all gap-1 ${activeTab === t.id ? 'bg-text/10 text-text border border-border shadow-lg' : 'text-text/60 hover:text-text/80'}`}
              >
                <t.icon size={16} strokeWidth={activeTab === t.id ? 2.5 : 1.5} />
                <span className="text-[9px] font-bold uppercase tracking-wider">{t.label}</span>
              </button>
            ))}
         </div>
      </section>

      {/* CONTENT AREA */}
      <main className="flex-1">
        {activeTab === "CITOFONIA" && (
          <div className="fade-up space-y-6 animate-in slide-in-from-bottom-5 duration-500">
             {/* QUICK CONTACTS */}
             <div className="grid grid-cols-2 gap-4 text-text">
                <button 
                  onClick={() => { setDialNum("P"); handleCall("P"); }}
                  className="p-6 rounded-[28px] bg-primary-light border border-border flex flex-col items-center gap-3 active:scale-95 transition-transform cursor-pointer"
                >
                   <ShieldCheck size={28} className="text-accent" />
                   <span className="text-xs font-bold">Portería Principal</span>
                </button>
                <button 
                  onClick={() => { setDialNum("A"); handleCall("A"); }}
                  className="p-6 rounded-[28px] bg-primary-light border border-border flex flex-col items-center gap-3 active:scale-95 transition-transform cursor-pointer"
                >
                   <Users size={28} className="text-secondary" />
                   <span className="text-xs font-bold">Administración</span>
                </button>
             </div>

             {/* NUMERIC DIALER */}
             <div className="liquid-glass-card rounded-[40px] p-8 border border-border flex flex-col items-center gap-8 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-transparent via-accent to-transparent opacity-30" />
                
                <div className="w-full flex flex-col items-center gap-2">
                   <div className="h-12 flex items-center justify-center">
                      <span className="text-4xl font-display font-bold text-text tracking-[0.2em]">
                        {dialNum || "MARCAR"}
                      </span>
                   </div>
                   {callState !== "IDLE" && <span className="text-accent text-xs font-black animate-pulse">{formatTime(callTime)} • EN LÍNEA</span>}
                </div>

                <div className="grid grid-cols-3 gap-6 w-full max-w-[240px]">
                   {["1","2","3","4","5","6","7","8","9","-","0","#"].map((n) => (
                     <button 
                       key={n}
                       onClick={() => handleDial(n)}
                       className="w-14 h-14 rounded-full bg-text/5 hover:bg-text/10 border border-border flex items-center justify-center text-xl font-bold text-text active:scale-90 transition-all cursor-pointer"
                     >
                       {n}
                     </button>
                   ))}
                </div>

                <div className="flex gap-6 w-full px-4">
                   <button 
                     onClick={() => setDialNum("")}
                     className="flex-1 py-4 rounded-2xl bg-text/5 border border-border text-text font-bold text-xs cursor-pointer"
                   >
                     Limpiar
                   </button>
                   <button 
                     onClick={() => handleCall()}
                     className={`flex-2 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 text-white font-black cursor-pointer ${callState !== "IDLE" ? 'bg-neutral-500' : 'bg-neutral-500'}`}
                   >
                     {callState !== "IDLE" ? <PhoneOff size={18} /> : <Phone size={18} />}
                     {callState !== "IDLE" ? 'COLGAR' : 'LLAMAR'}
                   </button>
                </div>
             </div>
          </div>
        )}


        {activeTab === "VISITAS" && (
           <div className="fade-up space-y-6 animate-in slide-in-from-bottom-5 duration-500">
              {/* PARKING STATUS */}
              <div className="grid grid-cols-2 gap-3">
                 <div className="liquid-glass-card rounded-[24px] p-4 border border-border flex flex-col">
                    <span className="text-text/60 text-[9px] font-black uppercase tracking-widest mb-1">Cupos Carros</span>
                    <div className="flex items-center gap-2">
                       <Car size={16} className="text-accent" />
                       <span className="text-lg font-display font-bold text-text">{parking.carros} Disponibles</span>
                    </div>
                 </div>
                 <div className="liquid-glass-card rounded-[24px] p-4 border border-border flex flex-col">
                    <span className="text-text/60 text-[9px] font-black uppercase tracking-widest mb-1">Cupos Motos</span>
                    <div className="flex items-center gap-2">
                       <Bike size={16} className="text-secondary" />
                       <span className="text-lg font-display font-bold text-text">{parking.motos} Disponibles</span>
                    </div>
                 </div>
              </div>

              {/* ACTION BUTTON */}
              <button 
                onClick={() => setIsAddingVisita(true)}
                className="w-full py-4 rounded-[22px] bg-accent text-on-accent font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                 <Plus size={18} /> AGENDAR NUEVA VISITA
              </button>

              {/* LIST */}
              <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-text/60 uppercase tracking-widest px-2">Visitas Recientes</h4>
                 {isLoading ? (
                   <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-accent" /></div>
                 ) : visitas.length === 0 ? (
                   <div className="py-12 flex flex-col items-center bg-text/5 rounded-3xl border border-dashed border-border text-text/50">
                      <Users size={40} strokeWidth={1} />
                      <p className="text-[10px] font-bold mt-2">No has programado visitas aún</p>
                   </div>
                 ) : visitas.map((v) => (
                   <div key={v.id} className="liquid-glass-card rounded-3xl p-4 border border-border flex items-center justify-between">
                      <div className="flex items-center gap-4">
                         <div className="w-12 h-12 rounded-2xl bg-text/5 flex items-center justify-center border border-border">
                            {v.tipo === "VEHICULAR" ? <Car size={20} className="text-text/60" /> : <Users size={20} className="text-text/60" />}
                         </div>
                         <div className="flex flex-col">
                            <span className="text-text font-bold text-sm">{v.nombre}</span>
                            <span className="text-text/50 text-[10px]">{v.placa ? `Placa: ${v.placa}` : 'Personal'} • {new Date(v.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                         </div>
                      </div>
                      <div className="px-2 py-1 bg-text/5 border border-border rounded-lg text-[8px] font-black uppercase text-text/60">PROGRAMADA</div>
                   </div>
                 ))}
              </div>
           </div>
        )}

        {activeTab === "RECEPCION" && (
          <div className="fade-up space-y-6 animate-in slide-in-from-bottom-5 duration-500">
             {/* ALERT IF PACKAGES */}
             {paquetes.length > 0 && (
               <div className="bg-linear-to-r from-accent/20 to-secondary/20 border border-border rounded-3xl p-6 flex flex-col gap-2 relative overflow-hidden group">
                  <div className="absolute -top-4 -right-4 w-20 h-20 bg-accent/20 blur-xl rounded-full" />
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-accent rounded-xl text-on-accent"><Package size={20} /></div>
                     <h3 className="text-text font-bold">¡Paquete en Portería!</h3>
                  </div>
                  <p className="text-text/60 text-xs leading-relaxed">Tienes {paquetes.length} entrega(s) pendiente(s) por retirar en la recepción principal.</p>
               </div>
             )}

             <div className="space-y-4">
                <h4 className="text-[10px] font-black text-text/60 uppercase tracking-widest px-2">Historial de Entregas</h4>
                {isLoading ? (
                  <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-accent" /></div>
                ) : paquetes.length === 0 ? (
                  <div className="py-20 flex flex-col items-center text-text/50">
                     <Package size={60} strokeWidth={1} />
                     <p className="font-bold text-sm mt-4">Sin paquetes pendientes</p>
                     <p className="text-[10px] uppercase tracking-widest mt-1">Todo está entregado</p>
                  </div>
                ) : paquetes.map((p) => (
                  <div key={p.id} className="liquid-glass-card rounded-[32px] p-5 border border-border flex flex-col gap-4">
                     <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                           <span className="text-text font-bold text-base">{p.descripcion}</span>
                           <span className="text-text/50 text-[10px] uppercase tracking-widest font-bold">De: {p.remitente}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent">
                           <Package size={18} />
                        </div>
                     </div>
                     <div className="flex items-center gap-6 pt-2 border-t border-border">
                        <div className="flex items-center gap-1.5 text-text/60 text-[9px] font-bold">
                           <Clock size={12} /> Llegó: {new Date(p.fechaLlegada).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-1.5 text-text/60 text-[9px] font-bold">
                           <MapPin size={12} /> Portería 1
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </main>

      {/* MODAL: ADD VISITA */}
      {isAddingVisita && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-primary/95 backdrop-blur-xl" onClick={() => setIsAddingVisita(false)} />
           <div className="relative w-full max-w-lg bg-primary-light rounded-t-[48px] border-t border-border p-10 animate-in slide-in-from-bottom duration-500">
              <div className="flex flex-col gap-8 pb-10">
                 <div className="w-12 h-1.5 bg-text/20 rounded-full mx-auto" />
                 <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-display font-bold text-text">Programar Visita</h3>
                    <button onClick={() => setIsAddingVisita(false)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text/45 cursor-pointer"><X size={20} /></button>
                 </div>

                 <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-text/60 uppercase tracking-widest">Nombre del Invitado</label>
                       <input type="text" placeholder="Ej: Diana Prince" className="w-full bg-text/5 border border-border rounded-2xl px-5 py-4 text-text placeholder:text-text/55 focus:border-accent outline-none transition-all" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-text/60 uppercase tracking-widest">Tipo de Vehículo</label>
                          <select className="w-full bg-text/5 border border-border rounded-2xl px-5 py-4 text-text outline-none">
                             <option className="bg-primary text-text" value="NINGUNO">Peatonal</option>
                             <option className="bg-primary text-text" value="CARRO">Carro</option>
                             <option className="bg-primary text-text" value="MOTO">Moto</option>
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-text/60 uppercase tracking-widest">Placa (Si aplica)</label>
                          <input type="text" placeholder="ABC-123" className="w-full bg-text/5 border border-border rounded-2xl px-5 py-4 text-text outline-none placeholder:text-text/55 uppercase" />
                       </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20 flex gap-4 items-center">
                       <Info size={20} className="text-accent shrink-0" />
                       <p className="text-[10px] text-text/60 font-medium leading-relaxed">Al activar el parqueadero, se reservará un cupo automáticamente por 2 horas desde la llegada.</p>
                    </div>

                    <button 
                      onClick={() => {
                        toast.success("Visita agendada correctamente");
                        setIsAddingVisita(false);
                        fetchData();
                      }}
                      className="w-full py-5 rounded-2xl bg-accent text-on-accent font-black text-base shadow-xl shadow-accent/20 active:scale-95 transition-all mt-4 cursor-pointer"
                    >
                      PROGRAMAR AHORA
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}

"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Phone, PhoneOff, X, ShieldAlert, Check } from "lucide-react";
import { toast } from "sonner";

export type CallState = "IDLE" | "RINGING" | "OUTGOING" | "CONNECTED" | "FALLBACK";

interface CallContextType {
  callState: CallState;
  callerName: string;
  callTime: number;
  lastSpeechResponse: string;
  dialNum: string;
  setDialNum: (num: string) => void;
  startCall: (num: string) => void;
  endCall: () => void;
  answerCall: () => void;
  rejectCall: () => void;
  handleOptionClick: (optionText: string, replyText: string) => void;
  getCallOptions: () => { label: string; reply: string }[];
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  
  // Call States
  const [callState, setCallState] = useState<CallState>("IDLE");
  const [callerName, setCallerName] = useState("");
  const [callTime, setCallTime] = useState(0);
  const [lastSpeechResponse, setLastSpeechResponse] = useState("");
  const [dialNum, setDialNum] = useState("");

  // WebRTC Refs
  const peerRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const incomingCallRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  // Audio Tone Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeToneRef = useRef<{ stop: () => void } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load User Profile on start
  useEffect(() => {
    if (session?.user) {
      fetch("/api/user/profile")
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setProfile(json.data);
          }
        })
        .catch((err) => console.error("Error fetching profile for calling:", err));
    }
  }, [session]);

  // Setup PeerJS connection when profile is loaded
  useEffect(() => {
    if (!profile) return;

    let activePeer: any = null;
    let isCancelled = false;
    const conjuntoId = profile.conjuntoId || "demo_id";
    const userId = profile.id;
    const role = profile.rol;
    
    // Predictable Peer ID depending on role
    let myPeerId = `user-${userId}`;
    if (role === "VIGILANTE") {
      myPeerId = `${conjuntoId}-VIGILANTE`;
    } else if (role === "ADMINISTRADOR") {
      myPeerId = `${conjuntoId}-ADMINISTRADOR`;
    } else if (profile.unidad?.numero) {
      const towerStr = profile.unidad.torre ? `${profile.unidad.torre}-` : "";
      myPeerId = `${conjuntoId}-APTO-${towerStr}${profile.unidad.numero}`;
    }

    console.log("Initializing Citofonía PeerJS with ID:", myPeerId);

    import("peerjs").then(({ default: Peer }) => {
      if (isCancelled) return;

      const p = new Peer(myPeerId, {
        host: "0.peerjs.com",
        port: 443,
        secure: true,
      });

      activePeer = p;
      peerRef.current = p;

      p.on("open", (id) => {
        if (isCancelled) {
          p.destroy();
          return;
        }
        console.log("Citofonía PeerJS connection open. Peer ID:", id);
      });

      p.on("call", (call: any) => {
        if (isCancelled) return;
        console.log("Citofonía: Recibiendo llamada WebRTC de:", call.peer);
        incomingCallRef.current = call;
        
        // Find caller info based on Peer ID format
        let name = "Residente";
        if (call.peer.includes("VIGILANTE")) {
          name = "Portería Principal";
        } else if (call.peer.includes("ADMINISTRADOR")) {
          name = "Administración";
        } else {
          const parts = call.peer.split("-APTO-");
          if (parts.length > 1) {
            name = `Apto ${parts[1]}`;
          } else {
            name = "Residente";
          }
        }
        
        setCallerName(name);
        setCallState("RINGING");
        
        // Play local incoming call ringtone
        playRingtone();
      });
      p.on("error", (err: any) => {
        if (isCancelled) return;
        console.error("Citofonía PeerJS error:", err);
        if (err.type === "peer-unavailable") {
          toast.error("El destinatario se encuentra fuera de línea.");
        } else {
          toast.error(`Error de citofonía: ${err.message || err.type}`);
        }
        endCall();
      });
    });

    // Create a hidden audio element in the DOM
    if (typeof window !== "undefined") {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      document.body.appendChild(audio);
      remoteAudioRef.current = audio;
    }

    return () => {
      isCancelled = true;
      if (activePeer) activePeer.destroy();
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      if (remoteAudioRef.current) remoteAudioRef.current.remove();
      stopSpeech();
    };
  }, [profile]);

  // Manage call timer
  useEffect(() => {
    if (callState === "CONNECTED") {
      callTimerRef.current = setInterval(() => {
        setCallTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallTime(0);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callState]);

  // Audio tone generators using Web Audio API
  const startAudioContext = () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playRingback = () => {
    const ctx = startAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 425;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, ctx.currentTime);

    let t = ctx.currentTime;
    for (let i = 0; i < 15; i++) {
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.setValueAtTime(0, t + 1.2);
      t += 3.0;
    }
    osc.start();
    activeToneRef.current = {
      stop: () => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {}
      },
    };
  };

  const playRingtone = () => {
    const ctx = startAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 600;
    osc.type = "triangle";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, ctx.currentTime);

    let t = ctx.currentTime;
    for (let i = 0; i < 15; i++) {
      // Ring-ring ringtone
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.setValueAtTime(0, t + 0.5);
      gain.gain.setValueAtTime(0.12, t + 0.7);
      gain.gain.setValueAtTime(0, t + 1.2);
      t += 3.0;
    }
    osc.start();
    activeToneRef.current = {
      stop: () => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {}
      },
    };
  };

  const playBeep = () => {
    const ctx = startAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 800;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.12);
    osc.start();
    setTimeout(() => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    }, 200);
  };

  const playDisconnect = () => {
    const ctx = startAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 425;
    osc.connect(gain);
    gain.connect(ctx.destination);

    let t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.setValueAtTime(0, t + 0.15);
      t += 0.3;
    }
    osc.start();
    setTimeout(() => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    }, 1200);
  };

  // Web Speech API
  const speakText = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find((v) => v.lang.startsWith("es"));
    if (esVoice) utterance.voice = esVoice;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  // Actions
  const startCall = async (num: string) => {
    if (!profile) return;
    const conjuntoId = profile.conjuntoId || "demo_id";
    let targetPeerId = `${conjuntoId}-APTO-${num}`;
    let name = `Apto ${num}`;

    if (num === "P") {
      targetPeerId = `${conjuntoId}-VIGILANTE`;
      name = "Portería Principal";
    } else if (num === "A") {
      targetPeerId = `${conjuntoId}-ADMINISTRADOR`;
      name = "Administración";
    }

    setCallerName(name);
    setCallState("OUTGOING");
    setLastSpeechResponse("Marcando canal digital...");
    playRingback();

    try {
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      if (!peerRef.current) {
        throw new Error("PeerJS client is not initialized.");
      }

      console.log("Citofonía: Realizando llamada a peer ID:", targetPeerId);
      const call = peerRef.current.call(targetPeerId, stream);
      
      if (call) {
        activeCallRef.current = call;
        
        call.on("stream", (remoteStream: MediaStream) => {
          console.log("Citofonía: Recibida señal WebRTC de respuesta.");
          if (activeToneRef.current) activeToneRef.current.stop();
          playBeep();
          
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.error("Error playing WebRTC stream:", e));
          }
          setCallState("CONNECTED");
        });

        call.on("close", () => {
          console.log("Citofonía: Llamada remota cerrada.");
          endCall();
        });

        call.on("error", (err: any) => {
          console.error("Citofonía: Error en llamada PeerJS:", err);
          toast.error("Error al establecer la conexión de voz.");
          endCall();
        });

        // Timeout if the recipient does not answer in 25 seconds
        setTimeout(() => {
          setCallState((current) => {
            if (current === "OUTGOING") {
              console.log("Citofonía: Llamada no contestada.");
              toast.info("Llamada sin respuesta.");
              endCall();
            }
            return current;
          });
        }, 25000);

      } else {
        toast.error("No se pudo iniciar la llamada.");
        endCall();
      }
    } catch (e) {
      console.warn("No mic or PeerJS failed:", e);
      toast.error("No se pudo acceder al micrófono para realizar la llamada.");
      endCall();
    }
  };

  const answerCall = async () => {
    if (activeToneRef.current) activeToneRef.current.stop();
    playBeep();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      if (incomingCallRef.current) {
        incomingCallRef.current.answer(stream);
        
        incomingCallRef.current.on("stream", (remoteStream: MediaStream) => {
          console.log("Citofonía: Transmisión WebRTC establecida bidireccional.");
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.error("Error playing WebRTC stream:", e));
          }
        });

        incomingCallRef.current.on("close", () => {
          endCall();
        });

        setCallState("CONNECTED");
      }
    } catch (e) {
      console.error("Failed to answer call with mic:", e);
      toast.error("No se pudo iniciar el micrófono para contestar.");
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (activeToneRef.current) activeToneRef.current.stop();
    playDisconnect();

    if (incomingCallRef.current) {
      incomingCallRef.current.close();
      incomingCallRef.current = null;
    }
    setCallState("IDLE");
    toast.info("Llamada rechazada");
  };

  const endCall = () => {
    if (activeToneRef.current) activeToneRef.current.stop();
    playDisconnect();
    stopSpeech();

    // Close WebRTC calls
    if (activeCallRef.current) {
      activeCallRef.current.close();
      activeCallRef.current = null;
    }
    if (incomingCallRef.current) {
      incomingCallRef.current.close();
      incomingCallRef.current = null;
    }

    // Stop mic tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setCallState("IDLE");
    setDialNum("");
    setLastSpeechResponse("");
    toast.info("Llamada finalizada");
  };

  const handleOptionClick = (optionText: string, replyText: string) => {
    speakText(replyText);
    setLastSpeechResponse(replyText);
    toast.success(`Respuesta enviada: "${optionText}"`);
  };

  const getCallOptions = (name: string) => {
    if (name === "Portería Principal") {
      return [
        {
          label: "Autorizar llegada de visita",
          reply: "Entendido, señor. Por favor regístrelo en la pestaña de visitas de la aplicación para dejar constancia y permitir el ingreso."
        },
        {
          label: "¿Tengo algún paquete?",
          reply: "Déjeme verificar en la bitácora... Sí, señor, tiene un paquete recibido de Logística Nacional. Puede pasar por él cuando guste."
        },
        {
          label: "Reportar un carro mal parqueado",
          reply: "Entendido, vecino. Ya mismo enviamos un oficial de ronda a verificar el vehículo y hacer el reporte."
        },
        {
          label: "Reportar emergencia",
          reply: "Entendido. Mantenga la calma, por favor. Ya mismo activamos el protocolo de seguridad y llamamos a las autoridades."
        }
      ];
    } else if (name === "Administración") {
      return [
        {
          label: "Preguntar saldo de administración",
          reply: "Hola. Su saldo actual de administración está al día. Recuerde que puede ver los detalles y pagar en el módulo de pagos de la app."
        },
        {
          label: "Reservar salón comunal / áreas",
          reply: "Para reservar áreas comunes, puede hacerlo de forma inmediata desde el módulo de reservas de la aplicación."
        },
        {
          label: "Reportar un daño en zonas comunes",
          reply: "Muchas gracias por el reporte. Tomamos nota de la novedad y enviaremos al personal de mantenimiento a revisar."
        }
      ];
    } else {
      return [
        {
          label: "Dejar un mensaje",
          reply: "Entendido, tomamos nota del mensaje y se lo informamos al residente cuando sea posible. Gracias."
        }
      ];
    }
  };

  const isCitofoniaPage = typeof window !== "undefined" && window.location.pathname === "/citofonia";

  return (
    <CallContext.Provider
      value={{
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
        getCallOptions: () => getCallOptions(callerName),
      }}
    >
      {children}

      {/* GLOBAL FLOATING INCOMING CALL HUD OVERLAY */}
      {callState === "RINGING" && !isCitofoniaPage && (
        <div className="fixed top-6 inset-x-6 z-50 p-6 liquid-glass-card rounded-[32px] border border-accent/40 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-top-12 duration-500 max-w-sm mx-auto">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent animate-bounce">
                <Phone size={24} />
             </div>
             <div>
                <span className="text-[10px] font-black text-accent uppercase tracking-widest block animate-pulse">Llamada Entrante</span>
                <h4 className="text-base font-display font-black text-text">{callerName}</h4>
             </div>
          </div>
          <div className="flex gap-3">
             <button
                onClick={rejectCall}
                className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/25 border border-red-500/35 text-red-500 rounded-2xl font-bold text-xs cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5"
             >
                <PhoneOff size={14} /> Rechazar
             </button>
             <button
                onClick={answerCall}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5"
             >
                <Check size={14} /> Contestar
             </button>
          </div>
        </div>
      )}

      {/* ACTIVE CALL HUD OVERLAY */}
      {callState === "CONNECTED" && !isCitofoniaPage && (
        <div className="fixed bottom-24 right-6 z-50 p-5 bg-primary/95 border border-emerald-500/35 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom duration-300">
           <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
           <div className="flex flex-col">
              <span className="text-[9px] font-black text-text/50 uppercase tracking-widest">En Línea</span>
              <span className="text-xs font-bold text-text">{callerName}</span>
           </div>
           <button
              onClick={endCall}
              className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all shadow-lg"
           >
              <PhoneOff size={16} />
           </button>
        </div>
      )}
    </CallContext.Provider>
  );
}

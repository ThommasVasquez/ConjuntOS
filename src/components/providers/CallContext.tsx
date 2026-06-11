"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
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

const sanitizePeerId = (id: string): string => {
  if (!id) return "";
  return id.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const router = useRouter();
  
  // Call States
  const [callState, setCallState] = useState<CallState>("IDLE");
  const [callerName, setCallerName] = useState("");
  const [callTime, setCallTime] = useState(0);
  const [lastSpeechResponse, setLastSpeechResponse] = useState("");
  const [dialNum, setDialNum] = useState("");
  const [isPeerReady, setIsPeerReady] = useState(false);
  const pendingCallbackRef = useRef<string | null>(null);

  // WebRTC Refs
  const peerRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const incomingCallRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const myPeerIdRef = useRef("");
  const startCallRef = useRef<any>(null);
  const targetPeerIdRef = useRef("");
  const callStateRef = useRef<CallState>("IDLE");
  callStateRef.current = callState;
  const answerCallRef = useRef<any>(null);
  const pushStatusRef = useRef<{ checked: boolean; sent: boolean; error?: string }>({ checked: false, sent: false });
  const peerUnavailableReceivedRef = useRef(false);
  const previousPathRef = useRef<string>("/inicio");
  
  // Audio Tone Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeToneRef = useRef<{ stop: () => void } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load User Profile on start
  useEffect(() => {
    if (user) {
      api.get('/usuarios/me/profile')
        .then((data) => setProfile(data))
        .catch((err) => console.error("Error fetching profile for calling:", err));
    }
  }, [user]);

  // Predictable Peer ID depending on role
  let myPeerId = "";
  if (profile) {
    const conjuntoId = profile.conjuntoId || "demo_id";
    const userId = profile.id;
    const role = profile.rol;
    
    myPeerId = `user-${userId}`;
    if (role === "VIGILANTE") {
      myPeerId = `${conjuntoId}-VIGILANTE`;
    } else if (role === "ADMINISTRADOR") {
      myPeerId = `${conjuntoId}-ADMINISTRADOR`;
    } else if (profile.unidad?.numero) {
      const cleanTorre = profile.unidad.torre ? String(profile.unidad.torre).trim() : "";
      let normalizedTorre = cleanTorre;
      if (/^\d+$/.test(cleanTorre)) {
        normalizedTorre = String(parseInt(cleanTorre, 10));
      }
      const towerStr = normalizedTorre ? `${normalizedTorre}-` : "";
      myPeerId = `${conjuntoId}-APTO-${towerStr}${profile.unidad.numero}`;
    }
    
    myPeerId = sanitizePeerId(myPeerId);
  }

  // Setup PeerJS connection when profile is loaded
  useEffect(() => {
    if (!profile || !myPeerId) return;

    let activePeer: any = null;
    let isCancelled = false;
    let retryTimeout: NodeJS.Timeout | null = null;
    
    myPeerIdRef.current = myPeerId;

    const initPeer = (retryCount = 0) => {
      import("peerjs").then(({ default: Peer }) => {
        if (isCancelled) return;

        if (activePeer) {
          try { activePeer.destroy(); } catch (e) {}
        }

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
          setIsPeerReady(true);
        });

        p.on("disconnected", () => {
          setIsPeerReady(false);
        });

        p.on("close", () => {
          setIsPeerReady(false);
        });

        p.on("call", (call: any) => {
          if (isCancelled) return;
          
          // Si el estado es OUTGOING y el peer coincide con el que estamos llamando, contestamos automáticamente (llamada de retorno)
          if (callStateRef.current === "OUTGOING" && call.peer === targetPeerIdRef.current) {
            incomingCallRef.current = call;
            if (answerCallRef.current) {
              answerCallRef.current();
            }
            return;
          }

          incomingCallRef.current = call;

          // Escuchar cierre o error de la llamada entrante antes de contestar
          call.on("close", () => {
            if (incomingCallRef.current === call) {
              endCall();
            }
          });

          call.on("error", (err: any) => {
            console.error("Citofonía: Error en llamada entrante antes de contestar:", err);
            if (incomingCallRef.current === call) {
              endCall();
            }
          });
          
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

          if (err.type === "unavailable-id" && retryCount < 2) {
            retryTimeout = setTimeout(() => {
              if (!isCancelled) {
                initPeer(retryCount + 1);
              }
            }, 2000);
            return;
          }

          const isPeerUnavailable = err.type === "peer-unavailable" || 
            (err.message && String(err.message).toLowerCase().includes("could not connect to peer"));

          if (isPeerUnavailable) {
            peerUnavailableReceivedRef.current = true;
            if (pushStatusRef.current.checked) {
              if (pushStatusRef.current.sent) {
                toast.info("El residente no está activo en la app. Notificación enviada.");
                setLastSpeechResponse("Enviando notificación push...");
              } else {
                toast.error("El residente no está activo y no tiene notificaciones configuradas.");
                endCall();
              }
            } else {
              toast.info("El residente no está activo. Verificando notificaciones...");
              setLastSpeechResponse("Buscando destinatario...");
            }
            return;
          }

          toast.error(`Error de citofonía: ${err.message || err.type}`);
          endCall();
        });
      });
    };

    initPeer(0);

    const handleUnload = () => {
      if (activePeer) {
        try { activePeer.destroy(); } catch (e) {}
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleUnload);
    }

    // Create a hidden audio element in the DOM
    if (typeof window !== "undefined") {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      document.body.appendChild(audio);
      remoteAudioRef.current = audio;
    }

    return () => {
      isCancelled = true;
      setIsPeerReady(false);
      if (retryTimeout) clearTimeout(retryTimeout);
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", handleUnload);
      }
      if (activePeer) {
        try { activePeer.destroy(); } catch (e) {}
      }
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch (e) {}
        peerRef.current = null;
      }
      if (remoteAudioRef.current) remoteAudioRef.current.remove();
      stopSpeech();
    };
  }, [myPeerId]);

  // Setup Push Notifications and Service Worker
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }
    if (!profile) return;

    const registerPush = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }

        if (permission !== "granted") {
          return;
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          return;
        }

        const urlBase64ToUint8Array = (base64String: string) => {
          const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
          const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }
          return outputArray;
        };

        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        let subscription = await registration.pushManager.getSubscription();
        let isNew = false;
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
          isNew = true;
        }

        // Only register in the DB when we have a brand-new subscription.
        // Re-registering an existing subscription on every profile render
        // causes duplicate push notifications per call.
        if (isNew) {
          await api.post('/usuarios/me/push-subscriptions', subscription);
        }
      } catch (err) {
        console.error("Error al registrar notificaciones push:", err);
      }
    };

    registerPush();
  }, [profile]);

  // Manejar mensajes del Service Worker y URL parameters para contestar llamadas
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "ANSWER_CALL" && event.data?.callerPeerId) {
          if (event.data.callerName) {
            setCallerName(event.data.callerName);
          }

          if (event.data.redirectToCallPage) {
            const currentPath = window.location.pathname;
            if (currentPath !== "/citofonia") {
              previousPathRef.current = currentPath;
            }
            router.push("/citofonia");
          }

          // Si ya tenemos una llamada sonando, la contestamos directamente en vez de iniciar una llamada de retorno
          if (callStateRef.current === "RINGING" && incomingCallRef.current) {
            if (answerCallRef.current) {
              answerCallRef.current();
            }
            return;
          }

          if (isPeerReady) {
            if (startCallRef.current) {
              startCallRef.current(event.data.callerPeerId);
            }
          } else {
            pendingCallbackRef.current = event.data.callerPeerId;
          }
        }
      };
      navigator.serviceWorker.addEventListener("message", handleMessage);
      return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
    }
  }, [profile, isPeerReady, router]);

  useEffect(() => {
    if (typeof window === "undefined" || !profile || !isPeerReady) return;

    const params = new URLSearchParams(window.location.search);
    const hasIncomingCall = params.get("answerCall") === "true" || params.get("incoming") === "true";
    const callerPeerId = params.get("callerPeerId");
    const callerNameParam = params.get("callerName");

    if (hasIncomingCall && callerPeerId) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      if (callerNameParam) {
        setCallerName(decodeURIComponent(callerNameParam));
      }
      if (startCallRef.current) {
        startCallRef.current(callerPeerId);
      }
    }
  }, [profile, isPeerReady]);

  // Procesar llamadas de retorno encoladas cuando PeerJS esté listo
  useEffect(() => {
    if (isPeerReady && pendingCallbackRef.current) {
      const target = pendingCallbackRef.current;
      pendingCallbackRef.current = null;
      if (startCallRef.current) {
        startCallRef.current(target);
      }
    }
  }, [isPeerReady]);

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
    
    let targetNum = num.trim();
    let name = `Apto ${num}`;
    let targetPeerId = "";

    // Si es un Peer ID completo:
    if (num.startsWith("user-") || num.includes("-VIGILANTE") || num.includes("-ADMINISTRADOR") || num.includes("-APTO-")) {
      targetPeerId = num;
      if (num.includes("-VIGILANTE")) {
        name = "Portería Principal";
      } else if (num.includes("-ADMINISTRADOR")) {
        name = "Administración";
      } else if (num.includes("-APTO-")) {
        const parts = num.split("-APTO-");
        name = `Apto ${parts[1]}`;
      } else {
        name = "Residente";
      }
    } else {
      if (num === "P") {
        targetNum = "VIGILANTE";
        name = "Portería Principal";
      } else if (num === "A") {
        targetNum = "ADMINISTRADOR";
        name = "Administración";
      } else {
        // Normalizar número de apartamento ingresado
        if (targetNum.includes("-")) {
          const parts = targetNum.split("-");
          const torrePart = parts[0].trim();
          const aptoPart = parts[1].trim();
          if (/^\d+$/.test(torrePart)) {
            targetNum = `${parseInt(torrePart, 10)}-${aptoPart}`;
          } else {
            targetNum = `${torrePart}-${aptoPart}`;
          }
        } else if (/^\d+$/.test(targetNum)) {
          if (targetNum.length === 5) {
            // e.g. "41410" -> "4-1410"
            targetNum = `${parseInt(targetNum.slice(0, 1), 10)}-${targetNum.slice(1)}`;
          } else if (targetNum.length === 6) {
            // e.g. "041410" -> "4-1410"
            targetNum = `${parseInt(targetNum.slice(0, 2), 10)}-${targetNum.slice(2)}`;
          } else if (targetNum.length === 4) {
            // e.g. "1101" -> "1-101"
            targetNum = `${parseInt(targetNum.slice(0, 1), 10)}-${targetNum.slice(1)}`;
          }
        }
      }

      targetPeerId = `${conjuntoId}-${targetNum}`;
      if (targetNum !== "VIGILANTE" && targetNum !== "ADMINISTRADOR") {
        targetPeerId = `${conjuntoId}-APTO-${targetNum}`;
      }
    }

    targetPeerId = sanitizePeerId(targetPeerId);
    setCallerName(name);
    setCallState("OUTGOING");
    setLastSpeechResponse("Marcando canal digital...");
    targetPeerIdRef.current = targetPeerId;
    playRingback();

    pushStatusRef.current = { checked: false, sent: false };
    peerUnavailableReceivedRef.current = false;

    // Capture the current path so we can return here when the call ends
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== "/citofonia") {
        previousPathRef.current = currentPath;
      }
    }

    // Get microphone stream — fall back to silent stream if no mic available
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
    } catch (e) {
      toast.info("Sin micrófono — realizando llamada sin audio de salida.");
      stream = new MediaStream();
      localStreamRef.current = stream;
    }

    try {
      if (!peerRef.current) {
        throw new Error("PeerJS client is not initialized.");
      }

      // Enviar notificación Push al destinatario para despertarlo / avisarle en su navegador
      const callerRoleName = profile.rol === "VIGILANTE" ? "Portería Principal" : (profile.rol === "ADMINISTRADOR" ? "Administración" : `Apto ${profile.unidad?.numero || ""}`);
      api.post<{ success: boolean; sent?: number; error?: string; reason?: string }>('/citofonia/call-push', {
          targetPeerId,
          callerName: callerRoleName,
          callerPeerId: myPeerIdRef.current
        })
      .then(json => {
        if (json.success && json.sent > 0) {
          pushStatusRef.current = { checked: true, sent: true };
          if (callStateRef.current === "OUTGOING" && peerUnavailableReceivedRef.current) {
            toast.info("El residente no está activo en la app. Notificación enviada.");
            setLastSpeechResponse("Enviando notificación push...");
          }
        } else {
          const errMsg = json.error || json.reason || "No subscriptions found";
          pushStatusRef.current = { checked: true, sent: false, error: errMsg };
          if (json.error) {
            toast.error(json.error);
            endCall();
            return;
          }
          if (callStateRef.current === "OUTGOING" && peerUnavailableReceivedRef.current) {
            toast.error("El residente no está activo y no tiene notificaciones configuradas.");
            endCall();
          }
        }
      })
      .catch(err => {
        pushStatusRef.current = { checked: true, sent: false, error: err.message };
        console.error("Error al enviar notificación push de llamada:", err);
        if (callStateRef.current === "OUTGOING" && peerUnavailableReceivedRef.current) {
          toast.error("El residente no está activo y falló el envío de la notificación.");
          endCall();
        }
      });

      const call = peerRef.current.call(targetPeerId, stream);
      
      if (call) {
        activeCallRef.current = call;
        
        call.on("stream", (remoteStream: MediaStream) => {
          if (activeToneRef.current) activeToneRef.current.stop();
          playBeep();
          
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.error("Error playing WebRTC stream:", e));
          }
          setCallState("CONNECTED");
        });

        call.on("close", () => {
          endCall();
        });

        call.on("error", (err: any) => {
          toast.error("Error al establecer la conexión de voz.");
          endCall();
        });

        // Timeout if the recipient does not answer in 25 seconds
        setTimeout(() => {
          setCallState((current) => {
            if (current === "OUTGOING") {
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
    } catch {
      toast.error("No se pudo iniciar la llamada.");
      endCall();
    }
  };
  startCallRef.current = startCall;

  const answerCall = async () => {
    if (activeToneRef.current) activeToneRef.current.stop();
    playBeep();

    // Capture the current path so we can return here when the call ends
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== "/citofonia") {
        previousPathRef.current = currentPath;
      }
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
    } catch (e) {
      // Device has no mic, or permission was denied — answer silently so the
      // resident can still hear the caller (one-way audio).
      toast.info("Contestando sin micrófono — el dispositivo no tiene uno disponible.");
      stream = new MediaStream();
      localStreamRef.current = stream;
    }

    if (incomingCallRef.current) {
      incomingCallRef.current.answer(stream);

      incomingCallRef.current.on("stream", (remoteStream: MediaStream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(e => console.error("Error playing WebRTC stream:", e));
        }
      });

      incomingCallRef.current.on("close", () => {
        endCall();
      });

      setCallState("CONNECTED");
      router.push("/citofonia");
    }
  };
  answerCallRef.current = answerCall;

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

    // Return to the page the user was on before the call started
    if (typeof window !== "undefined" && window.location.pathname === "/citofonia") {
      router.push(previousPathRef.current || "/inicio");
    }
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

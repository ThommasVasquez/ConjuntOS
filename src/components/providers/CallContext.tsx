"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useSession } from "next-auth/react";
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

export function CallProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
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
  }

  // Setup PeerJS connection when profile is loaded
  useEffect(() => {
    if (!profile || !myPeerId) return;

    let activePeer: any = null;
    let isCancelled = false;
    let retryTimeout: NodeJS.Timeout | null = null;
    
    myPeerIdRef.current = myPeerId;

    const initPeer = (retryCount = 0) => {
      console.log(`Initializing Citofonía PeerJS with ID: ${myPeerId} (attempt ${retryCount + 1})`);

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
          console.log("Citofonía PeerJS connection open. Peer ID:", id);
          setIsPeerReady(true);
        });

        p.on("disconnected", () => {
          console.log("Citofonía PeerJS connection disconnected.");
          setIsPeerReady(false);
        });

        p.on("close", () => {
          console.log("Citofonía PeerJS connection closed.");
          setIsPeerReady(false);
        });

        p.on("call", (call: any) => {
          if (isCancelled) return;
          console.log("Citofonía: Recibiendo llamada WebRTC de:", call.peer);
          
          // Si el estado es OUTGOING y el peer coincide con el que estamos llamando, contestamos automáticamente (llamada de retorno)
          if (callStateRef.current === "OUTGOING" && call.peer === targetPeerIdRef.current) {
            console.log("Citofonía: Auto-contestando llamada de retorno del destinatario despertado.");
            incomingCallRef.current = call;
            if (answerCallRef.current) {
              answerCallRef.current();
            }
            return;
          }

          incomingCallRef.current = call;

          // Escuchar cierre o error de la llamada entrante antes de contestar
          call.on("close", () => {
            console.log("Citofonía: Llamada entrante cancelada/cerrada por el llamante.");
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
            console.log("ID is taken, retrying in 2 seconds...");
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
            console.warn("Citofonía PeerJS: Peer is offline. Sending Web Push wake notification...", err);
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

          console.error("Citofonía PeerJS error:", err);
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
        console.log("Service Worker registrado con éxito. Scope:", registration.scope);

        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }

        if (permission !== "granted") {
          console.warn("Permiso de notificaciones no concedido:", permission);
          return;
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          console.warn("NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurado.");
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
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
        }

        await fetch("/api/user/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription })
        });
        console.log("Suscripción push registrada en base de datos.");
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
          console.log("Respondiendo llamada desde Service Worker message:", event.data);
          if (event.data.callerName) {
            setCallerName(event.data.callerName);
          }

          if (event.data.redirectToCallPage) {
            router.push("/citofonia");
          }

          // Si ya tenemos una llamada sonando, la contestamos directamente en vez de iniciar una llamada de retorno
          if (callStateRef.current === "RINGING" && incomingCallRef.current) {
            console.log("Citofonía: Contestando llamada entrante activa en respuesta al mensaje del SW.");
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
            console.log("PeerJS no listo. Encolando llamada de retorno.");
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
      console.log("Iniciando conexión/devolución de llamada a:", callerPeerId);
      
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
      console.log("Procesando llamada de retorno encolada para:", target);
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

    setCallerName(name);
    setCallState("OUTGOING");
    setLastSpeechResponse("Marcando canal digital...");
    targetPeerIdRef.current = targetPeerId;
    playRingback();

    pushStatusRef.current = { checked: false, sent: false };
    peerUnavailableReceivedRef.current = false;

    try {
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      if (!peerRef.current) {
        throw new Error("PeerJS client is not initialized.");
      }

      console.log("Citofonía: Realizando llamada a peer ID:", targetPeerId);
      
      // Enviar notificación Push al destinatario para despertarlo / avisarle en su navegador
      const callerRoleName = profile.rol === "VIGILANTE" ? "Portería Principal" : (profile.rol === "ADMINISTRADOR" ? "Administración" : `Apto ${profile.unidad?.numero || ""}`);
      fetch("/api/citofonia/call-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPeerId,
          callerName: callerRoleName,
          callerPeerId: myPeerIdRef.current
        })
      })
      .then(res => res.json())
      .then(json => {
        if (json.success && json.sent > 0) {
          pushStatusRef.current = { checked: true, sent: true };
          console.log(`[push] Push notification sent successfully to ${json.sent} devices.`);
          if (callStateRef.current === "OUTGOING" && peerUnavailableReceivedRef.current) {
            toast.info("El residente no está activo en la app. Notificación enviada.");
            setLastSpeechResponse("Enviando notificación push...");
          }
        } else {
          pushStatusRef.current = { checked: true, sent: false, error: json.reason || "No subscriptions found" };
          console.log(`[push] Push notification not sent:`, json.reason);
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
  startCallRef.current = startCall;

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
        router.push("/citofonia");
      }
    } catch (e) {
      console.error("Failed to answer call with mic:", e);
      toast.error("No se pudo iniciar el micrófono para contestar.");
      rejectCall();
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

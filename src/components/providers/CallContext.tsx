"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import type { ProfileResponse } from "@/lib/api/types";
import type { Room, RemoteTrack } from "livekit-client";
import { useRouter } from "next/navigation";
import { Phone, PhoneOff, Check } from "lucide-react";
import { toast } from "sonner";

export type CallState = "IDLE" | "RINGING" | "OUTGOING" | "CONNECTED" | "FALLBACK";

interface CallContextType {
  callState: CallState;
  callerName: string;
  callTime: number;
  lastSpeechResponse: string;
  dialNum: string;
  setDialNum: (num: string) => void;
  startCall: (num: string, displayName?: string) => void;
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

// The peer-id targeting scheme is unchanged: it still identifies *who* to ring.
// With LiveKit it is sent to the backend as `targetPeerId`; the backend resolves it
// to users, mints a room, and pushes them. Media no longer flows peer-to-peer.
const sanitizePeerId = (id: string): string => {
  if (!id) return "";
  return id.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const router = useRouter();

  // Call States
  const [callState, setCallState] = useState<CallState>("IDLE");
  const [callerName, setCallerName] = useState("");
  const [callTime, setCallTime] = useState(0);
  const [lastSpeechResponse, setLastSpeechResponse] = useState("");
  const [dialNum, setDialNum] = useState("");

  // LiveKit refs
  const roomRef = useRef<Room | null>(null); // current livekit-client Room
  const attachedElsRef = useRef<HTMLMediaElement[]>([]);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingRoomRef = useRef<string | null>(null); // room awaiting answer (from push)
  const joinRoomRef = useRef<((room: string) => Promise<void>) | null>(null);
  const startCallRef = useRef<((num: string, displayName?: string) => Promise<void>) | null>(null);
  const answerCallRef = useRef<(() => Promise<void>) | null>(null);

  const callStateRef = useRef<CallState>("IDLE");
  callStateRef.current = callState;
  const pushSentRef = useRef<number>(0);
  const previousPathRef = useRef<string>("/inicio");
  // True only once the call reached CONNECTED. Keeps a failed/unanswered outgoing
  // call from kicking the user back to /inicio: we leave them on the dialer.
  const hadConnectedRef = useRef(false);

  // Audio Tone Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeToneRef = useRef<{ stop: () => void } | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noAnswerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load User Profile on start
  useEffect(() => {
    if (user) {
      api.get<ProfileResponse>('/usuarios/me/profile')
        .then((data) => setProfile(data))
        .catch((err) => console.error("Error fetching profile for calling:", err));
    }
  }, [user]);

  // Hidden container that holds attached remote <audio> elements.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const div = document.createElement("div");
    div.style.display = "none";
    document.body.appendChild(div);
    audioContainerRef.current = div;
    return () => {
      try { div.remove(); } catch {}
      audioContainerRef.current = null;
    };
  }, []);

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
        if (isNew) {
          await api.post('/usuarios/me/push-subscriptions', subscription);
        }
      } catch (err) {
        console.error("Error al registrar notificaciones push:", err);
      }
    };

    registerPush();
  }, [profile]);

  // Handle Service Worker messages: INCOMING_CALL (ring) and ANSWER_CALL (join).
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data?.room) return;

      if (data.type === "INCOMING_CALL") {
        // Ring in-app even when the tab is open (foreground push).
        if (callStateRef.current !== "IDLE") return;
        pendingRoomRef.current = data.room;
        setCallerName(data.callerName || "Llamada entrante");
        setCallState("RINGING");
        playRingtone();
      } else if (data.type === "ANSWER_CALL") {
        if (data.callerName) setCallerName(data.callerName);
        if (data.redirectToCallPage) {
          const currentPath = window.location.pathname;
          if (currentPath !== "/citofonia") previousPathRef.current = currentPath;
          router.push("/citofonia");
        }
        pendingRoomRef.current = data.room;
        joinRoomRef.current?.(data.room);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
    // playRingtone is a stable local helper (reads only refs); excluded to avoid re-registering the listener on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, router]);

  // Handle deep-link from a notification opened in a fresh tab:
  // /citofonia?answerCall=true&room=...&callerName=...
  useEffect(() => {
    if (typeof window === "undefined" || !profile) return;

    const params = new URLSearchParams(window.location.search);
    const hasIncomingCall = params.get("answerCall") === "true" || params.get("incoming") === "true";
    const room = params.get("room");
    const callerNameParam = params.get("callerName");

    if (hasIncomingCall && room) {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (callerNameParam) setCallerName(decodeURIComponent(callerNameParam));
      pendingRoomRef.current = room;
      joinRoomRef.current?.(room);
    }
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
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
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
        } catch {}
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
        } catch {}
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
      } catch {}
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
      } catch {}
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

  // ── LiveKit connection ──
  const detachAll = () => {
    attachedElsRef.current.forEach((el) => {
      try { el.remove(); } catch {}
    });
    attachedElsRef.current = [];
  };

  // Connect to a LiveKit room, publish the mic, and render remote audio.
  // Marks the call CONNECTED as soon as a remote audio track is subscribed.
  const connectToRoom = async (roomName: string, token: string, url: string) => {
    const { Room, RoomEvent, Track } = await import("livekit-client");

    if (roomRef.current) {
      try { await roomRef.current.disconnect(); } catch {}
      roomRef.current = null;
    }
    detachAll();

    const lkRoom = new Room();
    roomRef.current = lkRoom;

    lkRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        (el as HTMLMediaElement).autoplay = true;
        audioContainerRef.current?.appendChild(el);
        attachedElsRef.current.push(el);
        if (activeToneRef.current) activeToneRef.current.stop();
        if (!hadConnectedRef.current) playBeep();
        hadConnectedRef.current = true;
        if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
        setCallState("CONNECTED");
      }
    });

    lkRoom.on(RoomEvent.Disconnected, () => endCall());
    lkRoom.on(RoomEvent.ParticipantDisconnected, () => {
      if (lkRoom.remoteParticipants.size === 0) endCall();
    });

    await lkRoom.connect(url, token);
    try {
      await lkRoom.localParticipant.setMicrophoneEnabled(true);
    } catch {
      toast.info("Sin micrófono — llamada en modo escucha.");
    }
  };

  // ── Actions ──
  const startCall = async (num: string, displayName?: string) => {
    if (!profile) return;
    const conjuntoId = profile.conjuntoId || "demo_id";

    const dialed = num.trim();
    let name = displayName?.trim() || "Llamando…";
    let targetPeerId = "";

    // Already a full target id (from the search picker, a callback, or a quick-call).
    if (
      dialed.startsWith("user-") ||
      dialed.startsWith("numero-") ||
      dialed.includes("-VIGILANTE") ||
      dialed.includes("-ADMINISTRADOR") ||
      dialed.includes("-APTO-")
    ) {
      targetPeerId = dialed;
      if (!displayName) {
        if (dialed.includes("-VIGILANTE")) name = "Portería Principal";
        else if (dialed.includes("-ADMINISTRADOR")) name = "Administración";
        else if (dialed.includes("-APTO-")) name = `Apto ${dialed.split("-APTO-")[1]}`;
        else if (dialed.startsWith("numero-")) name = `Interno ${dialed.slice(7)}`;
        else name = "Residente";
      }
    } else if (dialed === "P") {
      targetPeerId = `${conjuntoId}-VIGILANTE`;
      if (!displayName) name = "Portería Principal";
    } else if (dialed === "A") {
      targetPeerId = `${conjuntoId}-ADMINISTRADOR`;
      if (!displayName) name = "Administración";
    } else {
      // Plain dialed digits -> internal number (resolved to a user by the backend).
      targetPeerId = `numero-${dialed}`;
      if (!displayName) name = `Interno ${dialed}`;
    }

    targetPeerId = sanitizePeerId(targetPeerId);
    setCallerName(name);
    setCallState("OUTGOING");
    setLastSpeechResponse("Marcando canal digital...");
    playRingback();
    hadConnectedRef.current = false;
    pushSentRef.current = 0;

    // Capture the current path so we can return here when the call ends
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== "/citofonia") {
        previousPathRef.current = currentPath;
      }
    }

    const callerRoleName = profile.rol === "VIGILANTE"
      ? "Portería Principal"
      : (profile.rol === "ADMINISTRADOR" ? "Administración" : `Apto ${profile.unidad?.numero || ""}`);

    try {
      // Backend creates the room, returns the caller token, and pushes the targets.
      const res = await api.post<{ room: string; token: string; url: string; sent: number }>(
        '/citofonia/call',
        { targetPeerId, callerName: callerRoleName }
      );
      pushSentRef.current = res.sent ?? 0;

      await connectToRoom(res.room, res.token, res.url);

      // No-answer timeout: nobody joined the room within 25s.
      noAnswerTimerRef.current = setTimeout(() => {
        if (callStateRef.current === "OUTGOING") {
          if (pushSentRef.current > 0) {
            toast.info("El residente fue notificado pero no ha contestado.");
          } else {
            toast.info("El destinatario no está disponible.");
          }
          endCall();
        }
      }, 25000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo iniciar la llamada.";
      toast.error(msg.includes("LiveKit") ? "Servicio de voz no disponible." : "No se pudo iniciar la llamada.");
      endCall();
    }
  };
  startCallRef.current = startCall;

  // Join a room we were invited to (callee side).
  const joinRoom = async (roomName: string) => {
    if (!roomName) return;
    if (activeToneRef.current) activeToneRef.current.stop();
    setCallState("OUTGOING");
    setLastSpeechResponse("Conectando...");

    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== "/citofonia") previousPathRef.current = currentPath;
    }

    try {
      const tok = await api.get<{ token: string; url: string }>(
        `/citofonia/token?room=${encodeURIComponent(roomName)}`
      );
      playBeep();
      await connectToRoom(roomName, tok.token, tok.url);
      hadConnectedRef.current = true;
      setCallState("CONNECTED");
      router.push("/citofonia");
    } catch {
      toast.error("No se pudo contestar la llamada.");
      endCall();
    }
  };
  joinRoomRef.current = joinRoom;

  const answerCall = async () => {
    const room = pendingRoomRef.current;
    if (!room) {
      toast.error("La llamada ya no está disponible.");
      setCallState("IDLE");
      return;
    }
    await joinRoom(room);
  };
  answerCallRef.current = answerCall;

  const rejectCall = () => {
    if (activeToneRef.current) activeToneRef.current.stop();
    playDisconnect();
    pendingRoomRef.current = null;
    setCallState("IDLE");
    toast.info("Llamada rechazada");
  };

  const endCall = () => {
    if (activeToneRef.current) activeToneRef.current.stop();
    playDisconnect();
    stopSpeech();

    if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }

    // Disconnect LiveKit (this stops the published mic track too).
    if (roomRef.current) {
      try { roomRef.current.disconnect(); } catch {}
      roomRef.current = null;
    }
    detachAll();
    pendingRoomRef.current = null;

    const wasConnected = hadConnectedRef.current;
    hadConnectedRef.current = false;

    setCallState("IDLE");
    setDialNum("");
    setLastSpeechResponse("");

    if (wasConnected) {
      toast.info("Llamada finalizada");
      if (typeof window !== "undefined" && window.location.pathname === "/citofonia") {
        router.push(previousPathRef.current || "/inicio");
      }
    } else {
      // Stay on the dialer; do not redirect.
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
                className="flex-1 py-3 bg-text/10 hover:bg-text/25 border border-text/35 text-text rounded-2xl font-bold text-xs cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5"
             >
                <PhoneOff size={14} /> Rechazar
             </button>
             <button
                onClick={answerCall}
                className="flex-1 py-3 bg-text/10 hover:bg-text/10 text-white rounded-2xl font-black text-xs shadow-xl shadow-black/20 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5"
             >
                <Check size={14} /> Contestar
             </button>
          </div>
        </div>
      )}

      {/* ACTIVE CALL HUD OVERLAY */}
      {callState === "CONNECTED" && !isCitofoniaPage && (
        <div className="fixed bottom-24 right-6 z-50 p-5 bg-primary/95 border border-text/35 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom duration-300">
           <div className="w-2.5 h-2.5 rounded-full bg-text/10 animate-ping" />
           <div className="flex flex-col">
              <span className="text-[9px] font-black text-text uppercase tracking-widest">En Línea</span>
              <span className="text-xs font-bold text-text">{callerName}</span>
           </div>
           <button
              onClick={endCall}
              className="w-10 h-10 rounded-full bg-text/10 hover:bg-text/10 flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all shadow-lg"
           >
              <PhoneOff size={16} />
           </button>
        </div>
      )}
    </CallContext.Provider>
  );
}

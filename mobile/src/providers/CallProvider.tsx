import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Phone, PhoneOff, Check } from "lucide-react-native";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import {
  registerGlobals,
  AudioSession,
} from "@livekit/react-native";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

import { useAuth } from "@/hooks/useAuth";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { api } from "@/lib/api/client";
import type { ProfileResponse } from "@/lib/api/types";
import { toast } from "@/components/ui/toast";

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
  /**
   * Entry point for a tapped native push (closed/background app). Mirrors the
   * web service-worker "ANSWER_CALL" path: deep-links into /citofonia, records
   * the invited room as pending, and rings so the user can answer (no-op if a
   * call is already in progress). Consumed by @/services/push.
   */
  answerFromPush: (room: string, callerName?: string) => void;
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

// register the @livekit/react-native-webrtc globals exactly once for the JS runtime.
let globalsRegistered = false;
function ensureGlobals() {
  if (globalsRegistered) return;
  try {
    registerGlobals();
    globalsRegistered = true;
  } catch (e) {
    console.warn("LiveKit registerGlobals failed:", e);
  }
}

// The peer-id targeting scheme is unchanged: it still identifies *who* to ring.
// With LiveKit it is sent to the backend as `targetPeerId`; the backend resolves it
// to users, mints a room, and pushes them. Media no longer flows peer-to-peer.
const sanitizePeerId = (id: string): string => {
  if (!id) return "";
  return id.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
};

// Placeholder tone assets. These are silent stubs (see assets/sounds/README.md);
// playback is a no-op until real tones are supplied, and must never crash.
const SOUND_RINGBACK = require("../../assets/sounds/ringback.mp3");
const SOUND_RINGTONE = require("../../assets/sounds/ringtone.mp3");
const SOUND_BEEP = require("../../assets/sounds/beep.mp3");
const SOUND_DISCONNECT = require("../../assets/sounds/disconnect.mp3");

// Request microphone permission before connecting. iOS surfaces the prompt
// automatically through the WebRTC layer (NSMicrophoneUsageDescription); Android
// needs an explicit runtime request.
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Micrófono",
          message: "Se necesita el micrófono para las llamadas de citofonía.",
          buttonPositive: "Permitir",
          buttonNegative: "Cancelar",
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
  // iOS: ask through expo-av (same underlying AVAudioSession permission).
  try {
    const res = await Audio.requestPermissionsAsync();
    return res.granted;
  } catch {
    return true;
  }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Call States
  const [callState, setCallState] = useState<CallState>("IDLE");
  const [callerName, setCallerName] = useState("");
  const [callTime, setCallTime] = useState(0);
  const [lastSpeechResponse, setLastSpeechResponse] = useState("");
  const [dialNum, setDialNum] = useState("");

  // LiveKit refs
  const roomRef = useRef<Room | null>(null);
  const audioSessionActiveRef = useRef(false);
  const pendingRoomRef = useRef<string | null>(null); // room awaiting answer (from push)

  const callStateRef = useRef<CallState>("IDLE");
  callStateRef.current = callState;
  const pushSentRef = useRef<number>(0);
  const previousPathRef = useRef<string>("/inicio");
  // True only once the call reached CONNECTED. Keeps a failed/unanswered outgoing
  // call from kicking the user back to /inicio: we leave them on the dialer.
  const hadConnectedRef = useRef(false);

  // Audio tone refs (expo-av). activeToneRef holds the looping ring/ringback.
  const activeToneRef = useRef<Audio.Sound | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef<string>(pathname || "/inicio");
  pathRef.current = pathname || "/inicio";

  // Register WebRTC globals once on mount.
  useEffect(() => {
    ensureGlobals();
  }, []);

  // Load user profile on start.
  useEffect(() => {
    if (user) {
      api
        .get<ProfileResponse>("/usuarios/me/profile")
        .then((data) => setProfile(data))
        .catch((err) => console.error("Error fetching profile for calling:", err));
    } else {
      setProfile(null);
    }
  }, [user]);

  // Foreground ring over WebSocket. The backend publishes a citofonia/incoming_call
  // event to the target user, so an open app rings instantly. Background delivery
  // is handled by the push layer (@/services/push), which deep-links into /citofonia.
  useWsSubscription("citofonia", (event) => {
    if (event.action !== "incoming_call") return;
    const data = event.payload as { room?: string; callerName?: string } | undefined;
    if (!data?.room) return;
    if (callStateRef.current !== "IDLE") return;
    pendingRoomRef.current = data.room;
    setCallerName(data.callerName || "Llamada entrante");
    setCallState("RINGING");
    playRingtone();
  });

  // Manage call timer.
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

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTone();
      Speech.stop().catch(() => {});
      if (roomRef.current) {
        roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
      if (audioSessionActiveRef.current) {
        AudioSession.stopAudioSession().catch(() => {});
        audioSessionActiveRef.current = false;
      }
    };
  }, []);

  // ── Tone helpers (expo-av) ──
  // Every tone helper swallows errors so a placeholder/missing asset can never
  // crash the call engine.
  const stopTone = () => {
    const snd = activeToneRef.current;
    activeToneRef.current = null;
    if (snd) {
      snd.stopAsync().catch(() => {});
      snd.unloadAsync().catch(() => {});
    }
  };

  // Play a looping tone (ringback / ringtone). Replaces any tone already playing.
  const playLoopTone = async (asset: number) => {
    stopTone();
    try {
      const { sound } = await Audio.Sound.createAsync(
        asset,
        { shouldPlay: true, isLooping: true, volume: 1.0 },
        null,
        true
      );
      // A newer tone may have been requested while we awaited; honor the latest.
      if (activeToneRef.current) {
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        return;
      }
      activeToneRef.current = sound;
    } catch (e) {
      console.warn("playLoopTone failed (placeholder asset?):", e);
    }
  };

  // Play a one-shot tone (beep / disconnect); self-unloads when finished.
  const playOneShot = async (asset: number) => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        asset,
        { shouldPlay: true, isLooping: false, volume: 1.0 },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
          }
        },
        true
      );
    } catch (e) {
      console.warn("playOneShot failed (placeholder asset?):", e);
    }
  };

  const playRingback = () => {
    void playLoopTone(SOUND_RINGBACK);
  };
  const playRingtone = () => {
    void playLoopTone(SOUND_RINGTONE);
  };
  const playBeep = () => {
    void playOneShot(SOUND_BEEP);
  };
  const playDisconnect = () => {
    void playOneShot(SOUND_DISCONNECT);
  };

  // ── Speech (expo-speech, es) ──
  const speakText = (text: string) => {
    try {
      Speech.stop().catch(() => {});
      Speech.speak(text, { language: "es-ES", rate: 1.0 });
    } catch (e) {
      console.warn("speakText failed:", e);
    }
  };

  const stopSpeech = () => {
    Speech.stop().catch(() => {});
  };

  // ── LiveKit connection ──
  // Connect to a LiveKit room, publish the mic, and listen for remote audio.
  // Marks the call CONNECTED as soon as a remote audio track is subscribed.
  const connectToRoom = async (roomName: string, token: string, url: string) => {
    ensureGlobals();

    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }

    // Start the native audio session around the call.
    if (!audioSessionActiveRef.current) {
      try {
        await AudioSession.startAudioSession();
        audioSessionActiveRef.current = true;
      } catch (e) {
        console.warn("startAudioSession failed:", e);
      }
    }

    const lkRoom = new Room();
    roomRef.current = lkRoom;

    lkRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        // On RN, @livekit/react-native auto-renders subscribed remote audio via
        // the registered globals — no manual element attachment needed.
        stopTone();
        if (!hadConnectedRef.current) playBeep();
        hadConnectedRef.current = true;
        if (noAnswerTimerRef.current) {
          clearTimeout(noAnswerTimerRef.current);
          noAnswerTimerRef.current = null;
        }
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

    // Request mic permission before connecting.
    const micOk = await ensureMicPermission();
    if (!micOk) {
      toast.error("Se necesita permiso de micrófono para llamar.");
      return;
    }

    setCallerName(name);
    setCallState("OUTGOING");
    setLastSpeechResponse("Marcando canal digital...");
    playRingback();
    hadConnectedRef.current = false;
    pushSentRef.current = 0;

    // Capture the current path so we can return here when the call ends.
    if (pathRef.current !== "/citofonia") {
      previousPathRef.current = pathRef.current;
    }

    const callerRoleName =
      profile.rol === "VIGILANTE"
        ? "Portería Principal"
        : profile.rol === "ADMINISTRADOR"
        ? "Administración"
        : `Apto ${profile.unidad?.numero || ""}`;

    try {
      // Backend creates the room, returns the caller token, and pushes the targets.
      const res = await api.post<{ room: string; token: string; url: string; sent: number }>(
        "/citofonia/call",
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
      toast.error(
        msg.includes("LiveKit") ? "Servicio de voz no disponible." : "No se pudo iniciar la llamada."
      );
      endCall();
    }
  };

  // Join a room we were invited to (callee side).
  const joinRoom = async (roomName: string) => {
    if (!roomName) return;
    stopTone();

    const micOk = await ensureMicPermission();
    if (!micOk) {
      toast.error("Se necesita permiso de micrófono para contestar.");
      endCall();
      return;
    }

    setCallState("OUTGOING");
    setLastSpeechResponse("Conectando...");

    if (pathRef.current !== "/citofonia") {
      previousPathRef.current = pathRef.current;
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

  // Background / cold-start incoming calls are bridged in via answerFromPush()
  // below, which the native push response listener (@/services/push) calls on a
  // notification tap. It calls joinRoom directly through the live closure, so no
  // joinRoomRef bridge is needed — important because app.config.js has
  // experiments.reactCompiler = true, where a render-phase ref write can be
  // elided by the compiler and go stale.

  const answerCall = async () => {
    const room = pendingRoomRef.current;
    if (!room) {
      toast.error("La llamada ya no está disponible.");
      setCallState("IDLE");
      return;
    }
    await joinRoom(room);
  };

  const rejectCall = () => {
    stopTone();
    playDisconnect();
    pendingRoomRef.current = null;
    setCallState("IDLE");
    toast.info("Llamada rechazada");
  };

  // Tapped a citofonía push from a closed/background app. Mirrors the web
  // service-worker "ANSWER_CALL" handler: deep-link into /citofonia, record the
  // invited room as pending, and ring so the user can answer (or reject) with
  // the existing RINGING UI. A no-op while another call is already in progress,
  // so a stale tap can't hijack an active conversation.
  const answerFromPush = (room: string, name?: string) => {
    if (!room) return;
    if (callStateRef.current !== "IDLE") return;
    pendingRoomRef.current = room;
    setCallerName(name || "Llamada entrante");
    if (pathRef.current !== "/citofonia") {
      previousPathRef.current = pathRef.current;
    }
    setCallState("RINGING");
    playRingtone();
    router.push("/citofonia");
  };

  const endCall = () => {
    stopTone();
    playDisconnect();
    stopSpeech();

    if (noAnswerTimerRef.current) {
      clearTimeout(noAnswerTimerRef.current);
      noAnswerTimerRef.current = null;
    }

    // Disconnect LiveKit (this stops the published mic track too).
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    if (audioSessionActiveRef.current) {
      AudioSession.stopAudioSession().catch(() => {});
      audioSessionActiveRef.current = false;
    }
    pendingRoomRef.current = null;

    const wasConnected = hadConnectedRef.current;
    hadConnectedRef.current = false;

    setCallState("IDLE");
    setDialNum("");
    setLastSpeechResponse("");

    if (wasConnected) {
      toast.info("Llamada finalizada");
      // Post-call navigation is owned solely by the /citofonia screen effect
      // (it checks canGoBack and falls back to /inicio). Navigating here too
      // would stack a push on top of the screen's back/replace, polluting the
      // back stack and producing a flaky landing screen.
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
          reply:
            "Entendido, señor. Por favor regístrelo en la pestaña de visitas de la aplicación para dejar constancia y permitir el ingreso.",
        },
        {
          label: "¿Tengo algún paquete?",
          reply:
            "Déjeme verificar en la bitácora... Sí, señor, tiene un paquete recibido de Logística Nacional. Puede pasar por él cuando guste.",
        },
        {
          label: "Reportar un carro mal parqueado",
          reply:
            "Entendido, vecino. Ya mismo enviamos un oficial de ronda a verificar el vehículo y hacer el reporte.",
        },
        {
          label: "Reportar emergencia",
          reply:
            "Entendido. Mantenga la calma, por favor. Ya mismo activamos el protocolo de seguridad y llamamos a las autoridades.",
        },
      ];
    } else if (name === "Administración") {
      return [
        {
          label: "Preguntar saldo de administración",
          reply:
            "Hola. Su saldo actual de administración está al día. Recuerde que puede ver los detalles y pagar en el módulo de pagos de la app.",
        },
        {
          label: "Reservar salón comunal / áreas",
          reply:
            "Para reservar áreas comunes, puede hacerlo de forma inmediata desde el módulo de reservas de la aplicación.",
        },
        {
          label: "Reportar un daño en zonas comunes",
          reply:
            "Muchas gracias por el reporte. Tomamos nota de la novedad y enviaremos al personal de mantenimiento a revisar.",
        },
      ];
    } else {
      return [
        {
          label: "Dejar un mensaje",
          reply:
            "Entendido, tomamos nota del mensaje y se lo informamos al residente cuando sea posible. Gracias.",
        },
      ];
    }
  };

  const isCitofoniaPage = pathname === "/citofonia";

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
        answerFromPush,
        handleOptionClick,
        getCallOptions: () => getCallOptions(callerName),
      }}
    >
      {children}

      {/* GLOBAL FLOATING INCOMING CALL HUD OVERLAY */}
      {callState === "RINGING" && !isCitofoniaPage && (
        <View pointerEvents="box-none" style={styles.incomingWrap}>
          <View style={styles.incomingCard}>
            <View style={styles.row}>
              <View style={styles.incomingIcon}>
                <Phone size={24} color="#ffffff" />
              </View>
              <View style={styles.flexShrink}>
                <Text style={styles.incomingLabel}>LLAMADA ENTRANTE</Text>
                <Text style={styles.incomingName} numberOfLines={1}>
                  {callerName}
                </Text>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <Pressable
                onPress={rejectCall}
                style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
              >
                <PhoneOff size={14} color="#ffffff" />
                <Text style={styles.btnText}>Rechazar</Text>
              </Pressable>
              <Pressable
                onPress={answerCall}
                style={({ pressed }) => [styles.answerBtn, pressed && styles.pressed]}
              >
                <Check size={14} color="#ffffff" />
                <Text style={styles.btnTextBold}>Contestar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ACTIVE CALL HUD OVERLAY */}
      {callState === "CONNECTED" && !isCitofoniaPage && (
        <View pointerEvents="box-none" style={styles.activeWrap}>
          <View style={styles.activeCard}>
            <View style={styles.activeDot} />
            <View style={styles.flexShrink}>
              <Text style={styles.activeLabel}>EN LÍNEA</Text>
              <Text style={styles.activeName} numberOfLines={1}>
                {callerName}
              </Text>
            </View>
            <Pressable
              onPress={endCall}
              style={({ pressed }) => [styles.hangupBtn, pressed && styles.pressed]}
            >
              <PhoneOff size={16} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      )}
    </CallContext.Provider>
  );
}

const styles = StyleSheet.create({
  // Incoming call HUD: pinned near the top, above the navigator.
  incomingWrap: {
    position: "absolute",
    top: 56,
    left: 24,
    right: 24,
    zIndex: 50,
    alignItems: "center",
  },
  incomingCard: {
    width: "100%",
    maxWidth: 384,
    padding: 24,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(120,120,255,0.4)",
    backgroundColor: "rgba(20,20,30,0.92)",
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flexShrink: { flexShrink: 1 },
  incomingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(120,120,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  incomingLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#9aa0ff",
    letterSpacing: 1.5,
  },
  incomingName: { fontSize: 16, fontWeight: "900", color: "#ffffff" },
  actionsRow: { flexDirection: "row", gap: 12 },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  answerBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "rgba(40,200,120,0.85)",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  btnTextBold: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  // Active call HUD: pinned bottom-right, above the floating tab bar.
  activeWrap: {
    position: "absolute",
    bottom: 96,
    right: 24,
    zIndex: 50,
  },
  activeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(30,30,60,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3ddc84",
  },
  activeLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 1.5,
  },
  activeName: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
  hangupBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(220,40,40,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
});

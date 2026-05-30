"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
  Play, Pause, Sparkles, Mic, MicOff, MessageSquare, Send, 
  QrCode, Phone, Laptop, ChevronUp, ChevronDown, CheckCircle, 
  Circle, AlertCircle, ArrowRight, Lock, User, Plus, Trash2, 
  LogOut, RefreshCw, Smartphone, Layers, Shield, Home, Calendar,
  UserPlus, Download, Share2
} from "lucide-react";
import { toast } from "sonner";
import { gsap } from "gsap";

interface AgendaItem {
  id: string;
  titulo: string;
  descripcion?: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO';
}

interface SpeakingTurn {
  id: string;
  usuarioId: string;
  nombre: string;
  apto?: string;
  estado: 'PENDIENTE' | 'HABLANDO' | 'COMPLETADO';
  creadoEn: string;
  iniciadoHablarEn?: string;
}

interface ResidentOpinion {
  id: string;
  usuarioId: string;
  nombre: string;
  apto?: string;
  contenido: string;
  creadoEn: string;
}

const getInitials = (name: string) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
};

const getGradientClass = (name: string) => {
  const charCode = name.charCodeAt(0) || 0;
  const gradients = [
    "from-pink-500 to-rose-600 text-white",
    "from-purple-500 to-indigo-600 text-white",
    "from-blue-500 to-cyan-600 text-white",
    "from-emerald-500 to-teal-600 text-white",
    "from-amber-500 to-orange-600 text-white",
    "from-violet-500 to-fuchsia-600 text-white"
  ];
  return gradients[charCode % gradients.length];
};

const getOptionColor = (op: string) => {
  const norm = op.toUpperCase().trim();
  if (norm === "SI" || norm === "SÍ" || norm === "APROBAR") return "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]";
  if (norm === "NO" || norm === "RECHAZAR") return "bg-gradient-to-r from-rose-500 to-red-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]";
  if (norm === "ABSTENCION" || norm === "ABSTENCIÓN" || norm === "BLANCO") return "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]";
  return "bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]";
};

const RemoteVideo = ({ stream, className }: { stream: MediaStream; className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={videoRef} autoPlay playsInline className={className} />;
};

export default function AsambleaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const webUserRole = (session?.user as { role?: string })?.role;
  const isWebAdmin = webUserRole === "ADMINISTRADOR" || webUserRole === "SUPER_ADMIN";

  // Mode settings
  const [isDemoMode, setIsDemoMode] = useState(true); // Default to split demo on desktop
  const [activeTab, setActiveTab] = useState<"web" | "app">("web"); // Tab selector on mobile
  const [mobileActiveTab, setMobileActiveTab] = useState<"agenda" | "video" | "chat" | "votos" | "gestion">("video");
  
  // Web session states
  const [juntaId, setJuntaId] = useState<string | null>(null);
  const [tituloAsamblea, setTituloAsamblea] = useState("Asamblea General de Copropietarios");
  const [activa, setActiva] = useState(true);
  const [ordenDia, setOrdenDia] = useState<AgendaItem[]>([]);
  const [itemActivoIndex, setItemActivoIndex] = useState(0);
  const [turnos, setTurnos] = useState<SpeakingTurn[]>([]);
  const [opiniones, setOpiniones] = useState<ResidentOpinion[]>([]);

  // WebRTC PeerJS & signaling states
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [peer, setPeer] = useState<any>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  
  // Pairing states
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<"PENDIENTE" | "VINCULADO" | "EXPIRADO">("PENDIENTE");

  // Teleprompter / AI Copilot states
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotData, setCopilotData] = useState<{
    guiaTeleprompter: string;
    sugerencias: string[];
    resumenSentimiento: string;
    alertaModeracion?: {
      type: 'REPETICION' | 'DIVAGACION';
      mensaje: string;
      sugerenciaAccion: string;
    } | null;
  }>({
    guiaTeleprompter: "Cargando guía de asamblea...",
    sugerencias: [
      "El moderador guiará la reunión y otorgará los turnos de habla.",
      "Los residentes pueden opinar o pedir el micrófono desde la app.",
      "Haz clic en 'Obtener sugerencias IA' para generar guiones y consejos."
    ],
    resumenSentimiento: "Falta recabar opiniones de los residentes en este punto.",
    alertaModeracion: null
  });

  // Teleprompter scrolling state
  const [prompterSpeed, setPrompterSpeed] = useState(1); // 1 = slow, 2 = medium, 3 = fast
  const [isPrompterScrolling, setIsPrompterScrolling] = useState(false);
  const prompterRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Resident web interface input
  const [opinionInput, setOpinionInput] = useState("");
  const [submittingOpinion, setSubmittingOpinion] = useState(false);

  // Mobile App simulator states
  const [mobileUserEmail, setMobileUserEmail] = useState("raulmontaño@conjuntos.com"); // default resident
  const [mobileSession, setMobileSession] = useState<{
    id: string;
    nombre: string;
    email: string;
    rol: string;
    apto: string;
  } | null>(null);
  const [mobileOpinionText, setMobileOpinionText] = useState("");
  const [mobilePairingInput, setMobilePairingInput] = useState("");
  const [mobileAuthorizing, setMobileAuthorizing] = useState(false);

  // New Assembly Intelligence state variables
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [poderes, setPoderes] = useState<any[]>([]);
  const [votaciones, setVotaciones] = useState<any[]>([]);
  const [subtitulos, setSubtitulos] = useState<any[]>([]);
  const [quorumPercentage, setQuorumPercentage] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [presentCoefficient, setPresentCoefficient] = useState(0);
  const [totalCoefficient, setTotalCoefficient] = useState(1);
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [speakingTimeLeft, setSpeakingTimeLeft] = useState<number | null>(null);

  // Power delegation form states (Mobile)
  const [mobileOtorganteId, setMobileOtorganteId] = useState("");
  const [submittingPoder, setSubmittingPoder] = useState(false);

  // Votations form states (Admin)
  const [votacionTituloInput, setVotacionTituloInput] = useState("");
  const [votacionDescripcionInput, setVotacionDescripcionInput] = useState("");
  const [votacionOpcionesInput, setVotacionOpcionesInput] = useState("SI, NO, ABSTENCION");
  const [votacionFormulaInput, setVotacionFormulaInput] = useState<'MAYORIA_SIMPLE' | 'QUORUM_CALIFICADO'>('MAYORIA_SIMPLE');
  const [votacionEsSecreto, setVotacionEsSecreto] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"chat" | "votos" | "gestion">("chat");
  const lastActiveVoteIdRef = useRef<string | null>(null);
  const [generatingConsensus, setGeneratingConsensus] = useState(false);
  const [subtitlesLanguage, setSubtitlesLanguage] = useState<"ES" | "EN" | "PT" | "FR">("ES");
  const [translatedSubtitleText, setTranslatedSubtitleText] = useState("");
  const [translatingSubtitles, setTranslatingSubtitles] = useState(false);
  const [showSubtitleNotification, setShowSubtitleNotification] = useState(false);

  // Post-Assembly / Minutes states
  const [actaLoading, setActaLoading] = useState(false);
  const [actaContent, setActaContent] = useState<string | null>(null);
  const [actaUrl, setActaUrl] = useState<string | null>(null);

  // Subtitles microphone state
  const [isSpeaking, setIsSpeaking] = useState(false);

  // WebRTC Video Conferencing states
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const dialedPeersRef = useRef<Record<string, number>>({});

  // Council members (Simulated active remote streams)
  const [councilFeeds, setCouncilFeeds] = useState([
    { id: "c1", nombre: "Dra. Carmen Cecilia", rol: "Presidenta Consejo", camaraActiva: true, microfonoActivo: true, apto: "T1 Apto 101", avatar: "👩‍💼" },
    { id: "c2", nombre: "Ing. Carlos Alberto", rol: "Vocal Consejo", camaraActiva: true, microfonoActivo: false, apto: "T2 Apto 304", avatar: "👨‍💼" },
    { id: "c3", nombre: "Dra. Liliana Patricia", rol: "Revisor Fiscal", camaraActiva: false, microfonoActivo: false, apto: "T1 Apto 402", avatar: "👩‍💻" }
  ]);

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localStream]);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsCameraActive(true);
      setIsMuted(false);
      toast.success("Cámara y micrófono conectados");
    } catch (e) {
      console.warn("No se pudo iniciar cámara/micrófono real. Usando simulación.");
      setIsCameraActive(true); // simulate
      setIsMuted(false);
      toast.info("Acceso denegado o sin dispositivos. Se activó avatar interactivo.");
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
    }
    setIsMuted(!isMuted);
    toast.info(!isMuted ? "Micrófono silenciado" : "Micrófono activado");
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraActive(!isCameraActive);
      toast.info(!isCameraActive ? "Cámara activada" : "Cámara desactivada");
    } else {
      startVideo();
    }
  };

  useEffect(() => {
    if (localStream) {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      if (mobileVideoRef.current) {
        mobileVideoRef.current.srcObject = localStream;
      }
    }
  }, [localStream, status, mobileSession]);

  // WebRTC PeerJS connection & signaling
  const myUserId = session?.user?.id || mobileSession?.id || null;

  useEffect(() => {
    if (!myUserId) return;

    let activePeer: any = null;
    import('peerjs').then(({ default: Peer }) => {
      const p = new Peer(myUserId, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turns:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ]
        }
      });

      p.on('open', (id) => {
        console.log('PeerJS connection established with ID:', id);
        setPeer(p);
        activePeer = p;
      });

      p.on('call', (call: any) => {
        if (!call) return;
        console.log('Incoming call from peer:', call.peer);
        call.answer(localStream || new MediaStream());
        call.on('stream', (remoteStream: MediaStream) => {
          console.log('Received stream from peer:', call.peer);
          setRemoteStreams(prev => ({ ...prev, [call.peer]: remoteStream }));
        });
      });
      
      p.on('error', (err) => {
        console.error('PeerJS connection error:', err);
      });
    });

    return () => {
      if (activePeer) {
        activePeer.destroy();
      }
    };
  }, [myUserId, localStream]);

  // Clear remote streams cache on local stream changes to force re-dialing
  useEffect(() => {
    setRemoteStreams({});
  }, [localStream]);

  // WebRTC Dialing Effect
  useEffect(() => {
    if (!peer || !myUserId) return;

    const now = Date.now();
    const COOLDOWN_MS = 15000; // 15 seconds cooldown between dial attempts for the same peer

    // 1. Dial the Administrator
    if (adminUserId && adminUserId !== myUserId && !remoteStreams[adminUserId]) {
      const lastDial = dialedPeersRef.current[adminUserId] || 0;
      if (now - lastDial > COOLDOWN_MS) {
        dialedPeersRef.current[adminUserId] = now;
        console.log('Dialing Admin:', adminUserId);
        try {
          const call = peer.call(adminUserId, localStream || new MediaStream());
          if (call) {
            call.on('stream', (remoteStream: MediaStream) => {
              setRemoteStreams(prev => ({ ...prev, [adminUserId]: remoteStream }));
            });
            call.on('error', (err: any) => {
              console.error('Call to Admin error:', err);
            });
          }
        } catch (err) {
          console.error('Failed to call Admin:', err);
        }
      }
    }

    // 2. Dial the Active Speaker
    const activeSpeaker = turnos.find((t: any) => t.estado === "HABLANDO");
    if (activeSpeaker && activeSpeaker.usuarioId !== myUserId && activeSpeaker.usuarioId !== adminUserId && !remoteStreams[activeSpeaker.usuarioId]) {
      const targetId = activeSpeaker.usuarioId;
      const lastDial = dialedPeersRef.current[targetId] || 0;
      if (now - lastDial > COOLDOWN_MS) {
        dialedPeersRef.current[targetId] = now;
        console.log('Dialing Active Speaker:', targetId);
        try {
          const call = peer.call(targetId, localStream || new MediaStream());
          if (call) {
            call.on('stream', (remoteStream: MediaStream) => {
              setRemoteStreams(prev => ({ ...prev, [targetId]: remoteStream }));
            });
            call.on('error', (err: any) => {
              console.error('Call to Active Speaker error:', err);
            });
          }
        } catch (err) {
          console.error('Failed to call Active Speaker:', err);
        }
      }
    }
  }, [peer, adminUserId, turnos, remoteStreams, myUserId, localStream]);

  // Automatically adjust isDemoMode according to the user's authentication state
  useEffect(() => {
    if (status === "authenticated") {
      setIsDemoMode(false);
    } else if (status === "unauthenticated") {
      setIsDemoMode(true);
    }
  }, [status]);

  // Sync activeRightTab with mobileActiveTab when they transition
  useEffect(() => {
    if (["chat", "votos", "gestion"].includes(mobileActiveTab)) {
      setActiveRightTab(mobileActiveTab as any);
    }
  }, [mobileActiveTab]);

  useEffect(() => {
    setMobileActiveTab(activeRightTab as any);
  }, [activeRightTab]);

  // Initial loading
  useEffect(() => {
    fetchSession();
    
    // Poll session details every 3 seconds
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, []);

  // Speaking timer countdown effect
  useEffect(() => {
    const activeSpeaker = turnos.find((t: any) => t.estado === "HABLANDO");
    if (!activeSpeaker) {
      setSpeakingTimeLeft(null);
      return;
    }

    const totalLimit = 120; // 2 minutes limit in seconds
    const calcTimeLeft = () => {
      if (activeSpeaker.iniciadoHablarEn) {
        const elapsed = Math.floor((Date.now() - new Date(activeSpeaker.iniciadoHablarEn).getTime()) / 1000);
        return Math.max(0, totalLimit - elapsed);
      }
      return totalLimit;
    };

    setSpeakingTimeLeft(calcTimeLeft());

    const timer = setInterval(() => {
      setSpeakingTimeLeft(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [turnos]);

  // Auto-mute active speaker if time runs out (triggered on Admin side)
  useEffect(() => {
    if (isWebAdmin && speakingTimeLeft === 0) {
      const activeSpeaker = turnos.find((t: any) => t.estado === "HABLANDO");
      if (activeSpeaker) {
        toast.warning(`Tiempo agotado para ${activeSpeaker.nombre}. Silenciando automáticamente...`);
        handleCompleteTurn(activeSpeaker.id);
      }
    }
  }, [speakingTimeLeft, isWebAdmin, turnos]);

  // Fetch session data
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/asamblea/session");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setJuntaId(data.juntaId);
        setTituloAsamblea(data.titulo);
        setActiva(data.activa);
        setOrdenDia(data.ordenDia || []);
        setItemActivoIndex(data.itemActivoIndex ?? 0);
        setAdminUserId(data.adminUserId || null);
      }
      
      // Fetch turns (publicly accessible)
      const resTurnos = await fetch("/api/asamblea/turnos");
      if (resTurnos.ok) {
        const dataTurnos = await resTurnos.json();
        if (dataTurnos.success) {
          setTurnos(dataTurnos.turnos || []);
        }
      }

      // Fetch opinions (publicly accessible)
      const resOpiniones = await fetch("/api/asamblea/opiniones");
      if (resOpiniones.ok) {
        const dataOpiniones = await resOpiniones.json();
        if (dataOpiniones.success) {
          setOpiniones(dataOpiniones.opiniones || []);
        }
      }

      // Si no está autenticado, no consultar el resto de endpoints seguros
      if (status !== "authenticated") {
        return;
      }

      // Fetch assistance / quorum
      const resAsist = await fetch("/api/asamblea/asistencia");
      if (resAsist.ok) {
        const dataAsist = await resAsist.json();
        if (dataAsist.success) {
          setAsistencias(dataAsist.asistencias || []);
          setQuorumPercentage(dataAsist.quorumPercentage || 0);
          setTotalUnits(dataAsist.totalUnits || 0);
          setPresentCoefficient(dataAsist.presentCoefficient || 0);
          setTotalCoefficient(dataAsist.totalCoefficient || 1);
        }
      }

      // Fetch powers
      const resPoderes = await fetch("/api/asamblea/poderes");
      if (resPoderes.ok) {
        const dataPoderes = await resPoderes.json();
        if (dataPoderes.success) {
          setPoderes(dataPoderes.poderes || []);
        }
      }

      // Fetch votations
      const resVot = await fetch("/api/asamblea/votaciones");
      if (resVot.ok) {
        const dataVot = await resVot.json();
        if (dataVot.success) {
          setVotaciones(dataVot.votaciones || []);
        }
      }

      // Fetch subtitle transcripts if any
      if (data.success && data.juntaId) {
        const resActaData = await fetch("/api/asamblea/acta");
        if (resActaData.ok) {
          const dataActaData = await resActaData.json();
          if (dataActaData.success) {
            setActaContent(dataActaData.actaContent);
            setActaUrl(dataActaData.actaUrl);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to fetch assembly updates (likely offline or server rebuild):", e);
    }
  };
  
  useEffect(() => {
    const activeVote = votaciones.find(v => v.activa);
    if (activeVote && activeVote.id !== lastActiveVoteIdRef.current) {
      lastActiveVoteIdRef.current = activeVote.id;
      setActiveRightTab("votos");
      toast.info(`Nueva votación activa: "${activeVote.titulo}"`);
    } else if (!activeVote) {
      lastActiveVoteIdRef.current = null;
    }
  }, [votaciones]);

  // Pairing: Poll pairing status if logged out on Web
  useEffect(() => {
    if (status === "unauthenticated" && !pairingCode) {
      // Create code
      createPairingCode();
    }

    if (status === "unauthenticated" && pairingCode) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/asamblea/pairing?code=${pairingCode}`);
          const data = await res.json();
          if (data.success && data.status === "VINCULADO") {
            setPairingStatus("VINCULADO");
            toast.success("¡Dispositivo vinculado! Iniciando sesión...");
            clearInterval(interval);
            
            // Sign in automatically
            await signIn("credentials", {
              email: data.email,
              password: data.password,
              redirect: false
            });
            toast.success("Sesión iniciada con éxito.");
            router.refresh();
          } else if (data.success && data.status === "EXPIRADO") {
            setPairingStatus("EXPIRADO");
            setPairingCode(null);
            clearInterval(interval);
          }
        } catch (e) {
          console.error("Error polling pairing status:", e);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [status, pairingCode]);

  const createPairingCode = async () => {
    try {
      const res = await fetch("/api/asamblea/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" })
      });
      const data = await res.json();
      if (data.success) {
        setPairingCode(data.code);
        setPairingStatus("PENDIENTE");
      }
    } catch (e) {
      toast.error("Error al generar código de vinculación");
    }
  };

  const recognitionRef = useRef<any>(null);

  // AI Copilot trigger
  const triggerCopilot = async (overrideOpiniones?: any[], overrideTranscripcion?: string) => {
    if (ordenDia.length === 0) return;
    setCopilotLoading(true);
    try {
      const activeItem = ordenDia[itemActivoIndex];
      const currentOpinions = overrideOpiniones || opiniones;
      const currentTranscripcion = overrideTranscripcion || (subtitulos && subtitulos.length > 0 ? subtitulos[subtitulos.length - 1].text : "");
      
      const res = await fetch("/api/asamblea/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agendaItem: activeItem,
          opiniones: currentOpinions,
          transcripcion: currentTranscripcion
        })
      });
      const data = await res.json();
      if (data.success && data.copilotData) {
        setCopilotData(data.copilotData);
        toast.info("Copiloto IA: Sugerencias actualizadas");
      } else {
        toast.error("El Copiloto IA no pudo procesar la solicitud");
      }
    } catch (e) {
      toast.error("Error de conexión con el Copiloto IA");
    } finally {
      setCopilotLoading(false);
    }
  };

  // Automatically trigger Copilot when agenda point changes
  useEffect(() => {
    if (session && ((session.user as any).role === "ADMINISTRADOR" || (session.user as any).role === "SUPER_ADMIN")) {
      triggerCopilot();
    }
  }, [itemActivoIndex, session]);

  // Teleprompter scroller
  useEffect(() => {
    if (isPrompterScrolling) {
      scrollIntervalRef.current = setInterval(() => {
        if (prompterRef.current) {
          prompterRef.current.scrollTop += prompterSpeed;
          // Loop scroll if at end
          if (prompterRef.current.scrollTop + prompterRef.current.clientHeight >= prompterRef.current.scrollHeight - 5) {
            prompterRef.current.scrollTop = 0;
          }
        }
      }, 50);
    } else {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    }
    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, [isPrompterScrolling, prompterSpeed]);

  // Real-time simultaneous translation of subtitles
  useEffect(() => {
    if (!subtitulos || subtitulos.length === 0) {
      setTranslatedSubtitleText("");
      return;
    }
    const lastSubText = subtitulos[subtitulos.length - 1].text;
    if (subtitlesLanguage === "ES") {
      setTranslatedSubtitleText(lastSubText);
      return;
    }

    let active = true;
    const translateText = async () => {
      setTranslatingSubtitles(true);
      try {
        const response = await fetch("/api/asamblea/copilot/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: lastSubText, targetLang: subtitlesLanguage }),
        });
        const data = await response.json();
        if (active) {
          if (data.success && data.translatedText) {
            setTranslatedSubtitleText(data.translatedText);
          } else {
            setTranslatedSubtitleText(`[${subtitlesLanguage}] ${lastSubText}`);
          }
        }
      } catch (err) {
        console.error("Error translating subtitle:", err);
        if (active) {
          setTranslatedSubtitleText(`[${subtitlesLanguage}] ${lastSubText}`);
        }
      } finally {
        if (active) {
          setTranslatingSubtitles(false);
        }
      }
    };

    translateText();

    return () => {
      active = false;
    };
  }, [subtitulos, subtitlesLanguage]);

  // Manage subtitle notification visibility timeout
  useEffect(() => {
    if (!subtitulos || subtitulos.length === 0) {
      setShowSubtitleNotification(false);
      return;
    }
    setShowSubtitleNotification(true);
    
    const timer = setTimeout(() => {
      setShowSubtitleNotification(false);
    }, 6000); // Hide after 6 seconds of silence
    
    return () => clearTimeout(timer);
  }, [subtitulos]);

  // Admin controls
  const handleAgendaSelect = async (index: number) => {
    setItemActivoIndex(index);
    try {
      await fetch("/api/asamblea/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemActivoIndex: index })
      });
      // Mark active item as EN_CURSO, and previous items as COMPLETADO
      const updatedAgenda = ordenDia.map((item, idx) => {
        if (idx === index) return { ...item, estado: "EN_CURSO" as const };
        if (idx < index) return { ...item, estado: "COMPLETADO" as const };
        return { ...item, estado: "PENDIENTE" as const };
      });
      setOrdenDia(updatedAgenda);
      await fetch("/api/asamblea/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordenDia: updatedAgenda })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateAgendaOrder = async (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === ordenDia.length - 1) return;

    const newAgenda = [...ordenDia];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const temp = newAgenda[index];
    newAgenda[index] = newAgenda[targetIdx];
    newAgenda[targetIdx] = temp;

    setOrdenDia(newAgenda);
    try {
      await fetch("/api/asamblea/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordenDia: newAgenda })
      });
      toast.success("Orden del día reordenado");
    } catch (e) {
      console.error(e);
    }
  };

  const handleGrantMic = async (turnId: string) => {
    try {
      const res = await fetch("/api/asamblea/turnos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId, estado: "HABLANDO" })
      });
      const data = await res.json();
      if (data.success) {
        setTurnos(data.turnos);
        toast.info("Micrófono concedido");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCompleteTurn = async (turnId: string) => {
    try {
      const res = await fetch("/api/asamblea/turnos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId, estado: "COMPLETADO" })
      });
      const data = await res.json();
      if (data.success) {
        setTurnos(data.turnos);
        toast.info("Turno finalizado");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Resident actions (Web View)
  const handleRequestSpeak = async () => {
    try {
      const res = await fetch("/api/asamblea/turnos", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTurnos(data.turnos);
        toast.success("¡Solicitud de palabra enviada!");
      } else {
        toast.error(data.error || "No se pudo solicitar el turno");
      }
    } catch (e) {
      toast.error("Error de conexión");
    }
  };

  const handleSubmitOpinion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opinionInput.trim() || submittingOpinion) return;
    setSubmittingOpinion(true);
    try {
      const res = await fetch("/api/asamblea/opiniones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: opinionInput })
      });
      const data = await res.json();
      if (data.success) {
        setOpiniones(data.opiniones);
        setOpinionInput("");
        toast.success("Opinión enviada en vivo");
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error("Error de red");
    } finally {
      setSubmittingOpinion(false);
    }
  };

  // CHECK-IN & ATTENDANCE ACTIONS
  const handleCheckIn = async (tipo: 'PRESENCIAL' | 'VIRTUAL', targetUserId?: string) => {
    setSubmittingCheckIn(true);
    try {
      const res = await fetch("/api/asamblea/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, usuarioId: targetUserId })
      });
      const data = await res.json();
      if (data.success) {
        setAsistencias(data.asistencias);
        toast.success("Asistencia registrada correctamente");
        fetchSession(); // reload metrics
      } else {
        toast.error(data.error || "Error al registrar asistencia");
      }
    } catch (e) {
      toast.error("Error de conexión");
    } finally {
      setSubmittingCheckIn(false);
    }
  };

  // POWER DELEGATION ACTIONS
  const handleOtorgarPoder = async () => {
    if (!mobileOtorganteId || !mobileSession) return;
    setSubmittingPoder(true);
    try {
      const res = await fetch("/api/asamblea/poderes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otorganteId: mobileOtorganteId,
          apoderadoId: mobileSession.id,
          documentoUrl: "mock_signature_delegation_mandate_" + Date.now()
        })
      });
      const data = await res.json();
      if (data.success) {
        setPoderes(data.poderes);
        setMobileOtorganteId("");
        toast.success("Poder de representación enviado para aprobación del administrador");
      } else {
        toast.error(data.error || "Error al enviar poder");
      }
    } catch (e) {
      toast.error("Error de conexión");
    } finally {
      setSubmittingPoder(false);
    }
  };

  const handleAprobarPoder = async (powerId: string, verificado: boolean, rechazado: boolean = false) => {
    try {
      const res = await fetch("/api/asamblea/poderes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ powerId, verificado, rechazado })
      });
      const data = await res.json();
      if (data.success) {
        setPoderes(data.poderes);
        toast.success(rechazado ? "Poder rechazado y eliminado" : "Poder verificado correctamente");
        fetchSession();
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error("Error de conexión");
    }
  };

  const handleGenerateConsensusProposal = async () => {
    const activeAgendaItem = ordenDia[itemActivoIndex];
    if (!activeAgendaItem) {
      toast.error("No hay un punto activo en el orden del día");
      return;
    }

    setGeneratingConsensus(true);
    try {
      // Get active speaker's name or active speech
      const activeSpeaker = turnos.find((t: any) => t.estado === "HABLANDO");
      const currentSpeech = activeSpeaker ? `El residente ${activeSpeaker.nombre} está opinando.` : undefined;

      const res = await fetch("/api/asamblea/copilot/consensuar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agendaItem: activeAgendaItem,
          opiniones: opiniones,
          transcripcion: currentSpeech
        })
      });
      const data = await res.json();
      if (data.success && data.proposal) {
        setVotacionTituloInput(data.proposal.titulo || "");
        setVotacionDescripcionInput(data.proposal.descripcion || "");
        if (data.proposal.opciones && Array.isArray(data.proposal.opciones)) {
          setVotacionOpcionesInput(data.proposal.opciones.join(", "));
        }
        toast.success("¡Propuesta de consenso redactada por la IA!");
      } else {
        toast.error(data.error || "No se pudo generar la propuesta");
      }
    } catch (e) {
      toast.error("Error al conectar con la IA");
    } finally {
      setGeneratingConsensus(false);
    }
  };

  // VOTATIONS ACTIONS
  const handleCrearVotacion = async () => {
    if (!votacionTituloInput.trim()) return;
    try {
      const optionsArray = votacionOpcionesInput
        .split(",")
        .map(o => o.trim())
        .filter(o => o.length > 0);

      const res = await fetch("/api/asamblea/votaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: votacionTituloInput.trim(),
          descripcion: votacionDescripcionInput.trim() || undefined,
          opciones: optionsArray.length > 0 ? optionsArray : undefined,
          formula: votacionFormulaInput,
          esSecreto: votacionEsSecreto
        })
      });
      const data = await res.json();
      if (data.success) {
        setVotaciones(data.votaciones);
        setVotacionTituloInput("");
        setVotacionDescripcionInput("");
        setVotacionFormulaInput("MAYORIA_SIMPLE");
        setVotacionEsSecreto(false);
        toast.success("Propuesta de votación creada con éxito");
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error("Error de conexión");
    }
  };

  const handleActivarVotacion = async (votacionId: string, activa: boolean) => {
    try {
      const res = await fetch("/api/asamblea/votaciones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votacionId, activa })
      });
      const data = await res.json();
      if (data.success) {
        setVotaciones(data.votaciones);
        toast.success(activa ? "Votación lanzada a los residentes" : "Votación cerrada");
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error("Error de conexión");
    }
  };

  const handleVotar = async (votacionId: string, respuesta: string, simulateUserId?: string) => {
    try {
      const res = await fetch("/api/asamblea/votos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votacionId, respuesta, usuarioId: simulateUserId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Voto registrado ("${respuesta}") con firma digital`);
        fetchSession();
      } else {
        toast.error(data.error || "No se pudo registrar el voto");
      }
    } catch (e) {
      toast.error("Error de conexión");
    }
  };

  // POST-ASSEMBLY & AI ACTA
  const handleFinalizarAsamblea = async () => {
    setActaLoading(true);
    try {
      const res = await fetch("/api/asamblea/acta", {
        method: "POST"
      });
      const data = await res.json();
      if (data.success) {
        setActaContent(data.actaContent);
        setActaUrl(data.actaUrl);
        toast.success("Acta Oficial de la Asamblea redactada por IA");
      } else {
        toast.error(data.error || "No se pudo redactar el acta");
      }
    } catch (e) {
      toast.error("Error de conexión");
    } finally {
      setActaLoading(false);
    }
  };

  // WEB SPEECH API / LIVE SUBTITLES SIMULATION
  const startSpeakingSimulation = () => {
    setIsSpeaking(true);
    
    const phrases = [
      "Buenas noches a todos, empezamos el debate de la asamblea.",
      "Revisemos primero el cambio de administración de piscinas y las ofertas.",
      "Tenemos tres cotizaciones para la piscina, incluyendo la de Aquaservicios.",
      "Pasamos al tema de la cuota extraordinaria y mantenimiento de ascensores.",
      "Evaluemos si Otis o Schindler nos ofrecen mejores precios."
    ];
    
    let count = 0;
    const subInterval = setInterval(() => {
      const activeSpeaker = turnos.find((t: any) => t.estado === "HABLANDO");
      const speakerName = activeSpeaker ? activeSpeaker.nombre : (session?.user?.name || "Administrador");
      const nextPhrase = phrases[count % phrases.length];
      const newSub = {
        id: "sub_" + Date.now(),
        speaker: speakerName,
        text: nextPhrase,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setSubtitulos([newSub]);
      
      // Auto-trigger copilot suggestions based on what was said!
      triggerCopilot(opiniones, nextPhrase);

      // Also post as a chat opinion to simulate participant talking transcript
      fetch("/api/asamblea/opiniones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: `[Transcripción Voz] ${nextPhrase}` })
      }).then(r => r.json()).then(d => {
        if (d.success) setOpiniones(d.opiniones);
      });

      count++;
      if (count >= phrases.length) {
        clearInterval(subInterval);
        setIsSpeaking(false);
      }
    }, 6000);

    recognitionRef.current = subInterval;
  };

  const simulateSpeechTopic = (topic: string) => {
    let phrase = "";
    
    if (topic === "piscina") {
      phrase = "Iniciamos el debate sobre el cambio de administración de piscinas del conjunto.";
    } else if (topic === "ascensor") {
      phrase = "Procedemos a evaluar las cotizaciones presentadas para el mantenimiento preventivo de los ascensores Otis y Kone.";
    } else if (topic === "seguridad") {
      phrase = "Pasamos a debatir la contratación de la empresa de seguridad y vigilancia Atlas.";
    } else if (topic === "presupuesto") {
      phrase = "Abrimos la discusión sobre el proyecto de presupuesto 2026 y la cuota extraordinaria del muro.";
    } else if (topic === "repeticion") {
      phrase = "Repito e insisto, ya lo he dicho varias veces en esta asamblea, que el costo de Aquaservicios es demasiado elevado y no deberíamos contratar a esa empresa por ser excesivamente cara.";
    } else if (topic === "divagacion") {
      phrase = "Por cierto, hablando de las piscinas, quería comentar que los perros en el parqueadero andan sueltos y los dueños no limpian el excremento. Además deberíamos contratar más vigilantes para vigilar los vehículos.";
    }
    
    const activeSpeaker = turnos.find((t: any) => t.estado === "HABLANDO");
    const speakerName = activeSpeaker ? activeSpeaker.nombre : (session?.user?.name || "Administrador");

    const newSub = {
      id: "sub_" + Date.now(),
      speaker: speakerName,
      text: phrase,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setSubtitulos([newSub]);
    
    // Automatically trigger Copilot with this topic text!
    triggerCopilot(opiniones, phrase);
    
    // Also post to opinions to simulate voice transcription appearing in the log
    fetch("/api/asamblea/opiniones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: `[Transcripción Voz] ${phrase}` })
    }).then(r => r.json()).then(d => {
      if (d.success) setOpiniones(d.opiniones);
    });

    toast.success(`Discutiendo: ${topic.toUpperCase()} (IA sugerirá licitantes y precios en subtítulos)`);
  };

  const handleToggleSpeaking = () => {
    if (isSpeaking) {
      if (recognitionRef.current) {
        if (typeof recognitionRef.current === "object" && typeof recognitionRef.current.stop === "function") {
          recognitionRef.current.stop();
        } else {
          clearInterval(recognitionRef.current);
        }
      }
      setIsSpeaking(false);
      toast.info("Micrófono cerrado para subtítulos");
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = "es-ES";
          recognition.interimResults = false;
          recognition.maxAlternatives = 1;
          recognition.continuous = true;

          recognition.onstart = () => {
            setIsSpeaking(true);
            toast.success("Micrófono abierto. Habla para generar subtítulos reales y disparar sugerencias IA...");
          };

          recognition.onresult = (event: any) => {
            const resultText = event.results[event.results.length - 1][0].transcript;
            const newSub = {
              id: "sub_" + Date.now(),
              speaker: session?.user?.name || "Administrador",
              text: resultText,
              timestamp: new Date().toLocaleTimeString()
            };
            
            setSubtitulos([newSub]);
            
            // Auto-trigger copilot suggestions based on what was said!
            triggerCopilot(opiniones, resultText);
          };

          recognition.onerror = (event: any) => {
            console.error("Speech Recognition Error:", event.error);
            if (event.error === "not-allowed") {
              toast.warning("Acceso a micrófono no permitido. Iniciando simulación de voz...");
              startSpeakingSimulation();
            }
          };

          recognition.onend = () => {
            setIsSpeaking(false);
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn("Reconocimiento de voz falló al iniciar. Usando simulación.");
          startSpeakingSimulation();
        }
      } else {
        toast.info("Navegador sin Web Speech API nativo. Iniciando simulación...");
        startSpeakingSimulation();
      }
    }
  };

  // MOBILE SIMULATOR LOGIC
  const handleMobileLogin = async () => {
    // Simulated credential check based on seeded users
    const profiles: Record<string, { id: string, nombre: string, email: string, rol: string, apto: string, pass: string }> = {
      "raulmontaño@conjuntos.com": { id: "usr_01ovtd", nombre: "Raúl Montaño", email: "raulmontaño@conjuntos.com", rol: "PROPIETARIO", apto: "Torre 1 Apto 502", pass: "Md5891129Ae$" },
      "thommyadmin@example.com": { id: "usr_thommyadmin", nombre: "Thommy Admin", email: "thommyadmin@example.com", rol: "ADMINISTRADOR", apto: "Oficina Administración", pass: "Md5891129Ae$" },
      "thommy@example.com": { id: "usr_thommy", nombre: "Thommy Master", email: "thommy@example.com", rol: "SUPER_ADMIN", apto: "Penthouse", pass: "Md5891129Ae$" }
    };

    const user = profiles[mobileUserEmail];
    if (user) {
      setMobileSession(user);
      toast.success(`Logueado en celular como ${user.nombre}`);
    } else {
      toast.error("Usuario no reconocido");
    }
  };

  const handleMobilePairing = async () => {
    if (!mobilePairingInput || !mobileSession) return;
    setMobileAuthorizing(true);
    try {
      const res = await fetch("/api/asamblea/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "authorize",
          code: mobilePairingInput,
          email: mobileSession.email,
          password: (mobileSession as any).pass || "Md5891129Ae$",
          usuarioId: mobileSession.id
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("¡Web Autorizada! Iniciando sesión en navegador...");
        setMobilePairingInput("");
      } else {
        toast.error(data.error || "Código inválido");
      }
    } catch (e) {
      toast.error("Error de comunicación");
    } finally {
      setMobileAuthorizing(false);
    }
  };

  const handleMobileQuickPair = async () => {
    if (!pairingCode || !mobileSession) return;
    setMobilePairingInput(pairingCode);
    toast.info("Código auto-completado en celular");
  };

  const handleMobileSubmitOpinion = async () => {
    if (!mobileOpinionText.trim() || !mobileSession) return;
    try {
      // Mock opinion submit simulating mobile request bypassing next-auth (manually crafting POST to API with header if we wanted to bypass, but we'll call endpoint representing mobile session)
      // To simulate it correctly, we can send a custom API request
      const res = await fetch("/api/asamblea/opiniones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contenido: `[Celular] ${mobileOpinionText}`,
          usuarioId: mobileSession.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setOpiniones(data.opiniones);
        setMobileOpinionText("");
        toast.success("Comentario enviado desde celular");
        fetchSession();
      }
    } catch (e) {
      toast.error("Error al enviar desde celular");
    }
  };

  const handleMobileRequestSpeak = async () => {
    if (!mobileSession) return;
    try {
      const res = await fetch("/api/asamblea/turnos", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: mobileSession.id })
      });
      const data = await res.json();
      if (data.success) {
        setTurnos(data.turnos);
        toast.success("Palabra solicitada desde celular");
        fetchSession();
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error("Error de red");
    }
  };

  const activeAgendaItem = ordenDia[itemActivoIndex] || { titulo: "Sin orden del día", descripcion: "" };

  if (status === "authenticated") {
    return (
      <div className="w-screen h-screen bg-[#fafaf8] font-sans text-stone-800 relative overflow-hidden flex flex-col">
        {/* Main Grid: split-screen or 100% */}
        <div className={`w-full h-full grid grid-cols-1 ${isDemoMode ? "lg:grid-cols-4" : "grid-cols-1"} items-stretch relative z-10`}>
          
          {/* Main Desktop Container (takes 3 cols in demo mode, or all when unique mode) */}
          <div className={`${isDemoMode ? "lg:col-span-3" : "col-span-1"} bg-white flex h-full relative overflow-hidden`}>
            
            {/* 1. Left Vertical Sidebar (w-18) */}
            <div className="hidden md:flex w-18 bg-white border-r border-stone-200 flex-col justify-between items-center py-6 shrink-0 z-20">
              {/* Top Logo */}
              <button 
                onClick={() => router.push("/inicio")}
                className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-purple-500/20 hover:scale-105 transition-all cursor-pointer"
                title="Volver a Inicio"
              >
                CO
              </button>
              
              {/* Navigation Icons */}
              <div className="flex flex-col gap-5">
                <button onClick={() => router.push("/inicio")} className="p-3 text-stone-400 hover:text-stone-700 hover:bg-stone-50 rounded-xl transition-all cursor-pointer" title="Inicio">
                  <Home size={20} />
                </button>
                <button 
                  onClick={() => router.push("/reservas")}
                  className="p-3 text-stone-400 hover:text-stone-700 hover:bg-stone-50 rounded-xl transition-all cursor-pointer" 
                  title="Calendario y Reservas"
                >
                  <Calendar size={20} />
                </button>
                <button 
                  onClick={() => {
                    if (isDemoMode) {
                      setIsDemoMode(false);
                    }
                    setActiveRightTab("chat");
                  }}
                  className={`p-3 rounded-xl transition-all cursor-pointer ${activeRightTab === "chat" ? "text-indigo-600 bg-indigo-50" : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"}`} 
                  title="Chat de Asamblea"
                >
                  <MessageSquare size={20} />
                </button>
                <button 
                  onClick={() => {
                    if (isDemoMode) {
                      setIsDemoMode(false);
                    }
                    setActiveRightTab("votos");
                  }}
                  className={`p-3 rounded-xl transition-all cursor-pointer ${activeRightTab === "votos" ? "text-purple-600 bg-purple-50" : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"}`} 
                  title="Votaciones"
                >
                  <CheckCircle size={20} />
                </button>
                <button 
                  onClick={() => {
                    if (isDemoMode) {
                      setIsDemoMode(false);
                    }
                    setActiveRightTab("gestion");
                  }}
                  className={`p-3 rounded-xl transition-all cursor-pointer ${activeRightTab === "gestion" ? "text-emerald-600 bg-emerald-50" : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"}`} 
                  title="Gestión y Asistencia"
                >
                  <Shield size={20} />
                </button>
              </div>
              
              {/* Bottom User Avatar */}
              <div className="flex flex-col items-center gap-4">
                {/* Demo Mode Toggle (small icon size) */}
                <button 
                  onClick={() => setIsDemoMode(!isDemoMode)} 
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${isDemoMode ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-stone-50 border-stone-200 text-stone-400 hover:text-stone-600'}`}
                  title={isDemoMode ? "Modo Único (Pantalla Completa)" : "Modo Demo (Celular)"}
                >
                  <Smartphone size={16} />
                </button>
                <div className="w-10 h-10 rounded-full bg-indigo-100 border border-stone-200 flex items-center justify-center font-bold text-stone-700 text-sm shadow-sm" title={session?.user?.name || "Usuario"}>
                  {session?.user?.name?.[0] || "U"}
                </div>
              </div>
            </div>

            {/* Main workspace container */}
            <div className="flex-1 flex flex-col min-w-0 bg-white relative pb-16 md:pb-0">
              
              {/* 2. Topbar */}
              <div className="h-16 border-b border-stone-200 bg-white px-6 flex justify-between items-center shrink-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    ● Grabando [40:12:32]
                  </div>
                  <h2 className="text-sm font-bold text-stone-800 truncate max-w-[250px] md:max-w-[400px]">
                    {tituloAsamblea}
                  </h2>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Copy meeting link component */}
                  <div className="hidden sm:flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-500">
                    <span className="font-mono select-all truncate max-w-[120px]">meet.conjuntos.com/asamblea</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText("https://meet.conjuntos.com/asamblea");
                        toast.success("Enlace de reunión copiado");
                      }}
                      className="p-1 hover:bg-stone-200 rounded-md transition-colors text-stone-400 hover:text-stone-600 cursor-pointer"
                      title="Copiar Enlace"
                    >
                      <Share2 size={12} />
                    </button>
                  </div>
                  
                  {/* Invite neighbors action button */}
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText("https://meet.conjuntos.com/asamblea");
                      toast.success("Enlace de invitación copiado al portapapeles");
                    }}
                    className="bg-stone-950 hover:bg-stone-900 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <UserPlus size={13} />
                    <span>Invitar Copropietario</span>
                  </button>
                </div>
              </div>

              {/* 3. Columns Section */}
              <div className="flex-1 flex overflow-hidden bg-white">
                
                {/* Column 1: Order of the Day / Agenda (20%) */}
                <div className={`border-r border-stone-200 bg-[#fafaf8] p-5 flex-col gap-4 overflow-y-auto shrink-0 ${
                  mobileActiveTab === "agenda" ? "flex flex-1 w-full" : "hidden md:flex w-[20%]"
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Orden del Día</span>
                    <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold px-2 py-0.5 rounded-full">
                      {ordenDia.filter(item => item.estado === 'COMPLETADO').length}/{ordenDia.length} Completados
                    </span>
                  </div>
                  
                  {/* Speaker Turn Box */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-3 flex flex-col gap-2.5 shadow-xs">
                    <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block">Orador en Turno</span>
                    {(() => {
                      const activeSpeaker = turnos.find(t => t.estado === "HABLANDO");
                      const speakingUser = activeSpeaker || { id: "admin", nombre: "Thommy Admin", apto: "Administración", iniciadoHablarEn: new Date().toISOString() };
                      
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                              {getInitials(speakingUser.nombre)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold text-stone-800 truncate leading-none mb-1">{speakingUser.nombre}</p>
                              <p className="text-[9px] text-stone-400 uppercase tracking-wider">{speakingUser.apto || "Consejo"}</p>
                            </div>
                            {activeSpeaker && speakingTimeLeft !== null && (
                              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                                speakingTimeLeft <= 20 ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-stone-50 text-stone-600'
                              }`}>
                                {Math.floor(speakingTimeLeft / 60)}:{(speakingTimeLeft % 60).toString().padStart(2, '0')}
                              </span>
                            )}
                          </div>
                          
                          {/* Admin complete/mute button */}
                          {isWebAdmin && activeSpeaker && (
                            <button
                              onClick={() => handleCompleteTurn(activeSpeaker.id)}
                              className="w-full py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                            >
                              <MicOff size={11} />
                              <span>Terminar Turno (Silenciar)</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Speaker Queue Box */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-3 flex flex-col gap-2 shadow-xs">
                    <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block">Cola de Peticiones de Palabra</span>
                    {(() => {
                      const pendingTurns = turnos.filter(t => t.estado === "PENDIENTE");
                      if (pendingTurns.length === 0) {
                        return <p className="text-[10px] text-stone-400 italic py-1 text-center">No hay solicitudes.</p>;
                      }
                      
                      return (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                          {pendingTurns.map((turn, index) => {
                            const isMyTurn = turn.usuarioId === session?.user?.id;
                            return (
                              <div key={turn.id} className={`flex justify-between items-center p-2 rounded-xl border text-xs ${
                                isMyTurn ? 'bg-indigo-50/50 border-indigo-200' : 'bg-stone-50 border-stone-100'
                              }`}>
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-stone-700 truncate leading-tight">{turn.nombre}</p>
                                  <p className="text-[8px] text-stone-400 font-medium">{turn.apto || "Vecino"} • Cola #{index + 1}</p>
                                </div>
                                
                                {isWebAdmin ? (
                                  <button
                                    onClick={() => handleGrantMic(turn.id)}
                                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer shrink-0"
                                  >
                                    Ceder Mic
                                  </button>
                                ) : isMyTurn ? (
                                  <span className="text-[8px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Tú</span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Timeline list */}
                  <div className="flex flex-col gap-2 flex-1">
                    {ordenDia.map((item, idx) => {
                      const isActive = idx === itemActivoIndex;
                      const isCompleted = item.estado === 'COMPLETADO';
                      return (
                        <div 
                          key={item.id}
                          onClick={() => {
                            if (isWebAdmin) {
                              handleAgendaSelect(idx);
                            }
                          }}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isWebAdmin ? "cursor-pointer" : ""
                          } ${
                            isActive 
                              ? 'bg-white border-indigo-400 shadow-sm ring-2 ring-indigo-100/50' 
                              : isCompleted
                              ? 'bg-stone-50 border-stone-200/60 opacity-60 hover:opacity-85'
                              : 'bg-white border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex gap-2">
                              {isCompleted ? (
                                <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                              ) : isActive ? (
                                <span className="w-3.5 h-3.5 rounded-full bg-indigo-500 shrink-0 mt-0.5 flex items-center justify-center text-[8px] font-black text-white animate-pulse">●</span>
                              ) : (
                                <Circle size={15} className="text-stone-300 shrink-0 mt-0.5" />
                              )}
                              <span className={`text-[11px] font-bold leading-snug ${isActive ? 'text-stone-900' : 'text-stone-600'}`}>
                                {item.titulo}
                              </span>
                            </div>
                            
                            {/* Admin ordering buttons */}
                            {isWebAdmin && (
                              <div className="flex gap-0.5 shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                                <button 
                                  onClick={() => handleUpdateAgendaOrder(idx, "up")}
                                  disabled={idx === 0}
                                  className="p-0.5 hover:bg-stone-100 rounded text-stone-400 disabled:opacity-20"
                                >
                                  <ChevronUp size={11} />
                                </button>
                                <button 
                                  onClick={() => handleUpdateAgendaOrder(idx, "down")}
                                  disabled={idx === ordenDia.length - 1}
                                  className="p-0.5 hover:bg-stone-100 rounded text-stone-400 disabled:opacity-20"
                                >
                                  <ChevronDown size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                          {item.descripcion && (
                            <p className="text-[9.5px] text-stone-400 mt-1 leading-normal ml-5">
                              {item.descripcion}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Video Stage & Controls */}
                <div className={`p-5 overflow-y-auto bg-[#fdfdfb] gap-4 ${
                  mobileActiveTab === "video" ? "flex flex-1 flex-col w-full" : "hidden md:flex md:flex-1 md:flex-col"
                }`}>
                  <div className="flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                      <span className="text-[10px] font-black text-stone-500 uppercase tracking-wider">Spotlight Principal</span>
                    </div>
                  </div>

                  {/* Spotlight Box */}
                  {(() => {
                    const activeSpeaker = turnos.find(t => t.estado === "HABLANDO");
                    const isResidentActive = !!activeSpeaker;
                    const spotlightName = activeSpeaker ? activeSpeaker.nombre : "Thommy Admin";
                    const spotlightApto = activeSpeaker ? (activeSpeaker.apto || "N/A") : "Administración";
                    
                    return (
                      <div className="relative w-full aspect-video rounded-[28px] overflow-hidden bg-stone-900 border border-stone-200 shadow-lg flex flex-col justify-center items-center group max-h-[70vh]">
                        {isResidentActive ? (
                          (!isWebAdmin && isCameraActive && localStream && activeSpeaker.usuarioId === session?.user?.id) ? (
                            <video ref={localVideoRef} autoPlay playsInline className="w-full h-full object-cover -scale-x-100" />
                          ) : remoteStreams[activeSpeaker.usuarioId] ? (
                            <RemoteVideo stream={remoteStreams[activeSpeaker.usuarioId]} className="w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#1c1c24] to-[#0c0c0e] flex flex-col items-center justify-center">
                              <div className="relative flex items-center justify-center">
                                <div className="absolute w-24 h-24 rounded-full bg-red-500/10 animate-ping duration-1000" />
                                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getGradientClass(spotlightName)} flex items-center justify-center text-3xl font-bold shadow-lg text-white z-10 border border-white/20`}>
                                  {getInitials(spotlightName)}
                                </div>
                              </div>
                              <span className="text-base font-bold text-white mt-4 flex items-center gap-2">
                                {spotlightName} 
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                              </span>
                              <span className="text-[10px] text-red-400 uppercase font-black tracking-widest mt-1">Hablando...</span>
                            </div>
                          )
                        ) : (
                          (isWebAdmin && isCameraActive && localStream) ? (
                            <video ref={localVideoRef} autoPlay playsInline className="w-full h-full object-cover -scale-x-100" />
                          ) : (remoteStreams[adminUserId || ""] || remoteStreams["admin"]) ? (
                            <RemoteVideo stream={remoteStreams[adminUserId || ""] || remoteStreams["admin"]} className="w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#1c1c24] to-[#0c0c0e] flex flex-col items-center justify-center">
                              <div className="relative flex items-center justify-center">
                                <div className="absolute w-20 h-20 rounded-full bg-indigo-500/15 animate-pulse duration-1000" />
                                <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getGradientClass(spotlightName)} flex items-center justify-center text-2xl font-bold shadow-lg text-white z-10 border border-white/20`}>
                                  {getInitials(spotlightName)}
                                </div>
                              </div>
                              <span className="text-sm font-bold text-white mt-3 flex items-center gap-1">
                                {spotlightName}
                                <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">MOD</span>
                              </span>
                              <span className="text-[9px] text-white/40 uppercase font-black tracking-widest mt-1">Administrador</span>
                            </div>
                          )
                        )}

                        {/* Speaking turn countdown overlay */}
                        {isResidentActive && speakingTimeLeft !== null && (
                          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 z-30 flex items-center gap-2 shadow-lg">
                            <span className={`w-2 h-2 rounded-full ${speakingTimeLeft <= 20 ? 'bg-red-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
                            <span className="font-mono text-xs text-white font-black tracking-wider">
                              TIEMPO: {Math.floor(speakingTimeLeft / 60)}:{(speakingTimeLeft % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        )}

                        {/* Admin HUD Controls over video */}
                        {isWebAdmin && isResidentActive && (
                          <div className="absolute top-4 right-4 z-30 bg-black/75 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex flex-col gap-2 shadow-2xl text-left pointer-events-auto">
                            <span className="text-[8px] font-black text-red-400 uppercase tracking-widest block">Control de Moderador</span>
                            <div className="text-[10px] text-white">
                              <p className="font-bold">Hablando: {activeSpeaker.nombre}</p>
                              <p className="text-[8px] text-white/60">{activeSpeaker.apto}</p>
                            </div>
                            <button
                              onClick={() => handleCompleteTurn(activeSpeaker.id)}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md"
                            >
                              <MicOff size={10} />
                              <span>Silenciar Residente</span>
                            </button>
                          </div>
                        )}

                        {/* HUD left overlay */}
                        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 items-start pointer-events-none max-w-[190px]">
                          <div className="flex gap-1.5 items-center pointer-events-auto">
                            <span className="bg-red-500 text-white px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider animate-pulse shadow-md">En Directo</span>
                            <span className="bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded-lg text-[8px] font-bold shadow-md">{spotlightApto}</span>
                          </div>

                          {/* Quick HUD overlay in Demo Mode */}
                          {isDemoMode && (
                            <>
                              {!asistencias.some(a => a.usuarioId === session?.user?.id) && (
                                <div className="bg-amber-500 text-stone-950 p-2.5 rounded-xl shadow-2xl flex flex-col gap-1.5 pointer-events-auto text-left w-[180px] animate-bounce">
                                  <span className="text-[7px] font-black uppercase block">Quórum Pendiente</span>
                                  <p className="text-[9px] font-bold leading-tight">Debes registrar asistencia.</p>
                                  <button 
                                    onClick={() => handleCheckIn("VIRTUAL")}
                                    className="w-full py-1 bg-stone-900 hover:bg-stone-800 text-white rounded text-[8px] font-bold uppercase transition-all"
                                  >
                                    Check-In
                                  </button>
                                </div>
                              )}
                              
                              {votaciones.find(v => v.activa) && (() => {
                                const v = votaciones.find(x => x.activa);
                                const hasVoted = v.votos.some((x: any) => x.usuarioId === session?.user?.id);
                                
                                if (!hasVoted) {
                                  return (
                                    <div className="bg-indigo-600 text-white p-3 rounded-2xl border border-indigo-400 shadow-2xl flex flex-col gap-2 pointer-events-auto text-left w-[180px] animate-fade-in">
                                      <span className="text-[7.5px] font-black uppercase tracking-wider block bg-indigo-500 px-1.5 py-0.5 rounded w-fit">Voto Pendiente</span>
                                      <p className="text-[10px] font-bold leading-tight">{v.titulo}</p>
                                      <div className="flex gap-1">
                                        {v.opciones.map((op: any) => (
                                          <button 
                                            key={op}
                                            onClick={() => handleVotar(v.id, op)}
                                            className="flex-1 py-1 bg-white text-indigo-600 rounded text-[8px] font-black uppercase hover:bg-indigo-50 transition-all"
                                          >
                                            {op}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }
                              })()}
                            </>
                          )}
                        </div>

                        {/* Subtitles Overlay */}
                        {subtitulos && subtitulos.length > 0 && (
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[85%] bg-black/75 backdrop-blur-xs px-4 py-2 rounded-xl text-center border border-white/10 z-10">
                            <p className="text-[11px] text-white font-sans">
                              <span className="text-emerald-400 font-bold uppercase tracking-wider text-[8px] mr-1.5">
                                [{subtitulos[subtitulos.length - 1].speaker}]:
                              </span>
                              {translatingSubtitles ? "..." : (subtitlesLanguage === "ES" ? subtitulos[subtitulos.length - 1].text : translatedSubtitleText || subtitulos[subtitulos.length - 1].text)}
                            </p>
                          </div>
                        )}

                        {/* Twitch chat box if isDemoMode is true */}
                        {isDemoMode && (
                          <div className="absolute top-0 right-0 bottom-0 w-[180px] bg-black/60 border-l border-white/10 backdrop-blur-md z-20 flex flex-col p-2 text-left hidden sm:flex pointer-events-auto">
                            <span className="text-[8px] font-black text-white/50 uppercase tracking-widest block border-b border-white/5 pb-1 mb-1">Chat de Vecinos</span>
                            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-none">
                              {opiniones.slice(-6).map((op) => (
                                <div key={op.id} className="text-[8.5px] leading-relaxed">
                                  <span className="font-bold text-indigo-300 mr-1">
                                    {op.nombre.split(" ").slice(-1)[0]}:
                                  </span>
                                  <span className="text-white/80">{op.contenido}</span>
                                </div>
                              ))}
                            </div>
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                const input = e.currentTarget.elements.namedItem("overlayChatMsg") as HTMLInputElement;
                                if (!input.value.trim()) return;
                                const msg = input.value;
                                input.value = "";
                                fetch("/api/asamblea/opiniones", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ contenido: msg })
                                }).then(r => r.json()).then(d => {
                                  if (d.success) setOpiniones(d.opiniones);
                                });
                              }}
                              className="flex gap-1 pt-1 border-t border-white/5 mt-1"
                            >
                              <input name="overlayChatMsg" type="text" placeholder="Hablar..." className="flex-1 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[8px] text-white outline-none" />
                              <button type="submit" className="p-1 bg-indigo-500 text-white rounded"><Send size={8} /></button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Controls Row */}
                  <div className="flex flex-wrap md:flex-nowrap justify-center items-center gap-2 md:gap-3 bg-stone-50 border border-stone-200 rounded-2xl p-2 md:p-2.5 shrink-0 shadow-xs">
                    <button 
                      onClick={toggleMute}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer ${
                        isMuted 
                          ? 'bg-red-50 text-red-500 border-red-200' 
                          : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {isMuted ? <MicOff size={11} /> : <Mic size={11} />}
                      <span>{isMuted ? "Silenciado" : "Activo"}</span>
                    </button>

                    <button 
                      onClick={toggleCamera}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer ${
                        !isCameraActive 
                          ? 'bg-red-50 text-red-500 border-red-200' 
                          : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {!isCameraActive ? <Play size={11} /> : <Pause size={11} />}
                      <span>Cámara</span>
                    </button>

                    <button 
                      onClick={handleRequestSpeak}
                      disabled={turnos.some(t => t.usuarioId === session?.user?.id && (t.estado === "PENDIENTE" || t.estado === "HABLANDO"))}
                      className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:bg-indigo-700 cursor-pointer disabled:bg-stone-100 disabled:text-stone-400"
                    >
                      <Mic size={11} />
                      <span>Pedir Palabra</span>
                    </button>

                    {isWebAdmin && (
                      <button 
                        onClick={() => triggerCopilot()}
                        disabled={copilotLoading}
                        className="px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles size={11} />
                        <span>Copiloto</span>
                      </button>
                    )}

                    <div className="w-[1px] h-5 bg-stone-200 mx-1" />

                    <button 
                      onClick={() => signOut({ redirect: false }).then(() => router.refresh())}
                      className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all cursor-pointer shadow-xs"
                    >
                      <LogOut size={12} className="rotate-180" />
                    </button>
                  </div>

                  {/* Secondary participant list */}
                  <div className="flex flex-col gap-2 mt-1">
                    <span className="text-[9px] text-stone-400 uppercase tracking-widest font-black block">Otros Copropietarios (Participantes)</span>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                      <div className="relative w-[130px] aspect-video rounded-xl overflow-hidden bg-stone-100 border border-stone-200 flex flex-col justify-center items-center shrink-0 shadow-xs">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-sm mb-1">
                          TA
                        </div>
                        <span className="text-[9px] font-bold text-stone-700 truncate max-w-[110px]">Thommy Admin</span>
                        <div className="absolute bottom-1 left-1.5 bg-white/80 border border-stone-200 px-1 py-0.5 rounded text-[7px] text-stone-500 font-bold uppercase tracking-wider scale-90 origin-bottom-left">
                          Admin
                        </div>
                      </div>

                      {councilFeeds.map(feed => (
                        <div key={feed.id} className="relative w-[130px] aspect-video rounded-xl overflow-hidden bg-stone-100 border border-stone-200 flex flex-col justify-center items-center shrink-0 shadow-xs">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-sm mb-1">
                            {getInitials(feed.nombre)}
                          </div>
                          <span className="text-[9px] font-bold text-stone-700 truncate max-w-[110px]">{feed.nombre.split(" ").slice(-1)[0]}</span>
                          <div className="absolute bottom-1 left-1.5 bg-white/80 border border-stone-200 px-1 py-0.5 rounded text-[7px] text-stone-500 font-bold uppercase tracking-wider scale-90 origin-bottom-left">
                            {feed.rol}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Column 3: Tabbed sidepanel */}
                {!isDemoMode && (
                  <div className={`bg-white flex flex-col overflow-hidden shrink-0 ${
                    ["chat", "votos", "gestion"].includes(mobileActiveTab) 
                      ? "flex flex-1 w-full" 
                      : "hidden md:flex w-[22%] border-l border-stone-200"
                  }`}>
                    <div className="flex border-b border-stone-200 bg-stone-50 p-1.5 gap-1 shrink-0">
                      {["chat", "votos", "gestion"].map((tabName) => (
                        <button 
                          key={tabName}
                          onClick={() => {
                            setActiveRightTab(tabName as any);
                            setMobileActiveTab(tabName as any);
                          }}
                          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer uppercase tracking-wider text-[10px] ${
                            activeRightTab === tabName 
                              ? "bg-white text-stone-900 shadow-xs border border-stone-200" 
                              : "text-stone-500 hover:text-stone-800"
                          }`}
                        >
                          {tabName}
                        </button>
                      ))}
                    </div>

                    {/* Tab content body */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                      
                      {/* CHAT TAB */}
                      {activeRightTab === "chat" && (
                        <div className="flex-1 flex flex-col min-h-0 justify-between h-full">
                          <div className="space-y-3 flex-1 overflow-y-auto pr-1 pb-4">
                            {opiniones.length === 0 ? (
                              <div className="text-center py-8 text-stone-400 italic text-xs">No hay comentarios.</div>
                            ) : (
                              opiniones.map((op) => (
                                <div key={op.id} className="text-xs bg-stone-50 border border-stone-200/50 p-2.5 rounded-2xl">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-stone-800 text-[10px]">{op.nombre}</span>
                                    <span className="text-[9px] text-stone-400 font-medium">{op.apto || "Vecino"}</span>
                                  </div>
                                  <p className="text-stone-600 leading-normal font-sans">{op.contenido}</p>
                                </div>
                              ))
                            )}
                          </div>
                          <form onSubmit={handleSubmitOpinion} className="border-t border-stone-200 pt-3 flex gap-2 shrink-0 bg-white">
                            <input 
                              type="text"
                              required
                              value={opinionInput}
                              onChange={(e) => setOpinionInput(e.target.value)}
                              placeholder="Escribe tu opinión..."
                              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-800 placeholder-stone-400 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                            />
                            <button type="submit" className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 cursor-pointer shrink-0"><Send size={14} /></button>
                          </form>
                        </div>
                      )}

                      {/* VOTACIONES TAB */}
                      {activeRightTab === "votos" && (
                        <div className="space-y-4">
                          {isWebAdmin ? (
                            <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-2xl space-y-3 shadow-2xs">
                              <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">Lanzar Nueva Propuesta</span>
                              <div className="flex flex-col gap-2">
                                <input 
                                  type="text"
                                  placeholder="Título..."
                                  value={votacionTituloInput}
                                  onChange={e => setVotacionTituloInput(e.target.value)}
                                  className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:outline-none"
                                />
                                <input 
                                  type="text"
                                  placeholder="Opciones (SI, NO, ABSTENCION)"
                                  value={votacionOpcionesInput}
                                  onChange={e => setVotacionOpcionesInput(e.target.value)}
                                  className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:outline-none"
                                />
                                <input 
                                  type="text"
                                  placeholder="Descripción..."
                                  value={votacionDescripcionInput}
                                  onChange={e => setVotacionDescripcionInput(e.target.value)}
                                  className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:outline-none"
                                />
                                <select
                                  value={votacionFormulaInput}
                                  onChange={e => setVotacionFormulaInput(e.target.value as any)}
                                  className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-700 cursor-pointer focus:outline-none"
                                >
                                  <option value="MAYORIA_SIMPLE">Mayoría Simple</option>
                                  <option value="QUORUM_CALIFICADO">Quórum Calificado (70%)</option>
                                </select>

                                {/* Option 4: Secret vote checkbox */}
                                <div className="flex items-center gap-2 p-1">
                                  <input 
                                    type="checkbox"
                                    id="esSecreto"
                                    checked={votacionEsSecreto}
                                    onChange={e => setVotacionEsSecreto(e.target.checked)}
                                    className="w-4 h-4 rounded text-indigo-600 border-stone-300 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  <label htmlFor="esSecreto" className="text-xs text-stone-600 font-bold select-none cursor-pointer">
                                    Votación Secreta 🔒
                                  </label>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button 
                                  type="button"
                                  onClick={handleGenerateConsensusProposal}
                                  disabled={generatingConsensus}
                                  className="flex-1 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-[10px] uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                                >
                                  <Sparkles size={11} className={generatingConsensus ? "animate-spin" : ""} />
                                  Consensus IA
                                </button>
                                <button onClick={handleCrearVotacion} className="flex-1 bg-stone-900 hover:bg-stone-800 text-white font-bold text-[10px] uppercase rounded-xl py-2 cursor-pointer shadow-sm">Lanzar</button>
                              </div>
                            </div>
                          ) : (
                            votaciones.filter(v => v.activa).map(v => {
                              const hasVoted = v.votos.some((x: any) => x.usuarioId === session?.user?.id);
                              const myVote = v.votos.find((x: any) => x.usuarioId === session?.user?.id);
                              return (
                                <div key={v.id} className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3 shadow-xs text-left">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[7.5px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">Voto Activo</span>
                                    {v.esSecreto && (
                                      <span className="text-[7.5px] font-black bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md uppercase">Voto Secreto 🔒</span>
                                    )}
                                  </div>
                                  <h4 className="text-xs font-bold text-stone-800 leading-snug">{v.titulo}</h4>
                                  {v.descripcion && <p className="text-[10px] text-stone-500">{v.descripcion}</p>}
                                  {hasVoted ? (
                                    <div className="bg-white border border-emerald-200 p-2.5 rounded-xl text-[10px] text-emerald-600 leading-normal">
                                      <p className="font-bold flex items-center gap-1.5"><CheckCircle size={13} /> Tu voto: "{myVote?.respuesta}"</p>
                                      <p className="text-[6.5px] font-mono text-stone-400 mt-1 truncate">Firma: {myVote?.hashFirma}</p>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-1.5">
                                      {v.opciones.map((op: any) => (
                                        <button key={op} onClick={() => handleVotar(v.id, op)} className="w-full bg-white hover:bg-stone-50 border border-stone-200 rounded-xl py-2 text-xs font-bold text-stone-700 cursor-pointer">{op}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}

                          {/* List of other polls */}
                          <div className="space-y-3">
                            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Listado de Votaciones</span>
                            {votaciones.length === 0 ? (
                              <div className="text-center py-4 text-stone-400 text-xs italic">No hay votaciones.</div>
                            ) : (
                              votaciones.map((v) => {
                                const totalWeight = v.votos.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                return (
                                  <div key={v.id} className="border border-stone-200 rounded-2xl p-3.5 bg-[#fafaf8] space-y-2.5 shadow-2xs text-left">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-bold border ${v.activa ? 'bg-red-50 text-red-500 border-red-200 animate-pulse' : 'bg-stone-100 text-stone-500 border-stone-200'}`}>
                                            {v.activa ? "Activa" : "Cerrada"}
                                          </span>
                                          {v.esSecreto && <span className="px-1.5 py-0.5 rounded text-[7.5px] font-bold bg-purple-50 text-purple-600 border border-purple-200">🔒 Secreto</span>}
                                        </div>
                                        <h5 className="text-[11px] font-bold text-stone-800 mt-1.5 leading-tight">{v.titulo}</h5>
                                      </div>
                                      {isWebAdmin && (
                                        <button onClick={() => handleActivarVotacion(v.id, !v.activa)} className={`px-2 py-1 rounded-lg text-[8px] font-bold uppercase cursor-pointer ${v.activa ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white'}`}>{v.activa ? "Cerrar" : "Lanzar"}</button>
                                      )}
                                    </div>
                                    <div className="space-y-1.5">
                                      {v.opciones.map((op: any) => {
                                        const matchingVotes = v.votos.filter((x: any) => x.respuesta === op);
                                        const opWeight = matchingVotes.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                        const pct = totalWeight > 0 ? (opWeight / totalWeight) * 100 : 0;
                                        return (
                                          <div key={op} className="space-y-0.5">
                                            <div className="flex justify-between text-[9px] text-stone-600 font-medium">
                                              <span className="uppercase">{op}</span>
                                              <span>{pct.toFixed(0)}%</span>
                                            </div>
                                            <div className="relative w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                              <div className={`h-full rounded-full ${getOptionColor(op)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      {/* GESTIÓN TAB */}
                      {activeRightTab === "gestion" && (
                        <div className="space-y-4">
                          <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-2xl space-y-2 text-left">
                            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Quórum Coeficiente</span>
                            <div className="flex justify-between items-end">
                              <span className="text-[10px] text-stone-500 font-medium">Total Presente:</span>
                              <span className="text-sm font-black text-indigo-600">{(quorumPercentage * 100).toFixed(2)}%</span>
                            </div>
                            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                              <div className={`h-full ${quorumPercentage >= 0.51 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, quorumPercentage * 100)}%` }} />
                            </div>
                          </div>

                          {!isWebAdmin && (
                            <>
                              {!asistencias.some(a => a.usuarioId === session?.user?.id) ? (
                                <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex flex-col items-center gap-2 text-center">
                                  <AlertCircle size={20} className="text-amber-500" />
                                  <button onClick={() => handleCheckIn("VIRTUAL")} className="w-full py-2 bg-amber-500 text-stone-950 font-bold text-[10px] uppercase rounded-xl cursor-pointer">Registrar Check-In</button>
                                </div>
                              ) : (
                                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center gap-2 text-emerald-700 text-xs text-left">
                                  <CheckCircle size={14} className="shrink-0" />
                                  <div><p className="font-bold">Asistencia Lista</p></div>
                                </div>
                              )}
                            </>
                          )}

                          {isWebAdmin && (
                            <div className="space-y-2 text-left">
                              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Aprobación de Poderes</span>
                              {poderes.map(p => (
                                <div key={p.id} className="border border-stone-200 p-2.5 rounded-xl bg-stone-50 flex justify-between items-center text-xs">
                                  <div>
                                    <p className="font-bold text-stone-800">{p.otorganteNombre}</p>
                                    <p className="text-[8px] text-stone-400">➔ {p.apoderadoNombre}</p>
                                  </div>
                                  {!p.verificado && (
                                    <button onClick={() => handleAprobarPoder(p.id, true)} className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[8px] uppercase font-bold cursor-bold">Aprobar</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="space-y-2 text-left">
                            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Lista de Asistencia ({asistencias.length})</span>
                            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                              {asistencias.map((as, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs p-2 bg-stone-50 border border-stone-200/50 rounded-xl">
                                  <span className="font-medium text-stone-700 truncate max-w-[110px]">{as.nombre}</span>
                                  <span className="text-[9px] text-stone-400 font-bold uppercase">{as.apto}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Option 6: Post-Assembly / Minutes Dashboard area */}
              {actaContent && (
                <div className="border-t border-stone-200 bg-amber-50/40 p-4 shrink-0 flex flex-col gap-3 text-left">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-1">
                        📊 Panel de Cierre de Asamblea Ordinaria
                      </h4>
                      <p className="text-[9px] text-stone-500 mt-0.5">Analíticas post-asamblea, certificado quórum y descarga del acta digital.</p>
                    </div>
                    <div className="flex gap-2">
                      <a 
                        href={`data:text/markdown;charset=utf-8,${encodeURIComponent(actaContent)}`}
                        download="Acta_Asamblea_Ordinaria.md"
                        className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-[9px] uppercase tracking-wider rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Download size={11} /> Descargar Acta
                      </a>
                    </div>
                  </div>
                  
                  {/* SVG tension curve & participation heatmap */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Tension chart */}
                    <div className="bg-white border border-stone-200 p-3 rounded-2xl">
                      <span className="text-[8.5px] font-bold text-stone-500 uppercase tracking-wider block mb-2">Curva de Participación y Tensión</span>
                      <div className="h-28 w-full flex items-center justify-center">
                        <svg viewBox="0 0 300 100" className="w-full h-full">
                          <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15" />
                              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <line x1="0" y1="80" x2="300" y2="80" stroke="#f0f0f0" strokeWidth="1" />
                          <line x1="0" y1="50" x2="300" y2="50" stroke="#f0f0f0" strokeWidth="1" />
                          <line x1="0" y1="20" x2="300" y2="20" stroke="#f0f0f0" strokeWidth="1" />
                          <path d="M 0 80 Q 50 20, 100 60 T 200 40 T 300 10 L 300 80 L 0 80 Z" fill="url(#areaGrad)" />
                          <path d="M 0 80 Q 50 20, 100 60 T 200 40 T 300 10" fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" />
                          <circle cx="50" cy="40" r="4.5" fill="#e11d48" stroke="#ffffff" strokeWidth="1.5" />
                          <circle cx="250" cy="25" r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                          <text x="50" y="28" fontSize="6.5" fontWeight="bold" fill="#e11d48" textAnchor="middle">Punto 4: Tensión Alta</text>
                          <text x="250" y="15" fontSize="6.5" fontWeight="bold" fill="#10b981" textAnchor="middle">Votación Exitosa</text>
                        </svg>
                      </div>
                    </div>

                    {/* Heatmap */}
                    <div className="bg-white border border-stone-200 p-3 rounded-2xl">
                      <span className="text-[8.5px] font-bold text-stone-500 uppercase tracking-wider block mb-2">Mapa Térmico de Participación por Torre</span>
                      <div className="grid grid-cols-6 gap-1 text-center font-mono">
                        {[1, 2, 3, 4, 5, 6].map(tower => {
                          const participationVal = Math.floor((Math.sin(tower * 2.3) + 1.1) * 45);
                          let colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                          if (participationVal > 75) colorClass = "bg-emerald-600 text-white border-emerald-700";
                          else if (participationVal > 50) colorClass = "bg-emerald-400 text-stone-900 border-emerald-500";
                          else if (participationVal > 30) colorClass = "bg-amber-100 text-amber-800 border-amber-200";
                          else colorClass = "bg-red-50 text-red-700 border-red-200";
                          
                          return (
                            <div key={tower} className={`border rounded-lg p-2 text-xs flex flex-col justify-center items-center shadow-2xs ${colorClass}`}>
                              <span className="text-[7px] uppercase font-sans font-bold">Torre {tower}</span>
                              <span className="font-bold mt-0.5">{participationVal}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Audit signature */}
                  <div className="bg-white border border-stone-200 rounded-xl p-2.5 flex justify-between items-center text-[10px]">
                    <span className="text-stone-500 font-medium">📜 Firma del Acta en Blockchain / P2P:</span>
                    <span className="font-mono text-stone-400 select-all truncate max-w-[400px]">SHA-256: 8a73c1d9b3d2b271d4719264c92b21cf59f939e0db9637c89f55e0dbd5813d9c</span>
                  </div>
                </div>
              )}

              {/* Mobile Bottom Navigation Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-md border-t border-stone-200 flex md:hidden justify-around items-center px-2 z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                <button 
                  onClick={() => setMobileActiveTab("agenda")}
                  className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
                    mobileActiveTab === "agenda" ? "text-indigo-600 font-bold scale-105" : "text-stone-400"
                  }`}
                >
                  <Calendar size={18} />
                  <span className="text-[9px] uppercase tracking-wider">Agenda</span>
                </button>

                <button 
                  onClick={() => setMobileActiveTab("video")}
                  className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
                    mobileActiveTab === "video" ? "text-indigo-600 font-bold scale-105" : "text-stone-400"
                  }`}
                >
                  <Laptop size={18} />
                  <span className="text-[9px] uppercase tracking-wider">Video</span>
                </button>

                <button 
                  onClick={() => setMobileActiveTab("chat")}
                  className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
                    mobileActiveTab === "chat" ? "text-indigo-600 font-bold scale-105" : "text-stone-400"
                  }`}
                >
                  <MessageSquare size={18} />
                  <span className="text-[9px] uppercase tracking-wider">Chat</span>
                </button>

                <button 
                  onClick={() => setMobileActiveTab("votos")}
                  className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
                    mobileActiveTab === "votos" ? "text-purple-600 font-bold scale-105" : "text-stone-400"
                  }`}
                >
                  <CheckCircle size={18} />
                  <span className="text-[9px] uppercase tracking-wider">Votos</span>
                </button>

                <button 
                  onClick={() => setMobileActiveTab("gestion")}
                  className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
                    mobileActiveTab === "gestion" ? "text-emerald-600 font-bold scale-105" : "text-stone-400"
                  }`}
                >
                  <Shield size={18} />
                  <span className="text-[9px] uppercase tracking-wider">Gestión</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: MOBILE SIMULATOR FRAME */}
          {isDemoMode && (
            <div className="hidden lg:flex bg-[#fafaf8] border-l border-stone-200 flex-col items-center justify-center h-full relative p-6 overflow-y-auto">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-stone-200 rounded-full text-[10px] text-stone-600 font-bold uppercase tracking-wider mb-1">
                  <Smartphone size={10} /> Simulador App Celular (Residente)
                </div>

                {/* iPhone 14 CSS chassis */}
                <div className="relative border-gray-900 bg-gray-900 border-[10px] rounded-[2.5rem] h-[580px] w-[290px] shadow-2xl z-20 overflow-hidden">
                  <div className="h-[32px] w-[3px] bg-gray-900 absolute -left-[13px] top-[72px] rounded-l-lg" />
                  <div className="h-[46px] w-[3px] bg-gray-900 absolute -left-[13px] top-[124px] rounded-l-lg" />
                  <div className="h-[64px] w-[3px] bg-gray-900 absolute -right-[13px] top-[94px] rounded-r-lg" />

                  {/* iPhone screen content */}
                  <div className="rounded-[2.1rem] overflow-hidden w-full h-full bg-[#05020a] flex flex-col text-white relative">
                    <div className="h-10 bg-black/40 flex justify-between items-center px-6 relative z-30 select-none text-[10px] font-bold text-white/90">
                      <span>9:41 AM</span>
                      <div className="w-[80px] h-[18px] bg-black rounded-full mx-auto absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full mr-2" />
                        <div className="w-8 h-1 bg-zinc-900 rounded-full" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px]">5G</span>
                      </div>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto pb-8 flex flex-col gap-4 text-left relative z-20">
                      {!mobileSession ? (
                        <div className="flex-1 flex flex-col justify-center items-center text-center p-2">
                          <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/30 rounded-2xl flex items-center justify-center text-accent mb-4">
                            <Smartphone size={24} />
                          </div>
                          <h4 className="text-sm font-bold text-white mb-1">ConjuntOS App</h4>
                          <p className="text-[10px] text-white/40 mb-6 leading-relaxed">Inicia sesión en el celular simulado.</p>
                          <div className="w-full space-y-3.5 bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="space-y-1">
                              <select 
                                className="w-full bg-[#05020a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-hidden"
                                value={mobileUserEmail}
                                onChange={(e) => setMobileUserEmail(e.target.value)}
                              >
                                <option value="raulmontaño@conjuntos.com">Raúl Montaño (Propietario)</option>
                                <option value="thommyadmin@example.com">Thommy Admin (Administrador)</option>
                                <option value="thommy@example.com">Thommy Master (Super Admin)</option>
                              </select>
                            </div>
                            <button onClick={handleMobileLogin} className="w-full bg-gradient-to-r from-accent to-purple-600 text-white font-bold text-[10px] uppercase py-3 rounded-xl cursor-pointer">Entrar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col h-full gap-4">
                          <div className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center font-bold text-xs text-primary">{mobileSession.nombre[0]}</div>
                              <div>
                                <h5 className="text-[10px] font-bold text-white leading-none mb-0.5">{mobileSession.nombre}</h5>
                                <span className="text-[8px] text-white/30 uppercase font-medium">{mobileSession.apto}</span>
                              </div>
                            </div>
                            <button onClick={() => setMobileSession(null)} className="text-red-400 text-[8px] font-bold uppercase p-1">Salir</button>
                          </div>

                          <div className="flex-1 flex flex-col gap-3">
                            <div className="bg-black/50 border border-white/10 rounded-2xl p-2 flex flex-col gap-1.5 relative overflow-hidden">
                              <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/5 flex items-center justify-center relative">
                                <div className="text-center p-2 flex flex-col items-center justify-center">
                                  <span className="text-xl animate-pulse block mb-1">👑</span>
                                  <span className="text-[9px] font-bold text-white block">Thommy Admin</span>
                                </div>
                                {subtitulos && subtitulos.length > 0 && (
                                  <div className="absolute bottom-1.5 right-1.5 left-1.5 bg-black/70 px-2 py-1 rounded text-center pointer-events-none border border-white/5 z-10">
                                    <p className="text-[7.5px] text-white font-sans leading-tight">
                                      <span className="text-emerald-400 font-bold uppercase text-[6px] mr-1">[{subtitulos[subtitulos.length - 1].speaker}]:</span>
                                      {subtitlesLanguage === "ES" ? subtitulos[subtitulos.length - 1].text : translatedSubtitleText || subtitulos[subtitulos.length - 1].text}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {!asistencias.some(a => a.usuarioId === mobileSession.id) ? (
                              <button onClick={() => handleCheckIn("VIRTUAL", mobileSession.id)} className="w-full py-2 bg-amber-500 text-primary font-bold text-[9px] uppercase tracking-wider rounded-xl cursor-pointer">Confirmar Asistencia</button>
                            ) : (
                              <div className="bg-emerald-600/10 border border-emerald-500/25 p-2 rounded-2xl flex items-center justify-center gap-1.5 text-emerald-400 text-[9px] font-bold"><CheckCircle size={10} /> Presente en Quórum</div>
                            )}

                            {mobileSession.rol !== "ADMINISTRADOR" && mobileSession.rol !== "SUPER_ADMIN" && (
                              <button 
                                onClick={handleMobileRequestSpeak}
                                disabled={turnos.some(t => t.usuarioId === mobileSession.id && (t.estado === "PENDIENTE" || t.estado === "HABLANDO"))}
                                className="w-full py-2 bg-indigo-600 text-white font-bold text-[9px] uppercase tracking-wider rounded-xl cursor-pointer disabled:bg-zinc-800 disabled:text-zinc-500 transition-all hover:bg-indigo-700"
                              >
                                {turnos.some(t => t.usuarioId === mobileSession.id && t.estado === "PENDIENTE") 
                                  ? "Palabra Solicitada" 
                                  : turnos.some(t => t.usuarioId === mobileSession.id && t.estado === "HABLANDO") 
                                    ? "Hablando..." 
                                    : "Pedir Palabra"}
                              </button>
                            )}

                            {votaciones.filter(v => v.activa).map(v => {
                              const hasVoted = v.votos.some((x: any) => x.usuarioId === mobileSession.id);
                              const myVote = v.votos.find((x: any) => x.usuarioId === mobileSession.id);
                              return (
                                <div key={v.id} className="bg-accent/15 border border-accent rounded-2xl p-3 flex flex-col gap-2">
                                  <h5 className="text-[10px] font-bold text-white leading-tight">{v.titulo}</h5>
                                  {hasVoted ? (
                                    <div className="p-2 bg-emerald-500/10 rounded-xl text-[9px] text-emerald-400 font-medium">Registrado: "{myVote?.respuesta}"</div>
                                  ) : (
                                    <div className="flex gap-1.5">
                                      {v.opciones.map((op: any) => (
                                        <button key={op} onClick={() => handleVotar(v.id, op, mobileSession.id)} className="flex-1 bg-accent/20 hover:bg-accent text-white hover:text-primary border border-accent/40 rounded-lg py-1.5 text-[9px] font-black uppercase transition-all cursor-pointer">{op}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05020a] text-white p-6 relative overflow-hidden font-sans">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-accent/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-primary-light/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-white/5 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">En Vivo</span>
          </div>
          <h1 className="text-3xl font-display font-black text-glow tracking-tight">Portal de Asamblea General</h1>
          <p className="text-white/40 text-xs mt-1 font-medium uppercase tracking-wider">Gestión Mutual y Copiloto IA</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Desktop Demo Switcher */}
          <div className="hidden lg:flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
            <button 
              onClick={() => setIsDemoMode(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${isDemoMode ? 'bg-accent text-primary' : 'text-white/60 hover:text-white'}`}
            >
              <Smartphone size={14} /> Modo Demo (Pantalla Dividida)
            </button>
            <button 
              onClick={() => setIsDemoMode(false)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${!isDemoMode ? 'bg-accent text-primary' : 'text-white/60 hover:text-white'}`}
            >
              <Layers size={14} /> Modo Único (Producción)
            </button>
          </div>

          <button 
            onClick={() => router.push("/inicio")}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer"
          >
            Regresar al Inicio
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className={`grid grid-cols-1 ${isDemoMode ? "lg:grid-cols-3" : "lg:grid-cols-1"} gap-8 relative z-10`}>
        
        {/* Left Columns (Web Views) - takes 2 cols in demo mode */}
        <div className={`${isDemoMode ? "lg:col-span-2" : "col-span-1"} flex flex-col gap-6`}>
          
          {/* 1. NOT AUTHENTICATED: Pairing Screen */}
          {status === "unauthenticated" && (
            <div className="liquid-glass rounded-[32px] p-8 border border-white/10 shadow-2xl flex flex-col items-center justify-center text-center py-16">
              <div className="w-16 h-16 bg-accent/20 border border-accent/40 rounded-[24px] flex items-center justify-center mb-6 text-accent animate-pulse">
                <QrCode size={36} />
              </div>
              <h2 className="text-2xl font-display font-bold text-white mb-2">Inicio de Sesión Mutual</h2>
              <p className="text-white/50 text-sm max-w-md mb-8">
                Inicia sesión en la app del celular y vincula este navegador para participar en la asamblea de forma interactiva.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl bg-white/5 p-6 rounded-[28px] border border-white/5">
                {/* QR Code simulation */}
                <div className="flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-white/10 shadow-lg">
                  <div className="w-40 h-40 bg-zinc-100 flex items-center justify-center relative rounded-lg overflow-hidden border border-zinc-200">
                    {/* Simulated QR blocks */}
                    <div className="absolute inset-2 grid grid-cols-4 grid-rows-4 gap-1 opacity-90">
                      {[...Array(16)].map((_, i) => (
                        <div key={i} className={`rounded-sm ${i % 3 === 0 || i === 0 || i === 15 ? 'bg-black' : 'bg-transparent'}`} />
                      ))}
                    </div>
                    {/* Glowing scanning line */}
                    <div className="absolute left-0 right-0 h-1 bg-accent/60 shadow-[0_0_10px_var(--color-accent)] top-0 animate-bounce" />
                    <span className="text-[10px] font-black text-black absolute bottom-1 uppercase tracking-tighter bg-white/80 px-2 rounded">Escaneame</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-3">Código QR de la Asamblea</span>
                </div>

                {/* PIN Code */}
                <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left gap-4">
                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">Opción 2: Código PIN</span>
                  <div className="bg-[#05020a] border border-white/10 rounded-2xl p-6 py-4 w-full text-center">
                    {pairingCode ? (
                      <span className="text-4xl font-display font-black text-white tracking-widest select-all">
                        {pairingCode.substring(0, 3)} {pairingCode.substring(3)}
                      </span>
                    ) : (
                      <RefreshCw size={24} className="animate-spin mx-auto text-accent" />
                    )}
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed">
                    Escribe este PIN de 6 dígitos en el celular simulado a la derecha (o en la app real) para iniciar sesión al instante.
                  </p>
                  <button 
                    onClick={createPairingCode}
                    className="text-[10px] text-accent font-bold uppercase tracking-widest flex items-center gap-1.5 hover:underline"
                  >
                    <RefreshCw size={12} /> Regenerar código
                  </button>
                </div>
              </div>

              {/* Quick bypass for demo */}
              <div className="mt-10 pt-6 border-t border-white/5 w-full max-w-md">
                <span className="text-[10px] text-white/30 uppercase tracking-wider block mb-3 font-bold">Acceso Rápido sin Celular (Simulacro)</span>
                <div className="flex gap-3 justify-center">
                  <button 
                    onClick={() => signIn("credentials", { email: "thommyadmin@example.com", password: "Md5891129Ae$", redirect: false })}
                    className="px-4 py-2 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/30 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-all"
                  >
                    Entrar como Admin
                  </button>
                  <button 
                    onClick={() => signIn("credentials", { email: "raulmontaño@conjuntos.com", password: "Md5891129Ae$", redirect: false })}
                    className="px-4 py-2 bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-500/30 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-all"
                  >
                    Entrar como Residente
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. AUTHENTICATED: Web View UI */}
/* Handled by early return above */


        </div>

        {/* Right Column: MOBILE SIMULATOR FRAME (visible only in Demo Mode on desktop) */}
        {isDemoMode && (
          <div className="hidden lg:flex flex-col items-center relative">
            <div className="sticky top-6 flex flex-col items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-[#1a0e38] rounded-full border border-purple-500/20 text-[10px] text-purple-400 font-bold uppercase tracking-wider mb-2">
                <Smartphone size={10} /> Simulador App Celular (Residente)
              </div>

              {/* iPhone 14 CSS chassis */}
              <div className="relative border-gray-800 dark:border-gray-800 bg-gray-800 border-[12px] rounded-[2.5rem] h-[580px] w-[290px] shadow-[0_25px_60px_rgba(0,0,0,0.8)] z-20 overflow-hidden">
                {/* Physical buttons */}
                <div className="h-[32px] w-[3px] bg-gray-800 absolute -left-[15px] top-[72px] rounded-l-lg" />
                <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[15px] top-[124px] rounded-l-lg" />
                <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[15px] top-[178px] rounded-l-lg" />
                <div className="h-[64px] w-[3px] bg-gray-800 absolute -right-[15px] top-[94px] rounded-r-lg" />

                {/* iPhone screen content */}
                <div className="rounded-[2.1rem] overflow-hidden w-full h-full bg-[#05020a] flex flex-col text-white relative">
                  
                  {/* Status Bar */}
                  <div className="h-10 bg-black/40 flex justify-between items-center px-6 relative z-30 select-none text-[10px] font-bold text-white/90">
                    <span>9:41 AM</span>
                    <div className="w-[80px] h-[18px] bg-black rounded-full mx-auto absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                      {/* Dynamic Island */}
                      <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full mr-2" />
                      <div className="w-8 h-1 bg-zinc-900 rounded-full" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px]">LTE</span>
                      <div className="w-4 h-2 border border-white/50 rounded-xs p-0.5 flex items-center">
                        <div className="w-full h-full bg-white rounded-2xs" />
                      </div>
                    </div>
                  </div>

                  {/* App Screen View */}
                  <div className="flex-1 p-4 overflow-y-auto pb-8 flex flex-col gap-4 text-left relative z-20">
                    
                    {/* APP LOGGED OUT */}
                    {!mobileSession ? (
                      <div className="flex-1 flex flex-col justify-center items-center text-center p-2">
                        <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/30 rounded-2xl flex items-center justify-center text-accent mb-4">
                          <Smartphone size={24} />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1">ConjuntOS App</h4>
                        <p className="text-[10px] text-white/40 mb-6 leading-relaxed">
                          Inicia sesión en el simulador para simular a un copropietario.
                        </p>

                        <div className="w-full space-y-3.5 bg-white/5 p-4 rounded-2xl border border-white/5">
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-white/40 uppercase tracking-wider block">Seleccionar Usuario</label>
                            <select 
                              className="w-full bg-[#05020a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-hidden"
                              value={mobileUserEmail}
                              onChange={(e) => setMobileUserEmail(e.target.value)}
                            >
                              <option value="raulmontaño@conjuntos.com">Raúl Montaño (Propietario)</option>
                              <option value="thommyadmin@example.com">Thommy Admin (Administrador)</option>
                              <option value="thommy@example.com">Thommy Master (Super Admin)</option>
                            </select>
                          </div>

                          <button 
                            onClick={handleMobileLogin}
                            className="w-full bg-linear-to-r from-accent to-purple-600 hover:scale-102 active:scale-98 text-white font-black text-[10px] uppercase tracking-wider py-3 rounded-xl transition-all shadow-[0_5px_15px_rgba(217,70,239,0.2)] cursor-pointer"
                          >
                            Entrar en App Celular
                          </button>
                        </div>
                      </div>
                    ) : (
                      // APP LOGGED IN
                      <div className="flex-1 flex flex-col h-full gap-4">
                        
                        {/* Simulated header */}
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center font-bold text-xs text-primary">
                              {mobileSession.nombre[0]}
                            </div>
                            <div>
                              <h5 className="text-[10px] font-bold text-white leading-tight">{mobileSession.nombre}</h5>
                              <span className="text-[8px] text-white/30 uppercase font-medium">{mobileSession.apto}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => setMobileSession(null)}
                            className="text-red-400 text-[8px] font-bold uppercase tracking-wider p-1"
                          >
                            Salir
                          </button>
                        </div>

                        {/* VINCULAR WEB SECTION */}
                        {status === "unauthenticated" && (
                          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col gap-3">
                            <span className="text-[8px] font-black text-accent uppercase tracking-widest">Sincronización Web-App</span>
                            <h4 className="text-[11px] font-bold text-white leading-tight">Vincular Sesión con Navegador</h4>
                            <p className="text-[9px] text-white/50 leading-relaxed">
                              Ingresa el PIN de 6 dígitos que se muestra en tu navegador web.
                            </p>

                            <div className="flex gap-2">
                              <input 
                                type="text"
                                maxLength={6}
                                value={mobilePairingInput}
                                onChange={(e) => setMobilePairingInput(e.target.value.replace(/\D/g, ""))}
                                placeholder="Escribe el PIN"
                                className="flex-1 bg-[#05020a] border border-white/10 rounded-xl px-3 py-2 text-xs text-center text-glow font-bold focus:outline-hidden"
                              />
                              <button 
                                onClick={handleMobilePairing}
                                disabled={mobileAuthorizing || mobilePairingInput.length !== 6}
                                className="px-3 bg-accent text-primary font-bold text-[9px] uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50"
                              >
                                Vincular
                              </button>
                            </div>

                            {pairingCode && (
                              <button 
                                onClick={handleMobileQuickPair}
                                className="text-[8px] text-accent/60 font-bold uppercase tracking-widest text-center hover:text-accent mt-1"
                              >
                                Copiar PIN del navegador actual
                              </button>
                            )}
                          </div>
                        )}

                        {/* RESIDENT INTERFACE FOR ASSEMBLY IN SIMULATOR */}
/* Handled by early return above */

                        
                      </div>
                    )}

                  </div>

                  {/* iPhone bottom bar indicator */}
                  <div className="h-6 bg-black/40 flex items-center justify-center relative z-30">
                    <div className="w-24 h-1 bg-white/60 rounded-full" />
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}

      </div>
      
      {/* Footer Branding */}
      <footer className="mt-16 text-center text-[10px] text-white/20 uppercase tracking-widest border-t border-white/5 pt-6 relative z-10">
        ConjuntOS © 2026 • Sistema de Asambleas Seguras y Distribuidas
      </footer>
    </div>
  );
}

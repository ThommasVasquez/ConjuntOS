"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
  Play, Pause, Sparkles, Mic, MicOff, MessageSquare, Send, 
  QrCode, Phone, Laptop, ChevronUp, ChevronDown, CheckCircle, 
  Circle, AlertCircle, ArrowRight, Lock, User, Plus, Trash2, 
  LogOut, RefreshCw, Smartphone, Layers, Shield
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

export default function AsambleaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Mode settings
  const [isDemoMode, setIsDemoMode] = useState(true); // Default to split demo on desktop
  const [activeTab, setActiveTab] = useState<"web" | "app">("web"); // Tab selector on mobile
  
  // Web session states
  const [juntaId, setJuntaId] = useState<string | null>(null);
  const [tituloAsamblea, setTituloAsamblea] = useState("Asamblea General de Copropietarios");
  const [activa, setActiva] = useState(true);
  const [ordenDia, setOrdenDia] = useState<AgendaItem[]>([]);
  const [itemActivoIndex, setItemActivoIndex] = useState(0);
  const [turnos, setTurnos] = useState<SpeakingTurn[]>([]);
  const [opiniones, setOpiniones] = useState<ResidentOpinion[]>([]);
  
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
  const [generatingConsensus, setGeneratingConsensus] = useState(false);
  const [subtitlesLanguage, setSubtitlesLanguage] = useState<"ES" | "EN" | "PT" | "FR">("ES");
  const [translatedSubtitleText, setTranslatedSubtitleText] = useState("");
  const [translatingSubtitles, setTranslatingSubtitles] = useState(false);

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
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [turnos]);

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
          formula: votacionFormulaInput
        })
      });
      const data = await res.json();
      if (data.success) {
        setVotaciones(data.votaciones);
        setVotacionTituloInput("");
        setVotacionDescripcionInput("");
        setVotacionFormulaInput("MAYORIA_SIMPLE");
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

  const handleVotar = async (votacionId: string, respuesta: string) => {
    try {
      const res = await fetch("/api/asamblea/votos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votacionId, respuesta })
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
  const webUserRole = (session?.user as { role?: string })?.role;
  const isWebAdmin = webUserRole === "ADMINISTRADOR" || webUserRole === "SUPER_ADMIN";

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
          {status === "authenticated" && (
            <>
              {/* Web Header for Logged In User */}
              <div className="liquid-glass rounded-[28px] p-6 border border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white border border-white/20 font-bold text-sm ${isWebAdmin ? 'bg-accent' : 'bg-emerald-600'}`}>
                    {session.user?.name?.[0] || "U"}
                  </div>
                  <div>
                    <h3 className="text-white font-bold leading-none mb-1">{session.user?.name || session.user?.email}</h3>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-black flex items-center gap-1">
                      <Shield size={10} className={isWebAdmin ? "text-accent" : "text-emerald-500"} />
                      {isWebAdmin ? "Administrador del Conjunto" : "Copropietario / Residente"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => signOut({ redirect: false }).then(() => router.refresh())}
                  className="px-3.5 py-1.5 bg-red-950/40 hover:bg-red-950/60 border border-red-500/30 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={12} /> Salir
                </button>
              </div>

              {/* 2.1 Video Conference Grid (Shared by Admin & Resident) */}
              <div className="liquid-glass rounded-[32px] p-5 border border-white/10 flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <h4 className="text-xs font-black uppercase tracking-widest text-white">Videoconferencia de Asamblea (Meet Stage)</h4>
                  </div>
                  
                  {/* WebRTC Streaming Controls */}
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={toggleMute}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer ${
                        isMuted 
                          ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {isMuted ? <MicOff size={12} /> : <Mic size={12} />} {isMuted ? "Silenciado" : "Silenciar Mic"}
                    </button>

                    <button 
                      onClick={toggleCamera}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer ${
                        !isCameraActive 
                          ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {isCameraActive ? <Play size={12} /> : <Pause size={12} />} {isCameraActive ? "Apagar Cámara" : "Encender Cámara"}
                    </button>
                    
                    {!localStream && (
                      <button 
                        onClick={startVideo}
                        className="px-3.5 py-1.5 bg-accent text-primary rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:scale-102 hover:shadow-[0_0_15px_rgba(217,70,239,0.4)] transition-all cursor-pointer"
                      >
                        <Play size={12} /> Conectar Cámara
                      </button>
                    )}
                  </div>
                </div>

                {/* Simulated Topics Bar for Admin */}
                {isWebAdmin && (
                  <div className="flex flex-col gap-2 bg-white/5 border border-white/5 p-3 rounded-2xl">
                    <span className="text-[9px] text-accent font-black uppercase tracking-widest flex items-center gap-1">
                      <Sparkles size={10} className="text-accent" /> Temas Rápidos para Simular Voz (IA sugerirá Licitaciones y Precios en vivo):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => simulateSpeechTopic("piscina")}
                        className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/35 border border-purple-500/30 text-purple-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 hover:scale-102"
                      >
                        🏊‍♂️ Piscinas
                      </button>
                      <button 
                        onClick={() => simulateSpeechTopic("ascensor")}
                        className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-500/30 text-cyan-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 hover:scale-102"
                      >
                        🛗 Ascensores
                      </button>
                      <button 
                        onClick={() => simulateSpeechTopic("seguridad")}
                        className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/30 text-emerald-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 hover:scale-102"
                      >
                        🛡️ Seguridad
                      </button>
                      <button 
                        onClick={() => simulateSpeechTopic("presupuesto")}
                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/30 text-amber-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 hover:scale-102"
                      >
                        💰 Presupuesto
                      </button>
                      <button 
                        onClick={() => simulateSpeechTopic("repeticion")}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/35 border border-red-500/30 text-red-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 hover:scale-102"
                      >
                        🔁 Simular Repetición
                      </button>
                      <button 
                        onClick={() => simulateSpeechTopic("divagacion")}
                        className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/30 text-orange-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 hover:scale-102"
                      >
                        🔀 Simular Divagación
                      </button>
                    </div>
                  </div>
                )}

                {/* 2.1.1 MAIN SPOTLIGHT STAGE (Priority Active Speaker) */}
                {(() => {
                  const activeSpeaker = turnos.find(t => t.estado === "HABLANDO");
                  const isResidentActive = !!activeSpeaker;
                  const spotlightName = activeSpeaker ? activeSpeaker.nombre : "Thommy Admin";
                  const spotlightApto = activeSpeaker ? (activeSpeaker.apto || "N/A") : "Administración";
                  
                  return (
                    <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-[#0a0a0d] border border-white/10 flex flex-col justify-center items-center shadow-2xl group max-h-[480px]">
                      
                      {/* Speaking Timer on Main Spotlight (visible to everyone) */}
                      {isResidentActive && speakingTimeLeft !== null && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/65 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 shadow-2xl flex items-center gap-2.5 z-20 animate-fade-in">
                          <svg className="w-4.5 h-4.5 -rotate-90">
                            <circle 
                              cx="9" 
                              cy="9" 
                              r="7" 
                              className="stroke-white/10 fill-none" 
                              strokeWidth="2" 
                            />
                            <circle 
                              cx="9" 
                              cy="9" 
                              r="7" 
                              className={`fill-none transition-all duration-1000 ${
                                speakingTimeLeft > 60 
                                  ? "stroke-emerald-500" 
                                  : speakingTimeLeft > 20 
                                    ? "stroke-amber-500" 
                                    : "stroke-red-500 animate-pulse"
                              }`}
                              strokeWidth="2" 
                              strokeDasharray={2 * Math.PI * 7}
                              strokeDashoffset={((120 - speakingTimeLeft) / 120) * (2 * Math.PI * 7)}
                            />
                          </svg>
                          <span className={`text-[9px] font-mono font-black ${
                            speakingTimeLeft > 60 
                              ? "text-emerald-400" 
                              : speakingTimeLeft > 20 
                                ? "text-amber-400" 
                                : "text-red-400 animate-pulse"
                          }`}>
                            Límite de Habla: {Math.floor(speakingTimeLeft / 60)}:{(speakingTimeLeft % 60).toString().padStart(2, '0')}
                          </span>
                        </div>
                      )}

                      {/* AI Moderation Alert Card (visible ONLY to Admin) */}
                      {isWebAdmin && copilotData.alertaModeracion && (
                        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[85%] max-w-md bg-red-950/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-red-500/40 shadow-2xl z-30 flex items-center gap-3 animate-bounce">
                          <AlertCircle className="text-red-400 shrink-0 animate-pulse" size={16} />
                          <div className="text-left flex-1">
                            <span className="text-[7px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider block w-fit mb-0.5">
                              🛡️ MODERACIÓN IA ({copilotData.alertaModeracion.type})
                            </span>
                            <p className="text-[10px] font-bold text-white leading-normal">
                              {copilotData.alertaModeracion.mensaje}
                            </p>
                            <p className="text-[8.5px] text-red-300 mt-0.5 font-medium">
                              💡 {copilotData.alertaModeracion.sugerenciaAccion}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Active Video Rendering */}
                      {isResidentActive ? (
                        /* Case A: Resident is the active speaker speaking */
                        (!isWebAdmin && isCameraActive && localStream && activeSpeaker.usuarioId === session?.user?.id) ? (
                          <video 
                            ref={localVideoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover -scale-x-100" 
                          />
                        ) : (
                          /* Otherwise, simulated premium avatar stream of speaking resident */
                          <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#121216] to-[#070709] flex flex-col items-center justify-center">
                            {/* Animated voice waves for active speaker */}
                            <div className="relative flex items-center justify-center">
                              <div className="absolute w-24 h-24 rounded-full bg-red-500/10 animate-ping duration-1000" />
                              <div className="absolute w-28 h-28 rounded-full bg-red-500/5 animate-pulse duration-700" />
                              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getGradientClass(spotlightName)} flex items-center justify-center text-3xl font-bold shadow-lg border border-white/15 z-10`}>
                                {getInitials(spotlightName)}
                              </div>
                            </div>
                            <span className="text-base font-bold text-white mt-4 flex items-center gap-2">
                              {spotlightName} 
                              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                            </span>
                            <span className="text-[10px] text-red-400 uppercase font-black tracking-widest mt-1">
                              Hablando...
                            </span>
                          </div>
                        )
                      ) : (
                        /* Case B: No resident is speaking, Admin occupies the stage */
                        (isWebAdmin && isCameraActive && localStream) ? (
                          <video 
                            ref={localVideoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover -scale-x-100" 
                          />
                        ) : (
                          /* Otherwise, simulated Admin stream */
                          <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#121216] to-[#070709] flex flex-col items-center justify-center">
                            <div className="relative flex items-center justify-center">
                              <div className="absolute w-24 h-24 rounded-full bg-accent/15 animate-pulse duration-1000" />
                              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getGradientClass(spotlightName)} flex items-center justify-center text-3xl font-bold shadow-lg border border-white/15 z-10`}>
                                {getInitials(spotlightName)}
                              </div>
                            </div>
                            <span className="text-base font-bold text-white mt-4 flex items-center gap-1.5">
                              {spotlightName}
                              <span className="text-[8px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider">MOD</span>
                            </span>
                            <span className="text-[10px] text-white/40 uppercase font-black tracking-widest mt-1">
                              Administrador de la Asamblea
                            </span>
                          </div>
                        )
                      )}

                      {/* Top status badges */}
                      <div className="absolute top-4 left-4 flex gap-2 z-20 items-center">
                        <span className="bg-red-500 text-white px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest animate-pulse shadow-md">
                          En Pantalla Principal
                        </span>
                        <span className="bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-xl text-[9px] font-bold shadow-md">
                          {spotlightApto}
                        </span>
                        {isWebAdmin && (
                          <div className="bg-black/75 backdrop-blur-md border border-white/10 text-[9px] text-accent font-black uppercase tracking-widest px-3 py-1 rounded-xl shadow-md flex items-center gap-1.5 animate-fade-in">
                            <span className={`w-1.5 h-1.5 rounded-full ${quorumPercentage >= 0.51 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                            Quórum: {(quorumPercentage * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>

                      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-[9px] text-emerald-400 font-bold flex items-center gap-1.5 shadow-md border border-white/5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {spotlightName}
                        </div>
                        {/* Selector de idioma de subtítulos */}
                        <div className="relative">
                          <select
                            id="web-subtitle-lang-select"
                            value={subtitlesLanguage}
                            onChange={(e) => setSubtitlesLanguage(e.target.value as any)}
                            className="bg-black/60 backdrop-blur-md text-[9px] text-white font-bold px-2 py-1.5 rounded-xl border border-white/5 shadow-md cursor-pointer outline-none hover:bg-black/80 transition-colors focus:ring-1 focus:ring-accent"
                          >
                            <option value="ES" className="bg-neutral-900 text-white">🇪🇸 Español</option>
                            <option value="EN" className="bg-neutral-900 text-white">🇺🇸 English</option>
                            <option value="PT" className="bg-neutral-900 text-white">🇧🇷 Português</option>
                            <option value="FR" className="bg-neutral-900 text-white">🇫🇷 Français</option>
                          </select>
                        </div>
                      </div>

                      {/* Floating HUD: Pending Speak Requests */}
                      {isWebAdmin && turnos.filter(t => t.estado === "PENDIENTE").length > 0 && (() => {
                        const pendingTurns = turnos.filter(t => t.estado === "PENDIENTE");
                        const nextSpeaker = pendingTurns[0];
                        return (
                          <div className="absolute top-16 left-4 bg-gradient-to-br from-indigo-950/80 to-purple-950/80 backdrop-blur-md p-3 rounded-2xl border border-indigo-500/40 shadow-2xl z-30 flex flex-col gap-2 animate-fade-in w-[190px] hover:border-accent transition-colors duration-300">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                                <span className="text-[8px] font-black text-accent uppercase tracking-widest">Petición Mic</span>
                              </div>
                              <span className="text-[7px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-md font-bold">
                                En Cola: {pendingTurns.length}
                              </span>
                            </div>
                            <div className="border-t border-white/5 pt-1.5 mt-0.5">
                              <p className="text-[9.5px] font-bold text-white truncate leading-none mb-0.5">{nextSpeaker.nombre}</p>
                              <p className="text-[8px] text-white/50 font-medium">{nextSpeaker.apto || "Sin Apto"}</p>
                            </div>
                            <button
                              onClick={() => handleGrantMic(nextSpeaker.id)}
                              className="w-full py-1 bg-gradient-to-r from-accent to-purple-600 hover:from-accent/90 hover:to-purple-500 text-white rounded-lg text-[8px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-[0_0_12px_rgba(217,70,239,0.3)] flex items-center justify-center gap-1 hover:scale-102 mt-0.5"
                            >
                              <Mic size={9} /> Ceder Mic
                            </button>
                          </div>
                        );
                      })()}

                      {/* Floating HUD: Active Voting Progress */}
                      {isWebAdmin && votaciones.find(v => v.activo) && (() => {
                        const activeVote = votaciones.find(v => v.activo);
                        const totalVotos = activeVote.votos?.length || 0;
                        const siVotos = activeVote.votos?.filter((v: any) => v.respuesta === "SI").reduce((acc: number, v: any) => acc + (v.coeficiente || 0), 0) || 0;
                        const noVotos = activeVote.votos?.filter((v: any) => v.respuesta === "NO").reduce((acc: number, v: any) => acc + (v.coeficiente || 0), 0) || 0;
                        const absVotos = activeVote.votos?.filter((v: any) => v.respuesta === "ABSTENCION").reduce((acc: number, v: any) => acc + (v.coeficiente || 0), 0) || 0;
                        
                        return (
                          <div className="absolute top-16 right-4 bg-black/80 backdrop-blur-md p-3 rounded-2xl border border-emerald-500/30 shadow-2xl z-30 flex flex-col gap-2 w-[190px] animate-fade-in hover:border-emerald-500/50 transition-colors duration-300">
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Votación Activa
                              </span>
                              <span className="text-[7.5px] bg-white/5 border border-white/10 text-white/60 px-1.5 py-0.5 rounded font-bold">{totalVotos} votos</span>
                            </div>
                            <div className="border-t border-white/5 pt-1.5 mt-0.5">
                              <p className="text-[10px] font-bold text-white truncate leading-none mb-0.5">{activeVote.titulo}</p>
                              <span className="text-[7px] text-white/40 uppercase font-black tracking-wider block mb-1">
                                {activeVote.formula === 'QUORUM_CALIFICADO' ? 'Quórum Calificado (70%)' : 'Mayoría Simple'}
                              </span>
                            </div>
                            
                            <div className="flex flex-col gap-1 text-[8px] text-white/95 font-medium">
                              <div className="flex justify-between">
                                <span className="text-emerald-400">SÍ: {(siVotos * 100).toFixed(0)}%</span>
                                <span className="text-rose-400">NO: {(noVotos * 100).toFixed(0)}%</span>
                                <span className="text-amber-400">ABS: {(absVotos * 100).toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-white/15 h-1 rounded-full overflow-hidden flex">
                                <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${siVotos * 100}%` }} />
                                <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${noVotos * 100}%` }} />
                                <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${absVotos * 100}%` }} />
                              </div>
                            </div>
                            
                            <button
                              onClick={() => handleActivarVotacion(activeVote.id, false)}
                              className="w-full py-1.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white rounded-lg text-[8px] font-black uppercase tracking-wider transition-all duration-200 mt-1 cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.2)] flex items-center justify-center gap-1 hover:scale-102"
                            >
                              <CheckCircle size={9} /> Cerrar Votos
                            </button>
                          </div>
                        );
                      })()}

                      {/* Floating HUD: AI Sentiment Summary */}
                      {isWebAdmin && copilotData.resumenSentimiento && (
                        <div className="absolute bottom-4 left-4 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-md max-w-[200px] z-20 animate-fade-in text-left">
                          <span className="text-[7px] text-cyan-400 font-black uppercase tracking-widest block mb-0.5">Sentimiento IA</span>
                          <p className="text-[9px] text-white/90 font-medium leading-normal">
                            💬 {copilotData.resumenSentimiento}
                          </p>
                        </div>
                      )}

                      {/* Twitch/Kick-style Live Chat Overlay */}
                      <div className="absolute top-0 right-0 bottom-0 w-[220px] bg-black/70 border-l border-white/5 backdrop-blur-md z-20 flex flex-col p-3 text-left animate-fade-in hidden md:flex">
                        <div className="flex items-center gap-1.5 border-b border-white/5 pb-2 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[9px] font-black text-white uppercase tracking-widest">Chat de la Asamblea</span>
                        </div>
                        
                        {/* Scrollable opinions list */}
                        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                          {opiniones.length === 0 ? (
                            <p className="text-[8px] text-white/30 italic text-center pt-8">No hay mensajes aún.</p>
                          ) : (
                            opiniones.slice(-8).map((op) => (
                              <div key={op.id} className="text-[9px] leading-relaxed">
                                <span className="font-bold text-accent mr-1 uppercase text-[8px] tracking-wide">
                                  {op.apto ? `[${op.apto.split(" ").slice(-1)[0]}]` : ""}{op.nombre.split(" ").slice(-1)[0]}:
                                </span>
                                <span className="text-white/90 font-sans">{op.contenido}</span>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Send opinion input inside video overlay */}
                        <div className="border-t border-white/5 pt-2 mt-2">
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = e.currentTarget;
                              const input = form.elements.namedItem("overlayChatMsg") as HTMLInputElement;
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
                            className="flex gap-1"
                          >
                            <input
                              name="overlayChatMsg"
                              type="text"
                              placeholder="Enviar mensaje..."
                              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-[8.5px] text-white placeholder-white/30 outline-none focus:border-accent"
                            />
                            <button
                              type="submit"
                              className="px-2 py-1 bg-accent text-primary rounded-lg text-[8.5px] font-black uppercase hover:scale-102 transition-transform cursor-pointer"
                            >
                              <Send size={8} />
                            </button>
                          </form>
                        </div>
                      </div>

                      {/* Live spoken transcription subtitle for everyone */}
                      {subtitulos && subtitulos.length > 0 && (
                        <div className="absolute bottom-32 left-1/2 md:left-[38%] -translate-x-1/2 w-[85%] md:w-[60%] max-w-xl bg-black/60 backdrop-blur-xs px-4 py-2 rounded-lg shadow-lg text-center z-20 pointer-events-none select-none border border-white/5 animate-fade-in">
                          <p className="text-[11px] sm:text-xs text-white font-sans font-medium tracking-wide drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.9)]">
                            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[8px] mr-1.5">
                              [{subtitulos[subtitulos.length - 1].speaker}]:
                            </span>
                            {translatingSubtitles ? (
                              <span className="italic text-white/60 animate-pulse">Traduciendo...</span>
                            ) : (
                              `"${subtitlesLanguage === "ES" ? subtitulos[subtitulos.length - 1].text : translatedSubtitleText || subtitulos[subtitulos.length - 1].text}"`
                            )}
                          </p>
                        </div>
                      )}

                      {/* AI Suggestions floating subtitles block for the Administrator */}
                      {isWebAdmin && copilotData.sugerencias && copilotData.sugerencias.length > 0 && (
                        <div className="absolute bottom-6 left-1/2 md:left-[38%] -translate-x-1/2 w-[90%] md:w-[60%] max-w-2xl bg-black/75 backdrop-blur-xs px-5 py-3 rounded-xl shadow-2xl text-center z-20 pointer-events-none select-none border border-white/5 animate-fade-in">
                          <div className="flex flex-col gap-2">
                            <p className="text-xs sm:text-sm md:text-base text-yellow-300 font-sans font-semibold tracking-wide leading-relaxed drop-shadow-[0_2px_3px_rgba(0,0,0,1)]">
                              <span className="text-accent font-black uppercase tracking-wider text-[9px] mr-2">[IA COPILOTO]:</span>
                              {copilotData.sugerencias[0]}
                            </p>
                            {copilotData.sugerencias[1] && (
                              <p className="text-[11px] sm:text-xs text-white/90 font-sans font-normal leading-relaxed drop-shadow-[0_2px_3px_rgba(0,0,0,1)] border-t border-white/10 pt-2 mt-1">
                                <span className="text-cyan-400 font-black uppercase tracking-wider text-[9px] mr-2">[CONSEJO ALTERNATIVO]:</span>
                                {copilotData.sugerencias[1]}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2.1.2 SECONDARY TILES (Google Meet style Sidebar strip below) */}
                <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                  <span className="text-[9px] text-white/30 uppercase tracking-widest font-black block">Otros Participantes en la Reunión</span>
                  
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                    
                    {/* Compact Tile 1: Admin */}
                    <div className="relative w-[140px] aspect-video rounded-xl overflow-hidden bg-gradient-to-b from-[#18181c] to-[#0c0c0e] border border-white/10 flex flex-col justify-center items-center shrink-0 shadow-md">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-xs font-bold shadow-sm mb-1">
                        TA
                      </div>
                      <span className="text-[9px] font-bold text-white max-w-[120px] truncate">Thommy Admin</span>
                      <div className="absolute bottom-1 left-1.5 bg-black/60 px-1 py-0.5 rounded text-[7px] text-white/60 font-black uppercase tracking-wider scale-90 origin-bottom-left">
                        MOD / Admin
                      </div>
                    </div>

                    {/* Compact Council Members Tiles */}
                    {councilFeeds.map((feed) => (
                      <div key={feed.id} className="relative w-[140px] aspect-video rounded-xl overflow-hidden bg-gradient-to-b from-[#18181c] to-[#0c0c0e] border border-white/10 flex flex-col justify-center items-center shrink-0 shadow-md">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-xs font-bold shadow-sm mb-1">
                          {getInitials(feed.nombre)}
                        </div>
                        <span className="text-[9px] font-bold text-white max-w-[120px] truncate">{feed.nombre.split(" ").slice(-1)[0]}</span>
                        
                        {/* Mic status indicator */}
                        <span className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center ${feed.microfonoActivo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {feed.microfonoActivo ? <Mic size={8} /> : <MicOff size={8} />}
                        </span>
                        
                        <div className="absolute bottom-1 left-1.5 bg-black/60 px-1 py-0.5 rounded text-[7px] text-white/60 font-black uppercase tracking-wider scale-90 origin-bottom-left">
                          {feed.rol}
                        </div>
                      </div>
                    ))}

                    {/* Compact Tile of speaking Resident if active */}
                    {(() => {
                      const activeSpeaker = turnos.find((t: any) => t.estado === "HABLANDO");
                      if (!activeSpeaker) return null;
                      return (
                        <div className="relative w-[140px] aspect-video rounded-xl overflow-hidden bg-gradient-to-b from-[#18181c] to-[#0c0c0e] border-2 border-red-500/60 flex flex-col justify-center items-center shrink-0 shadow-md">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-xs font-bold shadow-sm mb-1">
                            {getInitials(activeSpeaker.nombre)}
                          </div>
                          <span className="text-[9px] font-bold text-white max-w-[120px] truncate">{activeSpeaker.nombre}</span>
                          
                          {/* Floating Traffic-Light Circle Timer */}
                          {speakingTimeLeft !== null && (
                            <div className="absolute top-1 left-1.5 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-xs px-1.5 py-0.5 rounded-md">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                speakingTimeLeft > 60 
                                  ? "bg-emerald-400 shadow-[0_0_6px_#10b981]" 
                                  : speakingTimeLeft > 20 
                                    ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" 
                                    : "bg-red-500 shadow-[0_0_6px_#ef4444] animate-ping"
                              }`} />
                              <span className="text-[7px] font-mono font-bold text-white">
                                {Math.floor(speakingTimeLeft / 60)}:{(speakingTimeLeft % 60).toString().padStart(2, '0')}
                              </span>
                            </div>
                          )}

                          <div className="absolute bottom-1 left-1.5 bg-red-600 px-1.5 py-0.5 rounded text-[7px] text-white font-black uppercase tracking-widest scale-90 origin-bottom-left flex items-center gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-white animate-ping" /> Hablando
                          </div>
                        </div>
                      );
                    })()}

                  </div>
                </div>

              </div>

              {/* ADMIN PANEL */}
              {isWebAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  {/* Left Column: Agenda & Quorum & Powers (2/5 size) */}
                  <div className="md:col-span-2 flex flex-col gap-5">
                    
                    {/* Quorum Progress Bar */}
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-5 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-white/60 uppercase tracking-widest text-[9px]">Quórum de Coeficiente Presente</span>
                        <span className="font-black text-accent text-sm">{(quorumPercentage * 100).toFixed(2)}%</span>
                      </div>
                      <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden relative">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${quorumPercentage >= 0.51 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                          style={{ width: `${Math.min(100, quorumPercentage * 100)}%` }} 
                        />
                        {/* 51% target marker line */}
                        <div className="absolute top-0 bottom-0 left-[51%] w-[1.5px] bg-red-500/80 shadow-[0_0_5px_red]" title="Mínimo Reglamentario (51%)" />
                      </div>
                      <div className="flex justify-between text-[9px] text-white/30 font-bold uppercase mt-0.5">
                        <span>Presentes: {asistencias.length} Residentes</span>
                        <span>{quorumPercentage >= 0.51 ? "✅ Quórum Válido" : "⚠️ Sin Quórum (Min 51%)"}</span>
                      </div>
                    </div>

                    {/* Powers of representation verification */}
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-5">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black uppercase tracking-widest text-white/40">Validación de Poderes</h4>
                        <span className="text-[9px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full font-bold text-white/60">
                          {poderes.filter(p => p.verificado).length}/{poderes.length} Aprobados
                        </span>
                      </div>
                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {poderes.length === 0 ? (
                          <div className="text-center py-4 text-white/30 text-xs">No hay poderes cargados.</div>
                        ) : (
                          poderes.map(p => (
                            <div key={p.id} className="bg-black/30 border border-white/5 p-3 rounded-2xl flex justify-between items-center text-xs">
                              <div>
                                <p className="font-bold text-white leading-tight">{p.otorganteNombre}</p>
                                <p className="text-[9px] text-white/40 uppercase mt-0.5">{p.otorganteApto} ➔ {p.apoderadoNombre}</p>
                              </div>
                              <div className="flex gap-1">
                                {p.verificado ? (
                                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase border border-emerald-500/20 rounded-md">Verificado</span>
                                ) : (
                                  <>
                                    <button 
                                      onClick={() => handleAprobarPoder(p.id, true)}
                                      className="px-2 py-1 bg-accent text-primary font-black text-[8px] uppercase tracking-wider rounded-md cursor-pointer"
                                    >
                                      Aprobar
                                    </button>
                                    <button 
                                      onClick={() => handleAprobarPoder(p.id, false, true)}
                                      className="px-2 py-1 bg-red-950/40 text-red-400 font-black text-[8px] uppercase tracking-wider rounded-md border border-red-500/20 cursor-pointer"
                                    >
                                      Rechazar
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Agenda / Orden del dia list */}
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center px-1">
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/30">Orden del Día</h3>
                        <span className="text-[9px] bg-accent/20 border border-accent/40 text-accent font-bold px-2 py-0.5 rounded-full">
                          {ordenDia.filter(item => item.estado === 'COMPLETADO').length}/{ordenDia.length} Listos
                        </span>
                      </div>

                      <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[350px] pr-1">
                        {ordenDia.map((item, index) => {
                          const isActive = index === itemActivoIndex;
                          const isCompleted = item.estado === 'COMPLETADO';
                          
                          return (
                            <div 
                              key={item.id}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                isActive 
                                  ? 'bg-linear-to-br from-accent/20 to-purple-900/10 border-accent shadow-lg shadow-accent/5' 
                                  : isCompleted
                                  ? 'bg-white/[0.01] border-white/5 opacity-50 hover:opacity-80'
                                  : 'bg-white/5 border-white/5 hover:border-white/15'
                              }`}
                              onClick={() => handleAgendaSelect(index)}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex gap-2">
                                  {isCompleted ? (
                                    <CheckCircle size={16} className="text-accent shrink-0 mt-0.5" />
                                  ) : isActive ? (
                                    <span className="w-4 h-4 rounded-full bg-accent shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-black text-primary animate-pulse">●</span>
                                  ) : (
                                    <Circle size={16} className="text-white/20 shrink-0 mt-0.5" />
                                  )}
                                  <span className={`text-xs font-bold leading-tight ${isActive ? 'text-white' : 'text-white/70'}`}>
                                    {item.titulo}
                                  </span>
                                </div>

                                {/* Ordering buttons */}
                                <div className="flex gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                  <button 
                                    onClick={() => handleUpdateAgendaOrder(index, "up")}
                                    disabled={index === 0}
                                    className="p-1 hover:bg-white/10 rounded-md text-white/30 hover:text-white disabled:opacity-20"
                                  >
                                    <ChevronUp size={12} />
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateAgendaOrder(index, "down")}
                                    disabled={index === ordenDia.length - 1}
                                    className="p-1 hover:bg-white/10 rounded-md text-white/30 hover:text-white disabled:opacity-20"
                                  >
                                    <ChevronDown size={12} />
                                  </button>
                                </div>
                              </div>
                              {item.descripcion && (
                                <p className="text-[10px] text-white/40 mt-1.5 leading-relaxed ml-6">
                                  {item.descripcion}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
 
                  {/* Center Column: Teleprompter, AI Copilot, Votations & Closure (3/5 size) */}
                  <div className="md:col-span-3 flex flex-col gap-6">
                    
                    {/* A. Teleprompter Widget */}
                    <div className="liquid-glass rounded-[32px] p-5 border border-white/10 flex flex-col h-[260px]">
                      <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                          <h4 className="text-xs font-black uppercase tracking-widest text-accent">Teleprompter Guía (Solo Admin)</h4>
                        </div>
                        {/* prompter controls */}
                        <div className="flex items-center gap-2">
                          {/* Live speech / subtitles trigger */}
                          {isSpeaking ? (
                            <button 
                              onClick={handleToggleSpeaking}
                              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 animate-pulse cursor-pointer"
                            >
                              <Pause size={10} /> Cerrar Mic
                            </button>
                          ) : (
                            <button 
                              onClick={handleToggleSpeaking}
                              className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/30 text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                            >
                              <Mic size={10} /> Hablar
                            </button>
                          )}

                          <button 
                            onClick={() => setIsPrompterScrolling(!isPrompterScrolling)}
                            className={`p-2 rounded-xl text-xs font-bold tracking-wider transition-all flex items-center justify-center cursor-pointer ${isPrompterScrolling ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}
                          >
                            {isPrompterScrolling ? <Pause size={12} /> : <Play size={12} />}
                          </button>
                          
                          <select 
                            className="bg-[#05020a] border border-white/10 rounded-xl px-2 py-1 text-[10px] text-white focus:outline-hidden"
                            value={prompterSpeed}
                            onChange={(e) => setPrompterSpeed(Number(e.target.value))}
                          >
                            <option value={1}>Lento</option>
                            <option value={2}>Medio</option>
                            <option value={3}>Rápido</option>
                          </select>
                        </div>
                      </div>
 
                      {/* Prompter Scrolling Text */}
                      <div 
                        ref={prompterRef}
                        className="flex-1 overflow-y-auto hide-scrollbar bg-black/40 p-4 rounded-2xl border border-white/5 font-serif text-sm leading-relaxed text-yellow-100 select-none max-h-[160px] scroll-smooth"
                      >
                        <p className="whitespace-pre-line text-glow">
                          {copilotData.guiaTeleprompter}
                        </p>
                      </div>
                    </div>
 
                    {/* B. AI Copilot Widget */}
                    <div className="liquid-glass rounded-[32px] p-5 border border-white/10 flex flex-col">
                      <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles size={14} className="text-accent" />
                          <h4 className="text-xs font-black uppercase tracking-widest text-white">Copiloto IA (Gemini)</h4>
                        </div>
                        <button 
                          onClick={() => triggerCopilot()}
                          disabled={copilotLoading}
                          className="px-3 py-1 bg-accent hover:bg-accent/80 text-primary font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {copilotLoading ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : (
                            <Sparkles size={10} />
                          )}
                          Actualizar Sugerencias
                        </button>
                      </div>
 
                      {/* AI suggestions content */}
                      <div className="space-y-4">
                        {/* Sentiment */}
                        <div>
                          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block mb-1">Análisis de Sentimiento de Residentes</span>
                          <p className="text-xs text-white/70 italic bg-white/5 p-3 rounded-xl border border-white/5">
                            {copilotData.resumenSentimiento}
                          </p>
                        </div>
 
                        {/* Ideas/Tips */}
                        <div>
                          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block mb-1.5">Sugerencias y Soluciones del Copiloto</span>
                          <ul className="space-y-2">
                            {copilotData.sugerencias.map((sug, idx) => (
                              <li key={idx} className="text-xs text-white/80 flex items-start gap-2">
                                <span className="text-accent shrink-0 mt-0.5">✦</span>
                                <span>{sug}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* C. Admin Votations Panel */}
                    <div className="liquid-glass rounded-[32px] p-5 border border-white/10 flex flex-col">
                      <h4 className="text-xs font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-1.5">
                        <CheckCircle size={12} className="text-accent" /> Control de Votaciones Ponderadas
                      </h4>

                      {/* Legal warning if overall attendance is less than 70% for qualified quorum */}
                      {isWebAdmin && quorumPercentage < 0.70 && (
                        <div className="bg-red-500/15 border border-red-500/25 p-3 rounded-2xl text-[9px] text-red-400 font-semibold leading-relaxed mb-3 animate-pulse">
                          ⚠️ ALERTA DE QUÓRUM LEGAL: El quórum verificado actual es de {(quorumPercentage * 100).toFixed(1)}%. Ninguna propuesta de Quórum Calificado (70% total) podrá ser aprobada hoy a menos que ingresen más copropietarios o se registren más poderes.
                        </div>
                      )}
                      
                      {/* Active proposals list */}
                      <div className="space-y-3 mb-4">
                        {votaciones.length === 0 ? (
                          <div className="text-center py-4 text-white/30 text-xs">No hay propuestas de votación creadas.</div>
                        ) : (
                          votaciones.map((v: any) => {
                            const totalVotes = v.votos.length;
                            const totalWeight = v.votos.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                            
                            return (
                              <div key={v.id} className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3">
                                <div className="flex justify-between items-start">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${v.activa ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : 'bg-white/5 text-white/40 border-white/10'}`}>
                                        {v.activa ? "Activa" : "Cerrada"}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${v.formula === 'QUORUM_CALIFICADO' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'}`}>
                                        {v.formula === 'QUORUM_CALIFICADO' ? "Quórum Calificado (70%)" : "Mayoría Simple"}
                                      </span>
                                    </div>
                                    <h5 className="text-xs font-bold text-white mt-1">{v.titulo}</h5>
                                  </div>
                                  <button 
                                    onClick={() => handleActivarVotacion(v.id, !v.activa)}
                                    className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${v.activa ? 'bg-amber-600/30 text-amber-400 hover:bg-amber-600/50' : 'bg-accent text-primary'}`}
                                  >
                                    {v.activa ? "Cerrar" : "Lanzar Votación"}
                                  </button>
                                </div>
                                
                                {v.descripcion && <p className="text-[10px] text-white/50">{v.descripcion}</p>}

                                {/* Results display */}
                                <div className="space-y-2.5 pt-3 border-t border-white/5">
                                  {v.opciones.map((op: string) => {
                                    const matchingVotes = v.votos.filter((x: any) => x.respuesta === op);
                                    const opWeight = matchingVotes.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                    // Pct of Cast: for Mayoria Simple
                                    const pctOfCast = totalWeight > 0 ? (opWeight / totalWeight) * 100 : 0;
                                    // Pct of Total (1.0 or 100%): for Quorum Calificado
                                    const pctOfTotal = opWeight * 100;
                                    
                                    const displayPct = v.formula === "QUORUM_CALIFICADO" ? pctOfTotal : pctOfCast;
                                    const colorGradient = getOptionColor(op);
                                    
                                    return (
                                      <div key={op} className="space-y-1">
                                        <div className="flex justify-between text-[10px]">
                                          <span className="font-bold uppercase text-white/80">{op}</span>
                                          <span className="font-semibold text-white/60">
                                            {displayPct.toFixed(1)}% {v.formula === "QUORUM_CALIFICADO" ? "del Total" : "de Votos Emitidos"} ({matchingVotes.length} {matchingVotes.length === 1 ? 'voto' : 'votos'})
                                          </span>
                                        </div>
                                        <div className="relative w-full h-3.5 bg-black/45 rounded-full overflow-hidden border border-white/5">
                                          {v.formula === "QUORUM_CALIFICADO" && (
                                            <>
                                              <div className="absolute left-[70%] top-0 bottom-0 border-l border-red-500/60 border-dashed z-10" />
                                              <span className="absolute left-[71%] top-0 text-[6.5px] font-black text-red-400 uppercase leading-[14px] tracking-widest z-10">70% Req</span>
                                            </>
                                          )}
                                          <div 
                                            className={`h-full rounded-full transition-all duration-500 ${colorGradient}`} 
                                            style={{ width: `${Math.min(displayPct, 100)}%` }} 
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Quorum Calificado Legal Result Summary */}
                                {v.formula === "QUORUM_CALIFICADO" && (
                                  <div className="mt-3 p-2 rounded-xl text-[10px] font-semibold text-center border border-white/5">
                                    {(() => {
                                      const siVotes = v.votos.filter((x: any) => x.respuesta.toUpperCase() === "SI" || x.respuesta.toUpperCase() === "SÍ");
                                      const siWeight = siVotes.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                      const passed = siWeight >= 0.70;
                                      
                                      if (passed) {
                                        return (
                                          <div className="bg-emerald-500/10 border-emerald-500/25 text-emerald-400">
                                            ✅ Propuesta APROBADA (SÍ alcanzó el {(siWeight * 100).toFixed(1)}% del Coeficiente Total)
                                          </div>
                                        );
                                      } else {
                                        return (
                                          <div className="bg-yellow-500/10 border-yellow-500/25 text-yellow-400 animate-pulse">
                                            ⏳ Propuesta EN DEBATE (SÍ lleva el {(siWeight * 100).toFixed(1)}% del 70.0% requerido)
                                          </div>
                                        );
                                      }
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                      
                      {/* Create form */}
                      <div className="border-t border-white/5 pt-4 space-y-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block">Nueva Propuesta</span>
                          <button 
                            type="button"
                            onClick={handleGenerateConsensusProposal}
                            disabled={generatingConsensus}
                            className="text-[8.5px] font-black text-accent hover:text-purple-400 uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles size={11} className={generatingConsensus ? "animate-spin text-purple-400" : "animate-pulse"} />
                            {generatingConsensus ? "Redactando..." : "Redactar Consenso con IA"}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input 
                            type="text"
                            placeholder="Título (ej: Cuota extraordinaria ascensor)"
                            value={votacionTituloInput}
                            onChange={e => setVotacionTituloInput(e.target.value)}
                            className="bg-[#05020a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                          />
                          <input 
                            type="text"
                            placeholder="Opciones (ej: SI, NO, ABSTENCION)"
                            value={votacionOpcionesInput}
                            onChange={e => setVotacionOpcionesInput(e.target.value)}
                            className="bg-[#05020a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input 
                            type="text"
                            placeholder="Descripción breve..."
                            value={votacionDescripcionInput}
                            onChange={e => setVotacionDescripcionInput(e.target.value)}
                            className="bg-[#05020a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                          />
                          <select
                            value={votacionFormulaInput}
                            onChange={e => setVotacionFormulaInput(e.target.value as any)}
                            className="bg-[#05020a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden cursor-pointer"
                          >
                            <option value="MAYORIA_SIMPLE">Mayoría Simple (Coeficiente Relativo)</option>
                            <option value="QUORUM_CALIFICADO">Quórum Calificado (70% Coeficiente Total)</option>
                          </select>
                        </div>
                        <button 
                          onClick={handleCrearVotacion}
                          className="w-full bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-[9px] uppercase tracking-wider py-2.5 rounded-xl cursor-pointer"
                        >
                          Crear y Guardar Propuesta
                        </button>
                      </div>
                    </div>

                    {/* D. Finalizar & AI Acta Widget */}
                    <div className="liquid-glass rounded-[32px] p-6 border border-white/10 flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b border-white/5 pb-3">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest text-white">Clausura y Acta Legal (Gemini IA)</h4>
                          <p className="text-[9px] text-white/40 mt-0.5">Genera automáticamente el acta de la asamblea consolidando quórum y votaciones.</p>
                        </div>
                        <button 
                          onClick={handleFinalizarAsamblea}
                          disabled={actaLoading}
                          className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {actaLoading ? <RefreshCw size={10} className="animate-spin" /> : <Shield size={10} />}
                          Cerrar y Redactar Acta
                        </button>
                      </div>

                      {actaContent && (
                        <div className="space-y-3">
                          <div className="bg-black/50 border border-white/5 rounded-2xl p-4 max-h-[220px] overflow-y-auto text-[10px] font-mono text-white/70 leading-relaxed whitespace-pre-wrap select-all scroll-smooth">
                            {actaContent}
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <span className="text-[9px] text-emerald-400 font-bold uppercase flex items-center gap-1">
                              <CheckCircle size={10} /> Validada bajo hash de auditoría legal
                            </span>
                            <a 
                              href={`data:text/markdown;charset=utf-8,${encodeURIComponent(actaContent)}`}
                              download="Acta_Asamblea_Ordinaria.md"
                              className="px-3.5 py-2 bg-accent text-primary hover:scale-102 transition-all font-black text-[9px] uppercase tracking-wider rounded-xl flex items-center gap-1 cursor-pointer"
                            >
                              Descargar Acta (.md)
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* RESIDENT PANEL (WEB VIEW) */}
              {!isWebAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  {/* Left Column: Agenda (2/5 size) */}
                  <div className="md:col-span-2 flex flex-col gap-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/30 px-1">Progreso de la Asamblea</h3>
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-5">
                      <div className="flex items-center gap-2 mb-4 bg-accent/15 border border-accent/30 p-4 rounded-2xl">
                        <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse shrink-0" />
                        <div>
                          <span className="text-[8px] font-black text-accent uppercase tracking-widest block">Tema en Discusión</span>
                          <h4 className="text-sm font-bold text-white leading-tight mt-0.5">{activeAgendaItem.titulo}</h4>
                        </div>
                      </div>

                      <div className="space-y-3 pl-2">
                        {ordenDia.map((item, idx) => (
                          <div key={item.id} className="flex items-center gap-3 text-xs">
                            {item.estado === 'COMPLETADO' ? (
                              <CheckCircle size={14} className="text-accent shrink-0" />
                            ) : idx === itemActivoIndex ? (
                              <span className="w-2 h-2 rounded-full bg-accent shrink-0 animate-ping" />
                            ) : (
                              <Circle size={14} className="text-white/10 shrink-0" />
                            )}
                            <span className={idx === itemActivoIndex ? "text-white font-bold" : "text-white/40"}>
                              {item.titulo}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Interaction (3/5 size) */}
                  <div className="md:col-span-3 flex flex-col gap-5">
                    
                    {/* Check-In Card */}
                    {!asistencias.some(a => a.usuarioId === session?.user?.id) ? (
                      <div className="bg-amber-600/10 border border-amber-500/30 rounded-3xl p-5 flex flex-col items-center text-center gap-3">
                        <AlertCircle size={28} className="text-amber-400 animate-bounce" />
                        <div>
                          <h4 className="text-xs font-bold text-white">Asistencia No Confirmada</h4>
                          <p className="text-[10px] text-white/50 mt-1">Registra tu asistencia para computar tu coeficiente en el quórum reglamentario.</p>
                        </div>
                        <button 
                          onClick={() => handleCheckIn("VIRTUAL")}
                          disabled={submittingCheckIn}
                          className="px-5 py-2.5 bg-amber-500 text-primary font-black text-[10px] uppercase tracking-wider rounded-xl hover:scale-102 transition-all cursor-pointer disabled:opacity-50"
                        >
                          Confirmar Mi Asistencia (Check-In)
                        </button>
                      </div>
                    ) : (
                      <div className="bg-emerald-600/10 border border-emerald-500/30 rounded-3xl p-4 flex items-center gap-3 text-emerald-400 text-xs">
                        <CheckCircle size={18} className="shrink-0" />
                        <div>
                          <p className="font-bold">Asistencia Registrada</p>
                          <p className="text-[9px] text-white/40">Presente en asamblea virtual. IP registrada para auditoría legal.</p>
                        </div>
                      </div>
                    )}

                    {/* Active proposals list for resident voting */}
                    {votaciones.filter((v: any) => v.activa).map((v: any) => {
                      const hasVoted = v.votos.some((x: any) => x.usuarioId === session?.user?.id);
                      const myVote = v.votos.find((x: any) => x.usuarioId === session?.user?.id);
                      
                      return (
                        <div key={v.id} className="bg-accent/15 border border-accent shadow-lg shadow-accent/5 rounded-3xl p-5 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black bg-accent text-primary px-1.5 py-0.5 rounded uppercase tracking-wider block w-fit">Votación Activa</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${v.formula === 'QUORUM_CALIFICADO' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'}`}>
                              {v.formula === 'QUORUM_CALIFICADO' ? "Quórum Calificado (70%)" : "Mayoría Simple"}
                            </span>
                          </div>
                          
                          <h4 className="text-sm font-bold text-white leading-tight">{v.titulo}</h4>
                          {v.descripcion && <p className="text-[10px] text-white/50 leading-relaxed">{v.descripcion}</p>}
                          
                          {hasVoted ? (
                            <div className="space-y-3 pt-2">
                              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-400 font-medium">
                                <p className="flex items-center gap-1.5">
                                  <CheckCircle size={12} /> Tu voto: "{myVote?.respuesta}" registrado con éxito.
                                </p>
                                <p className="text-[7.5px] text-white/40 font-mono mt-1 truncate">Firma: {myVote?.hashFirma}</p>
                              </div>
                              
                              {/* Live Results Progress for Resident */}
                              <div className="space-y-2 bg-black/30 p-3 rounded-2xl border border-white/5">
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-widest block mb-1">Resultados Parciales en Vivo</span>
                                {(() => {
                                  const totalWeight = v.votos.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                  
                                  return v.opciones.map((op: string) => {
                                    const matchingVotes = v.votos.filter((x: any) => x.respuesta === op);
                                    const opWeight = matchingVotes.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                    const pctOfCast = totalWeight > 0 ? (opWeight / totalWeight) * 100 : 0;
                                    const pctOfTotal = opWeight * 100;
                                    const displayPct = v.formula === "QUORUM_CALIFICADO" ? pctOfTotal : pctOfCast;
                                    const colorGradient = getOptionColor(op);
                                    
                                    return (
                                      <div key={op} className="space-y-1">
                                        <div className="flex justify-between text-[9px]">
                                          <span className="font-bold text-white/70 uppercase">{op}</span>
                                          <span className="font-semibold text-white/50">{displayPct.toFixed(1)}%</span>
                                        </div>
                                        <div className="relative w-full h-2.5 bg-black/45 rounded-full overflow-hidden border border-white/5">
                                          {v.formula === "QUORUM_CALIFICADO" && (
                                            <div className="absolute left-[70%] top-0 bottom-0 border-l border-red-500/50 border-dashed z-10" />
                                          )}
                                          <div 
                                            className={`h-full rounded-full transition-all duration-300 ${colorGradient}`} 
                                            style={{ width: `${Math.min(displayPct, 100)}%` }} 
                                          />
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 pt-2">
                              {v.opciones.map((op: string) => (
                                <button 
                                  key={op}
                                  onClick={() => handleVotar(v.id, op)}
                                  className="flex-1 bg-accent/20 hover:bg-accent text-white hover:text-primary border border-accent/40 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer hover:scale-102"
                                >
                                  {op}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Turn widget */}
                    <div className="liquid-glass rounded-[32px] p-6 border border-white/10 flex flex-col justify-center items-center text-center">
                      <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">Intervención en la Reunión</h4>
                      
                      {turnos.some(t => t.usuarioId === session?.user?.id && t.estado === "HABLANDO") ? (
                        <div className="flex flex-col items-center gap-3 animate-bounce">
                          <div className="w-16 h-16 bg-red-500/20 border border-red-500 rounded-full flex items-center justify-center text-red-400">
                            <Mic size={28} />
                          </div>
                          <span className="text-sm font-bold text-red-400">¡Tu micrófono está abierto! Habla ahora.</span>
                        </div>
                      ) : turnos.some(t => t.usuarioId === session?.user?.id && t.estado === "PENDIENTE") ? (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-16 h-16 bg-yellow-500/20 border border-yellow-500/40 rounded-full flex items-center justify-center text-yellow-400">
                            <MicOff size={28} />
                          </div>
                          <span className="text-sm font-bold text-yellow-400">
                            En cola de espera (Posición #{turnos.filter(t => t.estado === "PENDIENTE" || t.estado === "HABLANDO").findIndex(t => t.usuarioId === session?.user?.id) + 1})
                          </span>
                          <span className="text-[10px] text-white/30">Espera a que el administrador te ceda la palabra.</span>
                        </div>
                      ) : (
                        <button 
                          onClick={handleRequestSpeak}
                          className="px-6 py-4 bg-linear-to-r from-accent to-purple-600 hover:scale-102 active:scale-98 text-white font-bold text-sm uppercase tracking-wider rounded-2xl flex items-center gap-3 transition-all shadow-[0_10px_25px_rgba(217,70,239,0.3)] cursor-pointer"
                        >
                          <Mic size={18} /> Pedir la Palabra
                        </button>
                      )}
                    </div>

                    {/* Opinions widget */}
                    <div className="liquid-glass rounded-[32px] p-5 border border-white/10 flex flex-col">
                      <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">Enviar mi Opinión a la Administración</h4>
                      
                      <form onSubmit={handleSubmitOpinion} className="flex gap-2">
                        <input 
                          type="text"
                          required
                          value={opinionInput}
                          onChange={(e) => setOpinionInput(e.target.value)}
                          placeholder="ej: Sugiero votar primero el punto sobre la cuota."
                          className="flex-1 bg-white/5 border border-white/5 rounded-2xl px-4 py-3 text-xs text-white focus:outline-hidden focus:border-accent/40"
                        />
                        <button 
                          type="submit"
                          disabled={submittingOpinion}
                          className="w-12 h-12 bg-accent text-primary rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        >
                          <Send size={16} />
                        </button>
                      </form>
                      <span className="text-[9px] text-white/20 mt-2 block">
                        Tus opiniones serán analizadas por el Copiloto IA para guiar al administrador.
                      </span>
                    </div>

                  </div>
                </div>
              )}

              {/* SHARED LIVE PANELS (Admin Queue / Opinions Feed visible to logged in users) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* 1. Turn queue */}
                <div className="liquid-glass rounded-[32px] p-5 border border-white/10">
                  <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">Solicitudes de Palabra</h4>
                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                    {turnos.filter(t => t.estado === "PENDIENTE" || t.estado === "HABLANDO").length === 0 ? (
                      <div className="text-center py-6 text-white/30 text-xs">No hay solicitudes de palabra activas.</div>
                    ) : (
                      turnos.filter(t => t.estado === "PENDIENTE" || t.estado === "HABLANDO").map((t, idx) => (
                        <div key={t.id} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-white/30 font-black">#{idx + 1}</span>
                            <div>
                              <h5 className="text-xs font-bold leading-none mb-1 text-white">{t.nombre}</h5>
                              <p className="text-[9px] text-white/40 uppercase font-medium">{t.apto || "N/A"}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {t.estado === "HABLANDO" ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[8px] text-red-400 font-bold uppercase animate-pulse">Hablando</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] text-white/40 font-bold uppercase">En cola</span>
                            )}

                            {isWebAdmin && (
                              <div className="flex gap-1.5">
                                {t.estado !== "HABLANDO" && (
                                  <button 
                                    onClick={() => handleGrantMic(t.id)}
                                    className="px-2 py-1 bg-accent text-primary rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer"
                                  >
                                    Ceder Mic
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleCompleteTurn(t.id)}
                                  className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer"
                                >
                                  Terminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2. Live opinions stream */}
                <div className="liquid-glass rounded-[32px] p-5 border border-white/10">
                  <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">Comentarios y Opiniones Recientes</h4>
                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                    {opiniones.length === 0 ? (
                      <div className="text-center py-6 text-white/30 text-xs">No hay opiniones enviadas todavía.</div>
                    ) : (
                      [...opiniones].reverse().map((op) => (
                        <div key={op.id} className="bg-white/5 p-3.5 rounded-2xl border border-white/5">
                          <div className="flex justify-between items-start mb-1.5">
                            <span className="text-[10px] font-bold text-accent">{op.nombre}</span>
                            <span className="text-[8px] text-white/30">{op.apto || "N/A"}</span>
                          </div>
                          <p className="text-xs text-white/80 leading-normal">{op.contenido}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        {/* Right Column: MOBILE SIMULATOR FRAME (visible only in Demo Mode on desktop) */}
        {isDemoMode && (
          <div className="flex flex-col items-center relative">
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
                        {status === "authenticated" && (
                          <div className="flex-1 flex flex-col gap-3.5">
                            
                            {/* Mobile Video Conference Stream */}
                            <div className="bg-black/50 border border-white/10 rounded-2xl p-2 flex flex-col gap-1.5 relative overflow-hidden">
                              <div className="flex justify-between items-center px-1">
                                <span className="text-[7px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" /> Video en Vivo
                                </span>
                                
                                {/* Micro controls inside Mobile App */}
                                <div className="flex gap-1 items-center">
                                  <select
                                    id="mobile-subtitle-lang-select"
                                    value={subtitlesLanguage}
                                    onChange={(e) => setSubtitlesLanguage(e.target.value as any)}
                                    className="bg-white/10 hover:bg-white/20 transition-all text-[8px] text-white font-bold p-1 rounded-md border border-white/10 cursor-pointer outline-none max-w-[65px] font-sans"
                                  >
                                    <option value="ES" className="bg-neutral-900 text-white">🇪🇸 ES</option>
                                    <option value="EN" className="bg-neutral-900 text-white">🇺🇸 EN</option>
                                    <option value="PT" className="bg-neutral-900 text-white">🇧🇷 PT</option>
                                    <option value="FR" className="bg-neutral-900 text-white">🇫🇷 FR</option>
                                  </select>
                                  <button 
                                    onClick={toggleMute}
                                    className={`p-1 rounded-md text-[8px] font-bold uppercase transition-all ${
                                      isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/80'
                                    }`}
                                  >
                                    {isMuted ? <MicOff size={8} /> : <Mic size={8} />}
                                  </button>
                                  <button 
                                    onClick={toggleCamera}
                                    className={`p-1 rounded-md text-[8px] font-bold uppercase transition-all ${
                                      !isCameraActive ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/80'
                                    }`}
                                  >
                                    {isCameraActive ? <Play size={8} /> : <Pause size={8} />}
                                  </button>
                                </div>
                              </div>

                              {/* Main screen focus (Admin or Self speaking) */}
                              <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/5 flex items-center justify-center relative">
                                {isCameraActive && localStream ? (
                                  <video 
                                    ref={mobileVideoRef} 
                                    autoPlay 
                                    playsInline 
                                    muted 
                                    className="w-full h-full object-cover -scale-x-100" 
                                  />
                                ) : (
                                  <div className="text-center p-2 flex flex-col items-center justify-center">
                                    <span className="text-xl animate-pulse block mb-1">👑</span>
                                    <span className="text-[9px] font-bold text-white block">Thommy Admin</span>
                                    <span className="text-[7px] text-white/40 block">Administrador del Conjunto</span>
                                  </div>
                                )}
                                
                                <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded text-[7px] font-bold text-white/90 z-10">
                                  {isCameraActive && localStream ? "Tu Cámara" : "Transmisión Admin"}
                                </div>

                                {/* Translated Subtitles Overlay for Mobile Screen */}
                                {subtitulos && subtitulos.length > 0 && (
                                  <div className="absolute bottom-1.5 right-1.5 left-1.5 bg-black/70 backdrop-blur-xs px-2 py-1 rounded text-center pointer-events-none select-none border border-white/5 animate-fade-in z-10">
                                    <p className="text-[7px] text-white font-sans font-medium tracking-wide leading-tight">
                                      <span className="text-emerald-400 font-bold uppercase text-[6px] mr-1">
                                        [{subtitulos[subtitulos.length - 1].speaker}]:
                                      </span>
                                      {translatingSubtitles ? (
                                        <span className="italic text-white/60 animate-pulse">Translating...</span>
                                      ) : (
                                        `"${subtitlesLanguage === "ES" ? subtitulos[subtitulos.length - 1].text : translatedSubtitleText || subtitulos[subtitulos.length - 1].text}"`
                                      )}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Council list carousel/strip */}
                              <div className="flex gap-1.5 overflow-x-auto pb-1 mt-0.5">
                                {councilFeeds.map(c => (
                                  <div key={c.id} className="flex items-center gap-1 bg-white/5 border border-white/5 p-1 rounded-lg min-w-[75px] text-[7px] shrink-0">
                                    <span>{c.avatar}</span>
                                    <span className="truncate font-semibold text-white/70 max-w-[45px]">{c.nombre.split(" ").slice(-1)[0]}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Check-In status */}
                            {!asistencias.some(a => a.usuarioId === mobileSession.id) ? (
                              <div className="bg-amber-600/10 border border-amber-500/25 p-3 rounded-2xl flex flex-col gap-2 items-center text-center">
                                <span className="text-[7px] font-black text-amber-400 uppercase">Quórum Pendiente</span>
                                <button 
                                  onClick={() => handleCheckIn("VIRTUAL", mobileSession.id)}
                                  className="w-full py-2 bg-amber-500 text-primary font-black text-[9px] uppercase tracking-wider rounded-xl cursor-pointer"
                                >
                                  Confirmar Asistencia
                                </button>
                              </div>
                            ) : (
                              <div className="bg-emerald-600/10 border border-emerald-500/25 p-2 rounded-2xl flex items-center justify-center gap-1.5 text-emerald-400 text-[9px] font-bold">
                                <CheckCircle size={10} /> Presente en Quórum
                              </div>
                            )}

                            {/* Active Votation Toast inside Mobile */}
                            {votaciones.filter((v: any) => v.activa).map((v: any) => {
                              const hasVoted = v.votos.some((x: any) => x.usuarioId === mobileSession.id);
                              const myVote = v.votos.find((x: any) => x.usuarioId === mobileSession.id);
                              
                              return (
                                <div key={v.id} className="bg-accent/15 border border-accent rounded-2xl p-3 flex flex-col gap-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[7px] font-black bg-accent text-primary px-1.5 py-0.5 rounded uppercase tracking-wider block w-fit">Votación Activa</span>
                                    <span className="text-[7px] font-bold text-white/50">
                                      {v.formula === 'QUORUM_CALIFICADO' ? "Q. Calificado" : "M. Simple"}
                                    </span>
                                  </div>
                                  <h5 className="text-[10px] font-bold text-white leading-tight">{v.titulo}</h5>
                                  
                                  {hasVoted ? (
                                    <div className="space-y-2">
                                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col gap-0.5 text-[9px] text-emerald-400 font-medium font-sans">
                                        <p className="flex items-center gap-1 font-bold">
                                          <CheckCircle size={10} /> Voto: "{myVote?.respuesta}"
                                        </p>
                                        <p className="text-[6px] text-white/45 truncate">Firma: {myVote?.hashFirma}</p>
                                      </div>
                                      
                                      {/* Mobile live results list */}
                                      <div className="bg-black/35 p-2 rounded-xl space-y-1.5 border border-white/5">
                                        {(() => {
                                          const totalWeight = v.votos.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                          return v.opciones.map((op: string) => {
                                            const matchingVotes = v.votos.filter((x: any) => x.respuesta === op);
                                            const opWeight = matchingVotes.reduce((acc: number, curr: any) => acc + curr.coeficiente, 0);
                                            const pctOfCast = totalWeight > 0 ? (opWeight / totalWeight) * 100 : 0;
                                            const pctOfTotal = opWeight * 100;
                                            const displayPct = v.formula === "QUORUM_CALIFICADO" ? pctOfTotal : pctOfCast;
                                            const colorGradient = getOptionColor(op);
                                            
                                            return (
                                              <div key={op} className="space-y-0.5">
                                                <div className="flex justify-between text-[7px] font-bold">
                                                  <span className="text-white/60 uppercase">{op}</span>
                                                  <span className="text-white/40">{displayPct.toFixed(0)}%</span>
                                                </div>
                                                <div className="relative w-full h-1.5 bg-black/45 rounded-full overflow-hidden border border-white/5">
                                                  <div 
                                                    className={`h-full rounded-full transition-all duration-300 ${colorGradient}`} 
                                                    style={{ width: `${Math.min(displayPct, 100)}%` }} 
                                                  />
                                                </div>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1.5">
                                      {v.opciones.map((op: string) => (
                                        <button 
                                          key={op}
                                          onClick={() => handleVotar(v.id, op)}
                                          className="flex-1 bg-accent/20 hover:bg-accent text-white hover:text-primary border border-accent/40 rounded-lg py-1.5 text-[9px] font-black uppercase transition-all cursor-pointer"
                                        >
                                          {op}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Delegation Power (Representation) */}
                            <div className="bg-white/5 border border-white/5 p-3 rounded-2xl flex flex-col gap-2">
                              <span className="text-[7px] font-black text-white/30 uppercase tracking-widest">Otorgar Poder</span>
                              <div className="flex gap-1.5">
                                <select 
                                  value={mobileOtorganteId}
                                  onChange={e => setMobileOtorganteId(e.target.value)}
                                  className="flex-1 bg-[#05020a] border border-white/10 rounded-xl px-2 py-1.5 text-[9px] text-white focus:outline-hidden"
                                >
                                  <option value="">Elegir Vecino...</option>
                                  <option value="usr_01ovtd">Raúl Montaño (Torre 1 Apto 502)</option>
                                  <option value="usr_thommyadmin">Thommy Admin (Admin Oficina)</option>
                                  <option value="usr_thommy">Thommy Master (Penthouse)</option>
                                </select>
                                <button 
                                  onClick={handleOtorgarPoder}
                                  disabled={!mobileOtorganteId || submittingPoder}
                                  className="px-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-30"
                                >
                                  Otorgar
                                </button>
                              </div>
                            </div>

                            {/* Current agenda banner */}
                            <div className="bg-accent/10 border border-accent/20 rounded-2xl p-3 flex flex-col">
                              <span className="text-[7px] font-black text-accent uppercase tracking-wider block mb-0.5">Punto en discusión</span>
                              <h4 className="text-[10px] font-bold text-white leading-tight truncate">{activeAgendaItem.titulo}</h4>
                              <p className="text-[8px] text-white/45 line-clamp-2 mt-1 leading-normal">
                                {activeAgendaItem.descripcion || "Sin descripción."}
                              </p>
                            </div>

                            {/* Speaker queue status */}
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex flex-col items-center text-center gap-1.5">
                              <span className="text-[7px] font-black text-white/30 uppercase tracking-widest">Hablar en la Reunión</span>
                              
                              {turnos.some(t => t.usuarioId === mobileSession.id && t.estado === "HABLANDO") ? (
                                <div className="text-red-400 font-bold text-[9px] animate-pulse flex items-center gap-1">
                                  <Mic size={9} /> ¡Tu micrófono está abierto!
                                </div>
                              ) : turnos.some(t => t.usuarioId === mobileSession.id && t.estado === "PENDIENTE") ? (
                                <div className="text-yellow-400 font-bold text-[9px] flex items-center gap-1">
                                  <MicOff size={9} /> En cola (Posición #{turnos.filter(t => t.estado === "PENDIENTE" || t.estado === "HABLANDO").findIndex(t => t.usuarioId === mobileSession.id) + 1})
                                </div>
                              ) : (
                                <button 
                                  onClick={handleMobileRequestSpeak}
                                  className="w-full py-2 bg-accent text-primary rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer"
                                >
                                  Pedir la Palabra
                                </button>
                              )}
                            </div>

                            {/* Comment box */}
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex flex-col">
                              <span className="text-[7px] font-black text-white/30 uppercase tracking-widest mb-1.5 block">Enviar Opinión</span>
                              <textarea 
                                value={mobileOpinionText}
                                onChange={(e) => setMobileOpinionText(e.target.value)}
                                placeholder="Escribe aquí tu opinión sobre el punto..."
                                className="bg-[#05020a] border border-white/10 rounded-xl p-2 text-[9px] text-white focus:outline-hidden resize-none mb-2 min-h-[40px]"
                              />
                              <button 
                                onClick={handleMobileSubmitOpinion}
                                disabled={!mobileOpinionText.trim()}
                                className="w-full py-2 bg-linear-to-r from-accent to-purple-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                              >
                                Enviar Comentario
                              </button>
                            </div>

                          </div>
                        )}
                        
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

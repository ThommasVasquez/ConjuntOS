"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import {
  Building2,
  Home,
  User,
  Package,
  Printer,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Lock,
  Sparkles,
  QrCode,
  Check,
  Search,
  Truck,
  ShieldCheck,
  ChevronRight,
  Clock,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import StickerEtiqueta, { StickerData } from "@/components/paqueteria/StickerEtiqueta";
import {
  BLOQUES_REALES_LAS_BRISAS,
  getCasasRealesDeBloque,
  findResidenteReal,
  RESIDENTES_REALES_LAS_BRISAS,
} from "@/lib/lasBrisasData";

function getValidBackendTipo(tipo: string): string {
  switch (tipo) {
    case "ENERGIA":
      return "ENERGIA";
    case "AGUA":
      return "AGUA";
    case "GAS":
      return "GAS";
    case "CARTA":
    case "CARTA_BANCO":
      return "CARTA";
    case "DOCUMENTO":
      return "DOCUMENTO";
    case "REVISTA":
      return "REVISTA";
    default:
      return "OTRO";
  }
}

interface DirectorioItem {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
  telefono?: string | null;
}

interface CategoriaEntrega {
  id: string;
  label: string;
  sublabel: string;
  emoji: string;
  borderGlow: string;
  tipoBackend: string;
  accentColor: string;
}

const CATEGORIAS: CategoriaEntrega[] = [
  {
    id: "comida",
    label: "Comida Caliente",
    sublabel: "Urgente • Domicilio",
    emoji: "🍔",
    borderGlow: "border-red-500/40 text-red-400 group-hover:border-red-500",
    tipoBackend: "COMIDA",
    accentColor: "#ef4444",
  },
  {
    id: "paquete",
    label: "Paquetería",
    sublabel: "MercadoLibre • Amazon",
    emoji: "📦",
    borderGlow: "border-[#57bf00]/40 text-[#57bf00] group-hover:border-[#57bf00]",
    tipoBackend: "PAQUETE",
    accentColor: "#57bf00",
  },
  {
    id: "cadena_frio",
    label: "Cadena de Frío",
    sublabel: "Medicamentos • Frío",
    emoji: "❄️",
    borderGlow: "border-[#009df1]/40 text-[#009df1] group-hover:border-[#009df1]",
    tipoBackend: "CADENA_FRIO",
    accentColor: "#009df1",
  },
  {
    id: "recibo_energia",
    label: "Factura Energía",
    sublabel: "Enel / Codensa",
    emoji: "⚡",
    borderGlow: "border-amber-500/40 text-amber-400 group-hover:border-amber-500",
    tipoBackend: "ENERGIA",
    accentColor: "#f59e0b",
  },
  {
    id: "recibo_agua",
    label: "Factura Acueducto",
    sublabel: "EAAB / Agua",
    emoji: "💧",
    borderGlow: "border-blue-500/40 text-blue-400 group-hover:border-blue-500",
    tipoBackend: "AGUA",
    accentColor: "#3b82f6",
  },
  {
    id: "recibo_gas",
    label: "Factura Gas",
    sublabel: "Vanti / Gas Natural",
    emoji: "🔥",
    borderGlow: "border-orange-500/40 text-orange-400 group-hover:border-orange-500",
    tipoBackend: "GAS",
    accentColor: "#f97316",
  },
  {
    id: "recibo_telecom",
    label: "Telecomunicaciones",
    sublabel: "Claro • Movistar • Tigo",
    emoji: "🌐",
    borderGlow: "border-purple-500/40 text-purple-400 group-hover:border-purple-500",
    tipoBackend: "TELECOMUNICACIONES",
    accentColor: "#a855f7",
  },
  {
    id: "carta_banco",
    label: "Carta Bancaria",
    sublabel: "Documento Confidencial",
    emoji: "✉️",
    borderGlow: "border-indigo-500/40 text-indigo-400 group-hover:border-indigo-500",
    tipoBackend: "CARTA_BANCO",
    accentColor: "#6366f1",
  },
  {
    id: "otro",
    label: "Otro Envío",
    sublabel: "Correspondencia general",
    emoji: "🛍️",
    borderGlow: "border-zinc-500/40 text-zinc-300 group-hover:border-zinc-400",
    tipoBackend: "OTRO",
    accentColor: "#71717a",
  },
];

const EMPRESAS_RAPIDAS = [
  { name: "Rappi", icon: "🛵" },
  { name: "MercadoLibre", icon: "📦" },
  { name: "InterRapidísimo", icon: "🚚" },
  { name: "Servientrega", icon: "✉️" },
  { name: "Coordinadora", icon: "🚛" },
  { name: "Didi Food", icon: "🍔" },
  { name: "Amazon", icon: "📦" },
  { name: "Particular / Familiar", icon: "👤" },
];

const STEPS_CONFIG = [
  {
    id: 1,
    num: "01",
    title: "BLOQUE",
    shortTitle: "Bloque",
    color: "#57bf00",
    bgGradient: "from-[#57bf00]/20 via-[#0a1205] to-[#07090e]",
    borderActive: "border-[#57bf00]/60",
    glowColor: "rgba(87, 191, 0, 0.25)",
  },
  {
    id: 2,
    num: "02",
    title: "CASA",
    shortTitle: "Casa",
    color: "#009df1",
    bgGradient: "from-[#009df1]/20 via-[#040f1a] to-[#07090e]",
    borderActive: "border-[#009df1]/60",
    glowColor: "rgba(0, 157, 241, 0.25)",
  },
  {
    id: 3,
    num: "03",
    title: "DESTINATARIO",
    shortTitle: "Destinatario",
    color: "#a855f7",
    bgGradient: "from-purple-600/20 via-[#10061a] to-[#07090e]",
    borderActive: "border-purple-500/60",
    glowColor: "rgba(168, 85, 247, 0.25)",
  },
  {
    id: 4,
    num: "04",
    title: "CATEGORÍA",
    shortTitle: "Categoría",
    color: "#f59e0b",
    bgGradient: "from-amber-500/20 via-[#160e05] to-[#07090e]",
    borderActive: "border-amber-500/60",
    glowColor: "rgba(245, 158, 11, 0.25)",
  },
  {
    id: 5,
    num: "05",
    title: "CONFIRMAR",
    shortTitle: "Confirmar",
    color: "#57bf00",
    bgGradient: "from-emerald-500/20 via-[#05140b] to-[#07090e]",
    borderActive: "border-[#57bf00]/70",
    glowColor: "rgba(87, 191, 0, 0.35)",
  },
];

const IDLE_TIMEOUT_MS = 60000; // 60 segundos de inactividad activa el screensaver ambiental

export default function KioskoStandalonePage() {
  const router = useRouter();
  const { user } = useAuth();

  // Directorio cargado con los 479 registros reales de Las Brisas PH
  const [directorio, setDirectorio] = useState<DirectorioItem[]>(RESIDENTES_REALES_LAS_BRISAS);
  const [casaSearch, setCasaSearch] = useState<string>("");

  // Estado del formulario
  const [selectedBloque, setSelectedBloque] = useState<string>("");
  const [selectedCasa, setSelectedCasa] = useState<string>("");
  const [destinatarioNombre, setDestinatarioNombre] = useState<string>("");
  const [selectedCategoria, setSelectedCategoria] = useState<CategoriaEntrega>(CATEGORIAS[0]);
  const [remitente, setRemitente] = useState<string>("Rappi");
  const [documentoMensajero, setDocumentoMensajero] = useState<string>("");

  // Navegación estilo acordeón horizontal (1 a 5)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printedSticker, setPrintedSticker] = useState<StickerData | null>(null);
  const [countdown, setCountdown] = useState<number>(10);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Screensaver ambiental
  const [isIdle, setIsIdle] = useState(true);
  const [screensaverSlide, setScreensaverSlide] = useState(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Modal PIN del Guarda
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitPin, setExitPin] = useState("");

  // Refs de GSAP para animaciones cinemáticas
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const ticketLiveCardRef = useRef<HTMLDivElement | null>(null);
  const accordionContainerRef = useRef<HTMLDivElement | null>(null);
  const activeContentRef = useRef<HTMLDivElement | null>(null);

  // Hora actual para el reloj de portería
  const [currentTime, setCurrentTime] = useState<string>("");
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    updateClock();
    const t = setInterval(updateClock, 1000);
    return () => clearInterval(t);
  }, []);

  // Cargar directorio dinámico de Las Brisas PH
  const loadDir = useCallback(async () => {
    try {
      const data = await api.get<DirectorioItem[]>("/directorio");
      if (Array.isArray(data) && data.length > 0) {
        setDirectorio(data);
      } else {
        const altData = await api.get<DirectorioItem[]>("/usuarios/directorio");
        if (Array.isArray(altData) && altData.length > 0) {
          setDirectorio(altData);
        }
      }
    } catch {
      try {
        const altData = await api.get<DirectorioItem[]>("/usuarios/directorio");
        if (Array.isArray(altData) && altData.length > 0) {
          setDirectorio(altData);
        }
      } catch {
        setDirectorio(RESIDENTES_REALES_LAS_BRISAS);
      }
    }
  }, []);

  useEffect(() => {
    loadDir();
  }, [loadDir]);

  // Bloques reales de Las Brisas PH (1 al 6)
  const bloquesDisponibles = useMemo(() => {
    return BLOQUES_REALES_LAS_BRISAS;
  }, []);

  // Casas reales registradas en Las Brisas PH para el bloque
  const casasDisponibles = useMemo(() => {
    if (!selectedBloque) return [];
    return getCasasRealesDeBloque(selectedBloque);
  }, [selectedBloque]);

  // Filtro de casas por texto o número
  const casasFiltradas = useMemo(() => {
    const q = casaSearch.trim().toLowerCase();
    if (!q) return casasDisponibles;
    return casasDisponibles.filter((c) => {
      if (c.toLowerCase().includes(q)) return true;
      if (q.length === 2 && c.endsWith(q)) return true;
      return false;
    });
  }, [casasDisponibles, casaSearch]);

  // Detector de Inactividad (Screensaver)
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (step === 6) return;

    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
      handleResetForm();
    }, IDLE_TIMEOUT_MS);
  }, [step]);

  useEffect(() => {
    const events = ["mousedown", "mousemove", "touchstart", "pointerdown", "keydown"];
    const handleActivity = () => {
      if (isIdle) setIsIdle(false);
      resetIdleTimer();
    };

    events.forEach((evt) => window.addEventListener(evt, handleActivity));
    resetIdleTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isIdle, resetIdleTimer]);

  // Rotación del Screensaver cada 6 segundos
  useEffect(() => {
    if (!isIdle) return;
    const interval = setInterval(() => {
      setScreensaverSlide((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(interval);
  }, [isIdle]);

  // GSAP: Animar la transición entre pasos del acordeón
  useEffect(() => {
    if (activeContentRef.current && step <= 5) {
      gsap.fromTo(
        activeContentRef.current,
        {
          opacity: 0,
          y: 24,
          scale: 0.985,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.45,
          ease: "power3.out",
        }
      );
    }
  }, [step]);

  // GSAP: Pulso en el Live Ticket cuando cambian datos clave
  useEffect(() => {
    if (ticketLiveCardRef.current) {
      gsap.fromTo(
        ticketLiveCardRef.current,
        { scale: 0.98 },
        { scale: 1, duration: 0.35, ease: "back.out(2)" }
      );
    }
  }, [selectedBloque, selectedCasa, destinatarioNombre, selectedCategoria, remitente]);

  // Reset del formulario
  const handleResetForm = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setSelectedBloque("");
    setSelectedCasa("");
    setDestinatarioNombre("");
    setSelectedCategoria(CATEGORIAS[0]);
    setRemitente("Rappi");
    setDocumentoMensajero("");
    setPrintedSticker(null);
    setCasaSearch("");
    setStep(1);
  };

  // Validar si un paso anterior puede ser abierto haciendo tap en su cinta vertical
  const canOpenStep = (targetStep: number): boolean => {
    if (targetStep === 1) return true;
    if (targetStep === 2) return Boolean(selectedBloque);
    if (targetStep === 3) return Boolean(selectedBloque && selectedCasa);
    if (targetStep === 4) return Boolean(selectedBloque && selectedCasa && destinatarioNombre.trim());
    if (targetStep === 5) return Boolean(selectedBloque && selectedCasa && destinatarioNombre.trim());
    return false;
  };

  // Enviar entrega e imprimir sticker
  const handleRegistrarEImprimir = async () => {
    if (!selectedCasa) {
      toast.error("Selecciona la casa de destino.");
      return;
    }
    if (!destinatarioNombre.trim()) {
      toast.error("Escribe el nombre del destinatario del paquete.");
      return;
    }
    if (!remitente.trim()) {
      toast.error("Selecciona la empresa o remitente.");
      return;
    }

    const matchedResident =
      directorio.find((d) => {
        const cleanTorre = d.torre?.replace(/^(bloque|torre)\s*/i, "").trim() || "";
        const cleanApto = d.apto?.replace(/^(casa|apto)\s*/i, "").trim() || "";
        return cleanTorre === selectedBloque && cleanApto === selectedCasa;
      }) || findResidenteReal(selectedBloque, selectedCasa);

    const targetUserId =
      matchedResident?.id ??
      directorio[0]?.id ??
      RESIDENTES_REALES_LAS_BRISAS[0]?.id ??
      user?.id;

    if (!targetUserId) {
      toast.error("Debes iniciar sesión con tu cuenta de portería en la tablet.");
      return;
    }

    setIsSubmitting(true);
    try {
      const validTipo = getValidBackendTipo(selectedCategoria.tipoBackend);
      let resId = "";
      let resFecha = new Date().toISOString();

      try {
        const res = await api.post<{
          id: string;
          fechaLlegada: string;
          tipo: string;
          remitente: string;
        }>("/vigilancia/correspondencia", {
          usuarioId: targetUserId,
          tipo: validTipo,
          remitente: remitente.trim(),
          descripcion: `[${selectedCategoria.label.toUpperCase()}] Bloque ${selectedBloque} Casa ${selectedCasa} • Destinatario: ${destinatarioNombre.trim()}${documentoMensajero.trim() ? ` • C.C. Mensajero: ${documentoMensajero.trim()}` : ""}`,
        });
        resId = res.id;
        resFecha = res.fechaLlegada;
      } catch (postError) {
        console.warn("Fallback a /vigilancia/paquetes...", postError);
        const resPaquete = await api.post<{
          id: string;
          fechaLlegada?: string;
          createdAt?: string;
        }>("/vigilancia/paquetes", {
          usuarioId: targetUserId,
          remitente: remitente.trim(),
          descripcion: `[${selectedCategoria.label.toUpperCase()}] Bloque ${selectedBloque} Casa ${selectedCasa} • Destinatario: ${destinatarioNombre.trim()}`,
        });
        resId = resPaquete.id;
        resFecha = resPaquete.fechaLlegada || resPaquete.createdAt || new Date().toISOString();
      }

      const stickerInfo: StickerData = {
        id: resId,
        bloque: selectedBloque,
        casa: selectedCasa,
        torre: selectedBloque,
        apto: selectedCasa,
        destinatario: destinatarioNombre.trim(),
        tipo: selectedCategoria.tipoBackend,
        remitente: remitente.trim(),
        fecha: new Date(resFecha).toLocaleString("es-CO", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        documentoMensajero: documentoMensajero.trim() || null,
      };

      setPrintedSticker(stickerInfo);
      setStep(6);
      toast.success("¡Entrega registrada y sticker enviado a impresión!");

      setCountdown(10);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!);
            handleResetForm();
            setIsIdle(true);
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error("Error al registrar la entrega en portería.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // PIN de salida para el Guarda
  const handleVerifyExitPin = () => {
    if (exitPin === "1234" || exitPin === "2026") {
      router.push("/paqueteria");
    } else {
      toast.error("PIN de seguridad incorrecto");
      setExitPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#07090e] text-white overflow-hidden flex flex-col select-none font-sans antialiased">
      {/* Luces ambientales con la identidad cromática de ConjuntOS® (#57bf00 y #009df1) */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-[#57bf00]/12 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#009df1]/12 rounded-full blur-[190px] pointer-events-none" />
      <div className="absolute top-[35%] right-[25%] w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-[160px] pointer-events-none" />

      {/* ============================================================== */}
      {/* 1. SCREENSAVER AMBIENTAL (STANDBY TABLET PORTERÍA)             */}
      {/* ============================================================== */}
      {isIdle && (
        <div
          onClick={() => setIsIdle(false)}
          className="fixed inset-0 z-[150] bg-[#05070c]/92 backdrop-blur-3xl flex flex-col justify-between p-8 sm:p-14 cursor-pointer animate-in fade-in duration-700 overflow-hidden"
        >
          {/* Header del Screensaver */}
          <div className="flex items-center justify-between relative z-10 w-full max-w-6xl mx-auto">
            {/* Logos Oficiales: ConjuntOS® + Las Brisas PH */}
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                {/* Isotipo Castillo ConjuntOS */}
                <div className="w-8 h-10 bg-white rounded-md flex flex-col justify-between p-1 shadow-lg">
                  <div className="flex justify-between">
                    <span className="w-1.5 h-2 bg-[#111213] rounded-t-sm" />
                    <span className="w-1.5 h-1.5 bg-[#111213]" />
                    <span className="w-1.5 h-2 bg-[#111213] rounded-t-sm" />
                  </div>
                  <div className="w-2 h-2.5 bg-[#111213] mx-auto rounded-t-sm" />
                </div>
                <div className="flex items-baseline font-black tracking-tight text-2xl font-display">
                  <span className="text-white">Conjunt</span>
                  <span className="text-[#57bf00]">O</span>
                  <span className="text-[#009df1]">S</span>
                  <span className="text-[10px] text-white/50 ml-0.5">®</span>
                </div>
              </div>

              <div className="h-6 w-px bg-white/20" />

              <div className="relative w-36 h-10">
                <Image
                  src="/images/las-brisas-logo.jpg"
                  alt="Las Brisas La Felicidad"
                  fill
                  className="object-contain object-left drop-shadow-md"
                  priority
                />
              </div>
            </div>

            {/* Chip de Estado en Vivo */}
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-full bg-white/[0.05] border border-white/10 backdrop-blur-xl flex items-center gap-2.5 shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-[#57bf00] animate-ping" />
                <span className="text-xs font-semibold text-white/90 tracking-wide font-mono">
                  {currentTime || "PORTERÍA ACTIVA"}
                </span>
              </div>
            </div>
          </div>

          {/* Hero Carousel Central */}
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto my-auto relative z-10 gap-8">
            {screensaverSlide === 0 && (
              <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-700">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#57bf00]/15 border border-[#57bf00]/30 backdrop-blur-md">
                  <Sparkles size={14} className="text-[#57bf00]" />
                  <span className="text-xs font-bold tracking-wider uppercase text-[#57bf00]">
                    Kiosko Autoservicio de Domiciliarios
                  </span>
                </div>
                <h1 className="text-4xl sm:text-6xl font-display font-extrabold tracking-tight text-white leading-tight">
                  Recepción Express <br />
                  <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
                    Las Brisas PH
                  </span>
                </h1>
                <p className="text-base sm:text-xl text-white/60 max-w-lg font-light leading-relaxed">
                  Registra tu entrega paso a paso en segundos e imprime la etiqueta térmica oficial.
                </p>
              </div>
            )}

            {screensaverSlide === 1 && (
              <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-700">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-[#009df1]/15 text-[#009df1] border border-[#009df1]/30 text-xs font-bold uppercase tracking-wider">
                    Tecnología en Portería
                  </span>
                </div>
                <h1 className="text-4xl sm:text-6xl font-display font-extrabold tracking-tight text-white leading-tight">
                  Aviso Inmediato al <br />
                  <span className="text-[#57bf00]">Residente</span> &bull;{" "}
                  <span className="text-[#009df1]">En Vivo</span>
                </h1>
                <p className="text-base sm:text-lg text-white/60 max-w-lg font-light">
                  Prioridad automática para comida caliente, cadena de frío y paquetes urgentes.
                </p>
              </div>
            )}

            {screensaverSlide === 2 && (
              <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-700">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs font-bold text-white/90">
                  <Truck size={14} className="text-[#009df1]" />
                  <span>Proceso de 5 Pasos Ultrarrápido</span>
                </div>
                <h2 className="text-3xl sm:text-5xl font-display font-extrabold text-white tracking-tight">
                  ¿Cómo entregar en el Kiosko?
                </h2>
                <div className="grid grid-cols-3 gap-3 w-full max-w-xl text-left mt-2">
                  <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                    <span className="text-2xl font-extrabold text-[#57bf00]">1</span>
                    <p className="text-xs font-semibold text-white mt-1">Elige Bloque y Casa</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                    <span className="text-2xl font-extrabold text-[#009df1]">2</span>
                    <p className="text-xs font-semibold text-white mt-1">Escribe Destinatario</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                    <span className="text-2xl font-extrabold text-white">3</span>
                    <p className="text-xs font-semibold text-white mt-1">Imprime Sticker Térmico</p>
                  </div>
                </div>
              </div>
            )}

            {/* Botón de desbloqueo táctil */}
            <div className="flex flex-col items-center gap-3 mt-4">
              <button
                type="button"
                className="group relative px-10 py-5 rounded-full bg-white text-black font-extrabold text-base sm:text-lg tracking-tight shadow-[0_10px_40px_rgba(255,255,255,0.25)] flex items-center gap-3 active:scale-95 transition-all duration-200 cursor-pointer"
              >
                <span className="text-2xl group-hover:scale-125 transition-transform">👆</span>
                <span>Toca la pantalla para iniciar</span>
              </button>
              <span className="text-xs text-white/40 tracking-wider font-mono">
                Cualquier toque activa la pantalla
              </span>
            </div>
          </div>

          {/* Footer del Screensaver */}
          <div className="flex items-center justify-between text-xs text-white/40 pt-6 border-t border-white/10 max-w-6xl mx-auto w-full">
            <span>Las Brisas P.H. &bull; Portería Principal</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#57bf00]" />
              <span>Impresora Térmica 60×40mm Lista</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. LAYOUT CINEMÁTICO SPLIT SCREEN + ACORDEÓN HORIZONTAL        */}
      {/* ============================================================== */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 h-screen w-screen overflow-hidden relative z-10">

        {/* ------------------------------------------------------------ */}
        {/* PANEL IZQUIERDO: BRANDING EDITORIAL + LIVE TICKET PREVIEW     */}
        {/* ------------------------------------------------------------ */}
        <aside
          ref={leftPanelRef}
          className="lg:col-span-4 xl:col-span-4 flex flex-col justify-between p-5 lg:p-7 bg-[#080b12]/95 border-b lg:border-b-0 lg:border-r border-white/10 backdrop-blur-3xl z-20 overflow-y-auto"
        >
          {/* Top Bar: Brand & Portería */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo Oficial ConjuntOS */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-9 bg-white rounded-md flex flex-col justify-between p-1 shadow-md">
                  <div className="flex justify-between">
                    <span className="w-1 h-1.5 bg-[#111213] rounded-t-sm" />
                    <span className="w-1 h-1 bg-[#111213]" />
                    <span className="w-1 h-1.5 bg-[#111213] rounded-t-sm" />
                  </div>
                  <div className="w-1.5 h-2 bg-[#111213] mx-auto rounded-t-sm" />
                </div>
                <div className="flex items-baseline font-black tracking-tight text-xl font-display">
                  <span className="text-white">Conjunt</span>
                  <span className="text-[#57bf00]">O</span>
                  <span className="text-[#009df1]">S</span>
                  <span className="text-[9px] text-white/50 ml-0.5">®</span>
                </div>
              </div>

              <div className="h-5 w-px bg-white/20" />

              <div className="relative w-28 h-8">
                <Image
                  src="/images/las-brisas-logo.jpg"
                  alt="Las Brisas PH"
                  fill
                  className="object-contain object-left"
                  priority
                />
              </div>
            </div>

            {/* Lock Button para el Guarda */}
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="p-2.5 rounded-full bg-white/[0.06] hover:bg-white/15 text-white/60 hover:text-white transition-colors cursor-pointer"
              title="Salir del modo Kiosko (Guarda de Seguridad)"
            >
              <Lock size={15} />
            </button>
          </div>

          {/* Sección Editorial Central (Estilo Dribbble) */}
          <div className="my-auto py-4 flex flex-col gap-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-white/80 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#57bf00] animate-pulse" />
                <span>KIOSKO AUTOSERVICIO</span>
              </div>
              <h1 className="text-3xl xl:text-4xl font-display font-black tracking-tight text-white leading-tight">
                RECEPCIÓN <br />
                <span className="bg-gradient-to-r from-white via-[#57bf00] to-[#009df1] bg-clip-text text-transparent">
                  EXPRESS
                </span>
              </h1>
              <p className="text-xs xl:text-sm text-white/60 mt-1 font-light leading-relaxed">
                Conjunto Residencial Las Brisas P.H. &bull; Bogotá
              </p>
            </div>

            {/* LIVE TICKET / STICKER DINÁMICO EN TIEMPO REAL */}
            <div
              ref={ticketLiveCardRef}
              className="relative rounded-3xl bg-white text-black p-4 xl:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-2 border-black/10 overflow-hidden"
            >
              {/* Header del Ticket */}
              <div className="flex items-center justify-between border-b border-black/15 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#57bf00]" />
                  <span className="text-[11px] font-black font-mono tracking-wider text-black">
                    LAS BRISAS PH
                  </span>
                </div>
                <span className="text-[9.5px] font-black uppercase px-2.5 py-0.5 rounded-full bg-black text-white">
                  {selectedCategoria.emoji} {selectedCategoria.label}
                </span>
              </div>

              {/* Destino Principal (Bloque y Casa en Vivo) */}
              <div className="my-3 py-2.5 px-3 rounded-2xl bg-black/[0.04] border border-black/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-black/50 block">Destino</span>
                  <span className="text-xl xl:text-2xl font-black font-mono tracking-tight text-black">
                    {selectedBloque ? `BLOQUE ${selectedBloque}` : "BLOQUE —"}{" "}
                    {selectedCasa ? `• CASA ${selectedCasa}` : "• CASA —"}
                  </span>
                </div>
                {selectedBloque && selectedCasa ? (
                  <div className="w-7 h-7 rounded-full bg-[#57bf00] text-white flex items-center justify-center shadow">
                    <Check size={16} />
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-black/40">Pendiente</span>
                )}
              </div>

              {/* Destinatario y Empresa */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <div className="max-w-[190px]">
                  <div className="text-[10px] uppercase font-bold text-black/50">Para:</div>
                  <div className="font-extrabold text-black truncate text-sm">
                    {destinatarioNombre.trim() || "Por ingresar..."}
                  </div>
                  <div className="text-[10px] text-black/70 mt-0.5">
                    Empresa: <span className="font-bold text-black">{remitente}</span>
                  </div>
                </div>

                <div className="w-12 h-12 bg-white border border-black/20 rounded-xl flex items-center justify-center p-1 shadow-sm">
                  <QrCode size={38} className="text-black" />
                </div>
              </div>

              {/* Marca de agua sutil en el ticket */}
              <div className="mt-3 pt-2 border-t border-dashed border-black/20 flex items-center justify-between text-[9px] font-mono text-black/50">
                <span>CONJUNTOS&reg; PASS</span>
                <span>TÉRMICA 60x40MM</span>
              </div>
            </div>
          </div>

          {/* Footer del panel izquierdo */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/40">
            <div className="flex items-center gap-1.5 font-mono">
              <Clock size={13} className="text-[#009df1]" />
              <span>{currentTime || "12:00 PM"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#57bf00]" />
              <span>Portería Conectada</span>
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------------ */}
        {/* PANEL DERECHO: ACORDEÓN HORIZONTAL (ESTILO DRIBBLE VÍDEO)   */}
        {/* ------------------------------------------------------------ */}
        <main
          ref={accordionContainerRef}
          className="lg:col-span-8 xl:col-span-8 flex flex-col lg:flex-row h-full w-full p-2 lg:p-4 gap-2 lg:gap-3 overflow-hidden relative"
        >
          {STEPS_CONFIG.map((stepItem) => {
            const isActive = step === stepItem.id;
            const isCompleted = step > stepItem.id;
            const isClickable = canOpenStep(stepItem.id);

            // Resumen de valor elegido para mostrar en la pestaña contraída
            let valueSummary = "";
            if (stepItem.id === 1 && selectedBloque) valueSummary = `B.${selectedBloque}`;
            if (stepItem.id === 2 && selectedCasa) valueSummary = `C.${selectedCasa}`;
            if (stepItem.id === 3 && destinatarioNombre) valueSummary = destinatarioNombre.slice(0, 10);
            if (stepItem.id === 4 && selectedCategoria) valueSummary = selectedCategoria.emoji;
            if (stepItem.id === 5) valueSummary = "FINAL";

            return (
              <div
                key={stepItem.id}
                onMouseEnter={() => setHoveredStep(stepItem.id)}
                onMouseLeave={() => setHoveredStep(null)}
                onClick={() => {
                  if (!isActive && isClickable && stepItem.id <= 5) {
                    setStep(stepItem.id as 1 | 2 | 3 | 4 | 5);
                  }
                }}
                className={`relative rounded-3xl transition-all duration-500 ease-out flex flex-col overflow-hidden border ${
                  isActive
                    ? `flex-1 min-w-0 ${stepItem.borderActive} bg-gradient-to-b ${stepItem.bgGradient} shadow-2xl`
                    : `flex-none h-16 lg:h-full ${
                        isClickable ? "cursor-pointer hover:bg-white/[0.08]" : "cursor-not-allowed opacity-50"
                      } bg-white/[0.03] border-white/10 ${
                        hoveredStep === stepItem.id && isClickable ? "border-white/30" : ""
                      } w-full lg:w-16 xl:w-20`
                }`}
                style={{
                  boxShadow: isActive ? `0 0 50px ${stepItem.glowColor}` : undefined,
                }}
              >
                {/* ---------------------------------------------------- */}
                {/* CINTA CONTRAÍDA (PESTAÑA VERTICAL - ESTILO DRIBBLE) */}
                {/* ---------------------------------------------------- */}
                {!isActive && (
                  <div className="h-full w-full flex flex-row lg:flex-col items-center justify-between p-3 lg:p-4 select-none">
                    {/* Número y Flecha */}
                    <div className="flex items-center lg:flex-col gap-2">
                      <span
                        className="text-xs font-black font-mono tracking-wider"
                        style={{ color: isCompleted ? stepItem.color : "rgba(255,255,255,0.4)" }}
                      >
                        {stepItem.num}
                      </span>
                      {isCompleted ? (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]"
                          style={{ backgroundColor: stepItem.color }}
                        >
                          <Check size={11} />
                        </div>
                      ) : (
                        <ArrowUpRight
                          size={14}
                          className={`text-white/40 transition-transform duration-300 ${
                            hoveredStep === stepItem.id ? "rotate-45 text-white scale-125" : ""
                          }`}
                        />
                      )}
                    </div>

                    {/* Texto Vertical Rotado en Desktop / Horizontal en Mobile */}
                    <div className="hidden lg:flex flex-col items-center justify-center my-auto">
                      <span
                        className="text-xs xl:text-sm font-extrabold tracking-widest uppercase transition-colors"
                        style={{
                          writingMode: "vertical-rl",
                          transform: "rotate(180deg)",
                          color: isCompleted ? "#ffffff" : "rgba(255,255,255,0.6)",
                        }}
                      >
                        {valueSummary ? `${stepItem.shortTitle}: ${valueSummary}` : stepItem.title}
                      </span>
                    </div>

                    {/* Versión móvil horizontal */}
                    <div className="flex lg:hidden items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {stepItem.title}
                      </span>
                      {valueSummary && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white font-mono">
                          {valueSummary}
                        </span>
                      )}
                    </div>

                    {/* Indicador de barra de acento */}
                    <div
                      className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full"
                      style={{
                        backgroundColor: isCompleted ? stepItem.color : "rgba(255,255,255,0.2)",
                      }}
                    />
                  </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* CONTENIDO EXPANDIDO (PASO ACTIVO)                    */}
                {/* ---------------------------------------------------- */}
                {isActive && (
                  <div
                    ref={activeContentRef}
                    className="flex-1 flex flex-col justify-between p-4 sm:p-6 lg:p-8 h-full overflow-y-auto"
                  >
                    {/* Top Header del Paso Activo */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        {step > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5);
                            }}
                            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                          >
                            <ArrowLeft size={13} />
                            <span>Paso Anterior</span>
                          </button>
                        )}
                        <span
                          className="text-xs font-mono font-bold tracking-widest uppercase px-2.5 py-1 rounded-full bg-white/[0.08]"
                          style={{ color: stepItem.color }}
                        >
                          Paso {stepItem.num} de 05
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-white/50 font-mono">
                        <span>Las Brisas PH</span>
                      </div>
                    </div>

                    {/* ============================================== */}
                    {/* PASO 1: ELEGIR BLOQUE (1 al 6)                 */}
                    {/* ============================================== */}
                    {step === 1 && (
                      <div className="my-auto py-4 flex flex-col justify-center max-w-xl mx-auto w-full">
                        <div className="text-center mb-6">
                          <h2 className="text-2xl sm:text-4xl font-display font-extrabold text-white tracking-tight">
                            ¿A qué Bloque vas?
                          </h2>
                          <p className="text-xs sm:text-sm text-white/60 mt-1">
                            Selecciona el bloque de Las Brisas P.H.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 w-full">
                          {bloquesDisponibles.map((bloque) => {
                            const isSelected = selectedBloque === bloque;
                            return (
                              <button
                                key={bloque}
                                type="button"
                                onClick={() => {
                                  setSelectedBloque(bloque);
                                  setSelectedCasa("");
                                  setStep(2);
                                }}
                                className={`group p-6 rounded-3xl border transition-all duration-200 active:scale-95 flex flex-col items-center justify-center text-center cursor-pointer ${
                                  isSelected
                                    ? "bg-white text-black border-white shadow-2xl scale-105"
                                    : "bg-white/[0.06] border-white/10 hover:border-[#57bf00]/50 hover:bg-white/[0.1] text-white"
                                }`}
                              >
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                                  Bloque
                                </span>
                                <span className="text-3xl sm:text-4xl font-display font-black mt-0.5">
                                  {bloque}
                                </span>
                                <span className="text-[10px] text-white/40 group-hover:text-[#57bf00] mt-1 font-mono">
                                  80 casas
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ============================================== */}
                    {/* PASO 2: ELEGIR CASA (80 casas reales)          */}
                    {/* ============================================== */}
                    {step === 2 && (
                      <div className="my-auto py-2 flex flex-col justify-center max-w-2xl mx-auto w-full gap-3">
                        <div className="text-center">
                          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
                            Selecciona la Casa &bull; Bloque {selectedBloque}
                          </h2>
                          <p className="text-xs sm:text-sm text-white/60 mt-0.5 font-light">
                            80 casas reales (de la {parseInt(selectedBloque || "1") * 100 + 1} a la{" "}
                            {parseInt(selectedBloque || "1") * 100 + 80})
                          </p>
                        </div>

                        {/* Buscador de Casa */}
                        <div className="relative w-full">
                          <Search
                            size={16}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
                          />
                          <input
                            type="text"
                            placeholder="Buscar o escribir número de casa (ej: 15 o 315)..."
                            value={casaSearch}
                            onChange={(e) => setCasaSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/[0.08] border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:border-[#009df1] focus:bg-white/[0.12] transition-all"
                          />
                        </div>

                        {/* Cuadrícula de Casas Reales */}
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[290px] overflow-y-auto p-2 rounded-2xl bg-black/30 border border-white/10">
                          {casasFiltradas.map((casa) => {
                            const isSelected = selectedCasa === casa;
                            return (
                              <button
                                key={casa}
                                type="button"
                                onClick={() => {
                                  setSelectedCasa(casa);
                                }}
                                className={`py-3 px-2 rounded-xl font-mono font-bold transition-all duration-200 active:scale-95 flex flex-col items-center justify-center cursor-pointer ${
                                  isSelected
                                    ? "bg-[#009df1] text-white shadow-lg shadow-[#009df1]/40 scale-105"
                                    : "bg-white/[0.05] hover:bg-white/[0.12] text-white/90 border border-white/10"
                                }`}
                              >
                                <span className="text-[9px] uppercase opacity-60">Casa</span>
                                <span className="text-base sm:text-lg">{casa}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Botón de Continuar */}
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs text-white/60 font-mono">
                            {selectedCasa
                              ? `Casa ${selectedCasa} seleccionada`
                              : "Toca una casa para continuar"}
                          </span>

                          <button
                            type="button"
                            disabled={!selectedCasa}
                            onClick={() => setStep(3)}
                            className={`py-3.5 px-8 rounded-full font-bold text-xs tracking-wide flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                              selectedCasa
                                ? "bg-white text-black shadow-xl active:scale-95"
                                : "bg-white/10 text-white/30 cursor-not-allowed"
                            }`}
                          >
                            <span>Continuar a Destinatario</span>
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ============================================== */}
                    {/* PASO 3: DESTINATARIO (Nombre Protegido)        */}
                    {/* ============================================== */}
                    {step === 3 && (
                      <div className="my-auto py-4 flex flex-col justify-center max-w-lg mx-auto w-full gap-5">
                        <div className="text-center">
                          <div className="w-12 h-12 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center mx-auto mb-2">
                            <User size={24} />
                          </div>
                          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
                            ¿A nombre de quién viene?
                          </h2>
                          <p className="text-xs sm:text-sm text-white/60 mt-1">
                            Para Bloque {selectedBloque} &bull; Casa {selectedCasa}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-white/70 pl-1">
                            Nombre en el paquete o pedido:
                          </label>
                          <input
                            type="text"
                            autoFocus
                            placeholder="Escribe el nombre tal como figura en el paquete..."
                            value={destinatarioNombre}
                            onChange={(e) => setDestinatarioNombre(e.target.value)}
                            className="w-full py-4 px-5 rounded-2xl bg-white/[0.08] border border-white/20 text-white text-base sm:text-lg placeholder-white/35 focus:outline-none focus:border-purple-400 focus:bg-white/[0.12] transition-all"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={!destinatarioNombre.trim()}
                          onClick={() => setStep(4)}
                          className={`w-full py-4 rounded-full font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                            destinatarioNombre.trim()
                              ? "bg-white text-black shadow-xl active:scale-95"
                              : "bg-white/10 text-white/30 cursor-not-allowed"
                          }`}
                        >
                          <span>Continuar a Tipo de Envío</span>
                          <ArrowRight size={16} />
                        </button>

                        {/* Opción secundaria discreta para correo general */}
                        <div className="pt-3 border-t border-white/10 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setDestinatarioNombre("Destinatario General");
                              setStep(4);
                            }}
                            className="text-xs text-white/50 hover:text-white/80 underline decoration-white/20 transition-colors cursor-pointer"
                          >
                            ¿Sin nombre de persona? Marcar como Destinatario General
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ============================================== */}
                    {/* PASO 4: CATEGORÍA DE ENTREGA                   */}
                    {/* ============================================== */}
                    {step === 4 && (
                      <div className="my-auto py-2 flex flex-col justify-center max-w-2xl mx-auto w-full gap-4">
                        <div className="text-center">
                          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
                            ¿Qué tipo de entrega es?
                          </h2>
                          <p className="text-xs text-white/60 mt-0.5">
                            Determina la prioridad de aviso en tiempo real al residente
                          </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {CATEGORIAS.map((cat) => {
                            const isSelected = selectedCategoria.id === cat.id;
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategoria(cat)}
                                className={`p-4 rounded-3xl border text-left transition-all duration-200 active:scale-95 cursor-pointer flex flex-col justify-between ${
                                  isSelected
                                    ? "bg-white text-black border-white shadow-2xl scale-[1.02]"
                                    : `bg-white/[0.04] ${cat.borderGlow} hover:bg-white/[0.08]`
                                }`}
                              >
                                <div className="flex items-center justify-between w-full mb-2">
                                  <span className="text-3xl">{cat.emoji}</span>
                                  {isSelected && (
                                    <div className="w-5 h-5 rounded-full bg-[#57bf00] text-white flex items-center justify-center">
                                      <Check size={12} />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <h4
                                    className={`text-sm font-extrabold ${
                                      isSelected ? "text-black" : "text-white"
                                    }`}
                                  >
                                    {cat.label}
                                  </h4>
                                  <p
                                    className={`text-[10px] font-light mt-0.5 ${
                                      isSelected ? "text-black/70" : "text-white/60"
                                    }`}
                                  >
                                    {cat.sublabel}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex justify-center pt-2">
                          <button
                            type="button"
                            onClick={() => setStep(5)}
                            className="py-3.5 px-10 rounded-full bg-white text-black font-bold text-xs tracking-wide flex items-center gap-2 shadow-xl active:scale-95 transition-all cursor-pointer"
                          >
                            <span>Continuar a Confirmación</span>
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ============================================== */}
                    {/* PASO 5: EMPRESA, CONFIRMACIÓN & IMPRESIÓN       */}
                    {/* ============================================== */}
                    {step === 5 && (
                      <div className="my-auto py-2 flex flex-col justify-center max-w-xl mx-auto w-full gap-5">
                        <div className="text-center">
                          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
                            ¿De qué empresa vienes?
                          </h2>
                          <p className="text-xs text-white/60 mt-0.5">
                            Selecciona tu empresa o escribe el nombre del remitente
                          </p>
                        </div>

                        {/* Chips de Empresas Rápidas */}
                        <div className="flex flex-wrap gap-2 justify-center">
                          {EMPRESAS_RAPIDAS.map((emp) => {
                            const isSelected = remitente === emp.name;
                            return (
                              <button
                                key={emp.name}
                                type="button"
                                onClick={() => setRemitente(emp.name)}
                                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                                  isSelected
                                    ? "bg-white text-black shadow-md scale-105"
                                    : "bg-white/[0.06] hover:bg-white/10 text-white border border-white/10"
                                }`}
                              >
                                <span>{emp.icon}</span>
                                <span>{emp.name}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Remitente Personalizado y Cédula */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-white/60">
                              Otra empresa o remitente:
                            </label>
                            <input
                              type="text"
                              value={remitente}
                              onChange={(e) => setRemitente(e.target.value)}
                              placeholder="Empresa remitente"
                              className="py-3 px-3.5 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-xs focus:outline-none focus:border-white/40"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-white/60">
                              C.C. Mensajero (Opcional):
                            </label>
                            <input
                              type="text"
                              value={documentoMensajero}
                              onChange={(e) => setDocumentoMensajero(e.target.value)}
                              placeholder="Cédula de quien entrega"
                              className="py-3 px-3.5 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-xs focus:outline-none focus:border-white/40"
                            />
                          </div>
                        </div>

                        {/* Botón de Impresión Térmica Gigante */}
                        <button
                          type="button"
                          disabled={isSubmitting || !remitente.trim()}
                          onClick={handleRegistrarEImprimir}
                          className="w-full py-5 rounded-full bg-gradient-to-r from-[#57bf00] to-[#009df1] hover:brightness-110 text-white font-extrabold text-base tracking-wide flex items-center justify-center gap-3 shadow-[0_10px_35px_rgba(87,191,0,0.35)] active:scale-95 transition-all cursor-pointer"
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw size={20} className="animate-spin" />
                              <span>Registrando e imprimiendo...</span>
                            </>
                          ) : (
                            <>
                              <Printer size={22} />
                              <span>IMPRIMIR STICKER TÉRMICO (60×40MM)</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </main>
      </div>

      {/* ============================================================== */}
      {/* 3. PANTALLA DE ÉXITO & SALIDA DE STICKER TÉRMICO (PASO 6)      */}
      {/* ============================================================== */}
      {step === 6 && printedSticker && (
        <div className="fixed inset-0 z-[180] bg-[#05070c]/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-400">
          <div className="w-20 h-20 rounded-full bg-[#57bf00]/20 border border-[#57bf00]/40 flex items-center justify-center text-[#57bf00] mb-4 shadow-[0_0_50px_rgba(87,191,0,0.4)]">
            <CheckCircle2 size={46} />
          </div>

          <span className="text-xs font-bold text-[#57bf00] uppercase tracking-widest font-mono">
            &bull; ENTREGA REGISTRADA CON ÉXITO &bull;
          </span>
          <h2 className="text-3xl sm:text-5xl font-display font-extrabold text-white mt-1">
            Pega el sticker en el paquete y entrégalo al guarda
          </h2>
          <p className="text-sm text-white/60 mt-2 max-w-md mx-auto font-light">
            El residente de la{" "}
            <span className="text-white font-bold">
              Bloque {selectedBloque} Casa {selectedCasa}
            </span>{" "}
            ya recibió la notificación en tiempo real.
          </p>

          {/* Componente oficial de impresión térmica */}
          <div className="my-6 p-4 rounded-3xl bg-white/[0.04] border border-white/10 shadow-2xl">
            <StickerEtiqueta data={printedSticker} autoPrint={true} />
          </div>

          <button
            type="button"
            onClick={() => {
              handleResetForm();
              setIsIdle(true);
            }}
            className="py-4 px-10 rounded-full bg-white text-black font-extrabold text-sm tracking-wide shadow-2xl active:scale-95 transition-transform cursor-pointer"
          >
            Finalizar / Nueva Entrega ({countdown}s)
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. MODAL PIN DE SALIDA (EXCLUSIVO GUARDA DE SEGURIDAD)          */}
      {/* ============================================================== */}
      {showExitModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-white/15 rounded-3xl p-6 max-w-xs w-full flex flex-col gap-4 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white mx-auto">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Seguridad de Portería</h3>
              <p className="text-xs text-white/50 mt-0.5">Ingresa el PIN para salir del modo Kiosko</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyExitPin();
              }}
              className="flex flex-col gap-4"
            >
              <input
                type="password"
                autoComplete="current-password"
                maxLength={6}
                placeholder="••••"
                value={exitPin}
                onChange={(e) => setExitPin(e.target.value)}
                className="w-full py-3 px-4 text-center text-2xl tracking-[0.3em] font-mono bg-black/40 border border-white/15 rounded-2xl text-white focus:outline-none focus:border-[#57bf00]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExitModal(false);
                    setExitPin("");
                  }}
                  className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-[#57bf00] hover:bg-[#57bf00]/90 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Acceder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

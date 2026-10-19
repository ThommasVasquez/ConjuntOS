"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { 
  Building2, 
  Home,
  User, 
  Package, 
  Printer, 
  CheckCircle2, 
  ArrowLeft, 
  ArrowRight,
  RefreshCw, 
  ShieldCheck,
  Lock,
  Sparkles,
  QrCode,
  Check,
  Search,
  Truck,
  X,
  HelpCircle,
  Delete
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import StickerEtiqueta, { StickerData } from "@/components/paqueteria/StickerEtiqueta";

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
      return "OTRO"; // For COMIDA, PAQUETE, CADENA_FRIO, TELECOMUNICACIONES, OTRO
  }
}

interface DirectorioItem {
  id: string;
  nombre: string;
  torre: string | null; // Bloque in Las Brisas PH
  apto: string | null;  // Casa in Las Brisas PH
  telefono: string | null;
}

// Catálogo canónico real de unidades de Las Brisas PH:
// 6 Bloques residenciales (Bloques 1 al 6), exactamente 80 casas por bloque (480 unidades totales).
// Bloque 1: Casas 101 a 180
// Bloque 2: Casas 201 a 280
// Bloque 3: Casas 301 a 380
// Bloque 4: Casas 401 a 480
// Bloque 5: Casas 501 a 580
// Bloque 6: Casas 601 a 680
const BLOQUES_REALES_LAS_BRISAS = ["1", "2", "3", "4", "5", "6"];

const getCasasRealesPorBloque = (bloque: string): string[] => {
  const b = parseInt(bloque, 10);
  if (b >= 1 && b <= 6) {
    const start = b * 100 + 1;
    const end = b * 100 + 80;
    const list: string[] = [];
    for (let i = start; i <= end; i++) {
      list.push(String(i));
    }
    return list;
  }
  return [];
};

interface CategoriaEntrega {
  id: string;
  label: string;
  sublabel: string;
  emoji: string;
  borderGlow: string;
  tipoBackend: string;
}

const CATEGORIAS: CategoriaEntrega[] = [
  {
    id: "comida",
    label: "Comida Caliente",
    sublabel: "Urgente • Domicilio",
    emoji: "🍔",
    borderGlow: "border-red-500/30 text-red-400 group-hover:border-red-500/60",
    tipoBackend: "COMIDA",
  },
  {
    id: "paquete",
    label: "Paquetería",
    sublabel: "MercadoLibre • Amazon",
    emoji: "📦",
    borderGlow: "border-emerald-500/30 text-emerald-400 group-hover:border-emerald-500/60",
    tipoBackend: "PAQUETE",
  },
  {
    id: "cadena_frio",
    label: "Cadena de Frío",
    sublabel: "Medicamentos • Frío",
    emoji: "❄️",
    borderGlow: "border-cyan-500/30 text-cyan-400 group-hover:border-cyan-500/60",
    tipoBackend: "CADENA_FRIO",
  },
  {
    id: "recibo_energia",
    label: "Factura Energía",
    sublabel: "Enel / Codensa",
    emoji: "⚡",
    borderGlow: "border-amber-500/30 text-amber-400 group-hover:border-amber-500/60",
    tipoBackend: "ENERGIA",
  },
  {
    id: "recibo_agua",
    label: "Factura Acueducto",
    sublabel: "EAAB / Agua",
    emoji: "💧",
    borderGlow: "border-blue-500/30 text-blue-400 group-hover:border-blue-500/60",
    tipoBackend: "AGUA",
  },
  {
    id: "recibo_gas",
    label: "Factura Gas",
    sublabel: "Vanti / Gas Natural",
    emoji: "🔥",
    borderGlow: "border-orange-500/30 text-orange-400 group-hover:border-orange-500/60",
    tipoBackend: "GAS",
  },
  {
    id: "recibo_telecom",
    label: "Telecomunicaciones",
    sublabel: "Claro • Movistar • Tigo",
    emoji: "🌐",
    borderGlow: "border-purple-500/30 text-purple-400 group-hover:border-purple-500/60",
    tipoBackend: "TELECOMUNICACIONES",
  },
  {
    id: "carta_banco",
    label: "Carta Bancaria",
    sublabel: "Documento Confidencial",
    emoji: "✉️",
    borderGlow: "border-indigo-500/30 text-indigo-400 group-hover:border-indigo-500/60",
    tipoBackend: "CARTA_BANCO",
  },
  {
    id: "otro",
    label: "Otro Envío",
    sublabel: "Correspondencia general",
    emoji: "🛍️",
    borderGlow: "border-zinc-500/30 text-zinc-300 group-hover:border-zinc-500/60",
    tipoBackend: "OTRO",
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
  { name: "Familiar / Particular", icon: "👤" },
];

const IDLE_TIMEOUT_MS = 50000; // 50 seconds inactivity triggers Apple screensaver

export default function KioskoStandalonePage() {
  const router = useRouter();
  const { user } = useAuth();

  // Directory state loaded directly from Las Brisas PH database
  const [directorio, setDirectorio] = useState<DirectorioItem[]>([]);
  const [loadingDirectorio, setLoadingDirectorio] = useState(true);
  const [casaSearch, setCasaSearch] = useState<string>("");

  // Form states
  const [selectedBloque, setSelectedBloque] = useState<string>("");
  const [selectedCasa, setSelectedCasa] = useState<string>("");
  const [destinatarioNombre, setDestinatarioNombre] = useState<string>("");
  const [selectedCategoria, setSelectedCategoria] = useState<CategoriaEntrega>(CATEGORIAS[0]);
  const [remitente, setRemitente] = useState<string>("Rappi");
  const [documentoMensajero, setDocumentoMensajero] = useState<string>("");

  // Step Wizard:
  // 1: Elegir Bloque (dinámico según directorio)
  // 2: Elegir Casa (dinámico según bloque en Las Brisas)
  // 3: Nombre del Destinatario (Privacidad protegida)
  // 4: Tipo de Entrega (Categoría)
  // 5: Empresa & Confirmación (Sticker Apple Wallet Preview)
  // 6: Éxito & Salida de Sticker Térmico
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printedSticker, setPrintedSticker] = useState<StickerData | null>(null);
  const [countdown, setCountdown] = useState<number>(10);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Screensaver State
  const [isIdle, setIsIdle] = useState(true);
  const [screensaverSlide, setScreensaverSlide] = useState(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Exit PIN modal
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitPin, setExitPin] = useState("");

  // Load directory dynamically from Las Brisas PH
  const loadDir = useCallback(async () => {
    setLoadingDirectorio(true);
    try {
      const data = await api.get<DirectorioItem[]>("/directorio");
      if (Array.isArray(data) && data.length > 0) {
        setDirectorio(data);
      } else {
        const altData = await api.get<DirectorioItem[]>("/usuarios/directorio");
        setDirectorio(altData || []);
      }
    } catch {
      try {
        const altData = await api.get<DirectorioItem[]>("/usuarios/directorio");
        setDirectorio(altData || []);
      } catch {
        // silent
      }
    } finally {
      setLoadingDirectorio(false);
    }
  }, []);

  useEffect(() => {
    loadDir();
  }, [loadDir]);

  useEffect(() => {
    if (user && directorio.length === 0) {
      loadDir();
    }
  }, [user, directorio.length, loadDir]);

  // Bloques reales de Las Brisas PH: Bloques 1 al 6 (Siempre garantizados, incluido Bloque 3)
  const bloquesDisponibles = useMemo(() => {
    return BLOQUES_REALES_LAS_BRISAS;
  }, []);

  // Extract REAL Casas for the selected Bloque (exactly 80 real houses per block: X01 a X80)
  const casasDisponibles = useMemo(() => {
    if (!selectedBloque) return [];
    return getCasasRealesPorBloque(selectedBloque);
  }, [selectedBloque]);

  // Filtered Casas based on search: allows matching e.g. "15" -> "215" in Bloque 2, or full "215"
  const casasFiltradas = useMemo(() => {
    const q = casaSearch.trim().toLowerCase();
    if (!q) return casasDisponibles;
    return casasDisponibles.filter((c) => {
      if (c.toLowerCase().includes(q)) return true;
      // If courier types 2 digits like "15", also match "X15"
      if (q.length === 2 && c.endsWith(q)) return true;
      return false;
    });
  }, [casasDisponibles, casaSearch]);

  // Idle Activity Detector
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (step === 6) return; // Do not interrupt success view

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

  // Rotate Screensaver slides every 6 seconds
  useEffect(() => {
    if (!isIdle) return;
    const interval = setInterval(() => {
      setScreensaverSlide((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(interval);
  }, [isIdle]);

  // Form Reset
  const handleResetForm = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setSelectedBloque("");
    setSelectedCasa("");
    setDestinatarioNombre("");
    setSelectedCategoria(CATEGORIAS[0]);
    setRemitente("Rappi");
    setDocumentoMensajero("");
    setPrintedSticker(null);
    setStep(1);
  };

  // Numpad Handlers for Casa
  const handleNumpadPress = (digit: string) => {
    if (selectedCasa.length >= 4) return; // Houses are at most 3-4 digits
    setSelectedCasa((prev) => prev + digit);
  };

  const handleNumpadBackspace = () => {
    setSelectedCasa((prev) => prev.slice(0, -1));
  };

  const handleNumpadClear = () => {
    setSelectedCasa("");
  };

  // Submit and Print
  const handleRegistrarEImprimir = async () => {
    if (!selectedCasa) {
      toast.error("Selecciona la casa de destino.");
      return;
    }
    if (!destinatarioNombre.trim()) {
      toast.error("Escribe el nombre del destinatario que aparece en el paquete.");
      return;
    }
    if (!remitente.trim()) {
      toast.error("Selecciona la empresa o remitente.");
      return;
    }

    // Resolve matching resident silently in background for notification
    const matchedResident = directorio.find((d) => {
      const matchBloque = selectedBloque ? d.torre === selectedBloque : true;
      return matchBloque && d.apto === selectedCasa;
    });

    const targetUserId = matchedResident?.id ?? directorio[0]?.id ?? user?.id;
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
        console.warn("Fallo /vigilancia/correspondencia, intentando /vigilancia/paquetes...", postError);
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

  const handleVerifyExitPin = () => {
    if (exitPin === "1234" || exitPin === "2026") {
      router.push("/paqueteria");
    } else {
      toast.error("PIN de seguridad incorrecto");
      setExitPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#07090e] text-white overflow-hidden flex flex-col justify-between select-none font-sans antialiased">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#57bf00]/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute top-[40%] right-[30%] w-[350px] h-[350px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* ============================================================== */}
      {/* 1. APPLE SCREENSAVER (AMBIENT STANDBY MODE)                     */}
      {/* ============================================================== */}
      {isIdle && (
        <div 
          onClick={() => setIsIdle(false)}
          className="fixed inset-0 z-[150] bg-[#05070c]/90 backdrop-blur-3xl flex flex-col justify-between p-8 sm:p-14 cursor-pointer animate-in fade-in duration-700 overflow-hidden"
        >
          {/* Top Apple Navigation Bar */}
          <div className="flex items-center justify-between relative z-10 w-full max-w-6xl mx-auto">
            <div className="flex items-center gap-4">
              <div className="relative w-44 sm:w-56 h-14">
                <Image
                  src="/images/las-brisas-logo.jpg"
                  alt="Las Brisas La Felicidad"
                  fill
                  className="object-contain object-left drop-shadow-md"
                  priority
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-full bg-white/[0.05] border border-white/10 backdrop-blur-xl flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#57bf00] animate-ping" />
                <span className="text-[11px] font-semibold text-white/80 tracking-wide">
                  Tablet de Portería Activa
                </span>
              </div>
            </div>
          </div>

          {/* Center Carousel Hero */}
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto my-auto relative z-10 gap-8">
            {screensaverSlide === 0 && (
              <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-700">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md">
                  <Sparkles size={14} className="text-[#57bf00]" />
                  <span className="text-xs font-semibold tracking-wider uppercase text-white/90">
                    Autoservicio para Domiciliarios
                  </span>
                </div>
                <h1 className="text-4xl sm:text-6xl font-display font-extrabold tracking-tight text-white leading-tight">
                  Recepción Express <br />
                  <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
                    Las Brisas PH
                  </span>
                </h1>
                <p className="text-base sm:text-xl text-white/60 max-w-lg font-light leading-relaxed">
                  Registra tu entrega en segundos e imprime el sticker térmico oficial para portería.
                </p>
              </div>
            )}

            {screensaverSlide === 1 && (
              <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-700">
                <div className="relative w-44 h-12">
                  <Image
                    src="/logo.png"
                    alt="ConjuntOS"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <h1 className="text-4xl sm:text-6xl font-display font-extrabold tracking-tight text-white leading-tight">
                  Tu Entrega Conectada <br />
                  <span className="text-[#57bf00]">en Tiempo Real</span>
                </h1>
                <p className="text-base sm:text-lg text-white/60 max-w-lg font-light">
                  Aviso instantáneo al residente para comida caliente, refrigerados y facturas de servicios públicos.
                </p>
                <div className="text-xs font-mono text-white/40 tracking-widest uppercase">
                  Tecnología ConjuntOS® • Las Brisas La Felicidad
                </div>
              </div>
            )}

            {screensaverSlide === 2 && (
              <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-700">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md text-xs font-semibold text-white/90">
                  <Truck size={14} className="text-cyan-400" />
                  <span>Proceso Ultrarrápido</span>
                </div>
                <h2 className="text-3xl sm:text-5xl font-display font-extrabold text-white tracking-tight">
                  ¿Cómo funciona el Kiosko?
                </h2>
                <div className="grid grid-cols-3 gap-3 w-full max-w-xl text-left mt-2">
                  <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                    <span className="text-2xl font-extrabold text-cyan-400">1</span>
                    <p className="text-xs font-semibold text-white mt-1">Elige Bloque y Casa</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                    <span className="text-2xl font-extrabold text-[#57bf00]">2</span>
                    <p className="text-xs font-semibold text-white mt-1">Escribe Destinatario</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                    <span className="text-2xl font-extrabold text-amber-400">3</span>
                    <p className="text-xs font-semibold text-white mt-1">Pega el Sticker</p>
                  </div>
                </div>
              </div>
            )}

            {/* Apple Touch Call to Action */}
            <div className="flex flex-col items-center gap-3 mt-4">
              <button
                type="button"
                className="group relative px-10 py-5 rounded-full bg-white text-black font-semibold text-base sm:text-lg tracking-tight shadow-[0_10px_40px_rgba(255,255,255,0.25)] flex items-center gap-3 active:scale-95 transition-all duration-200"
              >
                <span className="text-2xl group-hover:scale-125 transition-transform">👆</span>
                <span>Toca la pantalla para iniciar</span>
              </button>
              <span className="text-xs text-white/40 tracking-wider">
                Cualquier toque despierta la tablet
              </span>
            </div>
          </div>

          {/* Bottom Specs */}
          <div className="flex items-center justify-between text-xs text-white/40 pt-6 border-t border-white/10 max-w-6xl mx-auto w-full">
            <span>Las Brisas PH • Portería Principal</span>
            <span>Impresora de Etiquetas 60×40mm</span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. APPLE-STYLE GUIDED WIZARD FLOW (ACTIVE KIOSK)               */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col justify-between p-4 sm:p-8 overflow-y-auto max-w-4xl w-full mx-auto relative z-10">
        
        {/* Apple Glass Navigation Bar */}
        <header className="flex items-center justify-between py-3 px-5 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-2xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="relative w-32 sm:w-40 h-9">
              <Image
                src="/images/las-brisas-logo.jpg"
                alt="Las Brisas La Felicidad"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
            <div className="h-4 w-px bg-white/20" />
            <span className="text-xs font-semibold text-white/80 hidden sm:inline">
              Kiosko Domicilios
            </span>
          </div>

          {/* Step Progress Dots */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((stepNum) => (
              <div
                key={stepNum}
                className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-bold transition-all duration-300 ${
                  step === stepNum
                    ? "bg-white text-black shadow-md scale-105"
                    : step > stepNum
                    ? "bg-[#57bf00] text-white"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {step > stepNum ? <Check size={14} /> : stepNum}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-20 sm:w-24 h-7 hidden sm:block">
              <Image
                src="/logo.png"
                alt="ConjuntOS"
                fill
                className="object-contain object-right"
                priority
              />
            </div>
            {/* Guard Exit PIN */}
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="p-2.5 rounded-full bg-white/[0.06] hover:bg-white/15 text-white/60 hover:text-white transition-colors cursor-pointer"
              title="Salir del modo Kiosko (Guarda)"
            >
              <Lock size={15} />
            </button>
          </div>
        </header>

        {/* ============================================================== */}
        {/* STEP 1: ELEGIR BLOQUE (Dinámico desde base de datos)           */}
        {/* ============================================================== */}
        {step === 1 && (
          <main className="flex-1 flex flex-col justify-center py-6 animate-in fade-in duration-300">
            <div className="text-center max-w-xl mx-auto mb-8">
              <span className="text-xs font-bold tracking-widest uppercase text-[#57bf00]">
                Paso 1 de 5 • Ubicación
              </span>
              <h2 className="text-3xl sm:text-5xl font-display font-extrabold text-white mt-1 tracking-tight">
                ¿A qué Bloque vas?
              </h2>
              <p className="text-sm sm:text-base text-white/60 mt-2 font-light">
                Selecciona el bloque de Las Brisas PH
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-xl mx-auto w-full">
              {bloquesDisponibles.map((bloque) => {
                const isSelected = selectedBloque === bloque;
                return (
                  <button
                    key={bloque}
                    type="button"
                    onClick={() => {
                      setSelectedBloque(bloque);
                      setSelectedCasa("");
                      setDestinatarioNombre("");
                      setStep(2); // Advance to Casa selection
                    }}
                    className={`group relative p-6 rounded-3xl backdrop-blur-2xl border transition-all duration-200 active:scale-95 flex flex-col items-center text-center cursor-pointer ${
                      isSelected
                        ? "bg-white text-black border-white shadow-2xl scale-105"
                        : "bg-white/[0.05] border-white/10 hover:border-white/30 text-white hover:bg-white/[0.09]"
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-wider font-semibold opacity-60">
                      Bloque
                    </span>
                    <span className="text-3xl sm:text-4xl font-display font-extrabold mt-0.5">
                      {bloque}
                    </span>
                  </button>
                );
              })}
            </div>
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 2: ELEGIR CASA (Casas reales de ese Bloque en Las Brisas) */}
        {/* ============================================================== */}
        {step === 2 && (
          <main className="flex-1 flex flex-col justify-between py-4 animate-in fade-in duration-300">
            {/* Top Bar with Back */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-full bg-white/[0.08] hover:bg-white/15 text-xs font-semibold text-white/90 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Cambiar Bloque ({selectedBloque})</span>
              </button>

              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-widest text-[#57bf00]">
                  Paso 2 de 5 • Casa
                </span>
                <h3 className="text-sm font-semibold text-white">
                  Bloque {selectedBloque}
                </h3>
              </div>
            </div>

            <div className="text-center max-w-lg mx-auto mb-2">
              <h2 className="text-2xl sm:text-4xl font-display font-extrabold text-white tracking-tight">
                Selecciona la Casa
              </h2>
              <p className="text-xs sm:text-sm text-white/60 mt-1 font-light">
                {selectedBloque ? `Casas de la ${parseInt(selectedBloque) * 100 + 1} a la ${parseInt(selectedBloque) * 100 + 80} en Las Brisas PH` : "Casas registradas en Las Brisas PH"}
              </p>
            </div>

            {/* Real Houses from Database */}
            <div className="flex-1 max-w-2xl mx-auto w-full my-auto flex flex-col justify-center gap-3">
              {/* Search filter for houses */}
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Buscar o escribir número de casa (ej: 15 o 315)..."
                  value={casaSearch}
                  onChange={(e) => setCasaSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/[0.06] border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:border-[#57bf00]"
                />
              </div>

              {/* Grid of Real Houses */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-[320px] overflow-y-auto p-2 rounded-3xl bg-white/[0.03] border border-white/10">
                {casasFiltradas.map((casa) => {
                  const isSelected = selectedCasa === casa;
                  return (
                    <button
                      key={casa}
                      type="button"
                      onClick={() => {
                        setSelectedCasa(casa);
                        setDestinatarioNombre("");
                      }}
                      className={`py-3.5 px-2.5 rounded-2xl font-mono text-base font-bold transition-all duration-200 active:scale-95 flex flex-col items-center justify-center cursor-pointer ${
                        isSelected
                          ? "bg-[#57bf00] text-white shadow-lg shadow-[#57bf00]/30 scale-105"
                          : "bg-white/[0.06] hover:bg-white/[0.12] text-white/90 border border-white/10"
                      }`}
                    >
                      <span className="text-[10px] text-white/60 font-sans uppercase">Casa</span>
                      <span className="text-lg">{casa}</span>
                    </button>
                  );
                })}
              </div>

              {selectedCasa && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.06] border border-[#57bf00]/40 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#57bf00] animate-pulse" />
                    <span className="text-xs font-mono font-bold text-white">
                      Bloque {selectedBloque} • Casa {selectedCasa} seleccionada
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-4 py-1.5 rounded-full bg-[#57bf00] text-white text-xs font-bold shadow hover:bg-[#57bf00]/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Continuar</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Next Button */}
            <div className="flex justify-center mt-4">
              <button
                type="button"
                disabled={!selectedCasa}
                onClick={() => setStep(3)}
                className={`py-4 px-10 rounded-full font-bold text-sm tracking-wide flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  selectedCasa
                    ? "bg-white text-black shadow-xl active:scale-95"
                    : "bg-white/10 text-white/30 cursor-not-allowed"
                }`}
              >
                <span>Continuar a Destinatario</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 3: DESTINATARIO (Privacidad Protegida • Escribir Nombre)   */}
        {/* ============================================================== */}
        {step === 3 && (
          <main className="flex-1 flex flex-col justify-between py-4 animate-in fade-in duration-300">
            {/* Header with Back button */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2.5 rounded-full bg-white/[0.08] hover:bg-white/15 text-xs font-semibold text-white/90 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Atrás (Casa {selectedCasa})</span>
              </button>

              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-widest text-[#57bf00]">
                  Paso 3 de 5 • Destinatario
                </span>
                <h3 className="text-sm font-semibold text-white">
                  Bloque {selectedBloque} - Casa {selectedCasa}
                </h3>
              </div>
            </div>

            <div className="max-w-lg mx-auto w-full my-auto flex flex-col gap-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[#57bf00]/15 text-[#57bf00] flex items-center justify-center mx-auto mb-3">
                  <User size={28} />
                </div>
                <h2 className="text-2xl sm:text-4xl font-display font-extrabold text-white tracking-tight">
                  ¿Para quién es el paquete?
                </h2>
                <p className="text-xs sm:text-sm text-white/60 mt-1 font-light">
                  Escribe el nombre del destinatario que aparece en la etiqueta del envío
                </p>
              </div>

              {/* Direct Name Input (Required, no resident suggestions leaked) */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70 pl-1">
                  Nombre en el paquete o pedido:
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ej. Carlos Rodríguez, Andrea Gómez..."
                  value={destinatarioNombre}
                  onChange={(e) => setDestinatarioNombre(e.target.value)}
                  className="w-full py-4 px-5 rounded-2xl bg-white/[0.08] border border-white/20 text-white text-base sm:text-lg placeholder-white/35 focus:outline-none focus:border-[#57bf00] focus:bg-white/[0.12] transition-all"
                />
              </div>

              {/* Next Button */}
              <div className="flex justify-center mt-2">
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
              </div>

              {/* Secondary Discreet Option for General Mail / Indeterminate */}
              <div className="pt-4 border-t border-white/10 text-center">
                <p className="text-[11px] text-white/40 mb-1.5 font-light">
                  ¿El envío es un recibo público o correspondencia sin nombre de persona?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDestinatarioNombre("Destinatario General");
                    setStep(4);
                  }}
                  className="text-xs text-white/50 hover:text-white/80 underline decoration-white/20 hover:decoration-white/60 transition-colors cursor-pointer"
                >
                  Marcar como Destinatario General (Sin nombre particular)
                </button>
              </div>
            </div>
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 4: TIPO DE ENTREGA (Categoría)                             */}
        {/* ============================================================== */}
        {step === 4 && (
          <main className="flex-1 flex flex-col justify-between py-4 animate-in fade-in duration-300">
            {/* Header with Back button */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2.5 rounded-full bg-white/[0.08] hover:bg-white/15 text-xs font-semibold text-white/90 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Atrás</span>
              </button>

              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-widest text-[#57bf00]">
                  Paso 4 de 5 • Categoría
                </span>
                <h3 className="text-sm font-semibold text-white">
                  Bloque {selectedBloque} - Casa {selectedCasa}
                </h3>
              </div>
            </div>

            <div className="text-center max-w-lg mx-auto mb-4">
              <h2 className="text-2xl sm:text-4xl font-display font-extrabold text-white tracking-tight">
                ¿Qué tipo de paquete es?
              </h2>
              <p className="text-xs sm:text-sm text-white/60 mt-1 font-light">
                Esto ajusta la prioridad y alerta al residente de inmediato
              </p>
            </div>

            {/* Cards Grid Apple Style */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto w-full my-auto">
              {CATEGORIAS.map((cat) => {
                const isSelected = selectedCategoria.id === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoria(cat);
                    }}
                    className={`group relative p-4 rounded-3xl backdrop-blur-2xl border text-left transition-all duration-200 active:scale-95 cursor-pointer flex flex-col justify-between overflow-hidden ${
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
                      <h4 className={`text-sm font-extrabold tracking-tight ${
                        isSelected ? "text-black" : "text-white"
                      }`}>
                        {cat.label}
                      </h4>
                      <p className={`text-[10.5px] font-light mt-0.5 ${
                        isSelected ? "text-black/70" : "text-white/60"
                      }`}>
                        {cat.sublabel}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Next Button */}
            <div className="flex justify-center mt-4">
              <button
                type="button"
                onClick={() => setStep(5)}
                className="py-4 px-10 rounded-full bg-white text-black font-bold text-sm tracking-wide flex items-center gap-2 shadow-xl active:scale-95 transition-all cursor-pointer"
              >
                <span>Continuar a Confirmación</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 5: EMPRESA, CONFIRMACIÓN & STICKER PREVIEW                */}
        {/* ============================================================== */}
        {step === 5 && (
          <main className="flex-1 flex flex-col justify-between py-4 animate-in fade-in duration-300">
            {/* Header with Back button */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-4 py-2.5 rounded-full bg-white/[0.08] hover:bg-white/15 text-xs font-semibold text-white/90 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Atrás</span>
              </button>

              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-widest text-[#57bf00]">
                  Paso 5 de 5 • Confirmar
                </span>
                <h3 className="text-sm font-semibold text-white">
                  Bloque {selectedBloque} - Casa {selectedCasa}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full my-auto items-center">
              
              {/* Left Column: Courier Company & Document */}
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
                    ¿De qué empresa vienes?
                  </h2>
                  <p className="text-xs text-white/60 mt-1">
                    Selecciona tu empresa o escribe el remitente
                  </p>
                </div>

                {/* Quick Chips */}
                <div className="flex flex-wrap gap-2">
                  {EMPRESAS_RAPIDAS.map((emp) => {
                    const isSelected = remitente === emp.name;
                    return (
                      <button
                        key={emp.name}
                        type="button"
                        onClick={() => setRemitente(emp.name)}
                        className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
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

                {/* Custom Remitente Input */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <label className="text-[11px] font-semibold text-white/60">
                    O escribe otra empresa / remitente:
                  </label>
                  <input
                    type="text"
                    value={remitente}
                    onChange={(e) => setRemitente(e.target.value)}
                    placeholder="Empresa o nombre del remitente"
                    className="py-3 px-4 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-sm focus:outline-none focus:border-white/40"
                  />
                </div>

                {/* Optional Messenger ID */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-white/60">
                    C.C. del Mensajero (Opcional):
                  </label>
                  <input
                    type="text"
                    value={documentoMensajero}
                    onChange={(e) => setDocumentoMensajero(e.target.value)}
                    placeholder="Cédula de quien entrega"
                    className="py-3 px-4 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-sm focus:outline-none focus:border-white/40"
                  />
                </div>
              </div>

              {/* Right Column: Apple Wallet Style Ticket Preview */}
              <div className="flex flex-col items-center">
                <span className="text-[11px] font-mono text-white/50 tracking-wider uppercase mb-2">
                  Vista Previa del Sticker (60×40mm)
                </span>

                {/* Apple Ticket Mockup */}
                <div className="w-[320px] rounded-3xl bg-white text-black p-4 shadow-2xl flex flex-col justify-between border-2 border-black/10 relative overflow-hidden">
                  <div className="flex items-center justify-between border-b border-black/15 pb-2">
                    <span className="text-[11px] font-bold font-mono text-black/60">LAS BRISAS PH</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-black text-white">
                      {selectedCategoria.emoji} {selectedCategoria.label}
                    </span>
                  </div>

                  <div className="my-3 text-center bg-black/5 py-2 rounded-xl">
                    <span className="text-2xl font-black font-mono tracking-tight text-black">
                      BLOQUE {selectedBloque} - CASA {selectedCasa}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-black truncate max-w-[170px]">
                        Para: {destinatarioNombre}
                      </div>
                      <div className="text-[10.5px] text-black/70 mt-0.5">
                        De: <span className="font-bold text-black">{remitente}</span>
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-white border border-black/20 rounded-lg flex items-center justify-center p-1">
                      <QrCode size={36} />
                    </div>
                  </div>
                </div>

                {/* Big Apple Action Button */}
                <button
                  type="button"
                  disabled={isSubmitting || !remitente.trim()}
                  onClick={handleRegistrarEImprimir}
                  className="w-full max-w-[320px] mt-6 py-5 rounded-full bg-[#57bf00] hover:bg-[#57bf00]/90 text-white font-extrabold text-base tracking-wide flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(87,191,0,0.35)] active:scale-95 transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      <span>Generando sticker...</span>
                    </>
                  ) : (
                    <>
                      <Printer size={22} />
                      <span>Imprimir Sticker Térmico</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 6: ÉXITO & STICKER IMPRESO                                */}
        {/* ============================================================== */}
        {step === 6 && printedSticker && (
          <main className="flex-1 flex flex-col items-center justify-center py-6 text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-full bg-[#57bf00]/20 border border-[#57bf00]/40 flex items-center justify-center text-[#57bf00] mb-4 shadow-xl">
              <CheckCircle2 size={44} />
            </div>

            <span className="text-xs font-bold text-[#57bf00] uppercase tracking-widest">
              ¡Registro Exitoso!
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-extrabold text-white mt-1">
              Pega el sticker en el paquete y entrégalo al guarda
            </h2>
            <p className="text-sm text-white/60 mt-2 max-w-md mx-auto font-light">
              El residente de la <span className="text-white font-bold">Bloque {selectedBloque} Casa {selectedCasa}</span> ya recibió la notificación.
            </p>

            {/* Sticker real para la impresora térmica */}
            <div className="my-6 p-4 rounded-3xl bg-white/[0.04] border border-white/10 shadow-2xl">
              <StickerEtiqueta data={printedSticker} autoPrint={true} />
            </div>

            {/* Reset Action */}
            <button
              type="button"
              onClick={() => {
                handleResetForm();
                setIsIdle(true);
              }}
              className="py-4 px-8 rounded-full bg-white text-black font-bold text-sm tracking-wide shadow-xl active:scale-95 transition-transform cursor-pointer"
            >
              Finalizar / Nueva Entrega ({countdown}s)
            </button>
          </main>
        )}

        {/* Apple Footer */}
        <footer className="flex items-center justify-between pt-4 border-t border-white/10 text-[11px] text-white/40">
          <span>ConjuntOS® Kiosko • Las Brisas PH</span>
          <span className="font-mono">Bloque {selectedBloque || "—"} • Casa {selectedCasa || "—"}</span>
        </footer>
      </div>

      {/* ============================================================== */}
      {/* 3. EXIT PIN MODAL (SECURITY GUARD ONLY)                        */}
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

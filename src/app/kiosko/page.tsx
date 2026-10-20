"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import {
  Printer,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Lock,
  QrCode,
  Check,
  Search,
  Truck,
  Clock,
  Sparkles,
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
  tipoBackend: string;
}

const CATEGORIAS: CategoriaEntrega[] = [
  {
    id: "comida",
    label: "Comida Caliente",
    sublabel: "Urgente • Domicilio",
    emoji: "🍔",
    tipoBackend: "COMIDA",
  },
  {
    id: "paquete",
    label: "Paquetería",
    sublabel: "MercadoLibre • Amazon",
    emoji: "📦",
    tipoBackend: "PAQUETE",
  },
  {
    id: "cadena_frio",
    label: "Cadena de Frío",
    sublabel: "Medicamentos • Frío",
    emoji: "❄️",
    tipoBackend: "CADENA_FRIO",
  },
  {
    id: "recibo_energia",
    label: "Factura Energía",
    sublabel: "Enel / Codensa",
    emoji: "⚡",
    tipoBackend: "ENERGIA",
  },
  {
    id: "recibo_agua",
    label: "Factura Acueducto",
    sublabel: "EAAB / Agua",
    emoji: "💧",
    tipoBackend: "AGUA",
  },
  {
    id: "recibo_gas",
    label: "Factura Gas",
    sublabel: "Vanti / Gas Natural",
    emoji: "🔥",
    tipoBackend: "GAS",
  },
  {
    id: "recibo_telecom",
    label: "Telecomunicaciones",
    sublabel: "Claro • Movistar • Tigo",
    emoji: "🌐",
    tipoBackend: "TELECOMUNICACIONES",
  },
  {
    id: "carta_banco",
    label: "Carta Bancaria",
    sublabel: "Documento Confidencial",
    emoji: "✉️",
    tipoBackend: "CARTA_BANCO",
  },
  {
    id: "otro",
    label: "Otro Envío",
    sublabel: "Correspondencia general",
    emoji: "🛍️",
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
  { name: "Particular / Familiar", icon: "👤" },
];

/**
 * Los 5 pasos con las texturas y gradientes fluidos exactamente inspirados
 * en las columnas cinemáticas del video de Dribbble:
 * 1. Azul Zafiro Profundo (Galleries)
 * 2. Oro / Ámbar Solar (Calendar)
 * 3. Humo Plateado / Monocromo (Explore)
 * 4. Lavanda / Seda Violeta (Contact)
 * 5. Verde Esmeralda / Lima ConjuntOS®
 */
const COLUMNAS_CONFIG = [
  {
    id: 1,
    num: "01",
    label: "Bloques",
    gradientClass:
      "bg-gradient-to-b from-[#1030e0] via-[#091763] to-[#04081c] border-blue-500/30",
    activeAccent: "#009df1",
  },
  {
    id: 2,
    num: "02",
    label: "Casas",
    gradientClass:
      "bg-gradient-to-b from-[#eab308] via-[#a16207] to-[#1c1202] border-amber-500/30",
    activeAccent: "#f59e0b",
  },
  {
    id: 3,
    num: "03",
    label: "Destinatario",
    gradientClass:
      "bg-gradient-to-b from-[#94a3b8] via-[#475569] to-[#0a0f18] border-slate-400/30",
    activeAccent: "#cbd5e1",
  },
  {
    id: 4,
    num: "04",
    label: "Categoría",
    gradientClass:
      "bg-gradient-to-b from-[#a855f7] via-[#581c87] to-[#160424] border-purple-500/30",
    activeAccent: "#c084fc",
  },
  {
    id: 5,
    num: "05",
    label: "Confirmar",
    gradientClass:
      "bg-gradient-to-b from-[#57bf00] via-[#1e5c00] to-[#050f00] border-[#57bf00]/40",
    activeAccent: "#57bf00",
  },
];

const IDLE_TIMEOUT_MS = 60000;

export default function KioskoPage() {
  const router = useRouter();
  const { user } = useAuth();

  // 479 registros reales de Las Brisas PH
  const [directorio, setDirectorio] = useState<DirectorioItem[]>(RESIDENTES_REALES_LAS_BRISAS);
  const [casaSearch, setCasaSearch] = useState<string>("");

  // Estado del flujo
  const [selectedBloque, setSelectedBloque] = useState<string>("");
  const [selectedCasa, setSelectedCasa] = useState<string>("");
  const [destinatarioNombre, setDestinatarioNombre] = useState<string>("");
  const [selectedCategoria, setSelectedCategoria] = useState<CategoriaEntrega>(CATEGORIAS[0]);
  const [remitente, setRemitente] = useState<string>("Rappi");
  const [documentoMensajero, setDocumentoMensajero] = useState<string>("");

  // Pasos: 1 a 5 (Columnas), 6 (Éxito & Impresión)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printedSticker, setPrintedSticker] = useState<StickerData | null>(null);
  const [countdown, setCountdown] = useState<number>(10);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Screensaver ambiental (inicia desactivado para mostrar el kiosko de inmediato)
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // PIN de seguridad del Guarda
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitPin, setExitPin] = useState("");

  // GSAP Refs
  const stageContentRef = useRef<HTMLDivElement | null>(null);
  const leftCanvasRef = useRef<HTMLDivElement | null>(null);

  // Reloj de portería
  const [currentTime, setCurrentTime] = useState<string>("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cargar directorio dinámico de Las Brisas PH
  const loadDir = useCallback(async () => {
    try {
      const data = await api.get<DirectorioItem[]>("/directorio");
      if (Array.isArray(data) && data.length > 0) {
        setDirectorio(data);
      }
    } catch {
      // Fallback a los 479 registros reales
      setDirectorio(RESIDENTES_REALES_LAS_BRISAS);
    }
  }, []);

  useEffect(() => {
    loadDir();
  }, [loadDir]);

  // Bloques reales de Las Brisas PH (1 al 6)
  const bloquesDisponibles = useMemo(() => {
    return BLOQUES_REALES_LAS_BRISAS;
  }, []);

  // Casas reales registradas para el bloque seleccionado
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

  // Transiciones fluidas con GSAP cada vez que cambia el paso activo
  useEffect(() => {
    if (stageContentRef.current && step <= 5) {
      gsap.fromTo(
        stageContentRef.current,
        {
          opacity: 0,
          x: 20,
        },
        {
          opacity: 1,
          x: 0,
          duration: 0.45,
          ease: "power3.out",
        }
      );
    }
  }, [step]);

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

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep === 1) return true;
    if (targetStep === 2) return Boolean(selectedBloque);
    if (targetStep === 3) return Boolean(selectedBloque && selectedCasa);
    if (targetStep === 4) return Boolean(selectedBloque && selectedCasa && destinatarioNombre.trim());
    if (targetStep === 5) return Boolean(selectedBloque && selectedCasa && destinatarioNombre.trim());
    return false;
  };

  // Registrar e imprimir sticker térmico
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

  const handleVerifyExitPin = () => {
    if (exitPin === "1234" || exitPin === "2026") {
      router.push("/paqueteria");
    } else {
      toast.error("PIN de seguridad incorrecto");
      setExitPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-black overflow-hidden flex flex-col select-none font-sans antialiased">

      {/* ============================================================== */}
      {/* 1. SCREENSAVER AMBIENTAL MINIMALISTA (STANDBY)                 */}
      {/* ============================================================== */}
      {isIdle && (
        <div
          onClick={() => setIsIdle(false)}
          className="fixed inset-0 z-[150] bg-[#07090e]/95 backdrop-blur-2xl text-white flex flex-col justify-between p-8 sm:p-16 cursor-pointer animate-in fade-in duration-500 overflow-hidden"
        >
          {/* Luces de fondo */}
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#57bf00]/15 rounded-full blur-[160px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#009df1]/15 rounded-full blur-[160px] pointer-events-none" />

          {/* Top Bar: Logo Oficial ConjuntOS® en tarjeta blanca limpia */}
          <div className="flex items-center justify-between w-full max-w-6xl mx-auto relative z-10">
            <div className="relative w-52 h-14 bg-white px-3 py-1.5 rounded-2xl shadow-lg">
              <Image
                src="/images/conjuntos-logo-horizontal.jpg"
                alt="ConjuntOS®"
                fill
                className="object-contain p-1"
                priority
              />
            </div>

            <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04]">
              <span className="w-2 h-2 rounded-full bg-[#57bf00] animate-ping" />
              <span className="text-xs font-mono font-bold text-white tracking-wider">
                {currentTime || "PORTERÍA ACTIVA"}
              </span>
            </div>
          </div>

          {/* Editorial Headline */}
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto my-auto gap-6 relative z-10">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-[#57bf00]">
              Conjunto Residencial Las Brisas P.H.
            </span>
            <h1 className="text-5xl sm:text-7xl font-display font-black tracking-tight text-white leading-[0.95]">
              RECEPCIÓN <br />
              <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
                EXPRESS
              </span>
            </h1>
            <p className="text-base sm:text-xl text-white/60 max-w-md font-light leading-relaxed">
              Autoservicio para domiciliarios. Registra tu entrega en segundos e imprime la etiqueta oficial de portería.
            </p>

            {/* Pill Touch Prompt */}
            <div className="mt-4">
              <div className="px-10 py-5 rounded-full bg-white text-black font-extrabold text-base tracking-tight shadow-2xl flex items-center gap-3 active:scale-95 transition-transform">
                <span>Toca la pantalla para iniciar</span>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>

          {/* Bottom Info */}
          <div className="flex items-center justify-between text-xs text-white/40 pt-6 border-t border-white/10 max-w-6xl mx-auto w-full font-mono relative z-10">
            <span>Las Brisas PH &bull; Bogotá</span>
            <span>Impresión Térmica 60×40mm</span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. LAYOUT EXACTO DE DRIBBBLE: IZQUIERDA BLANCA, DERECHA ACORDEÓN*/}
      {/* ============================================================== */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 h-screen w-screen overflow-hidden">

        {/* ------------------------------------------------------------ */}
        {/* LADO IZQUIERDO: EDITORIAL BLANCO IMPECABLE (art.gal style)   */}
        {/* ------------------------------------------------------------ */}
        <aside
          ref={leftCanvasRef}
          className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:p-12 bg-white text-black z-20 overflow-y-auto"
        >
          {/* Top: Logo Oficial ConjuntOS® de la imagen adjunta */}
          <div className="flex items-center justify-between">
            <div className="relative w-48 sm:w-56 h-14">
              <Image
                src="/images/conjuntos-logo-horizontal.jpg"
                alt="ConjuntOS®"
                fill
                className="object-contain object-left"
                priority
              />
            </div>

            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="p-2.5 rounded-full hover:bg-black/5 text-black/40 hover:text-black transition-colors cursor-pointer"
              title="Seguridad de Portería"
            >
              <Lock size={16} />
            </button>
          </div>

          {/* Gran Tipografía Editorial: FOLLOW THE ART -> RECEPCIÓN EXPRESS */}
          <div className="my-auto py-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-black/40">
                Las Brisas P.H. &bull; Autoservicio
              </span>
              <h1 className="text-4xl sm:text-6xl font-display font-black tracking-tight text-black leading-[0.92]">
                RECEPCIÓN <br />
                EXPRESS
              </h1>
            </div>

            <p className="text-xs sm:text-sm text-black/60 max-w-sm font-normal leading-relaxed">
              Módulo de entrega autónoma para domiciliarios y correspondencia en portería. Completa cada columna para generar el sticker térmico oficial.
            </p>

            {/* Thumbnail artístico en la esquina inferior izquierda (como en Dribbble) */}
            <div className="mt-4 pt-6 border-t border-black/10 flex items-center gap-4">
              <div className="relative w-24 h-16 rounded-xl overflow-hidden bg-black/5 border border-black/10 shadow-sm flex-none">
                <Image
                  src="/images/las-brisas-logo.jpg"
                  alt="Las Brisas"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-mono uppercase tracking-wider text-black/40">
                  Estado de la Entrega
                </span>
                <span className="text-xs sm:text-sm font-bold text-black mt-0.5">
                  {selectedBloque && selectedCasa
                    ? `Bloque ${selectedBloque} • Casa ${selectedCasa}`
                    : "Seleccionando destino..."}
                </span>
                {destinatarioNombre.trim() && (
                  <span className="text-[11px] text-black/60 truncate max-w-[200px]">
                    Para: {destinatarioNombre}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer Izquierdo */}
          <div className="pt-4 border-t border-black/10 flex items-center justify-between text-[11px] text-black/50 font-mono">
            <span>LAS BRISAS &bull; PORTERÍA</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#57bf00]" />
              <span>{currentTime}</span>
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------------ */}
        {/* LADO DERECHO: ACORDEÓN CINEMÁTICO (Galleries / Calendar / ...) */}
        {/* ------------------------------------------------------------ */}
        <section className="lg:col-span-7 xl:col-span-7 flex flex-col lg:flex-row h-full w-full bg-[#07080c] text-white overflow-hidden relative">
          
          {/* Renderizado de las 5 Columnas del Acordeón */}
          {COLUMNAS_CONFIG.map((col) => {
            const isActive = step === col.id;
            const isCompleted = step > col.id;
            const isClickable = canNavigateToStep(col.id);

            // Resumen de valor elegido para mostrar en la pestaña
            let valueSummary = "";
            if (col.id === 1 && selectedBloque) valueSummary = `B.${selectedBloque}`;
            if (col.id === 2 && selectedCasa) valueSummary = `C.${selectedCasa}`;
            if (col.id === 3 && destinatarioNombre) valueSummary = destinatarioNombre.slice(0, 10);
            if (col.id === 4 && selectedCategoria) valueSummary = selectedCategoria.emoji;
            if (col.id === 5) valueSummary = "FINAL";

            return (
              <div
                key={col.id}
                onMouseEnter={() => setHoveredColumn(col.id)}
                onMouseLeave={() => setHoveredColumn(null)}
                onClick={() => {
                  if (!isActive && isClickable && col.id <= 5) {
                    setStep(col.id as 1 | 2 | 3 | 4 | 5);
                  }
                }}
                className={`relative h-full flex flex-col transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden border-r border-white/10 ${
                  isActive
                    ? "flex-1 min-w-0 bg-[#090b10] z-10"
                    : `w-14 sm:w-16 lg:w-20 xl:w-24 flex-none ${col.gradientClass} ${
                        isClickable ? "cursor-pointer hover:brightness-125" : "cursor-not-allowed opacity-40"
                      }`
                }`}
              >
                {/* -------------------------------------------------- */}
                {/* PESTAÑA VERTICAL CONTRAÍDA (DRIBBBLE EXACT STYLE) */}
                {/* -------------------------------------------------- */}
                {!isActive && (
                  <div className="h-full w-full flex flex-col justify-between items-center py-8 px-2 select-none">
                    {/* Flecha Diagonal Superior (↗) que rota al hover */}
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white/50">
                        {col.num}
                      </span>
                      <ArrowUpRight
                        size={18}
                        className={`text-white transition-transform duration-300 ${
                          hoveredColumn === col.id ? "rotate-45 scale-125" : "text-white/60"
                        }`}
                      />
                    </div>

                    {/* Título Vertical Rotado al Pie de la Columna */}
                    <div className="my-auto flex flex-col items-center">
                      {isCompleted && (
                        <div className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-black mb-3 shadow">
                          <Check size={12} />
                        </div>
                      )}
                      <span
                        className="text-sm xl:text-base font-display font-extrabold tracking-widest uppercase text-white drop-shadow-md whitespace-nowrap"
                        style={{
                          writingMode: "vertical-rl",
                          transform: "rotate(180deg)",
                        }}
                      >
                        {valueSummary ? `${col.label}: ${valueSummary}` : col.label}
                      </span>
                    </div>

                    {/* Punto de estado inferior */}
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isCompleted ? col.activeAccent : "rgba(255,255,255,0.3)",
                      }}
                    />
                  </div>
                )}

                {/* -------------------------------------------------- */}
                {/* ESCENARIO ACTIVO EXPANDIDO (DRIBBBLE FORM STYLE)   */}
                {/* -------------------------------------------------- */}
                {isActive && (
                  <div
                    ref={stageContentRef}
                    className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-12 h-full overflow-y-auto bg-[#07090e]"
                  >
                    {/* Top Bar del Paso Activo */}
                    <div className="flex items-center justify-between pb-6 border-b border-white/10">
                      <div className="flex items-center gap-3">
                        {step > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5);
                            }}
                            className="px-3.5 py-1.5 rounded-full border border-white/20 hover:border-white text-xs font-mono text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <ArrowLeft size={13} />
                            <span>Atrás</span>
                          </button>
                        )}
                        <span className="text-xs font-mono tracking-widest uppercase text-white/50">
                          Paso {col.num} / 05 &bull; {col.label}
                        </span>
                      </div>

                      <span className="text-xs font-mono text-white/30 hidden sm:inline">
                        Las Brisas P.H.
                      </span>
                    </div>

                    {/* ============================================== */}
                    {/* PASO 1: ELEGIR BLOQUE (1 al 6)                 */}
                    {/* ============================================== */}
                    {step === 1 && (
                      <div className="my-auto py-6 flex flex-col justify-center max-w-xl mx-auto w-full gap-6">
                        <div>
                          <h2 className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight">
                            ¿A qué Bloque vas?
                          </h2>
                          <p className="text-sm text-white/50 mt-1 font-light">
                            Selecciona el bloque de destino en Las Brisas PH
                          </p>
                        </div>

                        {/* Cuadrícula Elegante de los 6 Bloques */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                                className={`p-8 rounded-2xl border transition-all duration-200 active:scale-95 flex flex-col items-center justify-center cursor-pointer ${
                                  isSelected
                                    ? "bg-white text-black border-white shadow-2xl scale-105"
                                    : "bg-white/[0.03] border-white/10 hover:border-white/40 hover:bg-white/[0.08] text-white"
                                }`}
                              >
                                <span className="text-[10px] uppercase font-mono tracking-widest opacity-50">
                                  Bloque
                                </span>
                                <span className="text-4xl sm:text-5xl font-display font-black mt-1">
                                  {bloque}
                                </span>
                                <span className="text-[10px] font-mono text-white/40 mt-1">
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
                      <div className="my-auto py-4 flex flex-col justify-center max-w-2xl mx-auto w-full gap-4">
                        <div>
                          <h2 className="text-2xl sm:text-4xl font-display font-black text-white tracking-tight">
                            Selecciona la Casa (Bloque {selectedBloque})
                          </h2>
                          <p className="text-xs sm:text-sm text-white/50 mt-1 font-light">
                            Casas de la {parseInt(selectedBloque || "1") * 100 + 1} a la{" "}
                            {parseInt(selectedBloque || "1") * 100 + 80} en Las Brisas PH
                          </p>
                        </div>

                        {/* Underline Search Input (estilo Dribbble) */}
                        <div className="relative py-2 border-b border-white/20 focus-within:border-white transition-colors">
                          <Search
                            size={16}
                            className="absolute left-0 top-1/2 -translate-y-1/2 text-white/40"
                          />
                          <input
                            type="text"
                            placeholder="Buscar o teclear número de casa (ej: 15 o 315)..."
                            value={casaSearch}
                            onChange={(e) => setCasaSearch(e.target.value)}
                            className="w-full pl-7 pr-4 py-2 bg-transparent text-white placeholder-white/30 text-sm focus:outline-none font-mono"
                          />
                        </div>

                        {/* Cuadrícula de Casas */}
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto p-2 rounded-2xl bg-white/[0.02] border border-white/10">
                          {casasFiltradas.map((casa) => {
                            const isSelected = selectedCasa === casa;
                            return (
                              <button
                                key={casa}
                                type="button"
                                onClick={() => setSelectedCasa(casa)}
                                className={`py-3 px-2 rounded-xl font-mono font-bold text-sm transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer ${
                                  isSelected
                                    ? "bg-white text-black shadow-lg scale-105"
                                    : "bg-white/[0.04] hover:bg-white/10 text-white border border-white/10"
                                }`}
                              >
                                <span className="text-[9px] uppercase opacity-50">Casa</span>
                                <span className="text-base sm:text-lg">{casa}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Botón de Continuar */}
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs font-mono text-white/50">
                            {selectedCasa
                              ? `Casa ${selectedCasa} seleccionada`
                              : "Selecciona una casa para avanzar"}
                          </span>

                          <button
                            type="button"
                            disabled={!selectedCasa}
                            onClick={() => setStep(3)}
                            className={`py-3.5 px-8 rounded-full font-mono text-xs uppercase tracking-widest font-bold flex items-center gap-2 transition-all cursor-pointer ${
                              selectedCasa
                                ? "bg-white text-black shadow-xl hover:bg-white/90 active:scale-95"
                                : "bg-white/10 text-white/30 cursor-not-allowed"
                            }`}
                          >
                            <span>Continuar</span>
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ============================================== */}
                    {/* PASO 3: DESTINATARIO (Underline Form Dribbble) */}
                    {/* ============================================== */}
                    {step === 3 && (
                      <div className="my-auto py-6 flex flex-col justify-center max-w-lg mx-auto w-full gap-8">
                        <div>
                          <span className="text-xs font-mono uppercase tracking-widest text-white/40">
                            Bloque {selectedBloque} &bull; Casa {selectedCasa}
                          </span>
                          <h2 className="text-3xl sm:text-4xl font-display font-black text-white mt-1">
                            ¿Para quién es el paquete?
                          </h2>
                          <p className="text-sm text-white/50 mt-1 font-light">
                            Escribe el nombre del destinatario tal como aparece en la guía o paquete
                          </p>
                        </div>

                        {/* Campo con línea inferior exactamente como en frame 9 de Dribbble */}
                        <div className="flex flex-col gap-3">
                          <label className="text-xs font-mono uppercase tracking-wider text-white/60">
                            Nombre en la etiqueta:
                          </label>
                          <input
                            type="text"
                            autoFocus
                            placeholder="Ej. Andrea Gómez, Carlos Rodríguez..."
                            value={destinatarioNombre}
                            onChange={(e) => setDestinatarioNombre(e.target.value)}
                            className="w-full py-4 bg-transparent border-b-2 border-white/30 focus:border-white text-white text-xl sm:text-2xl placeholder-white/20 focus:outline-none transition-colors font-display"
                          />
                        </div>

                        {/* Botón Elíptico estilo Dribbble (SUBMIT) */}
                        <div className="flex flex-col gap-4">
                          <button
                            type="button"
                            disabled={!destinatarioNombre.trim()}
                            onClick={() => setStep(4)}
                            className={`w-full py-4 rounded-full font-mono text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              destinatarioNombre.trim()
                                ? "border-2 border-white bg-white text-black hover:bg-white/90 active:scale-95 shadow-xl"
                                : "border border-white/20 text-white/30 cursor-not-allowed"
                            }`}
                          >
                            <span>Continuar a Tipo de Envío</span>
                            <ArrowRight size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDestinatarioNombre("Destinatario General");
                              setStep(4);
                            }}
                            className="text-xs text-center text-white/40 hover:text-white underline decoration-white/20 transition-colors cursor-pointer font-light"
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
                      <div className="my-auto py-4 flex flex-col justify-center max-w-2xl mx-auto w-full gap-5">
                        <div>
                          <h2 className="text-2xl sm:text-4xl font-display font-black text-white">
                            ¿Qué tipo de paquete es?
                          </h2>
                          <p className="text-xs sm:text-sm text-white/50 mt-1 font-light">
                            Selecciona la categoría para la prioridad de aviso en portería
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
                                className={`p-4 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer flex flex-col justify-between ${
                                  isSelected
                                    ? "bg-white text-black border-white shadow-xl scale-[1.02]"
                                    : "bg-white/[0.04] border-white/10 hover:border-white/30 text-white"
                                }`}
                              >
                                <span className="text-3xl mb-3">{cat.emoji}</span>
                                <div>
                                  <h4 className="text-sm font-bold">{cat.label}</h4>
                                  <p
                                    className={`text-[10px] mt-0.5 ${
                                      isSelected ? "text-black/70" : "text-white/50"
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
                            className="py-3.5 px-10 rounded-full bg-white text-black font-mono text-xs uppercase tracking-widest font-bold flex items-center gap-2 shadow-xl active:scale-95 cursor-pointer"
                          >
                            <span>Continuar a Confirmación</span>
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ============================================== */}
                    {/* PASO 5: EMPRESA & BOTÓN DE IMPRESIÓN           */}
                    {/* ============================================== */}
                    {step === 5 && (
                      <div className="my-auto py-4 flex flex-col justify-center max-w-xl mx-auto w-full gap-6">
                        <div>
                          <h2 className="text-2xl sm:text-4xl font-display font-black text-white">
                            ¿De qué empresa vienes?
                          </h2>
                          <p className="text-xs sm:text-sm text-white/50 mt-1 font-light">
                            Selecciona o escribe el remitente de la entrega
                          </p>
                        </div>

                        {/* Chips de Empresas */}
                        <div className="flex flex-wrap gap-2">
                          {EMPRESAS_RAPIDAS.map((emp) => {
                            const isSelected = remitente === emp.name;
                            return (
                              <button
                                key={emp.name}
                                type="button"
                                onClick={() => setRemitente(emp.name)}
                                className={`py-2 px-3.5 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                                  isSelected
                                    ? "bg-white text-black shadow-md"
                                    : "bg-white/[0.06] hover:bg-white/10 text-white border border-white/10"
                                }`}
                              >
                                <span>{emp.icon}</span>
                                <span>{emp.name}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Inputs Underline */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="border-b border-white/20 focus-within:border-white py-1">
                            <label className="text-[10px] font-mono uppercase text-white/50 block">
                              Otra Empresa:
                            </label>
                            <input
                              type="text"
                              value={remitente}
                              onChange={(e) => setRemitente(e.target.value)}
                              placeholder="Nombre empresa"
                              className="w-full bg-transparent text-white text-sm focus:outline-none py-1"
                            />
                          </div>

                          <div className="border-b border-white/20 focus-within:border-white py-1">
                            <label className="text-[10px] font-mono uppercase text-white/50 block">
                              C.C. Mensajero (Opcional):
                            </label>
                            <input
                              type="text"
                              value={documentoMensajero}
                              onChange={(e) => setDocumentoMensajero(e.target.value)}
                              placeholder="Cédula"
                              className="w-full bg-transparent text-white text-sm focus:outline-none py-1"
                            />
                          </div>
                        </div>

                        {/* Botón Elíptico Gigante de Impresión Térmica */}
                        <button
                          type="button"
                          disabled={isSubmitting || !remitente.trim()}
                          onClick={handleRegistrarEImprimir}
                          className="w-full py-5 rounded-full bg-white text-black hover:bg-white/90 font-mono text-xs uppercase tracking-[0.2em] font-black flex items-center justify-center gap-3 shadow-[0_15px_40px_rgba(255,255,255,0.2)] active:scale-95 transition-all cursor-pointer mt-2"
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw size={18} className="animate-spin" />
                              <span>GENERANDO STICKER...</span>
                            </>
                          ) : (
                            <>
                              <Printer size={20} />
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
        </section>
      </div>

      {/* ============================================================== */}
      {/* 3. PANTALLA DE ÉXITO & SALIDA DE STICKER TÉRMICO (PASO 6)      */}
      {/* ============================================================== */}
      {step === 6 && printedSticker && (
        <div className="fixed inset-0 z-[180] bg-black text-white flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-400">
          <div className="w-20 h-20 rounded-full border-2 border-white flex items-center justify-center text-white mb-4">
            <CheckCircle2 size={46} />
          </div>

          <span className="text-xs font-mono uppercase tracking-[0.25em] text-white/60">
            ENTREGA REGISTRADA
          </span>
          <h2 className="text-3xl sm:text-5xl font-display font-black text-white mt-1">
            Pega el sticker en el paquete y entrégalo al guarda
          </h2>
          <p className="text-sm text-white/60 mt-2 max-w-md mx-auto font-light">
            El residente de la{" "}
            <span className="text-white font-bold">
              Bloque {selectedBloque} Casa {selectedCasa}
            </span>{" "}
            ha sido notificado.
          </p>

          <div className="my-6 p-4 rounded-3xl bg-white/[0.05] border border-white/15 shadow-2xl">
            <StickerEtiqueta data={printedSticker} autoPrint={true} />
          </div>

          <button
            type="button"
            onClick={() => {
              handleResetForm();
              setIsIdle(true);
            }}
            className="py-4 px-10 rounded-full bg-white text-black font-mono text-xs uppercase tracking-widest font-black shadow-2xl active:scale-95 transition-transform cursor-pointer"
          >
            Finalizar / Nueva Entrega ({countdown}s)
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. MODAL PIN DE SEGURIDAD (GUARDA)                             */}
      {/* ============================================================== */}
      {showExitModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-white/15 rounded-3xl p-6 max-w-xs w-full flex flex-col gap-4 text-center shadow-2xl animate-in zoom-in-95 duration-200 text-white">
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
                className="w-full py-3 px-4 text-center text-2xl tracking-[0.3em] font-mono bg-black/40 border border-white/15 rounded-2xl text-white focus:outline-none focus:border-white"
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
                  className="flex-1 py-3 rounded-2xl bg-white text-black text-xs font-bold transition-colors cursor-pointer"
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

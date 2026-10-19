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
  ChevronRight,
  ShieldCheck,
  Lock,
  Sparkles,
  QrCode,
  Check,
  Search,
  Truck,
  Flame,
  Zap,
  Droplets,
  Wifi,
  X
} from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import StickerEtiqueta, { StickerData } from "@/components/paqueteria/StickerEtiqueta";

interface DirectorioItem {
  id: string;
  nombre: string;
  torre: string | null; // Bloque in Las Brisas PH
  apto: string | null;  // Casa in Las Brisas PH
  telefono: string | null;
}

interface CategoriaEntrega {
  id: string;
  label: string;
  sublabel: string;
  emoji: string;
  gradient: string;
  borderGlow: string;
  tipoBackend: string;
}

const CATEGORIAS: CategoriaEntrega[] = [
  {
    id: "comida",
    label: "Comida Caliente",
    sublabel: "Urgente • Domicilio",
    emoji: "🍔",
    gradient: "from-red-500/20 to-orange-500/10",
    borderGlow: "border-red-500/30 text-red-400 group-hover:border-red-500/60",
    tipoBackend: "COMIDA",
  },
  {
    id: "paquete",
    label: "Paquetería",
    sublabel: "MercadoLibre • Amazon",
    emoji: "📦",
    gradient: "from-emerald-500/20 to-teal-500/10",
    borderGlow: "border-emerald-500/30 text-emerald-400 group-hover:border-emerald-500/60",
    tipoBackend: "PAQUETE",
  },
  {
    id: "cadena_frio",
    label: "Cadena de Frío",
    sublabel: "Medicamentos • Frío",
    emoji: "❄️",
    gradient: "from-cyan-500/20 to-blue-500/10",
    borderGlow: "border-cyan-500/30 text-cyan-400 group-hover:border-cyan-500/60",
    tipoBackend: "CADENA_FRIO",
  },
  {
    id: "recibo_energia",
    label: "Factura Energía",
    sublabel: "Enel / Codensa",
    emoji: "⚡",
    gradient: "from-amber-500/20 to-yellow-500/10",
    borderGlow: "border-amber-500/30 text-amber-400 group-hover:border-amber-500/60",
    tipoBackend: "ENERGIA",
  },
  {
    id: "recibo_agua",
    label: "Factura Acueducto",
    sublabel: "EAAB / Agua",
    emoji: "💧",
    gradient: "from-blue-500/20 to-sky-500/10",
    borderGlow: "border-blue-500/30 text-blue-400 group-hover:border-blue-500/60",
    tipoBackend: "AGUA",
  },
  {
    id: "recibo_gas",
    label: "Factura Gas",
    sublabel: "Vanti / Gas Natural",
    emoji: "🔥",
    gradient: "from-orange-500/20 to-amber-500/10",
    borderGlow: "border-orange-500/30 text-orange-400 group-hover:border-orange-500/60",
    tipoBackend: "GAS",
  },
  {
    id: "recibo_telecom",
    label: "Telecomunicaciones",
    sublabel: "Claro • Movistar • Tigo",
    emoji: "🌐",
    gradient: "from-purple-500/20 to-indigo-500/10",
    borderGlow: "border-purple-500/30 text-purple-400 group-hover:border-purple-500/60",
    tipoBackend: "TELECOMUNICACIONES",
  },
  {
    id: "carta_banco",
    label: "Carta Bancaria",
    sublabel: "Documento Confidencial",
    emoji: "✉️",
    gradient: "from-indigo-500/20 to-violet-500/10",
    borderGlow: "border-indigo-500/30 text-indigo-400 group-hover:border-indigo-500/60",
    tipoBackend: "CARTA_BANCO",
  },
  {
    id: "otro",
    label: "Otro Envío",
    sublabel: "Correspondencia general",
    emoji: "🛍️",
    gradient: "from-zinc-500/20 to-stone-500/10",
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

const IDLE_TIMEOUT_MS = 50000; // 50 seconds of inactivity triggers Apple ambient screensaver

export default function KioskoStandalonePage() {
  const router = useRouter();

  // Directory state
  const [directorio, setDirectorio] = useState<DirectorioItem[]>([]);
  const [loadingDirectorio, setLoadingDirectorio] = useState(true);

  // Form states
  const [selectedBloque, setSelectedBloque] = useState<string>("");
  const [selectedCasa, setSelectedCasa] = useState<string>("");
  const [selectedUsuarioId, setSelectedUsuarioId] = useState<string>("");
  const [destinatarioNombre, setDestinatarioNombre] = useState<string>("");
  const [selectedCategoria, setSelectedCategoria] = useState<CategoriaEntrega>(CATEGORIAS[0]);
  const [remitente, setRemitente] = useState<string>("Rappi");
  const [documentoMensajero, setDocumentoMensajero] = useState<string>("");

  // Search filter for houses
  const [casaSearch, setCasaSearch] = useState<string>("");

  // Apple Wizard Steps:
  // 1: Elegir Bloque
  // 2: Elegir Casa & Residente
  // 3: Elegir Tipo de Entrega
  // 4: Elegir Empresa & Confirmar
  // 5: Éxito & Salida de Sticker
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
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

  // Load directory
  useEffect(() => {
    async function loadDir() {
      try {
        const data = await api.get<DirectorioItem[]>("/directorio");
        setDirectorio(data);
      } catch {
        toast.error("Error al cargar directorio de residentes");
      } finally {
        setLoadingDirectorio(false);
      }
    }
    loadDir();
  }, []);

  // Compute unique blocks
  const bloquesDisponibles = useMemo(() => {
    const set = new Set<string>();
    directorio.forEach((d) => {
      if (d.torre) set.add(d.torre.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [directorio]);

  // Compute houses for selected block
  const casasDisponibles = useMemo(() => {
    const list: string[] = [];
    directorio.forEach((d) => {
      const matchBloque = selectedBloque ? d.torre === selectedBloque : true;
      if (matchBloque && d.apto && !list.includes(d.apto)) {
        list.push(d.apto);
      }
    });
    return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [directorio, selectedBloque]);

  // Filtered houses
  const casasFiltradas = useMemo(() => {
    if (!casaSearch.trim()) return casasDisponibles;
    return casasDisponibles.filter((c) => c.toLowerCase().includes(casaSearch.toLowerCase()));
  }, [casasDisponibles, casaSearch]);

  // Residents in selected unit
  const residentesEnUnidad = useMemo(() => {
    if (!selectedCasa) return [];
    return directorio.filter((d) => {
      const matchBloque = selectedBloque ? d.torre === selectedBloque : true;
      return matchBloque && d.apto === selectedCasa;
    });
  }, [directorio, selectedBloque, selectedCasa]);

  // Auto select resident if single
  useEffect(() => {
    if (residentesEnUnidad.length === 1) {
      setSelectedUsuarioId(residentesEnUnidad[0].id);
      setDestinatarioNombre(residentesEnUnidad[0].nombre);
    } else if (residentesEnUnidad.length > 1 && !selectedUsuarioId) {
      setSelectedUsuarioId(residentesEnUnidad[0].id);
      setDestinatarioNombre(residentesEnUnidad[0].nombre);
    }
  }, [residentesEnUnidad, selectedUsuarioId]);

  // Idle Activity Detector
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (step === 5) return; // Do not interrupt success view

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
    setSelectedUsuarioId("");
    setDestinatarioNombre("");
    setSelectedCategoria(CATEGORIAS[0]);
    setRemitente("Rappi");
    setDocumentoMensajero("");
    setCasaSearch("");
    setPrintedSticker(null);
    setStep(1);
  };

  // Submit and Print
  const handleRegistrarEImprimir = async () => {
    if (!selectedCasa) {
      toast.error("Selecciona la casa de destino.");
      return;
    }
    if (!destinatarioNombre.trim()) {
      toast.error("Ingresa el nombre del destinatario.");
      return;
    }
    if (!remitente.trim()) {
      toast.error("Selecciona la empresa o remitente.");
      return;
    }

    const targetUserId = selectedUsuarioId || (residentesEnUnidad[0]?.id ?? directorio[0]?.id);
    if (!targetUserId) {
      toast.error("No se pudo identificar el residente destino.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<{
        id: string;
        fechaLlegada: string;
        tipo: string;
        remitente: string;
      }>("/vigilancia/correspondencia", {
        usuarioId: targetUserId,
        tipo: selectedCategoria.tipoBackend,
        remitente: remitente.trim(),
        descripcion: `Entrega express en Kiosko • Bloque ${selectedBloque || "PH"} Casa ${selectedCasa}`,
      });

      const stickerInfo: StickerData = {
        id: res.id,
        bloque: selectedBloque || null,
        casa: selectedCasa,
        torre: selectedBloque || null,
        apto: selectedCasa,
        destinatario: destinatarioNombre.trim(),
        tipo: selectedCategoria.tipoBackend,
        remitente: remitente.trim(),
        fecha: new Date(res.fechaLlegada).toLocaleString("es-CO", {
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
      setStep(5);
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
      {/* Background Ambient Glows (Apple Dark Glow) */}
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
                  Registra tu entrega en <span className="text-white font-medium">4 simples toques</span> e imprime el sticker térmico con código QR único.
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
                  <span>Proceso Ultrarrápido en 15 Segundos</span>
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
                    <p className="text-xs font-semibold text-white mt-1">Tipo de Envío</p>
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
                Cualquier toque o tecla despierta la tablet
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
      <div className="flex-1 flex flex-col justify-between p-4 sm:p-8 overflow-y-auto max-w-5xl w-full mx-auto relative z-10">
        
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

          {/* Step Progress Chips */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {[1, 2, 3, 4].map((stepNum) => (
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
        {/* STEP 1: ELEGIR BLOQUE                                         */}
        {/* ============================================================== */}
        {step === 1 && (
          <main className="flex-1 flex flex-col justify-center py-6 animate-in fade-in duration-300">
            <div className="text-center max-w-xl mx-auto mb-8">
              <span className="text-xs font-bold tracking-widest uppercase text-[#57bf00]">
                Paso 1 de 4 • Ubicación
              </span>
              <h2 className="text-3xl sm:text-5xl font-display font-extrabold text-white mt-1 tracking-tight">
                ¿A qué Bloque vas?
              </h2>
              <p className="text-sm sm:text-base text-white/60 mt-2 font-light">
                Toca el bloque correspondiente de Las Brisas PH
              </p>
            </div>

            {loadingDirectorio ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/50">
                <RefreshCw size={28} className="animate-spin text-[#57bf00]" />
                <span className="text-sm">Cargando bloques...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-3xl mx-auto w-full">
                {bloquesDisponibles.map((bloque) => {
                  const isSelected = selectedBloque === bloque;
                  return (
                    <button
                      key={bloque}
                      type="button"
                      onClick={() => {
                        setSelectedBloque(bloque);
                        setSelectedCasa("");
                        setSelectedUsuarioId("");
                        setDestinatarioNombre("");
                        setStep(2); // Auto advance to Step 2 in Apple style
                      }}
                      className={`group relative p-6 sm:p-8 rounded-3xl backdrop-blur-2xl border transition-all duration-200 active:scale-95 flex flex-col items-center text-center cursor-pointer ${
                        isSelected
                          ? "bg-white text-black border-white shadow-2xl scale-105"
                          : "bg-white/[0.05] border-white/10 hover:border-white/30 text-white hover:bg-white/[0.09]"
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
                        isSelected ? "bg-black/10 text-black" : "bg-white/[0.08] text-white/80 group-hover:text-white"
                      }`}>
                        <Building2 size={28} />
                      </div>
                      <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
                        Bloque
                      </span>
                      <span className="text-3xl sm:text-4xl font-display font-extrabold mt-0.5">
                        {bloque}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 2: ELEGIR CASA & RESIDENTE                               */}
        {/* ============================================================== */}
        {step === 2 && (
          <main className="flex-1 flex flex-col justify-between py-4 animate-in fade-in duration-300">
            {/* Header with Back button */}
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
                  Paso 2 de 4 • Casa
                </span>
                <h3 className="text-sm font-semibold text-white">
                  Bloque {selectedBloque}
                </h3>
              </div>
            </div>

            <div className="text-center max-w-lg mx-auto mb-4">
              <h2 className="text-2xl sm:text-4xl font-display font-extrabold text-white tracking-tight">
                ¿Qué número de Casa?
              </h2>
              <p className="text-xs sm:text-sm text-white/60 mt-1 font-light">
                Selecciona la casa de destino en el Bloque {selectedBloque}
              </p>
            </div>

            {/* Quick Search */}
            <div className="max-w-md mx-auto w-full mb-4 relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Filtrar número de casa..."
                value={casaSearch}
                onChange={(e) => setCasaSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/[0.06] border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/40"
              />
              {casaSearch && (
                <button
                  type="button"
                  onClick={() => setCasaSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Grid of Houses (Tactile Apple Buttons) */}
            <div className="flex-1 max-w-4xl mx-auto w-full overflow-y-auto max-h-[300px] p-2 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {casasFiltradas.map((casa) => {
                  const isSelected = selectedCasa === casa;
                  return (
                    <button
                      key={casa}
                      type="button"
                      onClick={() => {
                        setSelectedCasa(casa);
                        setSelectedUsuarioId("");
                        setDestinatarioNombre("");
                      }}
                      className={`py-3.5 px-2 rounded-2xl font-mono text-base font-bold transition-all duration-200 active:scale-95 flex flex-col items-center justify-center cursor-pointer ${
                        isSelected
                          ? "bg-[#57bf00] text-white shadow-lg shadow-[#57bf00]/30 scale-105"
                          : "bg-white/[0.06] hover:bg-white/[0.12] text-white/90 border border-white/10"
                      }`}
                    >
                      <span className="text-[10px] text-white/60 font-sans uppercase">Casa</span>
                      <span>{casa}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recipient selection if Casa is selected */}
            {selectedCasa && (
              <div className="mt-4 p-4 rounded-3xl bg-white/[0.05] border border-white/15 max-w-xl mx-auto w-full animate-in fade-in duration-200">
                <span className="text-xs font-semibold text-white/70 flex items-center gap-1.5 mb-2">
                  <User size={14} className="text-[#57bf00]" />
                  ¿Para quién va dirigido en Casa {selectedCasa}?
                </span>

                {residentesEnUnidad.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {residentesEnUnidad.map((r) => {
                      const isChosen = destinatarioNombre === r.nombre;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setSelectedUsuarioId(r.id);
                            setDestinatarioNombre(r.nombre);
                          }}
                          className={`py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isChosen
                              ? "bg-white text-black shadow-md scale-105"
                              : "bg-white/10 hover:bg-white/20 text-white"
                          }`}
                        >
                          {r.nombre}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Nombre del residente o destinatario"
                    value={destinatarioNombre}
                    onChange={(e) => setDestinatarioNombre(e.target.value)}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/[0.08] border border-white/15 text-white text-sm focus:outline-none focus:border-white/40"
                  />
                )}
              </div>
            )}

            {/* Next Button */}
            <div className="flex justify-center mt-4">
              <button
                type="button"
                disabled={!selectedCasa || !destinatarioNombre.trim()}
                onClick={() => setStep(3)}
                className={`py-4 px-10 rounded-full font-bold text-sm tracking-wide flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  selectedCasa && destinatarioNombre.trim()
                    ? "bg-white text-black shadow-xl active:scale-95"
                    : "bg-white/10 text-white/30 cursor-not-allowed"
                }`}
              >
                <span>Continuar a Tipo de Envío</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 3: ELEGIR TIPO DE ENTREGA                                 */}
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
                <span>Atrás</span>
              </button>

              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-widest text-[#57bf00]">
                  Paso 3 de 4 • Categoría
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-w-4xl mx-auto w-full my-auto">
              {CATEGORIAS.map((cat) => {
                const isSelected = selectedCategoria.id === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoria(cat);
                    }}
                    className={`group relative p-4 sm:p-5 rounded-3xl backdrop-blur-2xl border text-left transition-all duration-200 active:scale-95 cursor-pointer flex flex-col justify-between overflow-hidden ${
                      isSelected
                        ? "bg-white text-black border-white shadow-2xl scale-[1.02]"
                        : `bg-white/[0.04] ${cat.borderGlow} hover:bg-white/[0.08]`
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <span className="text-3xl sm:text-4xl">{cat.emoji}</span>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-[#57bf00] text-white flex items-center justify-center">
                          <Check size={14} />
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className={`text-sm sm:text-base font-extrabold tracking-tight ${
                        isSelected ? "text-black" : "text-white"
                      }`}>
                        {cat.label}
                      </h4>
                      <p className={`text-[11px] sm:text-xs font-light mt-0.5 ${
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
                onClick={() => setStep(4)}
                className="py-4 px-10 rounded-full bg-white text-black font-bold text-sm tracking-wide flex items-center gap-2 shadow-xl active:scale-95 transition-all cursor-pointer"
              >
                <span>Continuar a Confirmación</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </main>
        )}

        {/* ============================================================== */}
        {/* STEP 4: EMPRESA, CONFIRMACIÓN & STICKER PREVIEW                */}
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
                  Paso 4 de 4 • Confirmar
                </span>
                <h3 className="text-sm font-semibold text-white">
                  Bloque {selectedBloque} - Casa {selectedCasa}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full my-auto items-center">
              
              {/* Left Column: Courier Details */}
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
                    O escribe otra empresa / particular:
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
                    Documento del Domiciliario (Opcional):
                  </label>
                  <input
                    type="text"
                    value={documentoMensajero}
                    onChange={(e) => setDocumentoMensajero(e.target.value)}
                    placeholder="C.C. o documento del mensajero"
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
                        {destinatarioNombre}
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
        {/* STEP 5: ÉXITO & STICKER IMPRESO                                */}
        {/* ============================================================== */}
        {step === 5 && printedSticker && (
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
              El residente de la <span className="text-white font-bold">Casa {selectedCasa}</span> ya recibió la notificación en su celular.
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
            <input
              type="password"
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
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleVerifyExitPin}
                className="flex-1 py-3 rounded-2xl bg-[#57bf00] hover:bg-[#57bf00]/90 text-white text-xs font-bold transition-colors"
              >
                Acceder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

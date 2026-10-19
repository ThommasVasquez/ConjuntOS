"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { 
  Building2, 
  User, 
  Package, 
  Printer, 
  CheckCircle2, 
  ArrowLeft, 
  RefreshCw, 
  ChevronRight,
  ShieldCheck,
  Lock,
  Smartphone,
  Sparkles,
  QrCode,
  Flame,
  Zap,
  Droplets,
  Wifi,
  X
} from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import StickerEtiqueta, { StickerData } from "@/components/paqueteria/StickerEtiqueta";

interface DirectorioItem {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
  telefono: string | null;
}

interface CategoriaEntrega {
  id: string;
  label: string;
  sublabel: string;
  emoji: string;
  badgeColor: string;
  tipoBackend: string;
}

const CATEGORIAS: CategoriaEntrega[] = [
  {
    id: "comida",
    label: "Domicilio Comida",
    sublabel: "Urgente / Perecedero",
    emoji: "🍔",
    badgeColor: "border-red-500/40 bg-red-500/10 text-red-500",
    tipoBackend: "COMIDA",
  },
  {
    id: "cadena_frio",
    label: "Medicamentos / Frío",
    sublabel: "Requiere refrigeración",
    emoji: "❄️",
    badgeColor: "border-cyan-500/40 bg-cyan-500/10 text-cyan-500",
    tipoBackend: "CADENA_FRIO",
  },
  {
    id: "paquete",
    label: "Paquetería / Encomienda",
    sublabel: "MercadoLibre, Amazon, etc.",
    emoji: "📦",
    badgeColor: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
    tipoBackend: "PAQUETE",
  },
  {
    id: "recibo_energia",
    label: "Recibo Energía",
    sublabel: "Factura Enel / Codensa",
    emoji: "⚡",
    badgeColor: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    tipoBackend: "ENERGIA",
  },
  {
    id: "recibo_agua",
    label: "Recibo Acueducto",
    sublabel: "Factura EAAB / Agua",
    emoji: "💧",
    badgeColor: "border-blue-500/40 bg-blue-500/10 text-blue-500",
    tipoBackend: "AGUA",
  },
  {
    id: "recibo_gas",
    label: "Recibo Gas",
    sublabel: "Factura Vanti / Gas",
    emoji: "🔥",
    badgeColor: "border-orange-500/40 bg-orange-500/10 text-orange-500",
    tipoBackend: "GAS",
  },
  {
    id: "recibo_telecom",
    label: "Telecomunicaciones",
    sublabel: "Claro, Tigo, ETB, Movistar",
    emoji: "🌐",
    badgeColor: "border-purple-500/40 bg-purple-500/10 text-purple-500",
    tipoBackend: "TELECOMUNICACIONES",
  },
  {
    id: "carta_banco",
    label: "Carta Bancaria",
    sublabel: "Documento Confidencial",
    emoji: "✉️",
    badgeColor: "border-indigo-500/40 bg-indigo-500/10 text-indigo-500",
    tipoBackend: "CARTA_BANCO",
  },
  {
    id: "periodico",
    label: "Prensa / Revista",
    sublabel: "Periódico o Suscripción",
    emoji: "📰",
    badgeColor: "border-slate-500/40 bg-slate-500/10 text-slate-400",
    tipoBackend: "PERIODICO",
  },
  {
    id: "otro",
    label: "Otro Envío",
    sublabel: "Correspondencia general",
    emoji: "🛍️",
    badgeColor: "border-border bg-surface-2 text-text",
    tipoBackend: "OTRO",
  },
];

const EMPRESAS_SUGERIDAS = [
  "Rappi",
  "MercadoLibre",
  "Servientrega",
  "Coordinadora",
  "InterRapidísimo",
  "Didi Food",
  "Amazon",
  "Éxito",
  "Familiar / Particular",
];

const IDLE_TIMEOUT_MS = 45000; // 45 seconds of inactivity activates screensaver

export default function KioskoStandalonePage() {
  const router = useRouter();

  // Directory state
  const [directorio, setDirectorio] = useState<DirectorioItem[]>([]);
  const [loadingDirectorio, setLoadingDirectorio] = useState(true);

  // Form states
  const [selectedTorre, setSelectedTorre] = useState<string>("");
  const [selectedApto, setSelectedApto] = useState<string>("");
  const [selectedUsuarioId, setSelectedUsuarioId] = useState<string>("");
  const [destinatarioNombre, setDestinatarioNombre] = useState<string>("");
  const [selectedCategoria, setSelectedCategoria] = useState<CategoriaEntrega>(CATEGORIAS[0]);
  const [remitente, setRemitente] = useState<string>("Rappi");
  const [descripcion, setDescripcion] = useState<string>("");
  const [documentoMensajero, setDocumentoMensajero] = useState<string>("");

  // Kiosk UI flow
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Destino, 2: Categoría & Courier, 3: Éxito & Sticker
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printedSticker, setPrintedSticker] = useState<StickerData | null>(null);
  const [countdown, setCountdown] = useState<number>(10);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Screensaver State
  const [isIdle, setIsIdle] = useState(true); // Starts in screensaver until tapped
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

  // Compute unique towers
  const torresDisponibles = useMemo(() => {
    const set = new Set<string>();
    directorio.forEach((d) => {
      if (d.torre) set.add(d.torre.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [directorio]);

  // Compute apartments for selected tower
  const aptosDisponibles = useMemo(() => {
    const list: string[] = [];
    directorio.forEach((d) => {
      const matchTorre = selectedTorre ? d.torre === selectedTorre : true;
      if (matchTorre && d.apto && !list.includes(d.apto)) {
        list.push(d.apto);
      }
    });
    return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [directorio, selectedTorre]);

  // Compute residents in selected unit
  const residentesEnUnidad = useMemo(() => {
    if (!selectedApto) return [];
    return directorio.filter((d) => {
      const matchTorre = selectedTorre ? d.torre === selectedTorre : true;
      return matchTorre && d.apto === selectedApto;
    });
  }, [directorio, selectedTorre, selectedApto]);

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

  // -------------------------------------------------------------
  // Idle Activity Detector for Screensaver
  // -------------------------------------------------------------
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // If currently on step 3 (sticker printed), do not interrupt the countdown
    if (step === 3) return;

    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
      // Reset form to initial state when going idle
      handleResetForm();
    }, IDLE_TIMEOUT_MS);
  }, [step]);

  useEffect(() => {
    const events = ["mousedown", "mousemove", "touchstart", "pointerdown", "keydown"];
    const handleActivity = () => {
      if (isIdle) {
        setIsIdle(false);
      }
      resetIdleTimer();
    };

    events.forEach((evt) => window.addEventListener(evt, handleActivity));
    resetIdleTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isIdle, resetIdleTimer]);

  // Rotate Screensaver slides every 5 seconds
  useEffect(() => {
    if (!isIdle) return;
    const interval = setInterval(() => {
      setScreensaverSlide((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, [isIdle]);

  // -------------------------------------------------------------
  // Submission and Printing
  // -------------------------------------------------------------
  const handleRegistrarEImprimir = async () => {
    if (!selectedApto) {
      toast.error("Selecciona la casa de destino.");
      return;
    }
    if (!destinatarioNombre.trim()) {
      toast.error("Ingresa el nombre del destinatario.");
      return;
    }
    if (!remitente.trim()) {
      toast.error("Selecciona o escribe la empresa o remitente.");
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
        descripcion: descripcion.trim() ? descripcion.trim() : null,
      });

      const stickerInfo: StickerData = {
        id: res.id,
        bloque: selectedTorre || null,
        casa: selectedApto,
        torre: selectedTorre || null,
        apto: selectedApto,
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
      setStep(3);
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

  const handleResetForm = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setSelectedTorre("");
    setSelectedApto("");
    setSelectedUsuarioId("");
    setDestinatarioNombre("");
    setSelectedCategoria(CATEGORIAS[0]);
    setRemitente("Rappi");
    setDescripcion("");
    setDocumentoMensajero("");
    setPrintedSticker(null);
    setStep(1);
  };

  const handleVerifyExitPin = () => {
    // PIN standard for gate staff or 1234
    if (exitPin === "1234" || exitPin === "2026") {
      router.push("/paqueteria");
    } else {
      toast.error("PIN incorrecto");
      setExitPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white overflow-hidden flex flex-col justify-between select-none font-sans">
      {/* ============================================================== */}
      {/* 1. SCREENSAVER OVERLAY (IDLE STANDBY MODE)                     */}
      {/* ============================================================== */}
      {isIdle && (
        <div 
          onClick={() => setIsIdle(false)}
          className="fixed inset-0 z-[150] bg-gradient-to-br from-[#0c121e] via-[#05080f] to-[#120a17] flex flex-col justify-between p-8 sm:p-14 cursor-pointer animate-in fade-in duration-500 overflow-hidden"
        >
          {/* Ambient Glows */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[140px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#57bf00]/20 rounded-full blur-[140px] pointer-events-none" />

          {/* Top Brand Bar */}
          <div className="flex items-center justify-between relative z-10">
            <div className="relative w-48 sm:w-64 h-14 sm:h-16">
              <Image
                src="/images/las-brisas-logo.jpg"
                alt="Las Brisas La Felicidad"
                fill
                className="object-contain object-left drop-shadow-lg"
                priority
              />
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
              <ShieldCheck size={18} className="text-[#57bf00]" />
              <span className="text-xs font-black tracking-widest uppercase text-white/80">
                Portería Inteligente
              </span>
            </div>
          </div>

          {/* Center Dynamic Slides Carousel */}
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto my-auto relative z-10 gap-6">
            {screensaverSlide === 0 && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-700">
                <span className="px-4 py-1.5 rounded-full bg-accent/20 border border-accent/40 text-accent font-black text-xs uppercase tracking-widest">
                  Autoservicio para Domiciliarios
                </span>
                <h1 className="text-4xl sm:text-6xl font-display font-black text-white tracking-tight leading-tight">
                  Recepción Express de Envíos y Domicilios
                </h1>
                <p className="text-base sm:text-xl text-white/70 max-w-xl">
                  Registra tu entrega en solo <span className="text-accent font-bold">15 segundos</span> e imprime tu sticker adhesivo térmico.
                </p>
              </div>
            )}

            {screensaverSlide === 1 && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-700">
                <div className="relative w-44 h-14">
                  <Image
                    src="/logo.png"
                    alt="ConjuntOS"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <h1 className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight leading-tight">
                  Tu Conjunto Residencial Conectado
                </h1>
                <p className="text-base sm:text-lg text-white/70 max-w-xl">
                  Notificaciones automáticas en tiempo real para comida caliente, cadena de frío y paquetería segura.
                </p>
                <div className="flex items-center gap-2 text-xs text-[#57bf00] font-black uppercase tracking-wider">
                  <Sparkles size={16} /> Tecnología ConjuntOS® para Las Brisas PH
                </div>
              </div>
            )}

            {screensaverSlide === 2 && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-700">
                <span className="px-4 py-1.5 rounded-full bg-[#57bf00]/20 border border-[#57bf00]/40 text-[#57bf00] font-black text-xs uppercase tracking-widest">
                  Paso a Paso Rápido
                </span>
                <h2 className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight">
                  ¿Cómo funciona el Kiosko?
                </h2>
                <div className="grid grid-cols-3 gap-3 max-w-xl text-left mt-2">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <span className="text-2xl font-black text-accent">1</span>
                    <p className="text-xs font-bold text-white mt-1">Elige Bloque y Casa</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <span className="text-2xl font-black text-[#57bf00]">2</span>
                    <p className="text-xs font-bold text-white mt-1">Imprime tu Sticker</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <span className="text-2xl font-black text-amber-400">3</span>
                    <p className="text-xs font-bold text-white mt-1">Entrega al Vigilante</p>
                  </div>
                </div>
              </div>
            )}

            {/* Giant Pulsing Touch Prompt */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="relative group">
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-accent to-[#57bf00] opacity-70 blur-lg animate-pulse" />
                <button
                  type="button"
                  className="relative py-4 px-10 rounded-full bg-white text-black font-black text-lg uppercase tracking-wider shadow-2xl flex items-center gap-3 active:scale-95 transition-transform"
                >
                  <span className="text-2xl animate-bounce">👆</span>
                  <span>Toca la pantalla para iniciar</span>
                </button>
              </div>
              <span className="text-xs text-white/50 tracking-wider">
                Cualquier toque o tecla despierta la pantalla
              </span>
            </div>
          </div>

          {/* Bottom Footer Info */}
          <div className="flex items-center justify-between text-xs text-white/40 pt-4 border-t border-white/10 relative z-10">
            <span>Las Brisas LA FELICIDAD • Portería Principal</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#57bf00] animate-ping" />
              <span>Impresora Térmica Conectada (60×40mm)</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. ACTIVE KIOSK WORKFLOW (NON-IDLE MODE)                        */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col justify-between p-4 sm:p-8 bg-[#0a0f1d] overflow-y-auto">
        {/* Header */}
        <header className="w-full flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="relative w-36 sm:w-48 h-10 sm:h-12">
              <Image
                src="/images/las-brisas-logo.jpg"
                alt="Las Brisas La Felicidad"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
            <div className="hidden sm:flex flex-col border-l border-white/10 pl-3">
              <span className="text-xs font-black uppercase tracking-wider text-accent">
                Kiosko de Portería
              </span>
              <span className="text-[11px] text-white/60">Recepción Express de Envíos</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-24 sm:w-28 h-8 sm:h-9">
              <Image
                src="/logo.png"
                alt="ConjuntOS"
                fill
                className="object-contain object-right"
                priority
              />
            </div>
            {/* PIN lock button to exit Kiosk */}
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
              title="Salir con PIN de vigilante"
            >
              <Lock size={16} />
            </button>
          </div>
        </header>

        {/* Content Flow */}
        <main className="flex-1 max-w-5xl w-full mx-auto flex flex-col justify-center py-4">
          {/* STEP 1: DESTINATION SELECTION */}
          {step === 1 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-300">
              <div className="text-center">
                <span className="text-xs font-black text-accent uppercase tracking-widest">
                  Paso 1 de 2 • Destino
                </span>
                <h2 className="text-2xl sm:text-3xl font-display font-black text-white mt-1">
                  ¿A qué casa va dirigido el envío?
                </h2>
                <p className="text-xs sm:text-sm text-white/70 mt-1">
                  Selecciona el bloque y luego el número de casa.
                </p>
              </div>

              {/* Bloque selector */}
              {torresDisponibles.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-white/70 flex items-center gap-1.5">
                    <Building2 size={14} className="text-accent" />
                    1. Selecciona el Bloque:
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {torresDisponibles.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setSelectedTorre(t);
                          setSelectedApto("");
                        }}
                        className={`py-3 px-6 rounded-2xl text-sm font-black uppercase transition-all shadow-sm cursor-pointer active:scale-95 ${
                          selectedTorre === t
                            ? "bg-accent text-on-accent shadow-accent/30 scale-105"
                            : "bg-white/5 border border-white/10 text-white hover:border-accent/40"
                        }`}
                      >
                        Bloque {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Casa selector */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70 flex items-center gap-1.5">
                  <Building2 size={14} className="text-accent" />
                  2. Selecciona el número de Casa:
                </label>

                {loadingDirectorio ? (
                  <div className="py-8 text-center text-white/50">Cargando directorio...</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-56 overflow-y-auto p-2 rounded-2xl bg-white/5 border border-white/10">
                    {aptosDisponibles.map((apto) => (
                      <button
                        key={apto}
                        type="button"
                        onClick={() => {
                          setSelectedApto(apto);
                          setSelectedUsuarioId("");
                        }}
                        className={`py-3 rounded-xl text-base font-black font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center ${
                          selectedApto === apto
                            ? "bg-[#57bf00] text-white shadow-lg shadow-[#57bf00]/30 scale-105"
                            : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                        }`}
                      >
                        {apto}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recipient suggestions or custom name */}
              {selectedApto && (
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 animate-in fade-in duration-200">
                  <label className="text-xs font-bold uppercase tracking-wider text-white/70 flex items-center gap-1.5">
                    <User size={14} className="text-accent" />
                    3. ¿Para quién es el paquete?
                  </label>

                  {residentesEnUnidad.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {residentesEnUnidad.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setSelectedUsuarioId(r.id);
                            setDestinatarioNombre(r.nombre);
                          }}
                          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            destinatarioNombre === r.nombre
                              ? "bg-accent text-on-accent shadow-sm"
                              : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                          }`}
                        >
                          {r.nombre}
                        </button>
                      ))}
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="Escribe el nombre de la persona o destinatario..."
                    value={destinatarioNombre}
                    onChange={(e) => setDestinatarioNombre(e.target.value)}
                    className="w-full bg-black/40 border border-white/20 rounded-xl py-3 px-4 text-sm font-bold text-white focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              {/* Next step button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={!selectedApto || !destinatarioNombre.trim()}
                  onClick={() => setStep(2)}
                  className="w-full sm:w-auto py-4 px-8 rounded-2xl bg-[#57bf00] hover:bg-[#57bf00]/90 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-[#57bf00]/30 transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continuar a Tipo de Entrega</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CATEGORY & COURIER */}
          {step === 2 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-2 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ArrowLeft size={14} /> Volver
                </button>
                <div className="text-right">
                  <span className="text-xs font-black text-accent uppercase tracking-widest">
                    Paso 2 de 2 • Detalles
                  </span>
                  <p className="text-xs font-bold text-white">
                    Destino: {selectedTorre ? `Bloque ${selectedTorre} - ` : ""}Casa {selectedApto} • {destinatarioNombre}
                  </p>
                </div>
              </div>

              {/* Category Grid */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Selecciona el Tipo de Entrega:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {CATEGORIAS.map((cat) => {
                    const isSelected = selectedCategoria.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoria(cat)}
                        className={`p-3 rounded-2xl border flex flex-col items-center text-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? "bg-accent/20 border-accent shadow-lg shadow-accent/25 scale-[1.03]"
                            : "bg-white/5 border-white/10 hover:border-white/30"
                        }`}
                      >
                        <span className="text-2xl sm:text-3xl">{cat.emoji}</span>
                        <span className="text-xs font-bold text-white leading-tight">{cat.label}</span>
                        <span className="text-[10px] text-white/60">{cat.sublabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Courier chips */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Empresa o Remitente:
                </label>
                <div className="flex flex-wrap gap-2">
                  {EMPRESAS_SUGERIDAS.map((emp) => (
                    <button
                      key={emp}
                      type="button"
                      onClick={() => setRemitente(emp)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        remitente === emp
                          ? "bg-[#009df2] text-white shadow-md shadow-[#009df2]/30 scale-105"
                          : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                      }`}
                    >
                      {emp}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Otra empresa o nombre del repartidor..."
                  value={remitente}
                  onChange={(e) => setRemitente(e.target.value)}
                  className="w-full bg-black/40 border border-white/20 rounded-xl py-2.5 px-4 text-xs font-bold text-white mt-1 focus:outline-none focus:border-accent"
                />
              </div>

              {/* Brief description & courier ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-white/60 uppercase">
                    Descripción breve (opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Pizza familiar, sobre banco, 2 cajas..."
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="w-full bg-black/40 border border-white/20 rounded-xl py-2 px-3 text-xs text-white mt-1 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-white/60 uppercase">
                    Teléfono o Cédula repartidor (opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Para auditoría de seguridad..."
                    value={documentoMensajero}
                    onChange={(e) => setDocumentoMensajero(e.target.value)}
                    className="w-full bg-black/40 border border-white/20 rounded-xl py-2 px-3 text-xs text-white mt-1 focus:outline-none focus:border-accent font-mono"
                  />
                </div>
              </div>

              {/* PRINT BUTTON */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || !remitente.trim()}
                  onClick={handleRegistrarEImprimir}
                  className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 text-on-accent font-black text-base uppercase tracking-widest shadow-xl shadow-accent/30 transition-transform active:scale-98 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      <span>Registrando e imprimiendo...</span>
                    </>
                  ) : (
                    <>
                      <Printer size={22} />
                      <span>Imprimir Sticker Adhesivo (60×40mm)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: STICKER PRINTED & SUCCESS SCREEN */}
          {step === 3 && printedSticker && (
            <div className="flex flex-col items-center text-center gap-6 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-full bg-[#57bf00]/20 border border-[#57bf00]/40 flex items-center justify-center text-[#57bf00]">
                <CheckCircle2 size={36} />
              </div>

              <div>
                <span className="text-xs font-black text-[#57bf00] uppercase tracking-widest">
                  ¡Sticker Generado con Éxito!
                </span>
                <h2 className="text-2xl sm:text-3xl font-display font-black text-white mt-1">
                  Pega el sticker en el paquete y entrégalo al vigilante
                </h2>
                <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-md mx-auto">
                  El residente ya fue notificado automáticamente con los detalles del envío.
                </p>
              </div>

              {/* RENDER DEL STICKER REAL CON ESTILOS PARA IMPRESIÓN */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shadow-2xl">
                <StickerEtiqueta data={printedSticker} autoPrint={true} />
              </div>

              {/* Reset action button */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleResetForm();
                    setIsIdle(true);
                  }}
                  className="py-3 px-6 rounded-2xl bg-accent text-on-accent font-black text-xs uppercase tracking-wider shadow-md hover:bg-accent/90 transition-transform active:scale-95 cursor-pointer"
                >
                  Nueva Entrega ({countdown}s)
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="w-full flex items-center justify-between pt-4 border-t border-white/10 text-[11px] text-white/40">
          <span>ConjuntOS® Kiosko de Portería • Las Brisas PH</span>
          <span>Módulo Aislado e Inmune a Navegación Externa</span>
        </footer>
      </div>

      {/* ============================================================== */}
      {/* 3. EXIT PIN MODAL (FOR GATE SECURITY ONLY)                     */}
      {/* ============================================================== */}
      {showExitModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-white/20 rounded-3xl p-6 max-w-xs w-full flex flex-col gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent mx-auto">
              <Lock size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Seguridad de Portería</h3>
              <p className="text-xs text-white/60 mt-0.5">Ingresa el PIN para salir del modo Kiosko</p>
            </div>
            <input
              type="password"
              maxLength={6}
              placeholder="••••"
              value={exitPin}
              onChange={(e) => setExitPin(e.target.value)}
              className="w-full py-3 px-4 text-center text-xl tracking-[0.3em] font-mono bg-black/50 border border-white/20 rounded-xl text-white focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExitModal(false);
                  setExitPin("");
                }}
                className="flex-1 py-2.5 rounded-xl bg-white/10 text-xs font-bold text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleVerifyExitPin}
                className="flex-1 py-2.5 rounded-xl bg-accent text-on-accent text-xs font-bold"
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

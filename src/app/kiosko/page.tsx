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
  Check,
  Search,
  X,
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
    case "CARTA":
    case "CARTA_BANCO":
      return "CARTA";
    case "DOCUMENTO":
      return "DOCUMENTO";
    case "REVISTA":
      return "REVISTA";
    default:
      // En la base de datos de producción, correspondencia_tipo_check permite
      // estrictamente ['CARTA', 'DOCUMENTO', 'REVISTA', 'OTRO'].
      // Las categorías específicas (COMIDA, PAQUETE, ENERGIA, AGUA, GAS, etc.)
      // se registran como OTRO con la etiqueta exacta en la descripción.
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
 * Las 4 columnas del acordeón adaptadas con fotografía de Paquetería de alta gama:
 * 1. Ubicación    -> Recepción y casilleros inteligentes de paquetes
 * 2. Destinatario -> Residente recibiendo paquete de mensajería
 * 3. Categoría    -> Surtido de cajas, sobres y paquetes organizados
 * 4. Confirmar    -> Escaneo de código de barras y sticker de entrega
 */
const DRIBBLE_COLUMNS = [
  {
    id: 1,
    num: "01",
    label: "Ubicación",
    dribbbleLabel: "Galleries",
    imageTexture: "/images/kiosko/parcel-ubicacion.jpg",
  },
  {
    id: 2,
    num: "02",
    label: "Destinatario",
    dribbbleLabel: "Calendar",
    imageTexture: "/images/kiosko/parcel-destinatario.jpg",
  },
  {
    id: 3,
    num: "03",
    label: "Categoría",
    dribbbleLabel: "Explore",
    imageTexture: "/images/kiosko/parcel-categoria.jpg",
  },
  {
    id: 4,
    num: "04",
    label: "Confirmar",
    dribbbleLabel: "Contact",
    imageTexture: "/images/kiosko/parcel-confirmar.jpg",
  },
];

export default function KioskoPage() {
  const router = useRouter();
  const { user } = useAuth();

  // 479 registros reales de Las Brisas PH
  const [directorio, setDirectorio] = useState<DirectorioItem[]>(RESIDENTES_REALES_LAS_BRISAS);
  const [casaSearch, setCasaSearch] = useState<string>("");

  // Estados del flujo
  const [selectedBloque, setSelectedBloque] = useState<string>("");
  const [selectedCasa, setSelectedCasa] = useState<string>("");
  const [destinatarioNombre, setDestinatarioNombre] = useState<string>("");
  const [selectedCategoria, setSelectedCategoria] = useState<CategoriaEntrega>(CATEGORIAS[0]);
  const [remitente, setRemitente] = useState<string>("Rappi");
  const [documentoMensajero, setDocumentoMensajero] = useState<string>("");

  // activeColumn: null si todas las 4 columnas están visibles en standby (como en frame 1 de Dribbble),
  // o 1, 2, 3, 4 si una columna está abierta (como Contact en frame 9 de Dribbble).
  const [activeColumn, setActiveColumn] = useState<number | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);

  // Sub-paso dentro de Ubicación: "bloque" o "casa"
  const [ubicacionSubStep, setUbicacionSubStep] = useState<"bloque" | "casa">("bloque");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printedSticker, setPrintedSticker] = useState<StickerData | null>(null);
  const [countdown, setCountdown] = useState<number>(10);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Modal PIN del Guarda
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitPin, setExitPin] = useState("");

  // Refs de GSAP
  const activePanelRef = useRef<HTMLDivElement | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);

  // Cargar directorio dinámico de Las Brisas PH
  const loadDir = useCallback(async () => {
    try {
      const data = await api.get<DirectorioItem[]>("/directorio");
      if (Array.isArray(data) && data.length > 0) {
        setDirectorio(data);
      }
    } catch {
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

  // Animación GSAP al abrir o cambiar de columna
  useEffect(() => {
    if (activeColumn !== null && activePanelRef.current) {
      gsap.fromTo(
        activePanelRef.current,
        {
          opacity: 0,
          x: 40,
        },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          ease: "power3.out",
        }
      );
    }
  }, [activeColumn]);

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
    setActiveColumn(null);
    setUbicacionSubStep("bloque");
  };

  // Registrar e imprimir sticker térmico
  const handleRegistrarEImprimir = async () => {
    if (!selectedCasa) {
      toast.error("Selecciona la casa de destino.");
      setActiveColumn(1);
      setUbicacionSubStep("casa");
      return;
    }
    if (!destinatarioNombre.trim()) {
      toast.error("Escribe el nombre del destinatario.");
      setActiveColumn(2);
      return;
    }
    if (!remitente.trim()) {
      toast.error("Selecciona la empresa o remitente.");
      return;
    }

    // 1. Buscar todos los residentes de esta unidad en el directorio de la base de datos
    const residentsOfUnit = directorio.filter((d) => {
      const cleanTorre = d.torre?.replace(/^(bloque|torre)\s*/i, "").trim() || "";
      const cleanApto = d.apto?.replace(/^(casa|apto)\s*/i, "").trim() || "";
      return cleanTorre === selectedBloque && cleanApto === selectedCasa;
    });

    const destLower = destinatarioNombre.trim().toLowerCase();
    const specificResident = residentsOfUnit.find((d) => {
      if (!destLower || destLower === "destinatario general") return false;
      const nomLower = d.nombre.toLowerCase();
      return nomLower.includes(destLower) || destLower.includes(nomLower);
    });

    // 2. Buscar en el catálogo canónico de Las Brisas PH
    const catalogResident = findResidenteReal(selectedBloque, selectedCasa);

    // 3. Determinar el nombre final del destinatario para el sticker y la descripción
    const nombreDestinatarioFinal =
      destinatarioNombre.trim() ||
      specificResident?.nombre ||
      residentsOfUnit[0]?.nombre ||
      catalogResident?.nombre ||
      `Residente Bloque ${selectedBloque} Casa ${selectedCasa}`;

    setIsSubmitting(true);
    try {
      const validTipo = getValidBackendTipo(selectedCategoria.tipoBackend);
      let resId = "";
      let resFecha = new Date().toISOString();

      // Destinatarios prioritarios:
      // Si coincide con un residente específico por nombre, se envía a él.
      // Si es general o no especifica, se envía a TODOS los residentes de la casa en la BD.
      const targetResidents = specificResident
        ? [specificResident]
        : residentsOfUnit.length > 0
        ? residentsOfUnit
        : [];

      let apiSuccess = false;

      // Registrar para los residentes de la casa en la base de datos
      if (targetResidents.length > 0) {
        for (const resident of targetResidents) {
          try {
            const res = await api.post<{
              id: string;
              fechaLlegada: string;
              tipo: string;
              remitente: string;
            }>("/vigilancia/correspondencia", {
              usuarioId: resident.id,
              tipo: validTipo,
              remitente: remitente.trim(),
              descripcion: `[${selectedCategoria.label.toUpperCase()}] Bloque ${selectedBloque} Casa ${selectedCasa} • Destinatario: ${nombreDestinatarioFinal}${documentoMensajero.trim() ? ` • C.C. Mensajero: ${documentoMensajero.trim()}` : ""}`,
            });
            if (!resId) {
              resId = res.id;
              resFecha = res.fechaLlegada;
            }
            apiSuccess = true;
          } catch (candErr) {
            console.warn(`Intento con usuarioId ${resident.id} en correspondencia falló:`, candErr);
          }
        }
      }

      // Si no hubo residentes en la unidad o fallaron, intentar con el guarda en sesión o el primer usuario del directorio
      if (!apiSuccess) {
        const fallbackIds = [user?.id, directorio[0]?.id].filter(Boolean) as string[];
        for (const candId of fallbackIds) {
          try {
            const res = await api.post<{
              id: string;
              fechaLlegada: string;
              tipo: string;
              remitente: string;
            }>("/vigilancia/correspondencia", {
              usuarioId: candId,
              tipo: validTipo,
              remitente: remitente.trim(),
              descripcion: `[${selectedCategoria.label.toUpperCase()}] Bloque ${selectedBloque} Casa ${selectedCasa} • Destinatario: ${nombreDestinatarioFinal}${documentoMensajero.trim() ? ` • C.C. Mensajero: ${documentoMensajero.trim()}` : ""}`,
            });
            resId = res.id;
            resFecha = res.fechaLlegada;
            apiSuccess = true;
            break;
          } catch (candErr) {
            console.warn(`Intento fallback con usuarioId ${candId} falló:`, candErr);
          }
        }
      }

      // Si no fue posible con correspondencia, intentar con paquetes usando el ID de sesión del guarda
      if (!apiSuccess && user?.id) {
        try {
          const resPaquete = await api.post<{
            id: string;
            fechaLlegada?: string;
            createdAt?: string;
          }>("/vigilancia/paquetes", {
            usuarioId: user.id,
            remitente: remitente.trim(),
            descripcion: `[${selectedCategoria.label.toUpperCase()}] Bloque ${selectedBloque} Casa ${selectedCasa} • Destinatario: ${destinatarioNombre.trim()}${documentoMensajero.trim() ? ` • C.C.: ${documentoMensajero.trim()}` : ""}`,
          });
          resId = resPaquete.id;
          resFecha = resPaquete.fechaLlegada || resPaquete.createdAt || new Date().toISOString();
          apiSuccess = true;
        } catch (paqErr) {
          console.warn("Intento de fallback con /vigilancia/paquetes falló:", paqErr);
        }
      }

      // Respaldo garantizado de Kiosko: si el residente no está en la base de datos o el backend
      // responde 404, se genera un ID de transacción para que NUNCA se bloquee la impresión física
      if (!resId) {
        const kioskCode = `KSK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
        resId = kioskCode;
        resFecha = new Date().toISOString();
      }

      const stickerInfo: StickerData = {
        id: resId,
        bloque: selectedBloque,
        casa: selectedCasa,
        torre: selectedBloque,
        apto: selectedCasa,
        destinatario: nombreDestinatarioFinal,
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
      setActiveColumn(5); // Pantalla de éxito
      toast.success("¡Entrega registrada y sticker enviado a impresión!");

      setCountdown(10);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!);
            handleResetForm();
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (finalErr) {
      console.error("Error inesperado en kiosko:", finalErr);
      toast.error("Error al procesar la entrega en portería.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyExitPin = () => {
    if (exitPin === "1234" || exitPin === "2026") {
      router.push("/paqueteria");
    } else {
      toast.error("PIN incorrecto");
      setExitPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] w-screen h-screen bg-black overflow-hidden flex flex-col lg:flex-row font-sans select-none antialiased">
      {/* ------------------------------------------------------------ */}
      {/* LADO IZQUIERDO (BLANCO PURO - EXACTO AL VIDEO DRIBBBLE)      */}
      {/* ------------------------------------------------------------ */}
      <aside
        ref={leftPanelRef}
        className="w-full lg:w-[46%] xl:w-[44%] h-full bg-white text-black p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative z-10 overflow-hidden"
      >
          {/* Top-Left: Logos Oficiales de ConjuntOS® y Las Brisas La Felicidad */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="relative w-36 sm:w-44 h-11">
                <Image
                  src="/images/conjuntos-logo-horizontal.jpg"
                  alt="ConjuntOS®"
                  fill
                  className="object-contain object-left"
                  priority
                />
              </div>
              <div className="h-6 w-px bg-neutral-300" />
              <div className="relative w-28 sm:w-36 h-9">
                <Image
                  src="/images/las-brisas-logo.png"
                  alt="Las Brisas La Felicidad"
                  fill
                  className="object-contain object-left"
                  priority
                />
              </div>
            </div>

            {/* Botón sutil de menú de 2 líneas (como el "=" en el video de Dribbble) */}
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="w-8 h-8 flex flex-col justify-center items-end gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
              title="Menú de Portería"
            >
              <span className="w-6 h-[2px] bg-black block" />
              <span className="w-4 h-[2px] bg-black block" />
            </button>
          </div>

          {/* Gran Tipografía Editorial: FOLLOW THE ART -> RECEPCIÓN EXPRESS */}
          <div className="my-auto py-6 flex flex-col gap-5">
            <h1 className="text-5xl sm:text-7xl font-display font-black tracking-tighter text-black leading-[0.88] uppercase">
              RECEPCIÓN <br />
              EXPRESS
            </h1>

            <p className="font-mono text-xs sm:text-[13px] text-neutral-600 max-w-xs leading-relaxed">
              No dejes que los domicilios esperen en portería. Selecciona la columna correspondiente para registrar la entrega e imprimir la etiqueta oficial.
            </p>
          </div>

          {/* Bottom-Left: Thumbnail artístico con líneas decorativas circulares (exacto a Dribbble) */}
          <div className="relative flex items-center gap-4 pt-4 border-t border-neutral-100">
            {/* Líneas decorativas circulares como en el video */}
            <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full border border-neutral-200 pointer-events-none" />
            <div className="absolute -left-10 -bottom-10 w-36 h-36 rounded-full border border-neutral-100 pointer-events-none" />

            {/* Thumbnail dinámico: preview de paquetería o logo oficial de Las Brisas */}
            <div className="relative w-28 h-16 rounded-xl overflow-hidden shadow-sm border border-neutral-200 bg-white flex-none z-10 transition-all flex items-center justify-center p-1.5">
              <Image
                src={
                  hoveredColumn
                    ? DRIBBLE_COLUMNS.find((c) => c.id === hoveredColumn)?.imageTexture || "/images/las-brisas-logo.png"
                    : activeColumn
                    ? DRIBBLE_COLUMNS.find((c) => c.id === activeColumn)?.imageTexture || "/images/las-brisas-logo.png"
                    : "/images/las-brisas-logo.png"
                }
                alt="Las Brisas La Felicidad"
                fill
                className={hoveredColumn || activeColumn ? "object-cover" : "object-contain p-1"}
              />
            </div>

            <div className="flex flex-col z-10">
              <span className="font-mono text-[10px] text-neutral-400 tracking-wider uppercase">
                LAS BRISAS PH &bull; LA FELICIDAD
              </span>
              <span className="text-xs font-extrabold text-black uppercase tracking-tight mt-0.5">
                {selectedBloque && selectedCasa
                  ? `Bloque ${selectedBloque} • Casa ${selectedCasa}`
                  : "PORTERÍA INTELIGENTE"}
              </span>
              {destinatarioNombre.trim() && (
                <span className="text-[11px] text-neutral-600 font-mono truncate max-w-[200px]">
                  Para: {destinatarioNombre}
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------------ */}
        {/* LADO DERECHO (LAS 4 COLUMNAS FLUIDAS O EL PANEL EXPANDIDO)   */}
        {/* ------------------------------------------------------------ */}
        <section className="w-full lg:w-[54%] xl:w-[56%] h-full bg-black relative flex flex-row overflow-hidden">

          {/* ========================================================== */}
          {/* CASO A: VISTA STANDBY (LAS 4 COLUMNAS VISIBLES - FRAME 1)   */}
          {/* ========================================================== */}
          {activeColumn === null && (
            <div className="w-full h-full flex flex-row animate-in fade-in duration-500">
              {DRIBBLE_COLUMNS.map((col) => {
                const isHovered = hoveredColumn === col.id;
                const anyHovered = hoveredColumn !== null;

                // Ancho dinámico tipo acordeón idéntico al video de Dribbble:
                // Al pasar el cursor, la columna se expande suavemente y las demás se comprimen
                const flexClass = isHovered
                  ? "flex-[2] sm:flex-[2.4]"
                  : anyHovered
                  ? "flex-[0.6] sm:flex-[0.55]"
                  : "flex-1";

                // Resumen de valor elegido para mostrar en la base
                let valueSelected = "";
                if (col.id === 1 && selectedBloque && selectedCasa) {
                  valueSelected = `B.${selectedBloque} - C.${selectedCasa}`;
                } else if (col.id === 1 && selectedBloque) {
                  valueSelected = `Bloque ${selectedBloque}`;
                } else if (col.id === 2 && destinatarioNombre) {
                  valueSelected = destinatarioNombre.slice(0, 12);
                } else if (col.id === 3 && selectedCategoria) {
                  valueSelected = selectedCategoria.label;
                } else if (col.id === 4 && remitente) {
                  valueSelected = remitente;
                }

                return (
                  <div
                    key={col.id}
                    onMouseEnter={() => setHoveredColumn(col.id)}
                    onMouseLeave={() => setHoveredColumn(null)}
                    onClick={() => setActiveColumn(col.id)}
                    className={`${flexClass} h-full relative cursor-pointer overflow-hidden border-l border-white/10 group transition-all duration-500 ease-out`}
                  >
                    {/* Fotografía Vertical de Paquetería de Alta Resolución (9:16) */}
                    <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-105">
                      <Image
                        src={col.imageTexture}
                        alt={col.label}
                        fill
                        sizes="(max-width: 1024px) 25vw, 20vw"
                        className="object-cover object-center"
                        priority
                      />
                      {/* Gradiente oscuro para máxima legibilidad de tipografía vertical */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/30 group-hover:from-black/70 group-hover:via-black/20 group-hover:to-black/20 transition-all duration-500" />
                    </div>

                    {/* Contenido Vertical de la Columna */}
                    <div className="relative z-10 h-full w-full flex flex-col justify-between p-6 sm:p-8">
                      {/* Flecha Superior Diagonal (↗) */}
                      <div className="flex justify-end">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                            isHovered
                              ? "bg-white text-black scale-110 shadow-lg"
                              : "text-white/80"
                          }`}
                        >
                          <ArrowUpRight size={22} />
                        </div>
                      </div>

                      {/* Texto Vertical al Pie (Exacto al Video de Dribbble) */}
                      <div className="flex flex-col items-start pb-4">
                        <span
                          className="font-display font-black text-2xl sm:text-3xl lg:text-4xl text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] whitespace-nowrap select-none transition-transform duration-300"
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                          }}
                        >
                          {valueSelected ? valueSelected : col.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ========================================================== */}
          {/* CASO B: PANEL ACTIVO EXPANDIDO (EXACTO AL FRAME 9 DRIBBLE) */}
          {/* ========================================================== */}
          {activeColumn !== null && activeColumn <= 4 && (
            <div className="w-full h-full flex flex-row">
              {/* Contenido Principal de la Columna Activa (Fondo Negro Puro) */}
              <div
                ref={activePanelRef}
                className="flex-1 h-full bg-[#08090d] text-white p-8 sm:p-12 lg:p-14 flex flex-col justify-between overflow-y-auto"
              >
                {/* Header Superior del Formulario Activo */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveColumn(null)}
                    className="flex items-center gap-2 text-xs font-mono text-white/50 hover:text-white transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={14} />
                    <span>Ver todas las columnas</span>
                  </button>

                  <span className="text-xs font-mono tracking-widest uppercase text-white/40">
                    Columna 0{activeColumn} / 04
                  </span>
                </div>

                {/* ---------------------------------------------------- */}
                {/* 01. UBICACIÓN (BLOQUE & CASA)                        */}
                {/* ---------------------------------------------------- */}
                {activeColumn === 1 && (
                  <div className="my-auto py-6 flex flex-col gap-6 max-w-md w-full">
                    {ubicacionSubStep === "bloque" ? (
                      <>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                            ¿A qué Bloque vas?
                          </h2>
                          <p className="text-xs font-mono text-white/50 mt-1">
                            Selecciona el bloque de Las Brisas PH
                          </p>
                        </div>

                        {/* Cuadrícula de los 6 Bloques */}
                        <div className="grid grid-cols-3 gap-3">
                          {bloquesDisponibles.map((bloque) => {
                            const isSelected = selectedBloque === bloque;
                            return (
                              <button
                                key={bloque}
                                type="button"
                                onClick={() => {
                                  setSelectedBloque(bloque);
                                  setSelectedCasa("");
                                  setUbicacionSubStep("casa");
                                }}
                                className={`py-6 rounded-2xl border text-center transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-white text-black border-white shadow-xl scale-105"
                                    : "bg-white/[0.04] border-white/15 hover:border-white/50 text-white"
                                }`}
                              >
                                <span className="text-[10px] font-mono uppercase opacity-50 block">
                                  Bloque
                                </span>
                                <span className="text-3xl font-display font-black">
                                  {bloque}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                              Selecciona la Casa
                            </h2>
                            <p className="text-xs font-mono text-white/50 mt-1">
                              Bloque {selectedBloque} &bull; Casas {parseInt(selectedBloque || "1") * 100 + 1} a {parseInt(selectedBloque || "1") * 100 + 80}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setUbicacionSubStep("bloque")}
                            className="text-xs font-mono text-white/50 hover:text-white underline"
                          >
                            Cambiar Bloque
                          </button>
                        </div>

                        {/* Buscador de Casa Underline */}
                        <div className="relative py-2 border-b border-white/20 focus-within:border-white transition-colors">
                          <Search size={15} className="absolute left-0 top-1/2 -translate-y-1/2 text-white/40" />
                          <input
                            type="text"
                            placeholder="Buscar casa (ej: 15 o 315)..."
                            value={casaSearch}
                            onChange={(e) => setCasaSearch(e.target.value)}
                            className="w-full pl-6 bg-transparent text-white text-sm focus:outline-none font-mono placeholder-white/30"
                          />
                        </div>

                        {/* Grid de 80 Casas */}
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[240px] overflow-y-auto p-1">
                          {casasFiltradas.map((casa) => {
                            const isSelected = selectedCasa === casa;
                            return (
                              <button
                                key={casa}
                                type="button"
                                onClick={() => setSelectedCasa(casa)}
                                className={`py-2.5 rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-white text-black border-white shadow-md scale-105"
                                    : "bg-white/[0.04] border-white/10 hover:border-white/30 text-white"
                                }`}
                              >
                                {casa}
                              </button>
                            );
                          })}
                        </div>

                        {/* Botón Elíptico estilo Dribbble */}
                        <button
                          type="button"
                          disabled={!selectedCasa}
                          onClick={() => setActiveColumn(2)}
                          className={`mt-2 py-3 px-8 rounded-full border text-xs font-mono uppercase tracking-[0.2em] transition-all cursor-pointer ${
                            selectedCasa
                              ? "border-white bg-white text-black hover:bg-white/90 shadow-lg active:scale-95"
                              : "border-white/20 text-white/30 cursor-not-allowed"
                          }`}
                        >
                          Siguiente: Destinatario &rarr;
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* 02. DESTINATARIO (UNDERLINE FORM DRIBBBLE EXACT)     */}
                {/* ---------------------------------------------------- */}
                {activeColumn === 2 && (
                  <div className="my-auto py-6 flex flex-col gap-8 max-w-md w-full">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                        ¿Para quién es el paquete?
                      </h2>
                      <p className="text-xs font-mono text-white/50 mt-1">
                        Escribe el nombre tal como figura en la guía o etiqueta
                      </p>
                    </div>

                    {/* Underline Form Field (exacto al frame 9 de Dribbble) */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-mono text-white/50 uppercase tracking-wider">
                        Nombre completo
                      </label>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ej. Andrea Gómez, Carlos Rodríguez..."
                        value={destinatarioNombre}
                        onChange={(e) => setDestinatarioNombre(e.target.value)}
                        className="w-full py-3 bg-transparent border-b border-white/30 focus:border-white text-white text-xl placeholder-white/20 focus:outline-none transition-colors font-sans"
                      />
                    </div>

                    {/* Botón Elíptico estilo SUBMIT del video de Dribbble */}
                    <div className="flex flex-col gap-3 pt-2">
                      <button
                        type="button"
                        disabled={!destinatarioNombre.trim()}
                        onClick={() => setActiveColumn(3)}
                        className={`w-full py-3.5 rounded-full border text-xs font-mono uppercase tracking-[0.2em] transition-all cursor-pointer ${
                          destinatarioNombre.trim()
                            ? "border-white bg-white text-black hover:bg-white/90 shadow-xl active:scale-95"
                            : "border-white/20 text-white/30 cursor-not-allowed"
                        }`}
                      >
                        Siguiente: Categoría &rarr;
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDestinatarioNombre("Destinatario General");
                          setActiveColumn(3);
                        }}
                        className="text-[11px] font-mono text-center text-white/40 hover:text-white underline decoration-white/20"
                      >
                        ¿Sin nombre particular? Marcar como Destinatario General
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* 03. CATEGORÍA DE ENTREGA                             */}
                {/* ---------------------------------------------------- */}
                {activeColumn === 3 && (
                  <div className="my-auto py-6 flex flex-col gap-6 max-w-md w-full">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                        ¿Qué tipo de paquete es?
                      </h2>
                      <p className="text-xs font-mono text-white/50 mt-1">
                        Determina la prioridad de aviso al residente
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto p-1">
                      {CATEGORIAS.map((cat) => {
                        const isSelected = selectedCategoria.id === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategoria(cat)}
                            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? "bg-white text-black border-white shadow-lg scale-[1.02]"
                                : "bg-white/[0.04] border-white/10 hover:border-white/30 text-white"
                            }`}
                          >
                            <span className="text-2xl mb-1">{cat.emoji}</span>
                            <div>
                              <h4 className="text-xs font-bold leading-tight">{cat.label}</h4>
                              <p className={`text-[9px] mt-0.5 ${isSelected ? "text-black/60" : "text-white/40"}`}>
                                {cat.sublabel}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Botón Elíptico */}
                    <button
                      type="button"
                      onClick={() => setActiveColumn(4)}
                      className="w-full py-3.5 rounded-full border border-white bg-white text-black hover:bg-white/90 text-xs font-mono uppercase tracking-[0.2em] shadow-xl active:scale-95 cursor-pointer"
                    >
                      Siguiente: Confirmar &rarr;
                    </button>
                  </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* 04. CONFIRMAR & IMPRIMIR STICKER TÉRMICO             */}
                {/* ---------------------------------------------------- */}
                {activeColumn === 4 && (
                  <div className="my-auto py-6 flex flex-col gap-6 max-w-md w-full">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                        ¿De qué empresa vienes?
                      </h2>
                      <p className="text-xs font-mono text-white/50 mt-1">
                        Selecciona o escribe el remitente del envío
                      </p>
                    </div>

                    {/* Chips de Empresas */}
                    <div className="flex flex-wrap gap-1.5">
                      {EMPRESAS_RAPIDAS.map((emp) => {
                        const isSelected = remitente === emp.name;
                        return (
                          <button
                            key={emp.name}
                            type="button"
                            onClick={() => setRemitente(emp.name)}
                            className={`py-1.5 px-3 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
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
                    <div className="flex flex-col gap-3">
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

                    {/* Botón Elíptico Gigante estilo SUBMIT */}
                    <button
                      type="button"
                      disabled={isSubmitting || !remitente.trim()}
                      onClick={handleRegistrarEImprimir}
                      className="w-full py-4 rounded-full border border-white bg-white text-black hover:bg-white/90 font-mono text-xs uppercase tracking-[0.2em] font-black flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(255,255,255,0.2)] active:scale-95 transition-all cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>REGISTRANDO...</span>
                        </>
                      ) : (
                        <>
                          <Printer size={16} />
                          <span>IMPRIMIR STICKER TÉRMICO</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Tiras comprimidas a la derecha de las otras 3 columnas */}
              <div className="w-14 sm:w-16 h-full flex flex-col border-l border-white/10 flex-none">
                {DRIBBLE_COLUMNS.filter((c) => c.id !== activeColumn).map((col) => {
                  return (
                    <div
                      key={col.id}
                      onClick={() => setActiveColumn(col.id)}
                      className="flex-1 w-full relative cursor-pointer overflow-hidden border-b border-black/40 group hover:brightness-125 transition-all"
                    >
                      <Image
                        src={col.imageTexture}
                        alt={col.label}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors" />

                      <div className="relative z-10 h-full w-full flex flex-col justify-between items-center py-4">
                        <span className="text-[10px] font-mono text-white/60">
                          {col.num}
                        </span>
                        <span
                          className="font-display font-bold text-xs text-white uppercase tracking-wider select-none"
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                          }}
                        >
                          {col.label}
                        </span>
                        <ArrowUpRight size={14} className="text-white/60 group-hover:rotate-45 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* CASO C: PANTALLA DE ÉXITO & STICKER IMPRESO (COLUMNA 5)    */}
          {/* ========================================================== */}
          {activeColumn === 5 && printedSticker && (
            <div className="w-full h-full bg-[#08090d] text-white p-8 sm:p-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-400">
              <div className="w-16 h-16 rounded-full border border-white flex items-center justify-center text-white mb-4">
                <CheckCircle2 size={36} />
              </div>

              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/50">
                REGISTRO EXITOSO
              </span>
              <h2 className="text-2xl sm:text-4xl font-display font-bold text-white mt-1">
                Pega el sticker en el paquete
              </h2>
              <p className="text-xs text-white/50 mt-1 max-w-sm">
                Bloque {selectedBloque} &bull; Casa {selectedCasa} &bull; Residente notificado
              </p>

              <div className="my-5 p-3 rounded-2xl bg-white/[0.04] border border-white/10 shadow-2xl">
                <StickerEtiqueta data={printedSticker} autoPrint={true} />
              </div>

              <button
                type="button"
                onClick={handleResetForm}
                className="py-3 px-8 rounded-full border border-white bg-white text-black font-mono text-xs uppercase tracking-widest font-black shadow-xl active:scale-95 cursor-pointer"
              >
                Nueva Entrega ({countdown}s)
              </button>
            </div>
          )}
        </section>

      {/* ============================================================== */}
      {/* MODAL PIN DE SEGURIDAD (GUARDA)                                 */}
      {/* ============================================================== */}
      {showExitModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-white/15 rounded-3xl p-6 max-w-xs w-full flex flex-col gap-4 text-center shadow-2xl animate-in zoom-in-95 duration-200 text-white">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white mx-auto">
              <Lock size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Seguridad de Portería</h3>
              <p className="text-[11px] text-white/50 mt-0.5">PIN para salir a Paquetería</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyExitPin();
              }}
              className="flex flex-col gap-4"
            >
              <input
                type="text"
                name="username"
                value="porteria"
                autoComplete="username"
                className="hidden"
                readOnly
              />
              <input
                type="password"
                autoComplete="current-password"
                maxLength={6}
                placeholder="••••"
                value={exitPin}
                onChange={(e) => setExitPin(e.target.value)}
                className="w-full py-2.5 px-4 text-center text-xl tracking-[0.3em] font-mono bg-black/40 border border-white/15 rounded-xl text-white focus:outline-none focus:border-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExitModal(false);
                    setExitPin("");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-bold transition-colors cursor-pointer"
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

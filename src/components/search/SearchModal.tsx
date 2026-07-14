"use client";

import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { canAccess } from "@/lib/permissions";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, X, Sparkles, Loader2, ArrowRight,
  CreditCard, Calendar, Car, Package, MessageSquare,
  Building2, Users, Megaphone, AlertCircle, ChevronRight
} from "lucide-react";
import { gsap } from "gsap";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchContext {
  userName?: string;
  totalDebt?: number;
  pagos?: { concepto: string; monto: number; estado: string }[];
  paquetes?: { remitente?: string; estado?: string }[];
  reservas?: { area?: string; fechaInicio?: string }[];
  anuncios?: { titulo: string; contenido: string }[];
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  context?: SearchContext;
}

// ─── Platform Modules (searchable) ───────────────────────────────────────────
// iconBg: fondo del ícono   iconColor: color del ícono
const MODULES = [
  { title: "Pagos",        desc: "Cuotas, recibos y sanciones",      icon: <CreditCard   size={18} />, iconBg: "bg-[#009df2]/15", iconColor: "text-[#009df2]", path: "/pagos",        keywords: ["pago","cuota","administración","deuda","recibo","energía","gas","agua"] },
  { title: "Reservas",     desc: "Salón, cancha, gimnasio y más",     icon: <Calendar     size={18} />, iconBg: "bg-[#57bf00]/15", iconColor: "text-[#57bf00]", path: "/reservas",     keywords: ["reserva","salón","salon","cancha","gimnasio","piscina","bbq","área","area"] },
  { title: "Parqueadero",  desc: "Estado y asignación de cupos",      icon: <Car          size={18} />, iconBg: "bg-[#009df2]/15", iconColor: "text-[#009df2]", path: "/parqueadero",  keywords: ["parqueo","parqueadero","carro","moto","vehículo","vehiculo","cupo"] },
  { title: "Paquetería",   desc: "Paquetes en portería",              icon: <Package      size={18} />, iconBg: "bg-[#57bf00]/15", iconColor: "text-[#57bf00]", path: "/paqueteria",   keywords: ["paquete","encomienda","portería","porteria","llegó","llego","domicilio","envío"] },
  { title: "PQRS",         desc: "Peticiones, quejas y reclamos",     icon: <MessageSquare size={18}/>, iconBg: "bg-[#009df2]/15", iconColor: "text-[#009df2]", path: "/pqrs",         keywords: ["pqr","queja","petición","peticion","problema","reclamo","solicitud"] },
  { title: "Visitantes",   desc: "Autorización de ingresos",          icon: <Users        size={18} />, iconBg: "bg-[#57bf00]/15", iconColor: "text-[#57bf00]", path: "/visitantes",   keywords: ["visita","visitante","invitado","ingreso","acceso","autoriza"] },
  { title: "Cartelera",    desc: "Anuncios y novedades",              icon: <Megaphone    size={18} />, iconBg: "bg-[#009df2]/15", iconColor: "text-[#009df2]", path: "/cartelera",    keywords: ["anuncio","novedad","asamblea","reunión","reunion","circular","cartelera"] },
  { title: "Inmobiliaria", desc: "Venta y arriendo en el conjunto",   icon: <Building2    size={18} />, iconBg: "bg-[#57bf00]/15", iconColor: "text-[#57bf00]", path: "/inmobiliaria", keywords: ["venta","arriendo","alquiler","inmueble","apartamento","apto"] },
];

const SUGGESTIONS = [
  { label: "¿Cuánto debo?",        icon: <AlertCircle   size={14} />, color: "text-[#009df2]" },
  { label: "Ver paquetes",         icon: <Package       size={14} />, color: "text-[#57bf00]" },
  { label: "Reservar el salón",    icon: <Calendar      size={14} />, color: "text-[#009df2]" },
  { label: "Reportar un problema", icon: <MessageSquare size={14} />, color: "text-[#57bf00]" },
  { label: "Autorizar visita",     icon: <Users         size={14} />, color: "text-[#009df2]" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isQuestion(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.endsWith("?") || trimmed.split(" ").length >= 4;
}

function filterModules(query: string, role?: string | null) {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return MODULES.filter(m =>
    canAccess(role, m.path) && (
      m.title.toLowerCase().includes(q) ||
      m.desc.toLowerCase().includes(q) ||
      m.keywords.some(k => k.includes(q) || q.includes(k))
    )
  );
}

// ─── Typing Animation ─────────────────────────────────────────────────────────

function TypingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [text]);

  const parts = displayed.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} className="text-[#57bf00] font-bold">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
      {displayed.length < text.length && (
        <span className="inline-block w-0.5 h-3.5 bg-[#009df2] ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchModal({ isOpen, onClose, context = {} }: SearchModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.rol;
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<{ text: string } | null>(null);
  const [filteredModules, setFilteredModules] = useState<typeof MODULES>([]);

  // ── Animation ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setAiAnswer(null);
      setFilteredModules([]);

      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" });
      gsap.fromTo(cardRef.current,
        { opacity: 0, y: 40, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(1.2)", delay: 0.05 }
      );
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    gsap.to(cardRef.current, { opacity: 0, y: 30, scale: 0.96, duration: 0.2, ease: "power2.in" });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.25, delay: 0.1, onComplete: onClose });
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, handleClose]);

  // ── Search Logic ──────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setAiAnswer(null);
    setFilteredModules(filterModules(value, role));

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length >= 3 && isQuestion(value)) {
      debounceRef.current = setTimeout(() => askAI(value), 600);
    }
  };

  const askAI = useCallback(async (q: string) => {
    setIsLoadingAI(true);
    setAiAnswer(null);
    try {
      const contexto = Object.keys(context).length ? JSON.stringify(context) : undefined;
      const data = await api.post<{ respuesta: string }>("/ai/asistente", { pregunta: q, contexto });
      setAiAnswer({ text: data.respuesta });
    } catch {
      setAiAnswer({ text: "No pude procesar tu pregunta. Intenta de nuevo." });
    } finally {
      setIsLoadingAI(false);
    }
  }, [context]);

  const handleSuggestion = (label: string) => {
    setQuery(label);
    setFilteredModules(filterModules(label, role));
    askAI(label);
  };

  const navigateTo = (path: string) => {
    handleClose();
    setTimeout(() => router.push(path), 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) askAI(query);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-6"
      style={{ background: "rgba(8,8,8,0.85)", backdropFilter: "blur(24px)" }}
    >
      {/* Overlay tap-to-close */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Search Card — Liquid Glass */}
      <div
        ref={cardRef}
        className="relative w-full sm:max-w-lg flex flex-col rounded-t-[40px] sm:rounded-[40px] overflow-hidden"
        style={{
          background: "rgba(0, 157, 242, 0.07)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid rgba(0, 157, 242, 0.18)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
          maxHeight: "90vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-4 pb-2 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[#009df2]/30" />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-4 flex items-center gap-4 border-b border-[#009df2]/12">
          <div className="w-10 h-10 rounded-[16px] bg-[#009df2]/15 border border-[#009df2]/25 flex items-center justify-center flex-shrink-0">
            <Sparkles size={18} className="text-[#009df2]" />
          </div>
          <form onSubmit={handleSubmit} className="flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Buscar o preguntar algo..."
              className="w-full bg-transparent text-text text-base font-medium placeholder:text-text-muted focus:outline-none"
            />
          </form>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-text/5 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-all flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6" style={{ scrollbarWidth: "none" }}>

          {/* ─── AI Answer ─── */}
          {(isLoadingAI || aiAnswer) && (
            <div
              className="rounded-[24px] overflow-hidden border border-[#57bf00]/20"
              style={{ background: "rgba(87, 191, 0, 0.06)" }}
            >
              <div className="px-5 py-3 flex items-center gap-2 border-b border-[#57bf00]/10">
                <Sparkles size={14} className="text-[#57bf00]" />
                <span className="text-[10px] font-black text-[#57bf00] uppercase tracking-widest">
                  Asistente IA
                </span>
              </div>
              <div className="p-5">
                {isLoadingAI ? (
                  <div className="flex items-center gap-3 text-text">
                    <Loader2 size={16} className="animate-spin text-[#009df2]" />
                    <span className="text-sm">Analizando tu pregunta...</span>
                  </div>
                ) : aiAnswer ? (
                  <p className="text-sm text-text leading-relaxed">
                    <TypingText text={aiAnswer.text} />
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {/* ─── Module Results ─── */}
          {filteredModules.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-1">
                Módulos
              </span>
              {filteredModules.map((mod) => (
                <button
                  key={mod.path}
                  onClick={() => navigateTo(mod.path)}
                  className="flex items-center gap-4 p-4 rounded-[20px] bg-text/3 border border-border hover:bg-[#009df2]/8 hover:border-[#009df2]/20 transition-all text-left group active:scale-95"
                >
                  <div className={`w-10 h-10 rounded-[14px] ${mod.iconBg} border border-current/10 flex items-center justify-center ${mod.iconColor} flex-shrink-0`}>
                    {mod.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-text font-bold text-sm">{mod.title}</p>
                    <p className="text-text-muted text-[11px]">{mod.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-text-muted group-hover:text-[#57bf00] transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* ─── Empty state / Suggestions ─── */}
          {!query && !aiAnswer && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-1">
                  Preguntas frecuentes
                </span>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleSuggestion(s.label)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-text/5 border border-border text-text text-xs font-semibold hover:bg-[#009df2]/10 hover:border-[#009df2]/25 transition-all active:scale-95"
                    >
                      <span className={s.color}>{s.icon}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-1">
                  Accesos Directos
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {MODULES.filter((mod) => canAccess(role, mod.path)).slice(0, 4).map((mod) => (
                    <button
                      key={mod.path}
                      onClick={() => navigateTo(mod.path)}
                      className="flex items-center gap-3 p-4 rounded-[20px] bg-text/3 border border-border text-left active:scale-95 transition-all group hover:bg-[#009df2]/8 hover:border-[#009df2]/20"
                    >
                      <div className={`w-9 h-9 rounded-[12px] ${mod.iconBg} flex items-center justify-center ${mod.iconColor} flex-shrink-0`}>
                        {mod.icon}
                      </div>
                      <div>
                        <p className="text-text font-bold text-xs">{mod.title}</p>
                        <ArrowRight size={10} className="text-text-muted group-hover:text-[#57bf00] mt-0.5 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* No results */}
          {query.trim().length >= 2 && filteredModules.length === 0 && !aiAnswer && !isLoadingAI && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Search size={32} className="text-text-muted" />
              <p className="text-text text-sm">Sin resultados para <strong className="text-[#009df2]">&quot;{query}&quot;</strong></p>
              <button
                onClick={() => askAI(query)}
                className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#57bf00]/10 border border-[#57bf00]/20 text-[#57bf00] text-xs font-bold hover:bg-[#57bf00]/20 transition-all active:scale-95"
              >
                <Sparkles size={14} /> Preguntar al asistente IA
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#009df2]/10 flex items-center justify-between">
          <span className="text-[10px] text-text-muted font-medium">ConjuntOS Search</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#57bf00] animate-pulse" />
            <span className="text-[10px] text-text-muted">IA disponible</span>
          </div>
        </div>
      </div>
    </div>
  );
}

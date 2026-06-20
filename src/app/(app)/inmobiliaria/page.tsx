"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Building2,
  Search,
  Plus,
  Bed,
  Bath,
  Maximize2,
  Heart,
  CheckCircle2,
  X,
  ArrowRight,
  MapPin,
  ShieldCheck,
  Upload,
  Image as ImageIcon
} from "lucide-react";
import { gsap } from "gsap";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MSG } from "@/lib/flags";
import BottomSheet from "@/components/shell/BottomSheet";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";

interface Inmueble {
  id: string;
  titulo: string;
  descripcion: string;
  precio: string;
  tipoNegocio: "VENTA" | "ALQUILER";
  tipoUnidad: string;
  habitaciones: number;
  banos: number;
  area: string | null;
  imagenes: string[];
  caracteristicas: string[];
  estado: string;
  destacado: boolean;
  usuarioId: string;
  createdAt: string;
  updatedAt: string;
}

export default function InmobiliariaPage() {
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<"VENTA" | "ALQUILER" | "TODOS">("TODOS");
  const [filterUnidad, setFilterUnidad] = useState<"TODOS" | "APARTAMENTO" | "PARQUEADERO" | "LOCAL">("TODOS");
  const [isPosting, setIsPosting] = useState(false);
  const [selectedInmueble, setSelectedInmueble] = useState<Inmueble | null>(null);
  const [editingItem, setEditingItem] = useState<Inmueble | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const containerRef = useRef(null);
  const { user } = useAuth();
  const isPropietario = user?.rol === "PROPIETARIO";
  const currentUserId = user?.id;

  // Real-time WebSocket subscription
  useWsSubscription('inmueble', () => {
    const params = new URLSearchParams();
    if (filterType !== "TODOS") params.set("tipo", filterType);
    if (filterUnidad !== "TODOS") params.set("tipoUnidad", filterUnidad);
    const qp = params.toString() ? `?${params.toString()}` : '';
    api.get<Inmueble[]>(`/inmuebles${qp}`)
      .then((data) => setInmuebles(data))
      .catch(() => {});
  });

  useEffect(() => {
    async function loadInmuebles() {
      try {
        let qp = '';
        const params = new URLSearchParams();
        if (filterType !== "TODOS") params.set("tipo", filterType);
        if (filterUnidad !== "TODOS") params.set("tipoUnidad", filterUnidad);
        qp = params.toString() ? `?${params.toString()}` : '';
        
        const data = await api.get<Inmueble[]>(`/inmuebles${qp}`);
        setInmuebles(data);
      } catch (err) {
        console.error("Error loading inmuebles:", err);
        setInmuebles([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadInmuebles();
  }, [filterType, filterUnidad]);

  useEffect(() => {
    if (!isLoading && inmuebles.length > 0) {
      const t = setTimeout(() => {
        gsap.fromTo(".property-card",
          { opacity: 0, y: 30, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.08, ease: "back.out(1.2)" }
        );
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isLoading, inmuebles]);

  const filteredInmuebles = inmuebles.filter(inv => 
    (inv.titulo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (inv.descripcion || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={containerRef} className="min-h-screen pb-32">
      <ProfileHeader className="pt-16 px-6" />

      <div className="pt-8 pb-14 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3 text-text">
              <Building2 size={18} className="text-accent" />
              <span className="text-xs font-semibold tracking-widest uppercase">Inmobiliaria Interna</span>
            </div>
            {isPropietario && (
              <button
                onClick={() => setIsPosting(true)}
                className="px-4 py-2 rounded-xl bg-accent text-primary text-sm font-bold shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <Plus size={16} />
                <span>Publicar Oferta</span>
              </button>
            )}
          </div>
          <h1 className="text-4xl font-bold mb-6 text-text tracking-tight">Encuentra tu proximo hogar aqui mismo.</h1>
          
          <div className="flex flex-col gap-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-text/50">
                <Search size={18} />
              </div>
              <input 
                type="text"
                placeholder="Buscar inmuebles..."
                className="w-full h-12 pl-11 pr-4 rounded-xl bg-surface-2/60 border border-border focus:border-accent/40 outline-none transition-all text-text placeholder:text-text/40 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-2 p-1 rounded-xl bg-surface-2 border border-border w-fit">
              {(["TODOS", "VENTA", "ALQUILER"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                    filterType === type 
                      ? "bg-accent text-primary shadow-lg shadow-accent/20 scale-105" 
                      : "text-text hover:text-text hover:bg-surface-2"
                  }`}
                >
                  {type === "TODOS" ? "Todos" : type === "VENTA" ? "En Venta" : "En Arriendo"}
                </button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              {([
                { key: "TODOS", label: "Todo" },
                { key: "APARTAMENTO", label: "Apartamentos" },
                { key: "PARQUEADERO", label: "Parqueaderos" },
                { key: "LOCAL", label: "Habitaciones" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterUnidad(key)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 border ${
                    filterUnidad === key
                      ? "bg-text text-primary border-border shadow-lg"
                      : "border-border text-text hover:text-text hover:border-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        
      </div>

      <div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-96 rounded-3xl bg-surface-2 animate-pulse border border-border" />
            ))}
          </div>
        ) : filteredInmuebles.length > 0 ? (
          <div className="grid grid-cols-1 gap-5">
            {filteredInmuebles.map((inv) => (
              <PropertyCard key={inv.id} item={inv} onClick={() => setSelectedInmueble(inv)} currentUserId={currentUserId} onEdit={(item) => { setEditingItem(item); setIsPosting(true); }} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-surface-2 rounded-3xl border border-dashed border-border">
             <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4">
               <Search size={32} className="text-text" />
             </div>
             <h3 className="text-lg font-bold text-text mb-2">No se encontraron resultados</h3>
             <p className="text-text max-w-xs mx-auto">Intenta con otros filtros o palabras clave.</p>
          </div>
        )}
      </div>

      {selectedInmueble && (
        <PropertyDetail 
          item={selectedInmueble} 
          onClose={() => setSelectedInmueble(null)}
          currentUserId={currentUserId}
          onEdit={(item) => { setSelectedInmueble(null); setEditingItem(item); setIsPosting(true); }}
        />
      )}

      <BottomSheet isOpen={isPosting} onClose={() => { setIsPosting(false); setEditingItem(null); }} title={editingItem ? "Editar Inmueble" : "Publicar Inmueble"}>
         <PostingForm 
           onSuccess={() => { setIsPosting(false); setEditingItem(null); setFilterType("TODOS"); }} 
           editItem={editingItem}
         />
      </BottomSheet>
    </div>
  );
}

function PropertyCard({ item, onClick, currentUserId, onEdit }: { item: Inmueble, onClick: () => void; currentUserId?: string; onEdit?: (item: Inmueble) => void }) {
  const [isLiked, setIsLiked] = useState(false);
  const imagenes = item.imagenes || [];
  const mainImage = imagenes[0] || "/placeholder.svg";
  const isOwner = currentUserId && item.usuarioId === currentUserId;

  const formattedPrecio = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
    notation: Number(item.precio || 0) >= 1000000 ? "compact" : "standard"
  } as Intl.NumberFormatOptions).format(Number(item.precio || 0));

  const isParking = item.tipoUnidad === "PARQUEADERO";
  const isRoom = item.tipoUnidad === "LOCAL";

  const negocioColor = item.tipoNegocio === "VENTA"
    ? "bg-text/90 text-white"
    : "bg-accent/90 text-primary";

  return (
    <div 
      onClick={onClick}
      className="property-card group cursor-pointer bg-surface-2/40 border border-border rounded-[28px] overflow-hidden hover:border-accent/30 hover:shadow-xl hover:shadow-accent/10 transition-all duration-300 active:scale-[0.98] flex flex-col"
    >
      <div className="relative h-44 overflow-hidden">
        <Image
          src={mainImage}
          alt={item.titulo}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-700"
          unoptimized
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/20" />
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${negocioColor}`}>
            {item.tipoNegocio === "VENTA" ? "En Venta" : "Arriendo"}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setIsLiked(!isLiked); }}
            className={`w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${isLiked ? "bg-text/10 border-border" : "bg-black/30 border-white/20"}`}
          >
            <Heart size={14} className="text-white" fill={isLiked ? "white" : "none"} />
          </button>
        </div>
        <div className="absolute bottom-3 left-3">
          <p className="text-[9px] text-white mb-0.5 uppercase tracking-widest font-bold">{item.tipoNegocio === "VENTA" ? "Precio" : "/ mes"}</p>
          <p className="text-lg font-black text-white drop-shadow-lg">{formattedPrecio}</p>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-text leading-snug line-clamp-2">
          {item.titulo}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {isParking ? (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area || "—"}m²
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                Parqueadero Cubierto
              </span>
            </>
          ) : isRoom ? (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                <Bed size={11} className="text-accent/70" /> Privada
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                <Bath size={11} className="text-accent/70" /> {item.banos === 1 ? "Propio" : "Compartido"}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area || "—"}m²
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                <Bed size={11} className="text-accent/70" />{item.habitaciones} hab.
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                <Bath size={11} className="text-accent/70" />{item.banos} banos
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-text text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area || "—"}m²
              </span>
            </>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full border border-border overflow-hidden bg-accent/10 flex-shrink-0 flex items-center justify-center">
              <span className="text-[9px] font-black text-accent">P</span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-text truncate">{"Propietario"}</p>
              <p className="text-[9px] text-text">Verificado</p>
            </div>
          </div>
          <div className="px-2 py-1 rounded-lg bg-accent/10 border border-accent/20">
            <span className="text-[9px] font-bold text-accent uppercase">{item.tipoNegocio}</span>
          </div>
          {isOwner && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="px-2 py-1 rounded-lg bg-surface-2 border border-border text-text text-[9px] font-bold hover:bg-accent/10 hover:border-accent/30 transition-colors"
            >
              Editar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PropertyDetail({ item, onClose, currentUserId, onEdit }: { item: Inmueble; onClose: () => void; currentUserId?: string; onEdit?: (item: Inmueble) => void }) {
  const [step, setStep] = useState<"DETAILS" | "DOCS" | "SIGNING" | "SUCCESS">("DETAILS");
  const [docProgress, setDocProgress] = useState(0);
  const [signed, setSigned] = useState(false);
  const isOwner = currentUserId && item.usuarioId === currentUserId;
  
  const imagenes = item.imagenes || [];
  const mainImage = imagenes[0] || "/placeholder.svg";

  const formattedPrecio = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(item.precio || 0));

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  const startLeasing = () => {
    setStep("DOCS");
    let p = 0;
    const interval = setInterval(() => {
      p += 1;
      setDocProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => setStep("SIGNING"), 800);
      }
    }, 30);
  };

  const handleSign = () => {
    if (!PAYMENTS_ENABLED) { toast.error(PAYMENTS_DISABLED_MSG); return; }
    setSigned(true);
    gsap.to(".sign-path", { strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut" });
    setTimeout(() => {
      setStep("SUCCESS");
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-0 md:p-10 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-primary/95 dark:bg-[#000000]/95 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full h-full max-w-xl bg-primary dark:bg-[#000000] overflow-hidden md:rounded-[40px] border border-border flex flex-col shadow-2xl">
        <div className="absolute top-6 left-6 z-50">
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-95 transition-all">
            <X size={20} />
          </button>
        </div>
        {isOwner && onEdit && (
          <div className="absolute top-6 right-6 z-50">
            <button 
              onClick={() => onEdit(item)}
              className="px-3 py-2 rounded-full bg-accent text-primary text-xs font-bold shadow-lg active:scale-95 transition-all"
            >
              Editar
            </button>
          </div>
        )}

        {step === "DETAILS" && (
          <>
            <div className="flex-1 overflow-y-auto hide-scrollbar">
              <div className="relative h-[45vh] w-full">
                <Image src={mainImage} alt={item.titulo} fill className="object-cover" unoptimized />
                <div className="absolute inset-0 bg-linear-to-t from-primary via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6">
                   <span className="px-3 py-1 rounded-full bg-accent text-primary text-[10px] font-black uppercase tracking-tight mb-2 inline-block">
                     {item.tipoNegocio}
                   </span>
                   <h1 className="text-3xl font-bold text-text tracking-tight drop-shadow-md">{item.titulo}</h1>
                </div>
              </div>

              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-border">
                   <div>
                     <p className="text-text text-xs font-bold uppercase tracking-widest mb-1">Precio solicitado</p>
                     <p className="text-3xl font-black text-accent">{formattedPrecio} <span className="text-sm font-medium text-text">{item.tipoNegocio === "ALQUILER" ? "/ mes" : ""}</span></p>
                   </div>
                   <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1.5 text-accent/80 text-xs font-bold">
                         <ShieldCheck size={14} />
                         <span>Publicacion Verificada</span>
                      </div>
                      <p className="text-text text-[10px]">Puesto de control verificada</p>
                   </div>
                </div>

                 <div className="grid grid-cols-3 gap-4">
                   <div className="p-4 rounded-3xl bg-surface-2 border border-border flex flex-col items-center text-center gap-2">
                      <Bed size={22} className="text-accent" />
                      <div>
                        <p className="text-lg font-bold text-text leading-none">{item.habitaciones}</p>
                        <p className="text-[10px] text-text font-bold uppercase">Hab.</p>
                      </div>
                   </div>
                   <div className="p-4 rounded-3xl bg-surface-2 border border-border flex flex-col items-center text-center gap-2">
                      <Bath size={22} className="text-accent" />
                      <div>
                        <p className="text-lg font-bold text-text leading-none">{item.banos}</p>
                        <p className="text-[10px] text-text font-bold uppercase">Banos</p>
                      </div>
                   </div>
                   <div className="p-4 rounded-3xl bg-surface-2 border border-border flex flex-col items-center text-center gap-2">
                      <Maximize2 size={22} className="text-accent" />
                      <div>
                        <p className="text-lg font-bold text-text leading-none">{item.area || "—"}</p>
                        <p className="text-[10px] text-text font-black uppercase">m2</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-2">
                      <MapPin size={18} className="text-accent" />
                      <span className="text-sm font-bold text-text">Conjunto Residencial Interno</span>
                   </div>
                   <div className="p-5 rounded-3xl bg-surface-2 border border-dashed border-border">
                      <h4 className="text-xs font-bold text-text uppercase mb-3">Descripcion</h4>
                      <p className="text-text text-sm leading-relaxed">{item.descripcion}</p>
                   </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-primary border-t border-border">
               <button 
                onClick={startLeasing}
                className="w-full h-16 rounded-2xl bg-accent text-primary font-black shadow-xl shadow-accent/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg"
               >
                 <span>Iniciar Proceso de {item.tipoNegocio === "ALQUILER" ? "Arriendo" : "Compra"}</span>
                 <ArrowRight size={20} />
               </button>
            </div>
          </>
        )}

        {step === "DOCS" && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-8 animate-in zoom-in duration-500">
             <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle className="text-border stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50"/>
                  <circle 
                    className="text-accent stroke-current transition-all duration-300" 
                    strokeWidth="8" 
                    strokeDasharray={ 251 }
                    strokeDashoffset={ 251 - (251 * docProgress) / 100 }
                    strokeLinecap="round" 
                    fill="transparent" 
                    r="40" cx="50" cy="50"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-black text-text">{docProgress}%</span>
                </div>
             </div>
             <div className="space-y-3">
                <h2 className="text-2xl font-bold text-text">Verificando Antecedentes...</h2>
                <p className="text-text leading-relaxed max-w-xs mx-auto">
                    Validando vinculacion con la copropiedad y capacidad financiera en tiempo real.
                </p>
             </div>
             <div className="w-full space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-text uppercase px-2">
                  <span>Documento de Identidad</span>
                  <CheckCircle2 size={12} className={docProgress > 30 ? "text-text" : "text-border"} />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-text uppercase px-2">
                  <span>Certificacion Laboral</span>
                  <CheckCircle2 size={12} className={docProgress > 70 ? "text-text" : "text-border"} />
                </div>
             </div>
          </div>
        )}

        {step === "SIGNING" && (
           <div className="flex-1 flex flex-col p-8 space-y-8 animate-in fade-in duration-500">
              <div className="mt-12 text-center">
                 <h2 className="text-2xl font-bold text-text mb-2">Firma del Contrato Digital</h2>
                 <p className="text-text text-sm">Cierra el acuerdo formal aceptando los terminos.</p>
              </div>

              <div className="flex-1 bg-surface-2 border-2 border-dashed border-border rounded-[40px] relative overflow-hidden flex items-center justify-center group">
                 <svg className="w-64 h-32 text-accent" viewBox="0 0 200 100">
                    <path 
                      className="sign-path"
                      d="M20,60 C40,20 80,80 120,40 C160,0 180,80 180,60" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round"
                      strokeDasharray="400"
                      strokeDashoffset="400"
                    />
                 </svg>
                 {!signed && (
                    <button 
                      onClick={handleSign}
                      className="absolute inset-0 bg-accent/5 hover:bg-accent/10 transition-colors flex items-center justify-center group"
                    >
                       <div className="bg-text text-primary px-6 py-3 rounded-full font-bold shadow-xl animate-bounce">
                           Haz clic para firmar
                       </div>
                    </button>
                 )}
              </div>

              <div className="p-4 rounded-2xl bg-surface-2 text-center">
                 <p className="text-[10px] text-text uppercase font-medium leading-relaxed">
                   Al firmar, aceptas el reglamento de propiedad horizontal y las clausulas de pago establecidas para el inmueble.
                 </p>
              </div>
           </div>
        )}

        {step === "SUCCESS" && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-10 animate-in zoom-in duration-500">
             <div className="w-32 h-32 rounded-full bg-text/10 flex items-center justify-center shadow-2xl shadow-black/40 relative">
                <CheckCircle2 size={64} className="text-white" />
                <div className="absolute -inset-4 border border-text/50 rounded-full animate-ping" />
             </div>
             <div className="space-y-4">
                <h2 className="text-3xl font-black text-text">Bienvenido a tu nueva unidad!</h2>
                <p className="text-lg text-text leading-relaxed">
                  El proceso de {item.tipoNegocio === "ALQUILER" ? "arriendo" : "compra"} se ha completado. 
                  Ahora puedes gestionar tu nueva unidad desde el panel principal.
                </p>
             </div>
             <div className="w-full p-6 rounded-3xl bg-surface-2 border border-border space-y-3">
                <div className="flex justify-between text-sm">
                   <span className="text-text">Unidad:</span>
                   <span className="text-text font-bold">{item.titulo}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span className="text-text">Contrato No:</span>
                   <span className="text-accent font-mono font-bold">#CON-{ Math.floor(Math.random() * 90000) + 10000 }</span>
                </div>
             </div>
             <button 
              onClick={onClose}
              className="w-full h-16 rounded-2xl bg-surface-2 text-text font-bold border border-border hover:bg-surface-2/80 transition-all active:scale-95"
             >
                Cerrar y Empezar
             </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PostingForm({ onSuccess, editItem }: { onSuccess: () => void; editItem?: Inmueble | null }) {
  const isEditing = !!editItem;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>(editItem?.imagenes || []);
  const [existingUrls] = useState<string[]>(editItem?.imagenes || []);
  const [formData, setFormData] = useState({
    titulo: editItem?.titulo || "",
    descripcion: editItem?.descripcion || "",
    precio: editItem?.precio || "",
    moneda: (editItem as any)?.moneda || "COP",
    tipoNegocio: editItem?.tipoNegocio || "ALQUILER",
    tipoUnidad: editItem?.tipoUnidad || "APARTAMENTO",
    habitaciones: editItem?.habitaciones || 2,
    banos: editItem?.banos || 1,
    area: editItem?.area || "",
    imagenes: editItem?.imagenes || [] as string[]
  });

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Error leyendo archivo"));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setFiles(prev => [...prev, ...selected]);
    const newPreviews = selected.map(f => URL.createObjectURL(f));
    setPreviews(prev => [...prev, ...newPreviews]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    URL.revokeObjectURL(previews[index]);
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Upload files first
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file);
        const isImage = file.type.startsWith("image/");
        if (isImage) {
          const res = await api.post<{ url: string }>("/uploads/imagen", {
            data: dataUrl,
            carpeta: "inmobiliaria",
          });
          uploadedUrls.push(res.url);
        } else {
          const res = await api.post<{ url: string; content_type: string }>("/uploads/archivo", {
            data: dataUrl,
            nombre: file.name,
          });
          uploadedUrls.push(res.url);
        }
      }
      
      const allUrls = [...existingUrls, ...uploadedUrls];
      if (isEditing && editItem) {
        await api.put(`/inmuebles/${editItem.id}`, { ...formData, imagenes: allUrls });
      } else {
        await api.post('/inmuebles', { ...formData, imagenes: allUrls });
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Error al publicar el inmueble");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-10">
       <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(["ALQUILER", "VENTA"] as const).map(type => (
               <button
                 key={type}
                 type="button"
                 onClick={() => setFormData({...formData, tipoNegocio: type})}
                 className={`py-3 rounded-2xl border text-sm font-bold transition-all ${
                   formData.tipoNegocio === type 
                   ? "bg-accent border-accent text-primary" 
                   : "border-border bg-surface-2 text-text"
                 }`}
               >
                 {type === "ALQUILER" ? "Arrendar" : "Vender"}
               </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text uppercase pl-1">Tipo de Unidad</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "APARTAMENTO", label: "Apartamento" },
                { key: "PARQUEADERO", label: "Parqueadero" },
                { key: "LOCAL", label: "Habitación" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormData({...formData, tipoUnidad: key})}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                    formData.tipoUnidad === key
                      ? "bg-accent border-accent text-primary"
                      : "border-border bg-surface-2 text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text uppercase pl-1">Titulo del Anuncio</label>
            <input 
              required
              className="w-full h-14 rounded-2xl bg-surface-2 border border-border px-4 focus:border-accent text-text outline-none transition-all placeholder:text-text"
              placeholder="Ej: Apartamento remodelado Torre 2"
              value={formData.titulo}
              onChange={e => setFormData({...formData, titulo: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-text uppercase pl-1">Precio</label>
              <div className="flex gap-1">
                <input 
                  required
                  type="text"
                  inputMode="decimal"
                  className="flex-1 h-14 rounded-2xl bg-surface-2 border border-border px-4 focus:border-accent text-text outline-none"
                  placeholder="0.00"
                  value={formData.precio}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.,']/g, '');
                    setFormData({...formData, precio: v});
                  }}
                />
                <div className="flex rounded-2xl bg-surface-2 border border-border overflow-hidden shrink-0">
                  {(["COP", "USD"] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({...formData, moneda: c})}
                      className={`h-14 px-3 text-xs font-bold transition-all ${
                        formData.moneda === c
                          ? "bg-accent text-primary"
                          : "text-text/60 hover:text-text"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-text uppercase pl-1">Area (m²)</label>
              <input 
                type="text"
                inputMode="decimal"
                className="w-full h-14 rounded-2xl bg-surface-2 border border-border px-4 focus:border-accent text-text outline-none"
                placeholder="0.00"
                value={formData.area}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9.,]/g, '');
                  setFormData({...formData, area: v});
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
               <label className="text-[10px] font-bold text-text uppercase pl-1">Alcobas</label>
               <div className="flex items-center bg-surface-2 rounded-2xl border border-border overflow-hidden">
                  <button type="button" onClick={() => setFormData({...formData, habitaciones: Math.max(0, formData.habitaciones-1)})} className="flex-1 h-14 hover:bg-surface-2/80 text-text font-bold">−</button>
                  <span className="flex-1 text-center font-bold text-accent">{formData.habitaciones}</span>
                  <button type="button" onClick={() => setFormData({...formData, habitaciones: formData.habitaciones+1})} className="flex-1 h-14 hover:bg-surface-2/80 text-text font-bold">+</button>
               </div>
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-bold text-text uppercase pl-1">Banos</label>
               <div className="flex items-center bg-surface-2 rounded-2xl border border-border overflow-hidden">
                  <button type="button" onClick={() => setFormData({...formData, banos: Math.max(0, formData.banos-1)})} className="flex-1 h-14 hover:bg-surface-2/80 text-text font-bold">−</button>
                  <span className="flex-1 text-center font-bold text-accent">{formData.banos}</span>
                  <button type="button" onClick={() => setFormData({...formData, banos: formData.banos+1})} className="flex-1 h-14 hover:bg-surface-2/80 text-text font-bold">+</button>
               </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text uppercase pl-1">Descripcion</label>
            <textarea 
              required
              rows={3}
              className="w-full rounded-2xl bg-surface-2 border border-border p-4 focus:border-accent text-text outline-none transition-all placeholder:text-text"
              placeholder="Detalles del inmueble: acabados, ubicacion, servicios cercanos..."
              value={formData.descripcion}
              onChange={e => setFormData({...formData, descripcion: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-text uppercase pl-1">Fotos / Videos</label>
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => {
                const isVideo = files[i]?.type.startsWith("video/");
                return (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                    {isVideo ? (
                      <video src={url} className="w-full h-full object-cover" />
                    ) : (
                      <Image src={url} alt={`Preview ${i}`} fill className="object-cover" unoptimized />
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                );
              })}
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-accent/50 transition-colors bg-surface-2/40">
                <Upload size={18} className="text-text/50" />
                <span className="text-[8px] text-text/50 font-semibold">Subir</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[9px] text-text/40 pl-1">Fotos o videos del inmueble. Max 16 MB por archivo.</p>
          </div>
       </div>

       <button 
        type="submit"
        disabled={isSubmitting}
        className="w-full h-16 rounded-2xl bg-accent text-primary font-bold shadow-xl shadow-accent/20 flex items-center justify-center gap-3 active:scale-95 transition-transform"
       >
         {isSubmitting ? (
           <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
         ) : (
           <>
             <CheckCircle2 size={20} />
             <span>{isEditing ? "Guardar Cambios" : "Publicar Anuncio Ahora"}</span>
           </>
         )}
       </button>
    </form>
  );
}



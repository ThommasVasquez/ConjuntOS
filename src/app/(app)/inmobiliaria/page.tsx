"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { 
  Building2, 
  Search, 
  Filter, 
  Plus, 
  Bed, 
  Bath, 
  Maximize2, 
  Heart,
  CheckCircle2,
  Phone,
  MessageSquare,
  X, 
  ArrowRight, 
  Plane as Share, 
  MapPin, 
  ShieldCheck, 
  Zap
} from "lucide-react";
import { gsap } from "gsap";
import BottomSheet from "@/components/shell/BottomSheet";
import ProfileHeader from "@/components/shell/ProfileHeader";

interface Inmueble {
  id: string;
  titulo: string;
  descripcion: string;
  precio: number;
  tipoNegocio: "VENTA" | "ALQUILER";
  tipoUnidad: string;
  habitaciones: number;
  banos: number;
  area: number;
  imagenes: string; // JSON string
  usuario_nombre: string;
  usuario_avatar?: string;
  usuario_telefono?: string;
  creadoEn: string;
}

export default function InmobiliariaPage() {
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<"VENTA" | "ALQUILER" | "TODOS">("TODOS");
  const [filterUnidad, setFilterUnidad] = useState<"TODOS" | "APARTAMENTO" | "PARQUEADERO" | "LOCAL">("TODOS");
  const [isPosting, setIsPosting] = useState(false);
  const [selectedInmueble, setSelectedInmueble] = useState<Inmueble | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const containerRef = useRef(null);

  useEffect(() => {
    async function loadInmuebles() {
      try {
        const url = new URL("/api/user/inmuebles", window.location.origin);
        if (filterType !== "TODOS") url.searchParams.set("tipo", filterType);
        if (filterUnidad !== "TODOS") url.searchParams.set("tipoUnidad", filterUnidad);
        
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          setInmuebles(data.data);
        } else {
          setInmuebles(DUMMY_DATA.filter(i => 
            (filterType === "TODOS" || i.tipoNegocio === filterType) &&
            (filterUnidad === "TODOS" || i.tipoUnidad === filterUnidad)
          ));
        }
      } catch (err) {
        console.error("Error loading inmuebles:", err);
        setInmuebles(DUMMY_DATA.filter(i => 
          (filterType === "TODOS" || i.tipoNegocio === filterType) &&
          (filterUnidad === "TODOS" || i.tipoUnidad === filterUnidad)
        ));
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

      <div className="pt-8 pb-10 px-6 relative overflow-hidden bg-linear-to-b from-accent/10 to-transparent">
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-2 opacity-70">
            <Building2 size={18} className="text-accent" />
            <span className="text-xs font-semibold tracking-widest uppercase">Inmobiliaria Interna</span>
          </div>
          <h1 className="text-4xl font-bold mb-6 gradient-text tracking-tight">Encuentra tu proximo hogar aqui mismo.</h1>
          
          <div className="flex flex-col gap-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/50 group-focus-within:text-accent transition-colors">
                <Search size={20} />
              </div>
              <input 
                type="text"
                placeholder="Que buscas? (ej. Apartamento 3 alcobas)"
                className="w-full h-14 pl-12 pr-6 rounded-xl bg-white/5 border border-white/10 focus:border-accent/50 outline-none transition-all focus:bg-white/10 text-white placeholder:text-white/30 text-lg"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="absolute inset-y-0 right-2 flex items-center">
                 <button className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2 text-sm font-medium">
                    <Filter size={16} />
                    <span>Filtros</span>
                 </button>
              </div>
            </div>

            <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/5 w-fit">
              {(["TODOS", "VENTA", "ALQUILER"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                    filterType === type 
                      ? "bg-accent text-primary shadow-lg shadow-accent/20 scale-105" 
                      : "text-white/60 hover:text-white hover:bg-white/5"
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
                      ? "bg-white text-primary border-white shadow-lg"
                      : "border-white/10 text-white/50 hover:text-white hover:border-white/30"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 -left-20 w-60 h-60 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      </div>

      <div className="px-6 max-w-6xl mx-auto">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-96 rounded-3xl bg-white/5 animate-pulse border border-white/10" />
            ))}
          </div>
        ) : filteredInmuebles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filteredInmuebles.map((inv) => (
              <PropertyCard key={inv.id} item={inv} onClick={() => setSelectedInmueble(inv)} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
             <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
               <Search size={32} className="text-white/20" />
             </div>
             <h3 className="text-lg font-bold text-white mb-2">No se encontraron resultados</h3>
             <p className="text-white/40 max-w-xs mx-auto">Intenta con otros filtros o palabras clave.</p>
          </div>
        )}
      </div>

      <button 
        onClick={() => setIsPosting(true)}
        className="fixed bottom-8 right-8 w-16 h-16 rounded-full bg-accent text-primary shadow-2xl shadow-accent/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
      >
        <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>

      {selectedInmueble && (
        <PropertyDetailSimulation 
          item={selectedInmueble} 
          onClose={() => setSelectedInmueble(null)} 
        />
      )}

      <BottomSheet isOpen={isPosting} onClose={() => setIsPosting(false)} title="Publicar Inmueble">
         <PostingForm onSuccess={() => { setIsPosting(false); setFilterType("TODOS"); }} />
      </BottomSheet>
    </div>
  );
}

function PropertyCard({ item, onClick }: { item: Inmueble, onClick: () => void }) {
  const [isLiked, setIsLiked] = useState(false);
  const imagenes = JSON.parse(item.imagenes || "[]");
  const mainImage = imagenes[0] || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800";

  const formattedPrecio = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
    notation: item.precio >= 1000000 ? "compact" : "standard"
  } as Intl.NumberFormatOptions).format(item.precio);

  const isParking = item.tipoUnidad === "PARQUEADERO";
  const isRoom = item.tipoUnidad === "LOCAL";

  const negocioColor = item.tipoNegocio === "VENTA"
    ? "bg-emerald-500/90 text-white"
    : "bg-accent/90 text-primary";

  return (
    <div 
      onClick={onClick}
      className="property-card group cursor-pointer bg-linear-to-b from-white/10 to-white/5 border border-white/8 rounded-[28px] overflow-hidden hover:border-accent/30 hover:shadow-xl hover:shadow-accent/10 transition-all duration-300 active:scale-[0.98] flex flex-col"
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
            className={`w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${isLiked ? "bg-red-500 border-red-500" : "bg-black/30 border-white/20"}`}
          >
            <Heart size={14} className="text-white" fill={isLiked ? "white" : "none"} />
          </button>
        </div>
        <div className="absolute bottom-3 left-3">
          <p className="text-[9px] text-white/60 mb-0.5 uppercase tracking-widest font-bold">{item.tipoNegocio === "VENTA" ? "Precio" : "/ mes"}</p>
          <p className="text-lg font-black text-white drop-shadow-lg">{formattedPrecio}</p>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">
          {item.titulo}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {isParking ? (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area}m2
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                Parqueadero Cubierto
              </span>
            </>
          ) : isRoom ? (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bed size={11} className="text-accent/70" /> Privada
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bath size={11} className="text-accent/70" /> {item.banos === 1 ? "Propio" : "Compartido"}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area}m2
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bed size={11} className="text-accent/70" />{item.habitaciones} hab.
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bath size={11} className="text-accent/70" />{item.banos} banos
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area}m2
              </span>
            </>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full border border-white/10 overflow-hidden bg-white/5 flex-shrink-0">
              <Image
                src={item.usuario_avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100"}
                alt={item.usuario_nombre}
                width={28}
                height={28}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-white truncate">{item.usuario_nombre}</p>
              <p className="text-[9px] text-white/30">Verificado</p>
            </div>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => { window.open("tel:" + item.usuario_telefono, "_blank"); }}
              className="w-8 h-8 rounded-xl bg-accent text-primary flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            >
              <Phone size={14} />
            </button>
            <button
              onClick={() => { window.open("https://wa.me/57" + item.usuario_telefono, "_blank"); }}
              className="w-8 h-8 rounded-xl bg-[#25D366] text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            >
              <MessageSquare size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyDetailSimulation({ item, onClose }: { item: Inmueble, onClose: () => void }) {
  const [step, setStep] = useState<"DETAILS" | "DOCS" | "SIGNING" | "SUCCESS">("DETAILS");
  const [docProgress, setDocProgress] = useState(0);
  const [signed, setSigned] = useState(false);
  
  const imagenes = JSON.parse(item.imagenes || "[]");
  const mainImage = imagenes[0] || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800";

  const formattedPrecio = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(item.precio);

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
    setSigned(true);
    gsap.to(".sign-path", { strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut" });
    setTimeout(() => {
      setStep("SUCCESS");
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-0 md:p-10 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[#05020e]/95 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full h-full max-w-xl bg-[#05020e] overflow-hidden md:rounded-[40px] border border-white/10 flex flex-col shadow-2xl">
        <div className="absolute top-6 left-6 z-50">
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-95 transition-all">
            <X size={20} />
          </button>
        </div>

        {step === "DETAILS" && (
          <>
            <div className="flex-1 overflow-y-auto hide-scrollbar">
              <div className="relative h-[45vh] w-full">
                <Image src={mainImage} alt={item.titulo} fill className="object-cover" unoptimized />
                <div className="absolute inset-0 bg-linear-to-t from-[#05020e] via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6">
                   <span className="px-3 py-1 rounded-full bg-accent text-primary text-[10px] font-black uppercase tracking-tight mb-2 inline-block">
                     {item.tipoNegocio}
                   </span>
                   <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-md">{item.titulo}</h1>
                </div>
              </div>

              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                   <div>
                     <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Precio solicitado</p>
                     <p className="text-3xl font-black text-accent">{formattedPrecio} <span className="text-sm font-medium text-white/30">{item.tipoNegocio === "ALQUILER" ? "/ mes" : ""}</span></p>
                   </div>
                   <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1.5 text-accent/80 text-xs font-bold">
                         <ShieldCheck size={14} />
                         <span>Publicacion Verificada</span>
                      </div>
                      <p className="text-white/30 text-[10px]">Puesto de控制 verificada</p>
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                   <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center text-center gap-2">
                      <Bed size={22} className="text-accent" />
                      <div>
                        <p className="text-lg font-bold text-white leading-none">{item.habitaciones}</p>
                        <p className="text-[10px] text-white/40 font-bold uppercase">Hab.</p>
                      </div>
                   </div>
                   <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center text-center gap-2">
                      <Bath size={22} className="text-accent" />
                      <div>
                        <p className="text-lg font-bold text-white leading-none">{item.banos}</p>
                        <p className="text-[10px] text-white/40 font-bold uppercase">Banos</p>
                      </div>
                   </div>
                   <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center text-center gap-2">
                      <Maximize2 size={22} className="text-accent" />
                      <div>
                        <p className="text-lg font-bold text-white leading-none">{item.area}</p>
                        <p className="text-[10px] text-white/40 font-black uppercase">m2</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-2">
                      <MapPin size={18} className="text-accent" />
                      <span className="text-sm font-bold text-white/80">Conjunto Residencial Interno</span>
                   </div>
                   <div className="p-5 rounded-3xl bg-white/3 border border-dashed border-white/10">
                      <h4 className="text-xs font-bold text-white/40 uppercase mb-3">Descripcion</h4>
                      <p className="text-white/70 text-sm leading-relaxed">{item.descripcion}</p>
                   </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-[#05020e] border-t border-white/5">
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
                  <circle className="text-white/10 stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50"/>
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
                  <span className="text-xl font-black text-white">{docProgress}%</span>
                </div>
             </div>
             <div className="space-y-3">
                <h2 className="text-2xl font-bold text-white">Verificando Antecedentes...</h2>
                <p className="text-white/50 leading-relaxed max-w-xs mx-auto">
                    Validando vinculacion con la copropiedad y capacidad financiera en tiempo real.
                </p>
             </div>
             <div className="w-full space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-white/40 tuppercase px-2">
                  <span>Documento de Identidad</span>
                  <CheckCircle2 size={12} className={docProgress > 30 ? "text-emerald-500" : "text-white/10"} />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-white/40 tuppercase px-2">
                  <span>Certificacion Laboral</span>
                  <CheckCircle2 size={12} className={docProgress > 70 ? "text-emerald-500" : "text-white/10"} />
                </div>
             </div>
          </div>
        )}

        {step === "SIGNING" && (
           <div className="flex-1 flex flex-col p-8 space-y-8 animate-in fade-in duration-500">
              <div className="mt-12 text-center">
                 <h2 className="text-2xl font-bold text-white mb-2">Firma del Contrato Digital</h2>
                 <p className="text-white/50 text-sm">Cierra el acuerdo formal aceptando los terminos.</p>
              </div>

              <div className="flex-1 bg-white/[0.02] border-2 border-dashed border-white/10 rounded-[40px] relative overflow-hidden flex items-center justify-center group">
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
                       <div className="bg-white text-primary px-6 py-3 rounded-full font-bold shadow-xl animate-bounce">
                           Haz clic para firmar
                       </div>
                    </button>
                 )}
              </div>

              <div className="p-4 rounded-2xl bg-white/5 text-center">
                 <p className="text-[10px] text-white/30 uppercase font-medium leading-relaxed">
                   Al firmar, aceptas el reglamento de propiedad horizontal y las clausulas de pago establecidas para el inmueble.
                 </p>
              </div>
           </div>
        )}

        {step === "SUCCESS" && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-10 animate-in zoom-in duration-500">
             <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/40 relative">
                <CheckCircle2 size={64} className="text-white" />
                <div className="absolute -inset-4 border border-emerald-500/50 rounded-full animate-ping" />
             </div>
             <div className="space-y-4">
                <h2 className="text-3xl font-black text-white">Bienvenido a tu nueva unidad!</h2>
                <p className="text-lg text-white/60 leading-relaxed">
                  El proceso de {item.tipoNegocio === "ALQUILER" ? "arriendo" : "compra"} se ha completado. 
                  Ahora puedes gestionar tu nueva unidad desde el panel principal.
                </p>
             </div>
             <div className="w-full p-6 rounded-3xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex justify-between text-sm">
                   <span className="text-white/40">Unidad:</span>
                   <span className="text-white font-bold">{item.titulo}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span className="text-white/40">Contrato No:</span>
                   <span className="text-accent font-mono font-bold">#CON-{ Math.floor(Math.random() * 90000) + 10000 }</span>
                </div>
             </div>
             <button 
              onClick={onClose}
              className="w-full h-16 rounded-2xl bg-white/10 text-white font-bold border border-white/10 hover:bg-white/20 transition-all active:scale-95"
             >
                Cerrar y Empezar
             </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PostingForm({ onSuccess }: { onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    descripcion: "",
    precio: "",
    tipoNegocio: "ALQUILER",
    tipoUnidad: "APARTAMENTO",
    habitaciones: 2,
    banos: 1,
    area: "",
    imagenes: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&q=80&w=1000",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&q=80&w=1000"
    ]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/user/inmuebles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      }
    } catch (err) {
      console.error(err);
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
                   : "border-white/10 bg-white/5 text-white/60"
                 }`}
               >
                 {type === "ALQUILER" ? "Arrendar" : "Vender"}
               </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Titulo del Anuncio</label>
            <input 
              required
              className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 px-4 focus:border-accent outline-none transition-all"
              placeholder="Ej: Apartamento remodelado Torre 2"
              value={formData.titulo}
              onChange={e => setFormData({...formData, titulo: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Precio</label>
              <input 
                required
                type="number"
                className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 px-4 focus:border-accent outline-none"
                placeholder="0.00"
                value={formData.precio}
                onChange={e => setFormData({...formData, precio: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Area (m2)</label>
              <input 
                type="number"
                className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 px-4 focus:border-accent outline-none"
                placeholder="0"
                value={formData.area}
                onChange={e => setFormData({...formData, area: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
               <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Alcobas</label>
               <div className="flex items-center bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                  <button type="button" onClick={() => setFormData({...formData, habitaciones: Math.max(0, formData.habitaciones-1)})} className="flex-1 h-14 hover:bg-white/5">-</button>
                  <span className="flex-1 text-center font-bold text-accent">{formData.habitaciones}</span>
                  <button type="button" onClick={() => setFormData({...formData, habitaciones: formData.habitaciones+1})} className="flex-1 h-14 hover:bg-white/5">+</button>
               </div>
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Banos</label>
               <div className="flex items-center bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                  <button type="button" onClick={() => setFormData({...formData, banos: Math.max(0, formData.banos-1)})} className="flex-1 h-14 hover:bg-white/5">-</button>
                  <span className="flex-1 text-center font-bold text-accent">{formData.banos}</span>
                  <button type="button" onClick={() => setFormData({...formData, banos: formData.banos+1})} className="flex-1 h-14 hover:bg-white/5">+</button>
               </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Descripcion</label>
            <textarea 
              required
              rows={3}
              className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 focus:border-accent outline-none transition-all"
              placeholder="Cuentanos mas sobre el inmueble..."
              value={formData.descripcion}
              onChange={e => setFormData({...formData, descripcion: e.target.value})}
            />
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
             <span>Publicar Anuncio Ahora</span>
           </>
         )}
       </button>
    </form>
  );
}

const DUMMY_DATA:Inmueble[] = [
  {
    id: "1",
    titulo: "Bello Apartamento con Vista Panoramica",
    descripcion: "Apartamento moderno con excelente iluminacion, 3 alcobas y balcon.",
    precio: 450000000,
    tipoNegocio: "VENTA",
    tipoUnidad: "APARTAMENTO",
    habitaciones: 3,
    banos: 2,
    area: 85,
    imagenes: "[\"https://images.unsplash.com/photo-1524811967960-57ff6cd12356?auto=format&fit=crop&q=80&w=1000\"]",
    usuario_nombre: "Diego Carrascoal",
    usuario_avatar: "https://images.unsplash.com/photo-1500643752441-3ad77b06ca4f?auto=format&fit=crop&q=80&w=100",
    usuario_telefono: "3109876543",
    creadoEn: "now"
   },
  {
    id: "2",
    titulo: "Apartamento Familiar Enlo",
    descripcion: "Spacioso apartamento ideal para familia, cerca a zonas verdes.",
    precio: 370000000,
    tipoNegocio: "VENTA",
    tipoUnidad: "APARTAMENTO",
    habitaciones: 3,
    banos: 2,
    area: 75,
    imagenes: "[\"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&q=80&w=1000\"]",
    usuario_nombre: "Debora Osorio",
    usuario_avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100",
    usuario_telefono: "3123456789",
    creadoEn: "now"
  },
  {
    id: "3",
    titulo: "Alquiler de PARQUEADERO exclusivo",
    descripcion: "Parqueadero cubierto, vigilancia 24h, facil acceso",
    precio: 150000,
    tipoNegocio: "ALQUILER",
    tipoUnidad: "PARQUEADERO",
    habitaciones: 0,
    banos: 0,
    area: 12,
    imagenes: "[\"https://images.unsplash.com/photo-1570797231467-2e6f10219531?auto=format&fit=crop&q=80&w=1000\"]",
    usuario_nombre: "Colmana porcel",
    usuario_avatar: "https://images.unsplash.com/photo-1500643752441-3ad77b06ca4f?auto=format&fit=crop&q=80&w=100",
    usuario_telefono: "3001234567",
    creadoEn: "now"
  }
];

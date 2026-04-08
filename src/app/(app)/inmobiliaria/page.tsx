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
  MessageSquare
} from "lucide-react";
import { gsap } from "gsap";
import BottomSheet from "@/components/shell/BottomSheet";

interface Inmueble {
  id: string;
  titulo: string;
  descripcion: string;
  precio: number;
  tipoNegocio: 'VENTA' | 'ALQUILER';
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

import ProfileHeader from "@/components/shell/ProfileHeader";

export default function InmobiliariaPage() {
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<'VENTA' | 'ALQUILER' | 'TODOS'>('TODOS');
  const [filterUnidad, setFilterUnidad] = useState<'TODOS' | 'APARTAMENTO' | 'PARQUEADERO' | 'LOCAL'>('TODOS');
  const [isPosting, setIsPosting] = useState(false);
  const [selectedInmueble, setSelectedInmueble] = useState<Inmueble | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const containerRef = useRef(null);

  useEffect(() => {
    async function loadInmuebles() {
      try {
        const url = new URL("/api/user/inmuebles", window.location.origin);
        if (filterType !== 'TODOS') url.searchParams.set("tipo", filterType);
        if (filterUnidad !== 'TODOS') url.searchParams.set("tipoUnidad", filterUnidad);
        
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
          setInmuebles(data.data);
        }
      } catch (err) {
        console.error("❌ Error loading inmuebles:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadInmuebles();
  }, [filterType, filterUnidad]);

  useEffect(() => {
    if (!isLoading && inmuebles.length > 0) {
      // Small delay to ensure cards are rendered in the DOM
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
    inv.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.descripcion.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={containerRef} className="min-h-screen pb-32">
      <ProfileHeader className="pt-16 px-6" />

      {/* Header Premium (Adjusted padding) */}
      <div className="pt-8 pb-10 px-6 relative overflow-hidden bg-linear-to-b from-accent/10 to-transparent">
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-2 opacity-70">
            <Building2 size={18} className="text-accent" />
            <span className="text-xs font-semibold tracking-widest uppercase">Inmobiliaria Interna</span>
          </div>
          <h1 className="text-4xl font-bold mb-6 gradient-text tracking-tight">Encuentra tu próximo hogar aquí mismo.</h1>
          
          <div className="flex flex-col gap-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/50 group-focus-within:text-accent transition-colors">
                <Search size={20} />
              </div>
              <input 
                type="text"
                placeholder="¿Qué buscas? (ej. Apartamento 3 alcobas)"
                className="w-full h-14 pl-12 pr-6 rounded-2xl bg-white/5 border border-white/10 focus:border-accent/50 outline-none transition-all focus:bg-white/10 text-white placeholder:text-white/30 text-lg"
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
              {(['TODOS', 'VENTA', 'ALQUILER'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                    filterType === type 
                      ? 'bg-accent text-primary shadow-lg shadow-accent/20 scale-105' 
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {type === 'TODOS' ? 'Todos' : type === 'VENTA' ? 'En Venta' : 'En Arriendo'}
                </button>
              ))}
            </div>

            {/* Unit type filter pills */}
            <div className="flex gap-2 flex-wrap">
              {([
                { key: 'TODOS', label: '🏘️ Todo' },
                { key: 'APARTAMENTO', label: '🏠 Apartamentos' },
                { key: 'PARQUEADERO', label: '🅿️ Parqueaderos' },
                { key: 'LOCAL', label: '🛏️ Habitaciones' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterUnidad(key)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 border ${
                    filterUnidad === key
                      ? 'bg-white text-primary border-white shadow-lg'
                      : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Abstract background blur */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 -left-20 w-60 h-60 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      </div>

      {/* Grid de Inmuebles */}
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
                <Search size={32} className="text-white/30" />
             </div>
             <h3 className="text-xl font-semibold mb-2">No se encontraron resultados</h3>
             <p className="text-white/50 max-w-xs mx-auto">Prueba ajustando tus filtros o busca algo diferente.</p>
          </div>
        )}
      </div>

      {/* Floating Action Button - Adjusted to stay within content area on desktop */}
      <button 
        onClick={() => setIsPosting(true)}
        className="fixed bottom-32 right-6 md:right-[calc(50%-180px)] w-16 h-16 rounded-full bg-accent text-primary shadow-2xl shadow-accent/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
      >
        <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>

      {/* Detail Simulation Modal */}
      {selectedInmueble && (
        <PropertyDetailSimulation 
          item={selectedInmueble} 
          onClose={() => setSelectedInmueble(null)} 
        />
      )}

      {/* BottomSheet: Nueva Publicación */}
      <BottomSheet isOpen={isPosting} onClose={() => setIsPosting(false)} title="Publicar Inmueble">
         <PostingForm onSuccess={() => { setIsPosting(false); setFilterType('TODOS'); }} />
      </BottomSheet>
    </div>
  );
}

function PropertyCard({ item, onClick }: { item: Inmueble, onClick: () => void }) {
  const [isLiked, setIsLiked] = useState(false);
  const imagenes = JSON.parse(item.imagenes || "[]");
  const mainImage = imagenes[0] || `https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800`;

  const formattedPrice = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
    notation: item.precio >= 1000000 ? 'compact' : 'standard'
  } as Intl.NumberFormatOptions).format(item.precio);

  const isParking = item.tipoUnidad === 'PARQUEADERO';
  const isRoom = item.tipoUnidad === 'LOCAL';

  const negocioColor = item.tipoNegocio === 'VENTA'
    ? 'bg-emerald-500/90 text-white'
    : 'bg-accent/90 text-primary';

  return (
    <div 
      onClick={onClick}
      className="property-card group cursor-pointer bg-linear-to-b from-white/10 to-white/5 border border-white/8 rounded-[28px] overflow-hidden hover:border-accent/30 hover:shadow-xl hover:shadow-accent/10 transition-all duration-300 active:scale-[0.98] flex flex-col"
    >

      {/* — Image — */}
      <div className="relative h-44 overflow-hidden">
        <Image
          src={mainImage}
          alt={item.titulo}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-700"
          unoptimized
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/20" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${negocioColor}`}>
            {item.tipoNegocio === 'VENTA' ? 'En Venta' : 'Arriendo'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setIsLiked(!isLiked); }}
            className={`w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${isLiked ? 'bg-red-500 border-red-500' : 'bg-black/30 border-white/20'}`}
          >
            <Heart size={14} className="text-white" fill={isLiked ? "white" : "none"} />
          </button>
        </div>

        {/* Price bottom */}
        <div className="absolute bottom-3 left-3">
          <p className="text-[9px] text-white/60 mb-0.5 uppercase tracking-widest font-bold">{item.tipoNegocio === 'VENTA' ? 'Precio' : '/mes'}</p>
          <p className="text-lg font-black text-white drop-shadow-lg">{formattedPrice}</p>
        </div>
      </div>

      {/* — Content — */}
      <div className="p-4 flex-1 flex flex-col gap-3">

        {/* Title */}
        <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">
          {item.titulo}
        </h3>

        {/* Stats pills */}
        <div className="flex flex-wrap gap-1.5">
          {isParking ? (
            <>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area}m²
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                🚗 Cubierto
              </span>
            </>
          ) : isRoom ? (
            <>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bed size={11} className="text-accent/70" /> Privada
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bath size={11} className="text-accent/70" /> {item.banos === 1 ? 'Propio' : 'Compartido'}
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area}m²
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bed size={11} className="text-accent/70" />{item.habitaciones} hab.
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Bath size={11} className="text-accent/70" />{item.banos} baños
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-white/60 text-[10px] font-semibold">
                <Maximize2 size={11} className="text-accent/70" />{item.area}m²
              </span>
            </>
          )}
        </div>

        {/* Publisher */}
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
              <p className="text-[9px] text-white/30">Verificado ✓</p>
            </div>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`tel:${item.usuario_telefono}`, '_blank'); }}
              className="w-8 h-8 rounded-xl bg-accent text-primary flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            >
              <Phone size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/57${item.usuario_telefono}`, '_blank'); }}
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

// ── SIMULATION COMPONENTS ──────────────────────────────────────────────────

import { X, ArrowRight, Plane as Share, MapPin, ShieldCheck, Zap } from "lucide-react";

function PropertyDetailSimulation({ item, onClose }: { item: Inmueble, onClose: () => void }) {
  const [step, setStep] = useState<'DETAILS' | 'CONTACTING' | 'SUCCESS'>('DETAILS');
  const imagenes = JSON.parse(item.imagenes || "[]");
  const mainImage = imagenes[0] || `https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800`;

  const formattedPrice = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(item.precio);

  useEffect(() => {
    // Disable body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, []);

  const handleInterpreting = () => {
    setStep('CONTACTING');
    setTimeout(() => {
      setStep('SUCCESS');
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-0 md:p-10 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[#0d041a]/95 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full h-full max-w-xl bg-primary overflow-hidden md:rounded-[40px] border border-white/10 flex flex-col shadow-2xl">
        
        {/* Header Actions */}
        <div className="absolute top-6 left-6 z-50">
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-95 transition-all">
            <X size={20} />
          </button>
        </div>
        <div className="absolute top-6 right-6 z-50 flex gap-2">
          <button className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/10 transition-all active:scale-95">
            <Share size={18} />
          </button>
          <button className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/10 transition-all active:scale-95">
            <Heart size={18} />
          </button>
        </div>

        {step === 'DETAILS' && (
          <>
            <div className="flex-1 overflow-y-auto hide-scrollbar">
              {/* Cover */}
              <div className="relative h-[45vh] w-full">
                <Image src={mainImage} alt={item.titulo} fill className="object-cover" unoptimized />
                <div className="absolute inset-0 bg-linear-to-t from-primary via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6">
                   <span className="px-3 py-1 rounded-full bg-accent text-primary text-[10px] font-black uppercase tracking-tighter mb-2 inline-block">
                     {item.tipoNegocio}
                   </span>
                   <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-md">{item.titulo}</h1>
                </div>
              </div>

              {/* Info */}
              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                   <div>
                     <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Precio solicitado</p>
                     <p className="text-3xl font-black text-accent">{formattedPrice} <span className="text-sm font-medium text-white/30">{item.tipoNegocio === 'ALQUILER' ? '/mes' : ''}</span></p>
                   </div>
                   <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1.5 text-accent/80 text-xs font-bold">
                         <ShieldCheck size={14} />
                         <span>Publicación Verificada</span>
                      </div>
                      <p className="text-white/30 text-[10px]">Hace {Math.floor(Math.random() * 5) + 1} días</p>
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
                        <p className="text-[10px] text-white/40 font-bold uppercase">Baños</p>
                      </div>
                   </div>
                   <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center text-center gap-2">
                      <Maximize2 size={22} className="text-accent" />
                      <div>
                        <p className="text-lg font-bold text-white leading-none">{item.area}</p>
                        <p className="text-[10px] text-white/40 font-bold uppercase">m²</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-2">
                      <MapPin size={18} className="text-accent" />
                      <span className="text-sm font-bold text-white/80">Ubicación: Torre 4, Interior 201</span>
                   </div>
                   <div className="p-5 rounded-3xl bg-white/3 border border-dashed border-white/10">
                      <h4 className="text-xs font-bold text-white/40 uppercase mb-3">Descripción</h4>
                      <p className="text-white/70 text-sm leading-relaxed">{item.descripcion}</p>
                   </div>
                </div>

                {/* Advertiser */}
                <div className="p-4 rounded-[32px] bg-accent/5 border border-accent/20 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full border-2 border-accent overflow-hidden">
                        <Image src={item.usuario_avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"} alt="" width={48} height={48} unoptimized />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">{item.usuario_nombre}</p>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-tight">Propietario • Residente desde 2022</p>
                      </div>
                   </div>
                   <Zap size={20} className="text-accent animate-pulse" />
                </div>
              </div>
            </div>

            {/* Sticky Action */}
            <div className="p-6 bg-primary border-t border-white/5">
               <button 
                onClick={handleInterpreting}
                className="w-full h-16 rounded-2xl bg-accent text-primary font-black shadow-xl shadow-accent/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg"
               >
                 <span>Me interesa este Inmueble</span>
                 <ArrowRight size={20} />
               </button>
            </div>
          </>
        )}

        {step === 'CONTACTING' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-8 animate-in zoom-in duration-500">
             <div className="relative">
                <div className="w-32 h-32 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <Zap size={40} className="text-accent animate-pulse" />
                </div>
             </div>
             <div className="space-y-3">
                <h2 className="text-2xl font-bold text-white">Contactando al Propietario...</h2>
                <p className="text-white/50 leading-relaxed">Estamos notificando a {item.usuario_nombre} que estás interesado en su publicación.</p>
             </div>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-10 animate-in zoom-in duration-500">
             <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/40">
                <CheckCircle2 size={64} className="text-white" />
             </div>
             <div className="space-y-4">
                <h2 className="text-3xl font-black text-white">¡Grito de interés enviado!</h2>
                <p className="text-lg text-white/60 leading-relaxed">
                  Tu interés se ha registrado con éxito. <b>{item.usuario_nombre}</b> recibirá tu información y te contactará a través de la citofonía interna o chat.
                </p>
             </div>
             <button 
              onClick={onClose}
              className="w-full h-14 rounded-2xl bg-white/10 text-white font-bold border border-white/10 hover:bg-white/20 transition-all active:scale-95"
             >
                Regresar a la Inmobiliaria
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
             {['ALQUILER', 'VENTA'].map(type => (
               <button
                 key={type}
                 type="button"
                 onClick={() => setFormData({...formData, tipoNegocio: type})}
                 className={`py-3 rounded-2xl border text-sm font-bold transition-all ${
                   formData.tipoNegocio === type 
                   ? 'bg-accent border-accent text-primary' 
                   : 'border-white/10 bg-white/5 text-white/60'
                 }`}
               >
                 {type === 'ALQUILER' ? 'Arrendar' : 'Vender'}
               </button>
             ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Título del Anuncio</label>
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
              <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Área (m²)</label>
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
               <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Baños</label>
               <div className="flex items-center bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                  <button type="button" onClick={() => setFormData({...formData, banos: Math.max(0, formData.banos-1)})} className="flex-1 h-14 hover:bg-white/5">-</button>
                  <span className="flex-1 text-center font-bold text-accent">{formData.banos}</span>
                  <button type="button" onClick={() => setFormData({...formData, banos: formData.banos+1})} className="flex-1 h-14 hover:bg-white/5">+</button>
               </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-white/40 uppercase pl-1">Descripción</label>
            <textarea 
              required
              rows={3}
              className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 focus:border-accent outline-none transition-all"
              placeholder="Cuéntanos más sobre el inmueble..."
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

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
    if (!isLoading) {
      gsap.fromTo(".property-card", 
        { opacity: 0, y: 30, scale: 0.95 },
        { 
          opacity: 1, 
          y: 0, 
          scale: 1, 
          duration: 0.8, 
          stagger: 0.1, 
          ease: "back.out(1.2)" 
        }
      );
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredInmuebles.map((inv) => (
              <PropertyCard key={inv.id} item={inv} />
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

      {/* Floating Action Button */}
      <button 
        onClick={() => setIsPosting(true)}
        className="fixed bottom-24 right-6 w-16 h-16 rounded-full bg-accent text-primary shadow-2xl shadow-accent/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
      >
        <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>

      {/* BottomSheet: Nueva Publicación */}
      <BottomSheet isOpen={isPosting} onClose={() => setIsPosting(false)} title="Publicar Inmueble">
         <PostingForm onSuccess={() => { setIsPosting(false); setFilterType('TODOS'); }} />
      </BottomSheet>
    </div>
  );
}

function PropertyCard({ item }: { item: Inmueble }) {
  const [isLiked, setIsLiked] = useState(false);
  const imagenes = JSON.parse(item.imagenes || "[]");
  const mainImage = imagenes[0] || `https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1000`;

  const formattedPrice = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(item.precio);

  const unitTypeLabel: Record<string, string> = {
    APARTAMENTO: '🏠 Apartamento',
    PARQUEADERO: '🅿️ Parqueadero',
    LOCAL: '🛏️ Habitación',
    CASA: '🏡 Casa',
  };

  const isParking = item.tipoUnidad === 'PARQUEADERO';
  const isRoom = item.tipoUnidad === 'LOCAL';

  return (
    <div className="property-card group cursor-pointer bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden hover:border-white/20 hover:bg-white/10 transition-all duration-500 hover:shadow-2xl hover:shadow-accent/5 flex flex-col">
      {/* Portada */}
      <div className="relative aspect-4/3 overflow-hidden m-2 rounded-4xl">
        <Image 
          src={mainImage} 
          alt={item.titulo} 
          fill 
          className="object-cover group-hover:scale-110 transition-transform duration-700" 
          unoptimized
        />
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
           <div className="flex flex-col gap-1.5">
             <div className="px-3 py-1.5 rounded-full bg-primary/80 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider text-accent">
               {item.tipoNegocio === 'VENTA' ? 'En Venta' : 'En Arriendo'}
             </div>
             <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white/80">
               {unitTypeLabel[item.tipoUnidad] || item.tipoUnidad}
             </div>
           </div>
           <button 
            onClick={(e) => { e.stopPropagation(); setIsLiked(!isLiked); }}
            className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${isLiked ? 'bg-red-500 border-red-500 text-white' : 'bg-primary/40 border-white/20 text-white'}`}
           >
             <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
           </button>
        </div>
        <div className="absolute bottom-4 left-4">
           <div className="bg-primary/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 pr-6">
              <p className="text-[10px] text-white/60 mb-0.5">{item.tipoNegocio === 'VENTA' ? 'Precio' : 'Valor / mes'}</p>
              <p className="text-xl font-bold text-accent">{formattedPrice}</p>
           </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-6 pt-2 flex-1 flex flex-col">
        <h3 className="text-xl font-semibold mb-2 line-clamp-1">{item.titulo}</h3>
        
        {/* Smart stats by type */}
        <div className="flex gap-4 mb-4 text-white/50 text-sm">
          {isParking ? (
            <>
              <div className="flex items-center gap-1.5">
                <Maximize2 size={16} className="text-accent/70" />
                <span>{item.area}m²</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-accent/70">🚗</span>
                <span>Cupo cubierto</span>
              </div>
            </>
          ) : isRoom ? (
            <>
              <div className="flex items-center gap-1.5">
                <Bed size={16} className="text-accent/70" />
                <span>Habitación privada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bath size={16} className="text-accent/70" />
                <span>{item.banos === 1 ? 'Baño propio' : 'Baño compartido'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Maximize2 size={16} className="text-accent/70" />
                <span>{item.area}m²</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <Bed size={16} className="text-accent/70" />
                <span>{item.habitaciones} Hab.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bath size={16} className="text-accent/70" />
                <span>{item.banos} Baños</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Maximize2 size={16} className="text-accent/70" />
                <span>{item.area}m²</span>
              </div>
            </>
          )}
        </div>

        {/* Perfil del Publicador */}
        <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between gap-4">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-white/5">
                 <Image 
                   src={item.usuario_avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200"} 
                   alt={item.usuario_nombre} 
                   width={40} 
                   height={40} 
                   className="w-full h-full object-cover"
                   unoptimized
                 />
              </div>
              <div>
                 <p className="text-xs font-bold">{item.usuario_nombre}</p>
                 <p className="text-[10px] text-white/40">Residente Verificado ✓</p>
              </div>
           </div>
           <div className="flex gap-2">
              <button 
                onClick={(e) => { e.stopPropagation(); window.open(`tel:${item.usuario_telefono}`, '_blank'); }}
                className="w-9 h-9 rounded-xl bg-accent text-primary flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
              >
                 <Phone size={16} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/57${item.usuario_telefono}`, '_blank'); }}
                className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
              >
                 <MessageSquare size={16} />
              </button>
           </div>
        </div>
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

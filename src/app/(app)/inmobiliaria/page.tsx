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
  MapPin,
  ShieldCheck,
  Upload,
  Image as ImageIcon
} from "lucide-react";
import { gsap } from "gsap";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import BottomSheet from "@/components/shell/BottomSheet";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";

interface Inmueble {
  id: string;
  titulo: string;
  descripcion: string;
  precio: string;
  moneda: "COP" | "USD";
  tipoNegocio: "VENTA" | "ALQUILER";
  tipoUnidad: string;
  habitaciones: number;
  banos: number;
  area: string | null;
  imagenes: string[];
  caracteristicas: string[];
  estado: string;
  destacado: boolean;
  telefonoContacto: string | null;
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
  const [refreshKey, setRefreshKey] = useState(0);
  
  const containerRef = useRef(null);
  const { user } = useAuth();
  const isPropietario = user?.rol === "PROPIETARIO";
  const currentUserId = user?.id;

  // Real-time WebSocket subscription
  useWsSubscription('inmueble', () => {
    const params = new URLSearchParams();
    if (filterType !== "TODOS") params.set("tipoNegocio", filterType);
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
        if (filterType !== "TODOS") params.set("tipoNegocio", filterType);
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
  }, [filterType, filterUnidad, refreshKey]);

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
      <div className="max-w-[430px] mx-auto w-full">
        <ProfileHeader className="pt-16 px-6" />
      </div>

      <div className="max-w-[430px] mx-auto w-full pt-8 pb-14 px-4 relative overflow-hidden">
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

      <div className="max-w-[430px] mx-auto w-full px-4">
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
           onSuccess={() => { setIsPosting(false); setEditingItem(null); setRefreshKey(k => k + 1); }} 
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

  const formattedPrecio = new Intl.NumberFormat(item.moneda === "USD" ? "en-US" : "es-CO", {
    style: "currency",
    currency: item.moneda || "COP",
    maximumFractionDigits: 0
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
  const isOwner = currentUserId && item.usuarioId === currentUserId;
  
  const imagenes = item.imagenes || [];
  const mainImage = imagenes[0] || "/placeholder.svg";

  const formattedPrecio = new Intl.NumberFormat(item.moneda === "USD" ? "en-US" : "es-CO", {
    style: "currency",
    currency: item.moneda || "COP",
    maximumFractionDigits: 0
  }).format(Number(item.precio || 0));

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  const whatsappUrl = item.telefonoContacto
    ? `https://wa.me/${item.telefonoContacto.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola, vi tu publicación "${item.titulo}" en ConjuntOS y me interesa. ¿Podemos hablar?`)}`
    : null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-0 md:p-10 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-primary/95 dark:bg-[#000000]/95 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full h-full max-w-xl bg-primary dark:bg-[#000000] md:rounded-[40px] border border-border flex flex-col shadow-2xl pt-[env(safe-area-inset-top)]">
        <div className="absolute top-6 left-6 z-50" style={{top: 'calc(24px + env(safe-area-inset-top))'}}>
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

        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <div className="relative h-[45vh] w-full overflow-hidden rounded-t-[40px] md:rounded-t-[40px]">
            <Image src={mainImage} alt={item.titulo} fill className="object-cover" unoptimized />
            <div className="absolute inset-0 bg-linear-to-t from-primary via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6">
               <span className="px-3 py-1 rounded-full bg-accent text-primary text-[10px] font-black uppercase tracking-tight mb-2 inline-block">
                 {item.tipoNegocio}
               </span>
               <h1 className="text-3xl font-bold text-text tracking-tight drop-shadow-md break-words line-clamp-2">{item.titulo}</h1>
            </div>
          </div>

          <div className="p-6 space-y-8">
            <div className="flex items-center justify-between pb-6 border-b border-border gap-2 min-w-0">
               <div className="min-w-0">
                 <p className="text-text text-xs font-bold uppercase tracking-widest mb-1">Precio solicitado</p>
                 <p className="text-3xl font-black text-accent truncate">{formattedPrecio} <span className="text-sm font-medium text-text">{item.tipoNegocio === "ALQUILER" ? "/ mes" : ""}</span></p>
               </div>
               <div className="flex flex-col items-end shrink-0">
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

        <div className="p-6 bg-primary border-t border-border pb-[calc(env(safe-area-inset-bottom)+24px)]">
           {whatsappUrl ? (
             <a
               href={whatsappUrl}
               target="_blank"
               rel="noopener noreferrer"
               className="w-full h-16 rounded-2xl bg-[#25D366] text-white font-black shadow-xl shadow-[#25D366]/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg"
             >
               <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                 <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
               </svg>
               <span className="truncate">Contactar por WhatsApp</span>
             </a>
           ) : (
             <button 
               disabled
               className="w-full h-16 rounded-2xl bg-surface-2 text-text/40 font-bold flex items-center justify-center gap-3 text-lg cursor-not-allowed"
             >
               <span className="truncate">Teléfono no disponible</span>
             </button>
           )}
        </div>
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

  const cleanNumber = (raw: string): string => {
    if (!raw) return raw;
    const hasApostrophe = raw.includes("'");
    // Remove apostrophes (always thousands separator)
    let s = raw.replace(/'/g, '');
    const commaPos = s.lastIndexOf(',');
    const dotPos = s.lastIndexOf('.');

    if (hasApostrophe) {
      // Colombian millions notation: dots are thousands separators, comma is decimal
      s = s.replace(/\./g, '');           // remove all dots (thousands)
      if (commaPos >= 0) {
        // Replace last comma with dot (decimal)
        s = s.substring(0, s.lastIndexOf(',')) + '.' + s.substring(s.lastIndexOf(',') + 1);
      }
      return s;
    }

    // No apostrophe: standard ambiguous . and ,
    if (commaPos >= 0 && dotPos >= 0) {
      // Both present: last one is decimal separator
      if (commaPos > dotPos) {
        s = s.replace(/\./g, '');
        s = s.substring(0, s.lastIndexOf(',')).replace(/,/g, '') + '.' + s.substring(s.lastIndexOf(',') + 1);
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (commaPos >= 0) {
      const after = s.length - commaPos - 1;
      if (after <= 2 && after > 0 && commaPos > 0) {
        s = s.substring(0, commaPos) + '.' + s.substring(commaPos + 1);
      } else {
        s = s.replace(/,/g, '');
      }
    }
    return s;
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
      const payload = {
        ...formData,
        precio: cleanNumber(formData.precio),
        area: cleanNumber(formData.area) || null,
        imagenes: allUrls,
      };
      if (isEditing && editItem) {
        await api.put(`/inmuebles/${editItem.id}`, payload);
      } else {
        await api.post('/inmuebles', payload);
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

          <div className="space-y-4">
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



"use client";

import { 
  ShoppingBag, Search, Plus, Utensils, Heart, Wrench, 
  Baby, Dog, Laptop, MessageCircle, ArrowLeft,
  ChevronRight, Filter, Star, Clock, MapPin, X, Send, Camera, Sparkles
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { gsap } from "gsap";
import ProfileHeader from "@/components/shell/ProfileHeader";
import BottomSheet from "@/components/shell/BottomSheet";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface Clasificado {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | string | null;
  categoria: string;
  imagenUrl: string | null;
  activo: boolean;
  telefono: string | null;
  whatsapp: string | null;
  propietarioId: string | null;
  createdAt: string;
  propietario: { nombre: string; telefono: string | null } | null;
}

// IDs must match the backend `CatLocal` enum / `locales_categoria_check`
// constraint exactly (RESTAURANTE | TIENDA | LAVANDERIA | FARMACIA | OTRO),
// otherwise POST /clasificados fails serde validation and the filter never matches.
const CATEGORIES = [
  { id: 'TODOS', label: 'Todos', icon: <Sparkles size={18} /> },
  { id: 'RESTAURANTE', label: 'Comida', icon: <Utensils size={18} /> },
  { id: 'TIENDA', label: 'Tienda', icon: <ShoppingBag size={18} /> },
  { id: 'LAVANDERIA', label: 'Lavandería', icon: <Wrench size={18} /> },
  { id: 'FARMACIA', label: 'Salud', icon: <Heart size={18} /> },
  { id: 'OTRO', label: 'Otros', icon: <Star size={18} /> },
];

export default function ClasificadosPage() {
  const router = useRouter();
  const containerRef = useRef(null);
  const [items, setItems] = useState<Clasificado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState("");
  
  // States for interaction
  const [isPostingOpen, setIsPostingOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Clasificado | null>(null);

  const fetchData = async () => {
    try {
      const data = await api.get<Clasificado[]>('/clasificados');
      setItems(data);
    } catch (e) {
      console.error("Error fetching classifieds", e);
    } finally {
      setLoading(false);
    }
  };

  // Real-time WebSocket subscription
  useWsSubscription('clasificado', () => fetchData());

  useEffect(() => {
    fetchData();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 30 }, 
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: "power3.out" }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const filteredItems = items.filter(item => {
    const matchesCat = selectedCat === 'TODOS' || item.categoria === selectedCat;
    const matchesSearch = (item.nombre || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (item.descripcion || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-40 gap-8 overflow-x-hidden relative">
      
      {/* HEADER */}
      <div className="fade-up flex flex-col gap-4">
        <div className="flex items-center gap-4">
           <button 
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text/70 hover:text-text transition-all active:scale-90"
           >
             <ArrowLeft size={20} />
           </button>
           <h1 className="text-3xl font-black text-text tracking-tight">Mercadillo <span className="text-accent underline decoration-border">Vecinal</span></h1>
        </div>
        <p className="text-text/70 text-sm font-medium leading-relaxed">Apoya el talento local de tu conjunto. Servicios, emprendimientos y ventas internas.</p>
      </div>

      <ProfileHeader className="fade-up" />

      {/* SEARCH & FILTERS */}
      <section className="fade-up space-y-4">
        <div className="relative group">
          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-text/60 group-focus-within:text-accent transition-colors" />
          <input 
            type="text"
            placeholder="¿Qué buscas hoy?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 bg-surface-2 border border-border rounded-2xl pl-14 pr-6 text-sm text-text focus:outline-none focus:border-accent/40 focus:bg-surface-2/80 transition-all placeholder:text-text/50"
          />
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar -mx-1 px-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                selectedCat === cat.id 
                ? 'bg-accent border-accent text-primary shadow-lg shadow-accent/20' 
                : 'bg-surface-2 border-border text-text/70 hover:bg-surface-2/80'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* LISTINGS GRID */}
      <section className="flex flex-col gap-6">
        <div className="fade-up flex justify-between items-center">
           <h3 className="text-xs font-bold uppercase tracking-widest text-text/75">Resultados ({filteredItems.length})</h3>
           <Filter size={14} className="text-text/75" />
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
             <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
             <p className="text-[10px] font-black text-text/70 uppercase tracking-[.2em]">Cargando emprendimientos...</p>
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filteredItems.map((item) => (
              <ClasificadoCard 
                key={item.id} 
                item={item} 
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 flex flex-col items-center text-center gap-4 bg-surface-2 rounded-[40px] border border-dashed border-border">
             <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center text-text/60">
                <ShoppingBag size={32} />
             </div>
             <div className="space-y-1">
                <p className="text-text font-bold">No se encontraron resultados</p>
                <p className="text-text/70 text-xs">Intenta con otra categoría o palabra clave.</p>
             </div>
          </div>
        )}
      </section>

      {/* FAB: POST NEW */}
      <button 
        onClick={() => setIsPostingOpen(true)}
        className="fixed bottom-32 right-6 md:right-[calc(50%-180px)] w-16 h-16 rounded-full bg-accent text-primary shadow-2xl shadow-accent/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
      >
        <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>

      {/* BOTTOM SHEET: POSTING FORM */}
      <BottomSheet 
        isOpen={isPostingOpen} 
        onClose={() => setIsPostingOpen(false)}
        title="Nueva Publicación"
      >
        <ClasificadoPostingForm 
          onSuccess={() => {
            setIsPostingOpen(false);
            fetchData();
          }} 
        />
      </BottomSheet>

      {/* MODAL: DETAIL VIEW */}
      {selectedItem && (
        <ClasificadoDetail 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
        />
      )}

      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function ClasificadoCard({ item, onClick }: { item: Clasificado, onClick: () => void }) {
  const [isLiked, setIsLiked] = useState(false);

  const formattedPrice = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(item.precio || 0));

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `Hola ${item.propietario?.nombre || "Vendedor"}, vi tu anuncio de "${item.nombre}" en el Mercadillo de EnConjunto y me interesa más información.`;
    window.open(`https://wa.me/57${item.whatsapp}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div 
      onClick={onClick}
      className="fade-up group liquid-glass-card rounded-[32px] overflow-hidden border border-border hover:border-accent/40 hover:shadow-2xl hover:shadow-accent/10 transition-all duration-500 flex flex-col cursor-pointer active:scale-[0.98]"
    >
       
       <div className="relative h-48 w-full group overflow-hidden">
          <Image 
            src={item.imagenUrl || "/placeholder.svg"} 
            alt={item.nombre} 
            fill 
            className="object-cover transition-transform duration-1000 group-hover:scale-110" 
            unoptimized 
          />
          <div className="absolute inset-0 bg-linear-to-t from-primary/80 dark:from-[#120a2e]/80 via-transparent to-transparent" />
          
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
             <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[9px] font-black text-white uppercase tracking-widest">
                {item.categoria}
             </div>
             <button 
              onClick={(e) => { e.stopPropagation(); setIsLiked(!isLiked); }}
              className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${isLiked ? 'bg-red-500 border-red-500' : 'bg-black/30 border-white/20 hover:bg-black/50'}`}
             >
                <Heart size={16} className="text-white" fill={isLiked ? "white" : "none"} />
             </button>
          </div>

          <div className="absolute bottom-4 left-4">
             <div className="px-3 py-1.5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/20">
                <p className="text-[18px] font-black text-white leading-none">${item.precio ? Number(item.precio).toLocaleString() : 'Consultar'}</p>
             </div>
          </div>
       </div>

       <div className="p-5 flex flex-col gap-4 flex-1">
          <div className="space-y-1">
             <h4 className="text-lg font-bold text-text leading-tight group-hover:text-accent transition-colors duration-300">{item.nombre}</h4>
             <p className="text-text/75 text-[11px] line-clamp-2 leading-relaxed font-medium">{item.descripcion}</p>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full border border-accent/30 overflow-hidden bg-accent/10 flex items-center justify-center">
                     <span className="text-[10px] font-black text-accent">{(item.propietario?.nombre || "V")[0]}</span>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-text leading-none mb-0.5">{item.propietario?.nombre || "Vendedor"}</p>
                   {item.propietario?.telefono && <p className="text-[9px] text-text/75 font-bold uppercase tracking-tighter">Tel: {item.propietario.telefono}</p>}
                </div>
             </div>
             <button 
                onClick={handleWhatsApp}
                className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all active:scale-90"
             >
                <MessageCircle size={18} />
             </button>
          </div>
       </div>
    </div>
  );
}

function ClasificadoPostingForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    precio: "",
    categoria: "RESTAURANTE",
    whatsapp: ""
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.nombre || !form.precio || !form.descripcion) {
      return toast.error("Por favor completa los campos obligatorios");
    }
    setLoading(true);
    try {
      await api.post('/clasificados', form);
      toast.success("¡Publicado con éxito!");
      onSuccess();
    } catch (e) {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-4">
        {/* Image placeholder when no image provided */}
        <div className="w-full h-44 rounded-3xl bg-surface-2 border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 group hover:border-accent/40 hover:bg-surface-2/80 transition-all cursor-pointer">
           <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-text/60 group-hover:text-accent group-hover:scale-110 transition-all">
              <Camera size={24} />
           </div>
           <p className="text-[10px] font-black text-text/70 uppercase tracking-widest group-hover:text-text/80">Subir foto del producto</p>
        </div>

        <div className="space-y-1.5 px-1">
          <label className="text-[9px] font-black text-text/60 uppercase tracking-[0.2em] ml-1">Título del anuncio</label>
          <input 
            type="text" 
            placeholder="Ej: Empanadas de Pipian"
            value={form.nombre}
            onChange={(e) => setForm({...form, nombre: e.target.value})}
            className="w-full bg-surface-2 border border-border rounded-2xl px-5 py-4 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 px-1">
              <label className="text-[9px] font-black text-text/60 uppercase tracking-[0.2em] ml-1">Precio (COP)</label>
              <input 
                type="number" 
                placeholder="0" 
                value={form.precio}
                onChange={(e) => setForm({...form, precio: e.target.value})}
                className="w-full bg-surface-2 border border-border rounded-2xl px-5 py-4 text-sm text-text focus:outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-1.5 px-1">
              <label className="text-[9px] font-black text-text/60 uppercase tracking-[0.2em] ml-1">Categoría</label>
              <select 
                value={form.categoria}
                onChange={(e) => setForm({...form, categoria: e.target.value})}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-4 text-sm text-text focus:outline-none focus:border-accent appearance-none"
              >
                {CATEGORIES.filter(c => c.id !== 'TODOS').map(cat => (
                  <option key={cat.id} value={cat.id} className="bg-primary text-text">{cat.label}</option>
                ))}
              </select>
            </div>
        </div>

        <div className="space-y-1.5 px-1">
          <label className="text-[9px] font-black text-text/60 uppercase tracking-[0.2em] ml-1">WhatsApp de contacto</label>
          <input 
            type="tel" 
            placeholder="310 123 4567" 
            value={form.whatsapp}
            onChange={(e) => setForm({...form, whatsapp: e.target.value})}
            className="w-full bg-surface-2 border border-border rounded-2xl px-5 py-4 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-1.5 px-1">
          <label className="text-[9px] font-black text-text/60 uppercase tracking-[0.2em] ml-1">Descripción</label>
          <textarea 
            placeholder="Cuéntanos más sobre lo que ofreces..." 
            rows={3}
            value={form.descripcion}
            onChange={(e) => setForm({...form, descripcion: e.target.value})}
            className="w-full bg-surface-2 border border-border rounded-2xl px-5 py-4 text-sm text-text focus:outline-none focus:border-accent resize-none"
          />
        </div>
      </div>

      <button 
        disabled={loading}
        onClick={handleSubmit}
        className="w-full h-14 bg-linear-to-r from-accent to-purple-600 rounded-2xl flex items-center justify-center gap-3 text-sm font-black text-white uppercase tracking-widest shadow-xl shadow-accent/20 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <><Send size={18} /> Publicar Ahora</>}
      </button>
    </div>
  );
}

function ClasificadoDetail({ item, onClose }: { item: Clasificado, onClose: () => void }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".modal-content", 
        { y: 100, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }
      );
    }, modalRef);
    return () => ctx.revert();
  }, []);

  const handleWhatsApp = () => {
    const text = `Hola ${item.propietario?.nombre || "Vendedor"}, vi tu anuncio de "${item.nombre}" en el Mercadillo de EnConjunto y me interesa más información.`;
    window.open(`https://wa.me/57${item.whatsapp}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div ref={modalRef} className="fixed inset-0 z-[70] flex items-end justify-center px-0">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="modal-content relative w-full max-w-[430px] h-[85vh] bg-primary dark:bg-[#0c061a] rounded-t-[40px] overflow-hidden flex flex-col border-t border-border">
         {/* IMAGE HEADER */}
         <div className="relative h-2/5 w-full shrink-0">
            <Image 
              src={item.imagenUrl || "/placeholder.svg"} 
              alt={item.nombre} 
              fill 
              className="object-cover" 
              unoptimized 
            />
            <div className="absolute inset-0 bg-linear-to-t from-primary dark:from-[#0c061a] via-transparent to-transparent" />
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white"
            >
              <X size={20} />
            </button>
            <div className="absolute top-6 left-6 px-4 py-2 rounded-full bg-accent text-primary text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent/20">
              {item.categoria}
            </div>
         </div>
         <div className="p-8 flex flex-col gap-6 overflow-y-auto">
            <div className="space-y-3">
               <div className="flex justify-between items-start">
                  <h2 className="text-3xl font-black text-text leading-tight flex-1">{item.nombre}</h2>
                  <div className="text-right">
                     <p className="text-[28px] font-black text-accent tracking-tighter leading-none">${item.precio ? Number(item.precio).toLocaleString() : 'Consultar'}</p>
                     <p className="text-[10px] text-text/75 font-bold uppercase tracking-widest mt-1">Precio sugerido</p>
                  </div>
               </div>
               
               <div className="flex items-center gap-3 py-4 border-y border-border">
                   <div className="w-12 h-12 rounded-full border-2 border-accent/20 overflow-hidden">
                       <div className="w-full h-full bg-accent/10 flex items-center justify-center text-accent font-black">{(item.propietario?.nombre || "V")[0]}</div>
                  </div>
                  <div>
                    <h4 className="text-text font-bold">{item.propietario?.nombre || "Vendedor"}</h4>
                    {item.propietario?.telefono && <p className="text-xs text-text/75">Tel: {item.propietario.telefono}</p>}
                  </div>
               </div>
            </div>
 
            <div className="space-y-4">
               <h3 className="text-xs font-black text-text/80 uppercase tracking-[0.3em]">Descripción del vendedor</h3>
               <p className="text-text/70 leading-relaxed text-sm font-medium">{item.descripcion}</p>
            </div>
 
            <div className="mt-auto py-8">
               <button 
                 onClick={handleWhatsApp}
                 className="w-full py-5 bg-emerald-500 rounded-3xl flex items-center justify-center gap-4 text-white font-black text-lg shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
               >
                 <MessageCircle size={24} /> Contactar por WhatsApp
               </button>
               <p className="text-center text-[10px] text-text/60 mt-4 uppercase tracking-widest font-black">Transacción directa entre residentes</p>
            </div>
         </div>
      </div>
    </div>
  );
}

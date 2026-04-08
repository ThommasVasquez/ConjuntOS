"use client";

import { 
  ShoppingBag, Search, Plus, Utensils, Heart, Wrench, 
  Baby, Dog, Laptop, MessageCircle, ArrowLeft,
  ChevronRight, Filter, Star, Clock, MapPin
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { gsap } from "gsap";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { toast } from "sonner";

interface Clasificado {
  id: string;
  titulo: string;
  descripcion: string;
  precio: number;
  categoria: string;
  usuario_nombre: string;
  usuario_torre?: string;
  usuario_apto?: string;
  usuario_avatar?: string;
  whatsapp?: string;
  imagenUrl?: string;
}

const CATEGORIES = [
  { id: 'TODOS', label: 'Todos', icon: <ShoppingBag size={18} /> },
  { id: 'GASTRONOMIA', label: 'Comida', icon: <Utensils size={18} /> },
  { id: 'CUIDADO', label: 'Cuidado', icon: <Baby size={18} /> },
  { id: 'SERVICIOS', label: 'Hogar', icon: <Wrench size={18} /> },
  { id: 'MASCOTAS', label: 'Mascotas', icon: <Dog size={18} /> },
  { id: 'TECNOLOGIA', label: 'Tecno', icon: <Laptop size={18} /> },
];

export default function ClasificadosPage() {
  const router = useRouter();
  const containerRef = useRef(null);
  const [items, setItems] = useState<Clasificado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/user/clasificados");
        const data = await res.json();
        if (data.success) {
          setItems(data.data);
        }
      } catch (e) {
        console.error("Error fetching classifieds", e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 30 }, 
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out" }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const filteredItems = items.filter(item => {
    const matchesCat = selectedCat === 'TODOS' || item.categoria === selectedCat;
    const matchesSearch = item.titulo.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.descripcion.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 gap-8 overflow-x-hidden relative">
      
      {/* Background Orbs */}
      <div className="fixed top-[-10%] right-[-10%] w-[300px] h-[300px] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[10%] left-[-10%] w-[250px] h-[250px] bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

      {/* HEADER */}
      <div className="fade-up flex flex-col gap-4">
        <div className="flex items-center gap-4">
           <button 
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-90"
           >
             <ArrowLeft size={20} />
           </button>
           <h1 className="text-3xl font-black text-white tracking-tight">Mercadillo <span className="text-accent underline decoration-white/10">Vecinal</span></h1>
        </div>
        <p className="text-white/40 text-sm font-medium leading-relaxed">Apoya el talento local de tu conjunto. Servicios, emprendimientos y ventas internas.</p>
      </div>

      <ProfileHeader className="fade-up" />

      {/* SEARCH & FILTERS */}
      <section className="fade-up space-y-4">
        <div className="relative group">
          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
          <input 
            type="text"
            placeholder="¿Qué buscas hoy?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-14 pr-6 text-sm text-white focus:outline-none focus:border-accent/40 focus:bg-white/[0.08] transition-all"
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
                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
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
           <h3 className="text-xs font-bold uppercase tracking-widest text-white/20">Resultados ({filteredItems.length})</h3>
           <Filter size={14} className="text-white/20" />
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
             <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
             <p className="text-[10px] font-black text-white/20 uppercase tracking-[.2em]">Cargando emprendimientos...</p>
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filteredItems.map((item) => (
              <ClasificadoCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="py-20 flex flex-col items-center text-center gap-4 bg-white/5 rounded-[40px] border border-dashed border-white/10">
             <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                <ShoppingBag size={32} />
             </div>
             <div className="space-y-1">
                <p className="text-white/60 font-bold">No se encontraron resultados</p>
                <p className="text-white/30 text-xs">Intenta con otra categoría o palabra clave.</p>
             </div>
          </div>
        )}
      </section>

      {/* FAB: POST NEW */}
      <button 
        onClick={() => toast.info("Función de publicación activa próximamente para residentes.")}
        className="fixed bottom-32 right-6 md:right-[calc(50%-180px)] w-16 h-16 rounded-full bg-accent text-primary shadow-2xl shadow-accent/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
      >
        <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>

      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function ClasificadoCard({ item }: { item: Clasificado }) {
  const [isLiked, setIsLiked] = useState(false);

  const formattedPrice = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(item.precio);

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `Hola ${item.usuario_nombre}, vi tu anuncio de "${item.titulo}" en el Mercadillo de EnConjunto y me interesa más información.`;
    window.open(`https://wa.me/57${item.whatsapp}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="fade-up group liquid-glass-card rounded-[32px] overflow-hidden border border-white/10 hover:border-accent/30 hover:shadow-xl hover:shadow-accent/5 transition-all duration-300 flex flex-col">
       
       <div className="relative h-48 w-full group overflow-hidden">
          <Image 
            src={item.imagenUrl || "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&q=80&w=800"} 
            alt={item.titulo} 
            fill 
            className="object-cover transition-transform duration-700 group-hover:scale-110" 
            unoptimized 
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#120a2e] via-[#120a2e]/20 to-transparent" />
          
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
             <p className="text-[20px] font-black text-white drop-shadow-lg">{formattedPrice}</p>
          </div>
       </div>

       <div className="p-5 flex flex-col gap-4 flex-1">
          <div className="space-y-1">
             <h4 className="text-lg font-bold text-white leading-tight group-hover:text-accent transition-colors">{item.titulo}</h4>
             <p className="text-white/40 text-xs line-clamp-2 leading-relaxed">{item.descripcion}</p>
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between mt-auto">
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full border border-accent/30 overflow-hidden bg-accent/10 flex items-center justify-center">
                   {item.usuario_avatar ? (
                     <Image src={item.usuario_avatar} alt="" width={32} height={32} unoptimized />
                   ) : (
                     <span className="text-[10px] font-black text-accent">{item.usuario_nombre[0]}</span>
                   )}
                </div>
                <div>
                   <p className="text-[10px] font-bold text-white leading-none mb-0.5">{item.usuario_nombre}</p>
                   <p className="text-[9px] text-white/30 font-bold uppercase tracking-tighter">Torre {item.usuario_torre} • Apto {item.usuario_apto}</p>
                </div>
             </div>
             <button 
                onClick={handleWhatsApp}
                className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all active:scale-90"
             >
                <MessageCircle size={18} />
             </button>
          </div>
       </div>
    </div>
  );
}

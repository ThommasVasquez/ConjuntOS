"use client";

/**
 * RÉSERVAS - CONJUNTOAPP
 * Módulo de reserva de zonas comunes con pasarela de pago simulada.
 */

import { 
  ArrowRight, X, CreditCard, Lock, CheckCircle2, 
  ChevronLeft, Sparkles, Clock, MapPin, Users, QrCode, Download, Share2,
  Bell, Search, SlidersHorizontal
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Area {
  id: string;
  name: string;
  desc: string;
  price: number;
  image: string;
  icon: React.ReactNode;
  capacity: number;
  tags: string[];
}

export default function ReservasPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [profilePic, setProfilePic] = useState("https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=1000");
  const [userData, setUserData] = useState({ name: "Residente", unit: "Torre 1 - 101", gender: "femenino" });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasStory, setHasStory] = useState(false);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [step, setStep] = useState<'GRID' | 'BOOKING' | 'PAYMENT' | 'SUCCESS'>('GRID');

  const areas: Area[] = [
    {
      id: 'pool',
      name: "Piscina Infinity",
      desc: "Disfruta de una tarde relajante con vista panorámica y agua climatizada.",
      price: 15000,
      image: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&q=80&w=1000",
      icon: <Sparkles size={18} />,
      capacity: 10,
      tags: ["Climatizada", "Vistas"]
    },
    {
      id: 'gym',
      name: "Gym Premium",
      desc: "Equipamiento de última generación para tu rutina diaria de entrenamiento.",
      price: 0,
      image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=1000",
      icon: <Users size={18} />,
      capacity: 15,
      tags: ["24/7", "Máquinas Pro"]
    },
    {
      id: 'hall',
      name: "Salón Comunal Deluxe",
      desc: "El lugar perfecto para tus eventos especiales y reuniones importantes.",
      price: 80000,
      image: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=1000",
      icon: <MapPin size={18} />,
      capacity: 50,
      tags: ["Audio Pro", "Cocina"]
    }
  ];

  useEffect(() => {
    if (!userId) return;

    // Load local storage data
    const savedPic = localStorage.getItem(`conjunto_app_profile_pic_${userId}`);
    if (savedPic) setProfilePic(savedPic);

    const savedData = localStorage.getItem(`conjunto_app_profile_data_${userId}`);
    if (savedData) {
      try { setUserData(JSON.parse(savedData)); } catch (e) { console.error(e); }
    }

    // Story Logic
    const savedStory = localStorage.getItem(`conjunto_app_active_story_${userId}`);
    if (savedStory) {
      const { createdAt } = JSON.parse(savedStory);
      if (Date.now() - createdAt < 24 * 60 * 60 * 1000) {
        setHasStory(true);
      } else {
        localStorage.removeItem(`conjunto_app_active_story_${userId}`);
      }
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 30 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.6, 
          stagger: 0.1, 
          ease: "power2.out",
          delay: 0.1
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [userId]);

  const notifications = [
    { id: 1, title: "Reserva Confirmada", desc: "Tu acceso al gimnasio está listo.", time: "Hace 2m", icon: <CheckCircle2 size={14}/>, color: "text-emerald-400", isUnread: true },
    { id: 2, title: "Pago Pendiente", desc: "Cuota de administración de Abril.", time: "Hace 1h", icon: <CreditCard size={14}/>, color: "text-red-400", isUnread: false },
  ];

  const handleSelectArea = (area: Area) => {
    setSelectedArea(area);
    setStep('BOOKING');
  };

  const handleProcessPayment = () => {
    setStep('PAYMENT');
    
    // Simulación de pasarela de pago
    setTimeout(() => {
      setStep('SUCCESS');
      toast.success("Reserva confirmada con éxito");
    }, 4000);
  };

  const handlePostStory = () => {
    const story = {
      id: Date.now(),
      createdAt: Date.now(),
      type: 'RESERVATION',
      content: selectedArea?.name,
      image: selectedArea?.image
    };
    localStorage.setItem("conjunto_app_active_story", JSON.stringify(story));
    setHasStory(true);
    toast.success("¡Tu estado ha sido publicado!", {
      description: "Tus vecinos lo verán durante las próximas 24 horas."
    });
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-10">
      
      {/* BACKGROUND AMBIENT GLOW */}
      <div className="fixed top-[-10%] right-[-10%] w-full h-[50%] bg-[#4C1D95]/20 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-full h-[50%] bg-[#BE185D]/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

      {/* 1. HEADER (ESTILO INICIO) */}
      <section className="fade-up flex justify-between items-center relative z-20">
        <div className="flex items-center gap-4 group cursor-pointer active:scale-95 transition-transform" onClick={() => router.push('/perfil')}>
           <div className={`w-14 h-14 rounded-full p-[3px] transition-all duration-500 relative ${hasStory ? 'liquid-story-ring' : 'border border-white/20 bg-white/5'}`}>
              <div className="w-full h-full rounded-full overflow-hidden border border-white/10 shadow-2xl relative z-10">
                 <Image src={profilePic} alt="Profile" width={56} height={56} className="w-full h-full object-cover" unoptimized />
              </div>
              {hasStory && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-[#0d041a] z-20 flex items-center justify-center">
                   <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                </div>
              )}
           </div>
           <div className="flex flex-col">
             <div className="flex items-center gap-1.5">
                <button 
                  onClick={(e) => { e.stopPropagation(); router.back(); }}
                  className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 mr-1"
                >
                   <ChevronLeft size={12} />
                </button>
                <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">
                  {userData.gender === 'masculino' ? 'Bienvenido' : userData.gender === 'neutro' ? 'Bienvenide' : 'Bienvenida'} 👋
                </span>
             </div>
             <h1 className="text-white text-xl font-display font-bold tracking-tight text-glow">{userData.name || 'Residente'}</h1>
           </div>
        </div>

        {/* NOTIFICATIONS TRIGGER */}
        <div className="relative" ref={notificationsRef}>
          <button 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl group border border-white/10 active:scale-95 ${isNotificationsOpen ? 'bg-accent text-white border-accent/50' : 'liquid-glass text-white/80 hover:text-white'}`}
          >
             <Bell size={22} className={isNotificationsOpen ? 'animate-none' : 'group-hover:rotate-12 transition-transform'} />
             <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 bg-accent rounded-full border-2 border-[#1a0b2e] shadow-[0_0_10px_rgba(217,70,239,0.8)]"></span>
          </button>

          {/* NOTIFICATIONS DROPDOWN */}
          {isNotificationsOpen && (
            <div className="absolute top-14 right-0 w-[300px] liquid-glass backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden z-200 animate-in fade-in zoom-in-95 duration-200">
               <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                  <span className="text-sm font-bold text-white tracking-wide">Notificaciones</span>
                  <button className="text-[10px] text-accent font-bold uppercase hover:underline">Limpiar Todo</button>
               </div>
               <div className="flex flex-col max-h-[350px] overflow-y-auto hide-scrollbar">
                  {notifications.map((notif) => (
                    <button 
                      key={notif.id}
                      className="w-full px-5 py-4 flex items-start gap-4 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0 relative group"
                    >
                       {notif.isUnread && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_5px_rgba(217,70,239,0.5)]"></span>}
                       <div className={`mt-0.5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center ${notif.color}`}>
                          {notif.icon}
                       </div>
                       <div className="flex flex-col flex-1">
                          <div className="flex justify-between items-center mb-0.5">
                             <span className="text-xs font-bold text-white group-hover:text-glow transition-all">{notif.title}</span>
                             <span className="text-[9px] text-white/30 font-medium">{notif.time}</span>
                          </div>
                          <p className="text-[11px] text-white/50 leading-snug">{notif.desc}</p>
                       </div>
                    </button>
                  ))}
               </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. SEARCH BAR */}
      <section className="fade-up flex gap-3">
        <div className="relative flex-1 group">
           <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
           <input 
             type="text" 
             placeholder="Buscar novedades, servicios..." 
             className="w-full bg-[#1a1333] border border-white/5 rounded-[24px] py-4 pl-14 pr-6 text-sm text-white focus:outline-hidden focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner"
           />
        </div>
        <button className="w-14 h-14 rounded-[22px] bg-[#241a4a] border border-white/5 flex items-center justify-center text-white/60 hover:text-white hover:border-white/10 transition-all active:scale-95 shadow-lg">
           <SlidersHorizontal size={20} />
        </button>
      </section>

      <div className="flex flex-col gap-2 -mt-4 mb-2">
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Reservas</h1>
          <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest ">Zonas Comunes del Conjunto</p>
      </div>

      {/* MAIN CONTENT BASED ON STEP */}
      {step === 'GRID' && (
        <section className="flex flex-col gap-6">
           {areas.map((area) => (
             <div 
               key={area.id}
               onClick={() => handleSelectArea(area)}
               className="fade-up liquid-glass-card rounded-[32px] overflow-hidden group cursor-pointer active:scale-[0.98] transition-all border border-white/5 shadow-2xl relative"
             >
                <div className="relative h-60 w-full overflow-hidden">
                    <Image src={area.image} alt={area.name} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" unoptimized />
                   <div className="absolute inset-0 bg-linear-to-t from-[#0d041a] via-transparent to-transparent opacity-80" />
                   
                   {/* Badge Precio */}
                   <div className="absolute top-4 right-4 liquid-glass px-4 py-2 rounded-full border border-white/10 shadow-lg">
                      <span className="text-white font-bold text-sm">{area.price === 0 ? 'Gratis' : `$${area.price.toLocaleString()}`}</span>
                   </div>
                </div>

                <div className="p-6">
                   <div className="flex justify-between items-start mb-3">
                      <div>
                         <h3 className="text-xl font-bold text-white text-glow mb-1 leading-tight">{area.name}</h3>
                         <div className="flex gap-2">
                            {area.tags.map(tag => (
                              <span key={tag} className="text-[10px] text-white/40 font-bold uppercase tracking-wider">{tag}</span>
                            ))}
                         </div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shadow-[0_0_15px_rgba(217,70,239,0.2)]">
                         {area.icon}
                      </div>
                   </div>
                   <p className="text-white/50 text-xs leading-relaxed font-light mb-6">{area.desc}</p>
                   
                   <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                         <div className="flex items-center gap-1.5 text-white/30 text-[10px] font-bold uppercase">
                            <Users size={12} /> Máx {area.capacity} Personas
                         </div>
                      </div>
                      <div className="flex items-center gap-2 group/btn">
                         <span className="text-accent text-[11px] font-bold uppercase tracking-widest group-hover/btn:translate-x-[-4px] transition-transform duration-300">Reservar Ahora</span>
                         <ArrowRight size={14} className="text-accent" />
                      </div>
                   </div>
                </div>
             </div>
           ))}
        </section>
      )}

      {/* MODAL BOOKING (Simulated inside same page for fluidity) */}
      {step === 'BOOKING' && selectedArea && (
        <section className="fade-up fixed inset-0 z-[1000] flex flex-col justify-end">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setStep('GRID')} />
           <div className="liquid-glass rounded-t-[40px] p-8 pb-40 w-full max-w-[430px] mx-auto relative z-10 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] border-t border-white/20 animate-in slide-in-from-bottom-full duration-500 overflow-y-auto max-h-[95vh] hide-scrollbar">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-display font-medium text-white tracking-tight">Tu Reserva</h3>
                 <button onClick={() => setStep('GRID')} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white transition-all">
                    <X size={20} />
                 </button>
              </div>

              <div className="flex gap-6 items-center mb-8 p-4 rounded-3xl bg-white/5 border border-white/5">
                 <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shrink-0">
                     <Image src={selectedArea.image} alt={selectedArea.name} fill className="w-full h-full object-cover" unoptimized />
                 </div>
                 <div>
                    <h4 className="text-white font-bold text-lg mb-1">{selectedArea.name}</h4>
                    <p className="text-accent text-sm font-bold">{selectedArea.price === 0 ? 'Reserva Gratuita' : `$${selectedArea.price.toLocaleString()}`}</p>
                 </div>
              </div>

              <div className="flex flex-col gap-6 mb-8">
                 <div className="flex flex-col gap-3">
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Selecciona Fecha</label>
                    <div className="grid grid-cols-4 gap-3">
                       {[14, 15, 16, 17].map(day => (
                         <button key={day} className={`py-4 rounded-2xl border transition-all flex flex-col items-center gap-1 ${day === 15 ? 'bg-accent border-accent text-white shadow-[0_10px_20px_rgba(217,70,239,0.3)]' : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10'}`}>
                            <span className="text-[10px] font-medium opacity-50 uppercase tracking-tighter">Abr</span>
                            <span className="text-lg font-bold">{day}</span>
                         </button>
                       ))}
                    </div>
                 </div>

                 <div className="flex flex-col gap-3">
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Horario Disponible</label>
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 hide-scrollbar">
                       {["10:00 AM", "11:30 AM", "01:00 PM", "03:00 PM", "05:00 PM"].map(time => (
                         <button key={time} className={`px-5 py-3.5 rounded-full border shrink-0 text-xs font-bold transition-all ${time === "11:30 AM" ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                            {time}
                         </button>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="bg-linear-to-r from-[#4C1D95]/40 to-[#BE185D]/40 p-6 rounded-[28px] border border-white/10 mb-8">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-white/60 text-sm font-light">Subtotal</span>
                    <span className="text-white text-sm font-bold font-mono">${selectedArea.price.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
                    <span className="text-white/60 text-sm font-light">Fianza (Reembolsable)</span>
                    <span className="text-white text-sm font-bold font-mono">$0</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-white font-bold tracking-tight">Total a Pagar</span>
                    <span className="text-2xl font-display font-bold text-white text-glow shadow-accent/20">${selectedArea.price.toLocaleString()}</span>
                 </div>
              </div>

              <button 
                onClick={handleProcessPayment}
                className="w-full py-5 bg-gradient-to-r from-accent to-purple-600 rounded-3xl font-bold text-white shadow-[0_15px_40px_rgba(217,70,239,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                 Proceder al Pago <CreditCard size={20} />
              </button>
           </div>
        </section>
      )}

      {/* PAYMENT GATEWAY SIMULATION */}
      {step === 'PAYMENT' && (
        <section className="fade-up fixed inset-0 z-100 flex flex-col items-center justify-center p-8 bg-[#0d041a]/95 backdrop-blur-3xl animate-in fade-in duration-500">
           
           {/* LIQUID GLASS CARD SIMULATION */}
           <div id="payment-card" className="w-full max-w-[320px] aspect-[1.6/1] liquid-glass rounded-3xl border border-white/30 p-6 flex flex-col justify-between shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative overflow-hidden mb-12">
              <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent -z-10" />
              <div className="absolute bottom-[-20%] right-[-10%] w-40 h-40 bg-accent/20 blur-[50px] rounded-full -z-10" />
              
              <div className="flex justify-between items-center">
                 <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                    <Lock size={20} className="text-white/50" />
                 </div>
                 <div className="text-white/30 text-2xl font-bold italic">VISA</div>
              </div>

              <div className="flex flex-col gap-2">
                 <div className="h-4 w-48 bg-white/10 rounded-full animate-pulse" />
                 <div className="flex gap-3">
                    <div className="h-3 w-12 bg-white/10 rounded-full animate-pulse" />
                    <div className="h-3 w-12 bg-white/10 rounded-full animate-pulse" />
                 </div>
              </div>

              <div className="flex justify-between items-end">
                 <div>
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-1">Card Holder</p>
                    <p className="text-white font-mono tracking-wider">AMÉLIE THOMMY</p>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-red-500/80 mix-blend-screen" />
                    <div className="w-8 h-8 rounded-full bg-yellow-500/80 -ml-4" />
                 </div>
              </div>
           </div>

           <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-accent animate-spin mb-4" />
              <h3 className="text-2xl font-display font-medium text-white tracking-tight">Procesando Pago...</h3>
              <p className="text-white/40 text-sm max-w-xs leading-relaxed">Estamos validando tu transacción de forma segura con tu entidad bancaria.</p>
           </div>

           {/* SECURITY FOOTER */}
           <div className="absolute bottom-12 flex items-center gap-3 bg-white/5 px-6 py-3 rounded-full border border-white/5">
              <Lock size={14} className="text-accent" />
              <span className="text-[10px] text-white/60 font-bold uppercase tracking-widest">Pago Encriptado • 256-bit SSL</span>
           </div>

        </section>
      )}

      {/* SUCCESS TICKET STATE */}
      {step === 'SUCCESS' && selectedArea && (
        <section className="fade-up fixed inset-0 z-100 flex flex-col items-center justify-center p-6 bg-[#1a0b2e] animate-in slide-in-from-bottom-20 duration-700">
           
           <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)] mb-8 animate-bounce">
              <CheckCircle2 size={40} className="text-white" />
           </div>

           <h2 className="text-3xl font-display font-bold text-white tracking-tight mb-2 text-center text-glow">¡Reserva Exitosa!</h2>
           <p className="text-white/40 text-sm text-center mb-10 max-w-xs">Tu lugar en la {selectedArea.name} ya está asegurado. Disfruta de tu tiempo.</p>

           {/* DIGITAL TICKET */}
           <div className="w-full max-w-[340px] liquid-glass rounded-[40px] overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.8)] border border-white/10 relative">
              <div className="absolute top-0 left-0 w-full h-32 overflow-hidden -z-10">
                 <Image src={selectedArea.image} alt="" fill className="w-full h-full object-cover blur-sm opacity-40 scale-125" />
                 <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#1a0b2e]" />
              </div>

              <div className="p-8">
                 <div className="flex justify-between items-start mb-8 text-white/30 text-[10px] font-bold uppercase tracking-widest">
                    <span>Reserva ID: #QA-8829</span>
                    <span>15 Abr 2026</span>
                 </div>

                 <div className="flex flex-col gap-6 mb-8">
                    <div className="flex gap-4 items-center">
                       <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent">
                          <Users size={20} />
                       </div>
                       <div>
                          <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-0.5">Espacio</p>
                          <p className="text-white font-bold">{selectedArea.name}</p>
                       </div>
                    </div>
                    <div className="flex gap-4 items-center">
                       <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent">
                          <Clock size={20} />
                       </div>
                       <div>
                          <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-0.5">Horario</p>
                          <p className="text-white font-bold">11:30 AM - 01:00 PM</p>
                       </div>
                    </div>
                 </div>

                 <div className="w-full aspect-square bg-white p-6 rounded-[32px] flex items-center justify-center mb-8 shadow-inner shadow-black/20">
                    <QrCode size={180} className="text-[#0d041a]" />
                 </div>

                 <div className="border-t-2 border-dashed border-white/10 pt-8 flex flex-col gap-4">
                    <button 
                      onClick={handlePostStory}
                      className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center gap-3 text-white text-sm font-bold shadow-xl shadow-accent/20 active:scale-[0.98] transition-all"
                    >
                       <Download size={18} /> Publicar en Mis Estados
                    </button>
                    <div className="flex gap-4">
                       <button className="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center gap-2 text-white text-xs font-bold transition-all">
                          <Share2 size={16} /> Compartir
                       </button>
                    </div>
                 </div>
              </div>
           </div>

           <button 
             onClick={() => router.push('/inicio')}
             className="mt-12 text-white/40 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"
           >
              Volver al Inicio
           </button>

        </section>
      )}

      {/* CUSTOM SCROLLBAR STYLE */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .text-glow { text-shadow: 0 0 20px rgba(217,70,239,0.5); }
        
        @keyframes story-shimmer {
          0% { border-color: #D946EF; box-shadow: 0 0 15px #D946EF, 0 0 30px rgba(217,70,239,0.5), inset 0 0 10px #D946EF; }
          50% { border-color: #8B5CF6; box-shadow: 0 0 25px #8B5CF6, 0 0 50px rgba(139,92,246,0.6), inset 0 0 15px #8B5CF6; }
          100% { border-color: #D946EF; box-shadow: 0 0 15px #D946EF, 0 0 30px rgba(217,70,239,0.5), inset 0 0 10px #D946EF; }
        }

        .liquid-story-ring {
          position: relative;
          background: linear-gradient(45deg, #D946EF, #8B5CF6, #D946EF);
          background-size: 200% 200%;
          animation: story-shimmer 3s infinite ease-in-out, shimmer-bg 5s infinite linear;
          padding: 3px;
        }

        @keyframes shimmer-bg {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}} />

    </div>
  );
}

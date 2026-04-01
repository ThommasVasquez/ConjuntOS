"use client";

/**
 * VISITANTES - CONJUNTOAPP
 * Gestión de ingresos, generación de códigos QR y control de acceso.
 */

import { 
  Plus, QrCode, Clock, Calendar, CheckCircle2, 
  ChevronLeft, Share2, MoreHorizontal, UserPlus, 
  ShieldCheck, XCircle, ArrowRight, Bell, Download, User
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Visitor {
  id: string;
  name: string;
  type: 'FRECUENTE' | 'OCASIONAL' | 'DELIVERY';
  status: 'ACTIVO' | 'PROGRAMADO' | 'SALIDA';
  entryTime?: string;
  scheduledDate?: string;
  avatar?: string;
}

export default function VisitantesPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [profilePic, setProfilePic] = useState("/images/avatar-placeholder.png");
  const [userData, setUserData] = useState({ name: "Residente", gender: "femenino" });
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [newVisitForm, setNewVisitForm] = useState({ name: '', type: 'OCASIONAL' });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [hasStory, setHasStory] = useState(false);

  const notifications = [
    { id: 1, title: "Nuevo Invitado", desc: "Carlos Mendoza ha ingresado al conjunto.", time: "Hace 5m", icon: <CheckCircle2 size={16} />, color: "text-green-400", isUnread: true },
    { id: 2, title: "Invitación Expirada", desc: "El QR de Rappi ha expirado.", time: "Hace 1h", icon: <XCircle size={16} />, color: "text-red-400" },
  ];

  const [visitors] = useState<Visitor[]>([
    { id: '1', name: "Carlos Mendoza", type: 'FRECUENTE', status: 'ACTIVO', entryTime: '10:45 AM' },
    { id: '2', name: "Rappi - Pedido #442", type: 'DELIVERY', status: 'ACTIVO', entryTime: '11:15 AM' },
    { id: '3', name: "Elena Rodríguez", type: 'OCASIONAL', status: 'PROGRAMADO', scheduledDate: 'Hoy, 4:00 PM' },
    { id: '4', name: "Marco Tulio", type: 'FRECUENTE', status: 'SALIDA', entryTime: '08:00 AM' },
  ]);

  useEffect(() => {
    // Load local storage data
    const savedPic = localStorage.getItem("conjunto_app_profile_pic");
    if (savedPic) setProfilePic(savedPic);

    const savedData = localStorage.getItem("conjunto_app_profile_data");
    if (savedData) {
      try { setUserData(JSON.parse(savedData)); } catch (e) { console.error(e); }
    }

    const savedStory = localStorage.getItem("conjunto_app_user_story");
    if (savedStory) {
       const storyData = JSON.parse(savedStory);
       const now = new Date().getTime();
       if (now < storyData.expiresAt) setHasStory(true);
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 30 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.6, 
          stagger: 0.1,
          ease: "power3.out" 
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleCreateInvitation = () => {
    if (!newVisitForm.name) {
      toast.error("Por favor ingresa el nombre del invitado");
      return;
    }
    setIsQRModalOpen(true);
    toast.success("¡Código QR generado con éxito!");
  };



  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      
      {/* BACKGROUND AMBIENT GLOW */}
      <div className="fixed top-[-10%] right-[-10%] w-full h-[50%] bg-[#4C1D95]/10 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-full h-[50%] bg-[#BE185D]/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

      {/* 1. HEADER (ESTILO INICIO) */}
      <section className="fade-up flex justify-between items-center relative z-20">
        <div className="flex items-center gap-4 group cursor-pointer active:scale-95 transition-transform" onClick={() => router.push('/perfil')}>
           <div className={`w-14 h-14 rounded-full p-[3px] transition-all duration-500 relative ${hasStory ? 'liquid-story-ring' : 'border border-white/20 bg-white/5'}`}>
              <div className="w-full h-full rounded-full overflow-hidden border border-white/10 shadow-2xl relative z-10">
                 <Image 
                    src={profilePic} 
                    alt="Profile" 
                    width={56} 
                    height={56} 
                    className="w-full h-full object-cover" 
                    priority
                    unoptimized={profilePic.startsWith('data:')}
                 />
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

          {isNotificationsOpen && (
            <div className="absolute top-14 right-0 w-[280px] liquid-glass backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden z-200 animate-in fade-in zoom-in-95 duration-200">
               <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                  <span className="text-sm font-bold text-white tracking-wide">Notificaciones</span>
               </div>
               <div className="flex flex-col max-h-[300px] overflow-y-auto hide-scrollbar">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="w-full px-5 py-4 flex items-start gap-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 relative group">
                       <div className="mt-0.5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-accent">
                          {notif.icon}
                       </div>
                       <div className="flex flex-col flex-1">
                          <span className="text-xs font-bold text-white mb-0.5">{notif.title}</span>
                          <p className="text-[10px] text-white/50 leading-snug">{notif.desc}</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. SUMMARY CARDS */}
      <section className="grid grid-cols-2 gap-4 fade-up">
        <div className="liquid-glass-card p-5 rounded-[28px] border-t border-white/10 flex flex-col gap-3">
          <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-400">
            <User size={20} />
          </div>
          <div>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">En casa</span>
            <p className="text-2xl font-bold text-white tracking-tight">02</p>
          </div>
        </div>
        <div className="liquid-glass-card p-5 rounded-[28px] border-t border-white/10 flex flex-col gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
            <Calendar size={20} />
          </div>
          <div>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Agendadas</span>
            <p className="text-2xl font-bold text-white tracking-tight">01</p>
          </div>
        </div>
      </section>

      {/* 3. NEW VISIT ACTION */}
      <section className="fade-up liquid-glass-card p-6 rounded-[32px] border border-white/10 relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[60px] rounded-full -z-10 group-hover:bg-accent/20 transition-all" />
         
         <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-[18px] bg-accent flex items-center justify-center text-white shadow-[0_8px_20px_rgba(217,70,239,0.4)]">
                  <UserPlus size={24} />
               </div>
               <div>
                  <h3 className="text-white font-bold text-lg leading-tight">Nueva Invitación</h3>
                  <p className="text-white/40 text-xs">Genera un QR para tu visita en segundos.</p>
               </div>
            </div>

            <div className="flex flex-col gap-4">
               <input 
                 type="text" 
                 placeholder="Nombre del Invitado"
                 className="w-full bg-[#1a1333]/50 border border-white/10 rounded-2xl py-4 px-5 text-sm text-white focus:outline-hidden focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all outline-none"
                 value={newVisitForm.name}
                 onChange={(e) => setNewVisitForm({...newVisitForm, name: e.target.value})}
               />
               
               <div className="flex gap-2">
                  {['OCASIONAL', 'FRECUENTE', 'DELIVERY'].map((type) => (
                    <button 
                      key={type}
                      onClick={() => setNewVisitForm({...newVisitForm, type: type as 'OCASIONAL' | 'FRECUENTE' | 'DELIVERY'})}
                      className={`flex-1 py-3.5 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all ${newVisitForm.type === type ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      {type}
                    </button>
                  ))}
               </div>

               <button 
                 onClick={handleCreateInvitation}
                 className="w-full bg-linear-to-r from-accent to-purple-600 py-4 rounded-[22px] font-bold text-white shadow-xl shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
               >
                 Generar Código QR <QrCode size={20} />
               </button>
            </div>
         </div>
      </section>

      {/* 4. VISITOR LISTS */}
      <section className="fade-up flex flex-col gap-6">
         <div className="flex justify-between items-center px-1">
            <h2 className="text-white font-display text-lg font-bold tracking-tight">Activos en el Conjunto</h2>
            <div className="flex items-center gap-1.5 text-green-400 text-[10px] font-bold uppercase tracking-widest border border-green-500/20 bg-green-500/5 px-3 py-1.5 rounded-full">
               <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
               Tiempo Real
            </div>
         </div>

         <div className="flex flex-col gap-4">
            {visitors.filter(v => v.status === 'ACTIVO').map((visitor) => (
              <div key={visitor.id} className="liquid-glass-card rounded-[28px] p-5 flex items-center justify-between border border-white/5 hover:border-white/15 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative">
                     <User size={28} className="text-white/20" />
                     <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full border-2 border-[#0d041a] flex items-center justify-center">
                        <CheckCircle2 size={12} className="text-white" />
                     </div>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base leading-none mb-1.5">{visitor.name}</h4>
                    <div className="flex items-center gap-3">
                       <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${visitor.type === 'DELIVERY' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                          {visitor.type}
                       </span>
                       <div className="flex items-center gap-1 text-white/30 text-[10px]">
                          <Clock size={12} />
                          <span>Ingresó {visitor.entryTime}</span>
                       </div>
                    </div>
                  </div>
                </div>
                <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all ring-1 ring-white/10">
                   <MoreHorizontal size={20} />
                </button>
              </div>
            ))}
         </div>
      </section>

      {/* 5. HISTORY OR SCHEDULED */}
      <section className="fade-up flex flex-col gap-6">
         <div className="flex justify-between items-center px-1">
            <h2 className="text-white font-display text-lg font-bold tracking-tight">Programadas & Historial</h2>
            <button className="text-white/40 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">Ver Todo</button>
         </div>

         <div className="flex flex-col gap-3">
            {visitors.filter(v => v.status !== 'ACTIVO').map((visitor) => (
              <div key={visitor.id} className="liquid-glass-card rounded-[24px] p-4 flex items-center justify-between border border-white/5 opacity-80 hover:opacity-100 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${visitor.status === 'PROGRAMADO' ? 'bg-accent/10 text-accent' : 'bg-white/5 text-white/40'}`}>
                    {visitor.status === 'PROGRAMADO' ? <Calendar size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <h4 className="text-white font-semibold text-sm leading-tight">{visitor.name}</h4>
                    <p className="text-white/30 text-[10px] mt-0.5">
                      {visitor.status === 'PROGRAMADO' ? `Llega ${visitor.scheduledDate}` : `Salió ${visitor.entryTime}`}
                    </p>
                  </div>
                </div>
                {visitor.status === 'PROGRAMADO' ? (
                   <button 
                     onClick={() => { setIsQRModalOpen(true); }}
                     className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-bold hover:bg-accent hover:text-white hover:border-accent transition-all"
                   >
                     REENVIAR QR
                   </button>
                ) : (
                   <button className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                      <ArrowRight size={16} />
                   </button>
                )}
              </div>
            ))}
         </div>
      </section>

      {/* MODAL: QR INVITATION */}
      {isQRModalOpen && (
        <div className="fixed inset-0 z-200 flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsQRModalOpen(false)} />
           
           <div className="relative w-full max-w-sm liquid-glass-card rounded-[40px] border border-white/20 shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-400">
              <div className="p-8 flex flex-col items-center gap-6">
                 <div className="w-full flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                       <ShieldCheck size={18} className="text-green-400" />
                       <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Acceso Seguro</span>
                    </div>
                    <button onClick={() => setIsQRModalOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-white/10">
                       <Plus className="rotate-45" size={20} />
                    </button>
                 </div>

                 <div className="flex flex-col items-center text-center gap-2">
                    <h3 className="text-2xl font-display font-bold text-white tracking-tight">Invitación Digital</h3>
                    <p className="text-white/50 text-xs px-4">Comparte este código con tu invitado para agilizar su ingreso.</p>
                 </div>

                 <div className="relative p-6 bg-white rounded-3xl shadow-[0_0_40px_rgba(255,255,255,0.1)] group">
                    <div className="w-48 h-48 bg-gray-50 flex items-center justify-center rounded-2xl border-4 border-white overflow-hidden">
                       <QrCode size={160} className="text-[#1a0b2e]" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                       <div className="w-12 h-12 bg-[#1a0b2e] rounded-xl flex items-center justify-center text-white shadow-xl">
                          <CheckCircle2 size={24} className="text-green-400" />
                       </div>
                    </div>
                 </div>

                 <div className="w-full flex flex-col gap-4">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                       <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Invitado</span>
                       <p className="text-white font-bold text-lg">{newVisitForm.name || "Invitado Especial"}</p>
                       <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 size={14} className="text-accent" />
                          <span className="text-[10px] text-accent font-bold uppercase tracking-wider">Pase de tipo {newVisitForm.type}</span>
                       </div>
                    </div>

                    <div className="flex gap-3">
                       <button className="flex-1 bg-white/10 hover:bg-white/20 py-4 rounded-2xl font-bold text-white text-sm transition-all flex items-center justify-center gap-2">
                          <Download size={18} /> Guardar
                       </button>
                       <button className="flex-1 bg-[#25D366] hover:brightness-110 py-4 rounded-2xl font-bold text-white text-sm transition-all shadow-lg flex items-center justify-center gap-2">
                          <Share2 size={18} /> WhatsApp
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

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

"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Bell, CheckCircle2, Package, AlertTriangle } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

interface ProfileHeaderProps {
  className?: string;
  showWelcome?: boolean;
}

export default function ProfileHeader({ className = "", showWelcome = true }: ProfileHeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === "/perfil";
  const userId = session?.user?.id;
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  const [profilePic, setProfilePic] = useState<string>("https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1000");
  const [userData, setUserData] = useState({ name: "Cargando...", gender: "femenino" });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasStory, setHasStory] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!userId) return;
      
      // Intentar cargar de LocalStorage primero para velocidad instantánea
      const savedPic = localStorage.getItem(`conjunto_app_profile_pic_${userId}`);
      const savedData = localStorage.getItem(`conjunto_app_profile_data_${userId}`);
      if (savedPic) setProfilePic(savedPic);
      if (savedData) setUserData(JSON.parse(savedData));

      try {
        const fetchRes = await fetch("/api/user/profile", { cache: 'no-store' });
        const res = await fetchRes.json();
        
        if (res.success && res.data) {
          const u = res.data;
          const mapped = { name: u.nombre, gender: u.genero || "femenino" };
          setUserData(mapped);
          if (u.avatar) setProfilePic(u.avatar);
          
          localStorage.setItem(`conjunto_app_profile_data_${userId}`, JSON.stringify(mapped));
          if (u.avatar) localStorage.setItem(`conjunto_app_profile_pic_${userId}`, u.avatar);
        }
      } catch (error) {
        console.warn("⚠️ Error syncing profile header:", error);
      }
    }

    if (session) loadData();

    // Lógica de Story (Cartelera activa)
    const savedStory = localStorage.getItem("conjunto_app_active_story");
    if (savedStory) {
      const { createdAt } = JSON.parse(savedStory);
      if (Date.now() - createdAt < 24 * 60 * 60 * 1000) setHasStory(true);
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [session, userId]);

  const notifications = [
    { id: 1, title: "Pago Recibido", desc: "Administración Abril 2026 procesada.", time: "Hace 5m", icon: <CheckCircle2 size={14} />, color: "text-emerald-400", isUnread: true },
    { id: 2, title: "Paquete en Portería", desc: "Tienes un envío esperando.", time: "Hace 1h", icon: <Package size={14} />, color: "text-amber-400", isUnread: true },
    { id: 3, title: "Mantenimiento", desc: "Lavado de tanques mañana.", time: "Hace 2h", icon: <AlertTriangle size={14} />, color: "text-primary", isUnread: false },
  ];

  return (
    <header className={`flex justify-between items-center relative z-50 ${className}`}>
      <div 
        onClick={() => !isProfilePage && router.push("/perfil")}
        className={`flex items-center gap-4 transition-transform ${isProfilePage ? 'cursor-default transition-none' : 'group cursor-pointer active:scale-95'}`}
      >
        <div className={`w-14 h-14 rounded-full p-[3px] transition-all duration-500 relative ${hasStory ? 'liquid-story-ring' : 'border border-white/20 bg-white/5'}`}>
          <div className="w-full h-full rounded-full overflow-hidden relative shadow-xl backdrop-blur-xl">
            <Image src={profilePic} alt="User Avatar" width={56} height={56} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" unoptimized />
            <div className="absolute inset-0 border border-white/10 rounded-full pointer-events-none" />
          </div>
          {hasStory && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-[#0d041a] z-20 flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
          )}
        </div>
        <div className="flex flex-col">
          {showWelcome && (
            <div className="flex items-center gap-1.5 leading-none mb-1">
              <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">
                {userData.gender === 'masculino' ? 'Bienvenido' : userData.gender === 'neutro' ? 'Bienvenide' : 'Bienvenida'} 👋
              </span>
            </div>
          )}
          <h1 className="text-white text-xl font-display font-bold tracking-tight text-glow leading-none">{userData.name || 'Residente'}</h1>
        </div>
      </div>

      <div className="relative" ref={notificationsRef}>
        <button 
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl group border border-white/10 active:scale-95 ${isNotificationsOpen ? 'bg-accent text-white border-accent/50' : 'liquid-glass text-white/80 hover:text-white'}`}
        >
          <Bell size={22} />
          <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 bg-accent rounded-full border-2 border-[#1a0b2e] shadow-[0_0_10px_rgba(217,70,239,0.8)]"></span>
        </button>

        {isNotificationsOpen && (
          <div className="absolute top-14 right-0 w-[280px] liquid-glass backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden z-100 animate-in fade-in zoom-in-95 duration-200">
             <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                <span className="text-sm font-bold text-white tracking-wide">Notificaciones</span>
                <button className="text-[10px] text-accent font-bold uppercase hover:underline">Limpiar</button>
             </div>
             <div className="flex flex-col max-h-[300px] overflow-y-auto hide-scrollbar">
                {notifications.map((notif) => (
                  <div key={notif.id} className="w-full px-5 py-3.5 flex items-start gap-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 relative">
                     {notif.isUnread && <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent"></span>}
                     <div className={`mt-0.5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center ${notif.color}`}>
                        {notif.icon}
                     </div>
                     <div className="flex flex-col flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                           <span className="text-[11px] font-bold text-white">{notif.title}</span>
                           <span className="text-[8px] text-white/30">{notif.time}</span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-tight">{notif.desc}</p>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .liquid-story-ring {
          position: relative;
          background: linear-gradient(45deg, #D946EF, #8B5CF6, #D946EF);
          background-size: 200% 200%;
          animation: story-bg 5s infinite linear;
          padding: 3px;
        }
        @keyframes story-bg {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .text-glow { text-shadow: 0 0 20px rgba(217,70,239,0.5); }
      `}</style>
    </header>
  );
}

"use client";

import { AlertTriangle, Bell, CheckCircle2, Package } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import type { NotificacionDto, ProfileResponse } from "@/lib/api/types";
import { toast } from "sonner";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { getNotifTarget } from "@/lib/notif-routing";

interface ProfileHeaderProps {
  className?: string;
  showWelcome?: boolean;
}

export default function ProfileHeader({ className = "", showWelcome = true }: ProfileHeaderProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === "/perfil";
  const userId = user?.id;
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  const [profilePic, setProfilePic] = useState<string>("https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1000");
  const [userData, setUserData] = useState({ name: "Cargando...", gender: "femenino" });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasStory, setHasStory] = useState(false);
  const [notifications, setNotifications] = useState<NotificacionDto[]>([]);

  const refetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const notifData = await api.get<NotificacionDto[]>('/notificaciones');
      if (notifData) {
        setNotifications(notifData);
        const unreadCount = notifData.filter((n) => !n.leida).length;
        setHasStory(unreadCount > 0);
      }
    } catch {}
  }, [userId]);

  // Real-time WebSocket subscription
  useWsSubscription('notification', () => refetchNotifications());

  useEffect(() => {
    const MAX_RETRIES = 2;
    let currentRetry = 0;

    async function loadData() {
      if (!userId) return;
      
      const savedPic = localStorage.getItem(`conjuntos_profile_pic_${userId}`);
      const savedData = localStorage.getItem(`conjuntos_profile_data_${userId}`);
      if (savedPic) setProfilePic(savedPic);
      if (savedData) setUserData(JSON.parse(savedData));

      try {
        const [profileData, notifData, reservaData] = await Promise.all([
          api.get<ProfileResponse>('/usuarios/me/profile').catch((e) => {
            if (e instanceof ApiError && e.status === 401 && currentRetry < MAX_RETRIES) {
              currentRetry++;
              setTimeout(loadData, 1000);
            }
            return null;
          }),
          api.get<NotificacionDto[]>('/notificaciones').catch(() => null),
          api.get<{ fechaInicio: string; fechaFin: string; estado: string }[]>('/reservas').catch(() => null),
        ]);

        if (profileData) {
          const u = profileData;
          const mapped = { name: u.nombre || (user?.rol === 'HUESPED_TEMPORAL' ? 'Huésped' : 'Residente'), gender: u.genero || "neutro" };
          setUserData(mapped);
          if (u.avatar) setProfilePic(u.avatar);
          localStorage.setItem(`conjuntos_profile_data_${userId}`, JSON.stringify(mapped));
          if (u.avatar) localStorage.setItem(`conjuntos_profile_pic_${userId}`, u.avatar);
        }

        let pendingCount = 0;
        if (notifData) {
          setNotifications(notifData);
          pendingCount = notifData.filter((n) => !n.leida).length;
        }

        let activeReserva = false;
        if (reservaData) {
          const now = new Date();
          activeReserva = reservaData.some((r) => {
            const start = new Date(r.fechaInicio);
            const end = new Date(r.fechaFin);
            return now >= start && now <= end && r.estado !== "CANCELADA";
          });
        }

        setHasStory(pendingCount > 0 || activeReserva);

      } catch {
        // Non-critical: profile status API unavailable
      }
    }

    if (!authLoading && userId) {
      loadData();
    }

    // Lógica de Story (Cartelera activa)
    const savedStory = localStorage.getItem("conjunto_app_active_story");
    if (savedStory) {
      try {
        const { createdAt } = JSON.parse(savedStory);
        if (Date.now() - createdAt < 24 * 60 * 60 * 1000) setHasStory(true);
      } catch {
        // Ignore corrupt story data
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [authLoading, userId]);

  const getNotifIcon = (tipo: string) => {
    switch (tipo) {
      case 'APROBACION':
        return { icon: <CheckCircle2 size={14} />, color: "text-text bg-text/10" };
      case 'SISTEMA':
        return { icon: <AlertTriangle size={14} />, color: "text-text bg-text/10" };
      case 'PAQUETE':
        return { icon: <Package size={14} />, color: "text-accent bg-accent/10" };
      case 'INFO':
      default:
        return { icon: <Bell size={14} />, color: "text-accent bg-accent/10" };
    }
  };

  // Marca como leída y navega al destino correspondiente.
  const handleNotifClick = async (notif: NotificacionDto) => {
    const destino = getNotifTarget(notif, user?.rol);
    markAsRead(notif.id);
    setIsNotificationsOpen(false);
    router.push(destino);
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.put('/notificaciones/leidas', { ids: [id] });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, leida: true } : n))
      );
      const updated = notifications.map(n => (n.id === id ? { ...n, leida: true } : n));
      const unreadCount = updated.filter(n => !n.leida).length;
      setHasStory(unreadCount > 0);
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const clearAllNotifications = async () => {
    try {
      const unread = notifications.filter(n => !n.leida);
      if (unread.length === 0) return;
      const ids = unread.map(n => n.id);
      await api.put('/notificaciones/leidas', { ids });
      setNotifications(prev => prev.map(n => ({ ...n, leida: true })));
      setHasStory(false);
      toast.success("Notificaciones marcadas como leídas");
    } catch (err) {
      console.error("Error clearing notifications:", err);
    }
  };

  return (
    <header className={`flex justify-between items-center relative z-50 ${className}`}>
      <div 
        onClick={() => !isProfilePage && router.push("/perfil")}
        className={`flex items-center gap-4 transition-transform ${isProfilePage ? 'cursor-default transition-none' : 'group cursor-pointer active:scale-95'}`}
      >
        <div className={`w-14 h-14 rounded-full p-[3px] transition-all duration-500 relative liquid-status-halo`}>
          <div className="w-full h-full rounded-full overflow-hidden relative shadow-xl backdrop-blur-xl z-20">
            <Image src={profilePic} alt="User Avatar" width={56} height={56} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" unoptimized />
            <div className="absolute inset-0 border border-border rounded-full pointer-events-none" />
          </div>
          {hasStory && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#EF4444] rounded-full border-2 border-primary z-30 flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.8)]">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
          )}
        </div>
        <div className="flex flex-col">
          {showWelcome && (
            <div className="flex items-center gap-1.5 leading-none mb-1">
              <span className="text-text text-[10px] font-bold uppercase tracking-widest">
                {userData.gender === 'masculino' ? 'Bienvenido' : userData.gender === 'neutro' ? 'Bienvenide' : 'Bienvenida'} 👋
              </span>
            </div>
          )}
          <h1 className="text-text text-xl font-display font-bold tracking-tight text-glow leading-none">{userData.name || 'Residente'}</h1>
        </div>
      </div>

      <div className="relative" ref={notificationsRef}>
        <button 
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl group border border-border active:scale-95 ${isNotificationsOpen ? 'bg-accent text-on-accent border-accent/50' : 'liquid-glass text-text hover:text-text'}`}
        >
          <Bell size={22} />
          {notifications.some(n => !n.leida) && (
            <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 bg-[#EF4444] rounded-full border-2 border-primary shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse"></span>
          )}
        </button>

        {isNotificationsOpen && (
          <div className="absolute top-14 right-0 w-[280px] liquid-glass backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-border overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-200">
             <div className="p-4 border-b border-border bg-surface/50 flex justify-between items-center">
                <span className="text-sm font-bold text-text tracking-wide">Notificaciones</span>
                <button onClick={clearAllNotifications} className="text-[10px] text-accent font-bold uppercase hover:underline">Limpiar</button>
             </div>
             <div className="flex flex-col max-h-[300px] overflow-y-auto hide-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-text">
                    No tienes notificaciones
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const iconStyle = getNotifIcon(notif.tipo);
                    return (
                      <div 
                        key={notif.id} 
                        onClick={() => handleNotifClick(notif)}
                        className={`w-full px-5 py-3.5 flex items-start gap-4 hover:bg-text/5 transition-colors border-b border-border last:border-0 relative cursor-pointer ${notif.leida ? 'opacity-60' : ''}`}
                      >
                        {!notif.leida && <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.7)]"></span>}
                        <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${iconStyle.color}`}>
                           {iconStyle.icon}
                        </div>
                        <div className="flex flex-col flex-1">
                           <div className="flex justify-between items-center mb-0.5">
                              <span className="text-[11px] font-bold text-text">{notif.titulo}</span>
                              <span className="text-[8px] text-text">{formatTime(notif.createdAt)}</span>
                           </div>
                           <p className="text-[10px] text-text leading-tight">{notif.mensaje}</p>
                        </div>
                      </div>
                    );
                  })
                )}
             </div>
          </div>
        )}
      </div>
    </header>
  );
}

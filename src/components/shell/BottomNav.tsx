"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DollarSign, Building2, Home, Map, Package, Phone, Ticket, User, Users, MessageCircle, Scale } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// BUILD_REVISION: 1.2.0 - MANDATORY ICON: Building2 (Buildings)
export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.rol;

  // Custom icons mapping based on the role
  let tabs = [];
  
  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') {
    tabs = [
      { name: "Panel", path: "/vigilancia", icon: Home },
      { name: "Citofonía", path: "/citofonia", icon: Phone },
      { name: "Visitas", path: "/control-visitas", icon: Users },
      { name: "Paquetes", path: "/paqueteria", icon: Package },
      { name: "Perfil", path: "/perfil", icon: User },
    ];
  } else if (role === 'ENCARGADO_PARQUEADERO') {
    tabs = [
      { name: "Control", path: "/inicio", icon: Home },
      { name: "Mapa", path: "/mapa-parqueadero", icon: Map },
      { name: "Perfil", path: "/perfil", icon: User },
    ];
   } else if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN' || role === 'CONCEJO') {
    tabs = [
      { name: "Panel", path: "/inicio", icon: Home },
      { name: "Mensajes", path: "/admin-mensajes", icon: MessageCircle },
      { name: "Novedades", path: "/admin-novedades", icon: Building2 },
      { name: "Comité", path: "/comite-convivencia", icon: Scale },
      { name: "Finanzas", path: "/admin-finanzas", icon: DollarSign },
      { name: "Perfil", path: "/perfil", icon: User },
    ];
  } else if (role === 'PROPIETARIO') {
    tabs = [
      { name: "Inicio", path: "/inicio", icon: Home },
      { name: "Citofonía", path: "/citofonia", icon: Phone }, 
      { name: "Inmobiliaria", path: "/inmobiliaria", icon: Building2 },
      { name: "Pases", path: "/pases-temporales", icon: Ticket },
      { name: "Perfil", path: "/perfil", icon: User },
    ];
  } else if (role === 'HUESPED_TEMPORAL') {
    tabs = [
      { name: "Estancia", path: "/mi-estancia", icon: Home },
      { name: "Citofonía", path: "/citofonia", icon: Phone },
      { name: "Chat", path: "/chat", icon: MessageCircle },
      { name: "Perfil", path: "/perfil", icon: User },
    ];
  } else if (role === 'ADMINISTRADOR_PISCINA' || role === 'ADMINISTRADOR_GYM' || role === 'MANTENIMIENTO_LOCATIVO' || role === 'OPERARIO_LIMPIEZA') {
    tabs = [
      { name: "Inicio", path: "/inicio", icon: Home },
      { name: "Perfil", path: "/perfil", icon: User },
    ];
  } else {
    // RESIDENTES por defecto
    tabs = [
      { name: "Inicio", path: "/inicio", icon: Home },
      { name: "Citofonía", path: "/citofonia", icon: Phone }, 
      { name: "Inmobiliaria", path: "/inmobiliaria", icon: Building2 },
      { name: "Perfil", path: "/perfil", icon: User },
    ];
  }

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] w-[92%] max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div 
        className="liquid-glass rounded-[35px] w-full flex justify-between items-center p-2.5 relative shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-2xl"
      >
        {tabs.map((tab) => {
          const isActive = pathname.includes(tab.path);
          const Icon = tab.icon;
          
          return (
            <Link 
              key={tab.path} 
              href={tab.path}
              className={`relative flex items-center justify-center transition-all duration-300 rounded-full h-[52px] group
                ${isActive ? 'w-[120px] nav-active-glass px-4' : 'w-[52px] bg-text/5 border border-border/30 hover:bg-text/10 mx-1'}
              `}
            >
              <div className="flex items-center gap-2 relative z-10 w-full justify-center">
                <Icon 
                  size={20} 
                  className={`transition-colors duration-300 ${isActive ? '!text-white' : 'text-[#009df2] group-hover:text-[#57bf00]'}`} 
                  strokeWidth={isActive ? 2.5 : 2}
                />
                
                {/* Text only for active state */}
                {isActive && (
                  <span className="text-[13px] font-bold text-white whitespace-nowrap overflow-hidden">
                    {tab.name}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  );
}

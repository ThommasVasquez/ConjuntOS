"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { 
  ChevronLeft, Bell, Search, MoreHorizontal,
  LogOut
} from "lucide-react";

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getPageTitle = (path: string) => {
    if (path.includes("reservas")) return "Reservas";
    if (path.includes("pagos")) return "Pagos";
    if (path.includes("cartelera")) return "Cartelera";
    if (path.includes("inmobiliaria")) return "Inmobiliaria";
    if (path.includes("perfil")) return "Mi Perfil";
    return "Bienvenido";
  };
  
  const title = getPageTitle(pathname);

  useEffect(() => {
    if (titleRef.current) {
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: -5 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }
      );
    }
  }, [pathname]);

  const isHome = pathname === "/inicio" || pathname === "/";
  const isHideTopBar = true; // All screens now use their own dedicated header layout (like ProfileHeader) directly.

  return (
    <header className={`fixed top-0 w-full max-w-[430px] z-100 flex items-start justify-between px-6 pt-10 pb-4 bg-gradient-to-b from-primary/90 to-transparent transition-all duration-500 ${isHideTopBar ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
      
      {/* Título en la Izquierda (Glass Style) */}
      <div className="flex flex-col">
        <div className="flex items-center text-[10px] text-text-muted mb-0.5">
           Tu Conjunto <ChevronLeft size={10} className="ml-1 -rotate-90"/>
        </div>
        <div className="flex items-center gap-3">
          {!isHome && (
            <button onClick={() => router.back()} className="text-text hover:text-accent transition-colors animate-fade-in" aria-label="Volver atrás">
              <ChevronLeft size={24} />
            </button>
          )}
          <h1 
            ref={titleRef}
            className="text-text font-display font-semibold text-2xl tracking-wide text-glow"
            style={{ viewTransitionName: 'page-title' }}
          >
            {title}
          </h1>
        </div>
      </div>
      
      {/* Botones Flotantes Circulares Liquid Glass */}
      <div className="flex items-center gap-3">
        <button className="w-10 h-10 rounded-full liquid-glass flex items-center justify-center text-text hover:text-text hover:scale-105 active:scale-95 transition-all shadow-accent/20">
          <Search size={18} />
        </button>
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="relative w-10 h-10 rounded-full liquid-glass flex items-center justify-center text-text hover:text-text hover:scale-105 active:scale-95 transition-all shadow-accent/20"
          >
            <MoreHorizontal size={20} />
            {/* Badge sutil */}
            <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-accent rounded-full border border-primary animate-pulse"></span>
          </button>
          
          {/* Dropdown Menu Dinámico */}
          {dropdownOpen && (
            <div className="absolute top-12 right-0 w-48 bg-[#1a1a2e] backdrop-blur-3xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {pathname === "/perfil" ? (
                <>
                  <button onClick={() => { router.push('?modal=edit'); setDropdownOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-text hover:bg-text/10 transition-colors border-b border-border flex items-center gap-2">
                    Editar Perfil
                  </button>
                  <button onClick={() => setDropdownOpen(false)} className="w-full text-left px-4 py-3 text-sm text-text hover:bg-text/10 transition-colors border-b border-border flex items-center gap-2">
                    Privacidad
                  </button>
                  <button onClick={async () => {
                    setDropdownOpen(false);
                    await logout();
                    router.push("/login");
                    toast.success("¡Hasta pronto!");
                  }} className="w-full text-left px-4 py-3 text-sm text-text hover:bg-text/10 transition-colors flex items-center gap-2">
                    <LogOut size={14} /> Cerrar Sesión
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setDropdownOpen(false)} className="w-full text-left px-4 py-3 text-sm text-text hover:bg-text/10 transition-colors border-b border-border flex items-center gap-2">
                    <Bell size={14} /> Notificaciones
                  </button>
                  <button onClick={() => setDropdownOpen(false)} className="w-full text-left px-4 py-3 text-sm text-text hover:bg-text/10 transition-colors flex items-center gap-2">
                    Soporte Técnico
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

    </header>
  );
}

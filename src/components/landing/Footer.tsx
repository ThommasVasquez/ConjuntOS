"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";

export default function Footer() {
  const { navigate } = useViewTransition();

  return (
    <footer className="bg-[#05020a] text-white pt-24 overflow-hidden relative border-t border-white/5">
      {/* Background Orbs */}
      <div className="absolute bottom-0 right-[-10%] w-[500px] h-[500px] bg-[#4C1D95]/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-24 relative z-10">
        
        {/* Left Col */}
        <div className="col-span-1 md:col-span-2">
          <p className="text-white/50 max-w-sm mb-8 text-sm leading-relaxed font-light">
            Gestión residencial de alta definición. Transparencia, seguridad y comunidad perfectamente integradas en un ecosistema que eleva tu calidad de vida.
          </p>
          <div className="flex gap-2 max-w-md">
            <input 
              type="email" 
              placeholder="tu@email.com" 
              className="bg-white/5 border border-white/10 rounded-full px-6 py-3.5 text-sm text-white focus:outline-hidden focus:border-accent/40 focus:ring-4 focus:ring-accent/5 w-64 shadow-inner placeholder:text-white/20"
            />
            <button className="bg-accent text-white px-6 py-3.5 rounded-full text-sm font-bold hover:bg-accent/80 hover:shadow-[0_0_15px_rgba(217,70,239,0.3)] transition-all active:scale-95 cursor-pointer">
              Suscribirse
            </button>
          </div>
        </div>

        {/* Links */}
        <div>
          <h4 className="font-bold mb-6 font-[family-name:var(--font-montserrat)] text-white/90">Plataforma</h4>
          <ul className="space-y-4 text-sm text-white/50 font-light">
            <li><button onClick={() => navigate("/")} className="hover:text-accent transition-colors cursor-pointer">Inicio</button></li>
            <li><button onClick={() => navigate("/login")} className="hover:text-accent transition-colors cursor-pointer">Acceso Residentes</button></li>
            <li><button onClick={() => navigate("/login")} className="hover:text-accent transition-colors cursor-pointer">Panel Admin</button></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-6 font-[family-name:var(--font-montserrat)] text-white/90">Compañía</h4>
          <ul className="space-y-4 text-sm text-white/50 font-light">
            <li><a href="#" className="hover:text-accent transition-colors">Acerca de</a></li>
            <li><a href="#" className="hover:text-accent transition-colors">Contacto</a></li>
            <li><a href="#" className="hover:text-accent transition-colors">Privacidad</a></li>
          </ul>
        </div>
      </div>

      {/* Massive Typography matching "Nestery" reference */}
      <div className="w-full flex justify-center overflow-hidden translate-y-12 select-none pointer-events-none">
        <h1 
          className="text-[20vw] font-black leading-none tracking-tighter text-white/[0.015] font-[family-name:var(--font-montserrat)] uppercase select-none"
          style={{ letterSpacing: "-0.05em" }}
        >
          CONJUNTOS
        </h1>
      </div>

      {/* Very bottom bar */}
      <div className="border-t border-white/5 py-6 px-6 relative z-10 bg-[#05020a]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-white/30">
          <p>© {new Date().getFullYear()} ENERGYSOFTmedia. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0 font-light">
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

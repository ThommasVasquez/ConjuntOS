"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";

export default function Footer() {
  const { navigate } = useViewTransition();

  return (
    <footer className="bg-[#05020a] text-white pt-24 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-24 relative z-10">
        
        {/* Left Col */}
        <div className="col-span-1 md:col-span-2">
          <p className="text-gray-400 max-w-sm mb-8 text-sm leading-relaxed">
            Gestión residencial de alta definición. Transparencia, seguridad y comunidad perfectamente integradas en un ecosistema que eleva tu calidad de vida.
          </p>
          <div className="flex gap-2">
            <input 
              type="email" 
              placeholder="tu@email.com" 
              className="bg-white/10 border border-white/20 rounded-full px-6 py-3 text-sm text-white focus:outline-none focus:border-[#D946EF] w-64"
            />
            <button className="bg-white text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-[#D946EF] hover:text-white transition-colors">
              Suscribirse
            </button>
          </div>
        </div>

        {/* Links */}
        <div>
          <h4 className="font-bold mb-6 font-[family-name:var(--font-montserrat)]">Plataforma</h4>
          <ul className="space-y-4 text-sm text-gray-400">
            <li><button onClick={() => navigate("/")} className="hover:text-white transition-colors">Inicio</button></li>
            <li><button onClick={() => navigate("/login")} className="hover:text-white transition-colors">Acceso Residentes</button></li>
            <li><button onClick={() => navigate("/login")} className="hover:text-white transition-colors">Panel Admin</button></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-6 font-[family-name:var(--font-montserrat)]">Compañía</h4>
          <ul className="space-y-4 text-sm text-gray-400">
            <li><a href="#" className="hover:text-white transition-colors">Acerca de</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Contacto</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Privacidad</a></li>
          </ul>
        </div>
      </div>

      {/* Massive Typography matching "Nestery" reference */}
      <div className="w-full flex justify-center overflow-hidden translate-y-12">
        <h1 
          className="text-[20vw] font-bold leading-none tracking-tighter text-white/95 font-[family-name:var(--font-montserrat)]"
          style={{ letterSpacing: "-0.05em" }}
        >
          ConjuntOS
        </h1>
      </div>

      {/* Very bottom bar */}
      <div className="border-t border-white/10 py-6 px-6 relative z-10 bg-[#05020a]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} ENERGYSOFTmedia. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

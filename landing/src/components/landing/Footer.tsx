"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";

/**
 * Deliberately always-dark footer — bookends the dark intro heroes (DoorHero +
 * Hero) so the page reads dark → light → dark instead of dissolving into one
 * big white block before the footer. Uses explicit colors (not theme tokens)
 * because it stays dark in both themes.
 */
export default function Footer() {
  const { navigate } = useViewTransition();

  return (
    <footer className="bg-[#0A0A0A] text-white pt-24 overflow-hidden relative">
      {/* Background Orb */}
      <div className="absolute bottom-0 right-[-10%] w-[500px] h-[500px] bg-white/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-24 relative z-10">
        {/* Left Col */}
        <div className="col-span-1 md:col-span-2">
          <p className="text-white/70 max-w-sm mb-8 text-sm leading-relaxed font-light">
            Gestión residencial de alta definición. Transparencia, seguridad y comunidad perfectamente integradas en un ecosistema que eleva tu calidad de vida.
          </p>
          <div className="flex gap-2 max-w-md">
            <input
              type="email"
              placeholder="tu@email.com"
              className="bg-white/5 border border-white/15 rounded-full px-6 py-3.5 text-sm text-white focus:outline-hidden focus:border-white/40 focus:ring-4 focus:ring-white/5 w-64 shadow-inner placeholder:text-white/40"
            />
            <button className="bg-white text-black px-6 py-3.5 rounded-full text-sm font-bold hover:bg-white/90 transition-all active:scale-95 cursor-pointer">
              Suscribirse
            </button>
          </div>
        </div>

        {/* Links */}
        <div>
          <h4 className="font-bold mb-6 font-[family-name:var(--font-serif)] text-white">Plataforma</h4>
          <ul className="space-y-4 text-sm text-white/60 font-light">
            <li><a href="/" className="hover:text-white transition-colors">Inicio</a></li>
            <li><a href="https://app.conjuntos.app/login" className="hover:text-white transition-colors">Acceso Residentes</a></li>
            <li><a href="https://app.conjuntos.app/login" className="hover:text-white transition-colors">Panel Admin</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-6 font-[family-name:var(--font-serif)] text-white">Compañía</h4>
          <ul className="space-y-4 text-sm text-white/60 font-light">
            <li><a href="#" className="hover:text-white transition-colors">Acerca de</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Contacto</a></li>
            <li><button onClick={() => navigate("/privacidad")} className="hover:text-white transition-colors cursor-pointer">Política de Privacidad</button></li>
            <li><button onClick={() => navigate("/proteccion-datos")} className="hover:text-white transition-colors cursor-pointer">Protección de Datos</button></li>
          </ul>
        </div>
      </div>

      {/* Massive watermark typography */}
      <div className="w-full flex justify-center overflow-hidden translate-y-12 select-none pointer-events-none">
        <h1
          className="text-[20vw] font-black leading-none tracking-tighter text-white/[0.03] font-[family-name:var(--font-serif)] uppercase select-none"
          style={{ letterSpacing: "-0.05em" }}
        >
          CONJUNTOS
        </h1>
      </div>

      {/* Very bottom bar */}
      <div className="border-t border-white/10 py-6 px-6 relative z-10 bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-white/50">
          <p>© 2026 ENERGYSOFTmedia. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0 font-light">
            <button onClick={() => navigate("/proteccion-datos")} className="hover:text-white transition-colors cursor-pointer">Protección de Datos</button>
            <button onClick={() => navigate("/privacidad")} className="hover:text-white transition-colors cursor-pointer">Privacidad</button>
          </div>
        </div>
      </div>
    </footer>
  );
}

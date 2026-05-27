"use client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect } from "react";
import { gsap } from "gsap";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandedFooter } from "@/components/shell/BrandedFooter";
import { Shield, Mail, Lock, ArrowRight, Loader2, Star } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".liquid-login-card", 
        { y: 60, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 1.2, ease: "elastic.out(1, 0.75)" }
      );
      
      gsap.fromTo(".fade-in-element", 
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power3.out", delay: 0.4 }
      );

      gsap.to(".bg-glow-1", {
        x: '30%', y: '10%', duration: 15, repeat: -1, yoyo: true, ease: "sine.inOut"
      });
      gsap.to(".bg-glow-2", {
        x: '-20%', y: '-15%', duration: 12, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        throw new Error("El servidor no respondió correctamente.");
      }

      if (result && result.ok) {
        toast.success("¡Bienvenido! Sesión iniciada con éxito.");
        setTimeout(() => {
          router.push("/inicio");
          router.refresh();
        }, 1000);
      } else {
        toast.error(result?.error || "Error al iniciar sesión. Inténtalo de nuevo.");
      }
    } catch (error: any) {
      toast.error(error.message || "Error al conectar con la comunidad.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0D041A] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="bg-glow-1 absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="bg-glow-2 absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="liquid-login-card relative w-full max-w-md liquid-glass p-10 rounded-[48px] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.8)] backdrop-blur-3xl z-10 overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="text-center mb-10 flex flex-col items-center">
          <div className="fade-in-element w-16 h-16 bg-accent rounded-[24px] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(217,70,239,0.5)] border border-accent/50 rotate-6 hover:rotate-0 transition-transform duration-500">
             <Shield className="text-white" size={32} />
          </div>
          <h1 className="fade-in-element text-4xl font-display font-bold text-white tracking-tight text-glow mb-2">ConjuntOS</h1>
          <p className="fade-in-element text-white/50 text-sm font-medium tracking-wide">Tu comunidad, sincronizada en la nube.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="fade-in-element space-y-2">
            <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest ml-1">Email Residencial</label>
            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-accent transition-colors" size={20} />
              <input 
                type="text" 
                required
                autoComplete="username"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="ej: thommy" 
                className="w-full bg-white/5 border border-white/5 rounded-3xl py-4.5 pl-14 pr-6 text-sm text-white focus:outline-hidden focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="fade-in-element space-y-2">
            <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest ml-1 text-right">Contraseña</label>
            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-accent transition-colors" size={20} />
              <input 
                type="password" 
                required
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••" 
                className="w-full bg-white/5 border border-white/5 rounded-3xl py-4.5 pl-14 pr-6 text-sm text-white focus:outline-hidden focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="fade-in-element pt-4 relative group">
             <div className="absolute inset-x-0 bottom-1 blur-xl bg-accent opacity-0 group-hover:opacity-30 transition-opacity duration-500" />
             <button 
               type="submit" 
               disabled={isLoading}
               className="relative w-full bg-linear-to-r from-accent to-primary hover:scale-[1.02] active:scale-95 text-white font-bold py-5 rounded-3xl flex items-center justify-center gap-3 transition-all shadow-[0_15px_30px_rgba(217,70,239,0.3)] group cursor-pointer"
             >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={22} />
                ) : (
                  <>
                    <span>Entrar al Sistema</span>
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
             </button>
          </div>
        </form>

        <div className="fade-in-element mt-10 text-center space-y-4">
           <p className="text-white/30 text-[11px] flex items-center justify-center gap-2">
             <Star size={12} className="text-accent" /> Acceso exclusivo para residentes autorizados
           </p>
           <div className="flex justify-center gap-6">
              <button className="text-[10px] text-white/40 font-bold uppercase transition-colors tracking-widest">¿Olvidaste tu contraseña?</button>
           </div>
        </div>

        {/* INTRA-CARD BRANDING - Stage 28 */}
        <BrandedFooter isInternal className="pointer-events-none" />
      </div>

      <div className="absolute top-10 left-10 text-white/[0.03] text-[15vw] font-display font-black pointer-events-none select-none uppercase tracking-tighter leading-none h-[120px] overflow-hidden">
        CONJUNTOS
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .text-glow { text-shadow: 0 0 30px rgba(217,70,239,0.5); }
      `}} />
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { gsap } from "gsap";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
    // GSAP Entrance Animations
    const ctx = gsap.context(() => {
      gsap.fromTo(".liquid-login-card", 
        { y: 60, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 1.2, ease: "elastic.out(1, 0.75)" }
      );
      
      gsap.fromTo(".fade-in-element", 
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power3.out", delay: 0.4 }
      );

      // Ambient background movement
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
    console.log("🚀 Iniciando proceso de firma con Auth.js...");
    
    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      console.log("📥 Resultado de Auth.js:", result);

      if (result?.error) {
        console.error("❌ Error devuelto por Auth.js:", result.error);
        toast.error("Credenciales incorrectas. Prueba con: thommy@example.com / 123456");
      } else {
        console.log("🎉 Autenticación exitosa, redirigiendo...");
        toast.success("¡Bienvenido a ConjuntoApp!");
        router.push("/inicio");
        router.refresh();
      }
    } catch (err) {
      console.error("🔥 Error catastrófico en el cliente:", err);
      toast.error("Ocurrió un error al iniciar sesión");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0D041A] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      
      {/* Background Decorative Elements */}
      <div className="bg-glow-1 absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="bg-glow-2 absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Immersive Login Card */}
      <div className="liquid-login-card relative w-full max-w-md liquid-glass p-10 rounded-[48px] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.8)] backdrop-blur-3xl z-10 overflow-hidden">
        
        {/* Card Shine Effect */}
        <div className="absolute inset-0 bg-linear-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
        
        {/* Header Section */}
        <div className="text-center mb-10 flex flex-col items-center">
          <div className="fade-in-element w-16 h-16 bg-accent rounded-[24px] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(217,70,239,0.5)] border border-accent/50 rotate-6 hover:rotate-0 transition-transform duration-500">
             <Shield className="text-white" size={32} />
          </div>
          <h1 className="fade-in-element text-4xl font-display font-bold text-white tracking-tight text-glow mb-2">ConjuntoApp</h1>
          <p className="fade-in-element text-white/50 text-sm font-medium tracking-wide">Tu comunidad, sincronizada en la nube.</p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="fade-in-element space-y-2">
            <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest ml-1">Email Residencial</label>
            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-accent transition-colors" size={20} />
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="ej: thommy@example.com" 
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
                    <span>Entrar al Conjunto</span>
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
             </button>
          </div>
        </form>

        {/* Footer Links */}
        <div className="fade-in-element mt-10 text-center space-y-4">
           <p className="text-white/30 text-[11px] flex items-center justify-center gap-2">
             <Star size={12} className="text-accent" /> Acceso exclusivo para residentes autorizados
           </p>
           <div className="flex justify-center gap-6">
              <button className="text-[10px] text-white/40 font-bold uppercase hover:text-white transition-colors tracking-widest">¿Olvidaste tu contraseña?</button>
           </div>
        </div>

      </div>

      {/* Decorative Text */}
      <div className="absolute top-10 left-10 text-white/5 text-[15vw] font-display font-black pointer-events-none select-none uppercase tracking-tighter leading-none h-[120px] overflow-hidden">
        CONJUNTO
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .text-glow { text-shadow: 0 0 30px rgba(217,70,239,0.5); }
      `}} />
    </div>
  );
}

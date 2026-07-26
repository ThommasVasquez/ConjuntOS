"use client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect } from "react";
import { gsap } from "gsap";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { BrandedFooter } from "@/components/shell/BrandedFooter";
import { useTheme } from "@/components/providers/ThemeContext";
import { Mail, Lock, ArrowRight, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

// Validate a post-login redirect target: only same-origin relative paths.
// Rejects protocol-relative ("//evil.com"), absolute URLs ("http://…") and backslash tricks.
function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/inicio";
  if (raw.includes("://") || raw.includes("\\")) return "/inicio";
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  // Logo: responde al tema de la APP (ThemeProvider), no al del SO
  const { theme } = useTheme();
  const logoSrc = theme === "light" ? "/logo-vertical.svg" : "/logo-verticalW.svg";

  // Already logged in → redirect to dashboard
  useEffect(() => {
    if (user) {
      const params = new URLSearchParams(window.location.search);
      const callback = safeCallback(params.get("callbackUrl"));
      // HUESPED_TEMPORAL always goes to /mi-estancia
      const dest = user.rol === "HUESPED_TEMPORAL" ? "/mi-estancia" : callback;
      router.replace(dest);
    }
  }, [user, router]);

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
      await login(formData.email, formData.password);
      toast.success("¡Bienvenido! Sesión iniciada con éxito.");
      const params = new URLSearchParams(window.location.search);
      const callback = safeCallback(params.get("callbackUrl"));
      const dest = user?.rol === "HUESPED_TEMPORAL" ? "/mi-estancia" : callback;
      setTimeout(() => {
        router.push(dest);
        router.refresh();
      }, 1000);
    } catch (error: unknown) {
      // The backend returns a generic "authentication required" for a failed
      // login; surface a clear, user-facing message instead of that jargon.
      const message =
        error instanceof ApiError
          ? error.status === 401
            ? "Correo o contraseña incorrectos."
            : error.detail
          : error instanceof Error
            ? error.message
            : "Error al conectar con la comunidad.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-primary flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="bg-glow-1 absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-blue-400/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="bg-glow-2 absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-emerald-300/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="liquid-login-card relative w-full max-w-md liquid-glass p-10 rounded-[32px] backdrop-blur-3xl z-10 overflow-hidden">
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="fade-in-element w-full max-w-[210px] mb-3 mx-auto">
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img
               src={logoSrc}
               alt="ConjuntOS"
               suppressHydrationWarning
               style={{ width: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
             />
          </div>
          <p className="fade-in-element text-text-muted text-sm">Tu comunidad, sincronizada en la nube.</p>
          <h1 className="fade-in-element mt-6 text-3xl font-extrabold tracking-tight text-text">Bienvenido de nuevo</h1>
          <p className="fade-in-element mt-2 text-text-muted text-sm">Accede al portal de tu comunidad</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="fade-in-element space-y-2">
            <label className="block text-sm font-semibold text-text ml-1">Correo electrónico</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" size={20} />
              <input
                type="text"
                required
                autoComplete="username"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="tu@correo.com"
                className="w-full bg-surface-2 border border-border rounded-2xl py-4 pl-12 pr-4 text-sm text-text focus:outline-hidden focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-text-muted/60"
              />
            </div>
          </div>

          <div className="fade-in-element space-y-2">
            <label className="block text-sm font-semibold text-text ml-1">Contraseña</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" size={20} />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                className="w-full bg-surface-2 border border-border rounded-2xl py-4 pl-12 pr-28 text-sm text-text focus:outline-hidden focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-text-muted/60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[13px] font-medium text-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <div className="fade-in-element text-right">
            <button type="button" className="text-[13px] font-medium text-blue-500 hover:text-blue-600 transition-colors cursor-pointer">
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <div className="fade-in-element pt-2">
             <button
               type="submit"
               disabled={isLoading}
               className="w-full bg-linear-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 active:scale-[0.98] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-600/30 group cursor-pointer"
             >
                {isLoading ? (
                  <Skeleton className="w-6 h-6 rounded-full" />
                ) : (
                  <>
                    <span>Entrar al Sistema</span>
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
             </button>
          </div>
        </form>

        <div className="fade-in-element mt-8 flex items-center gap-4">
          <div className="flex-1 border-t border-border" />
          <span className="text-text-muted text-xs">o</span>
          <div className="flex-1 border-t border-border" />
        </div>

        <div className="fade-in-element mt-6 flex items-center gap-4 bg-surface-2 border border-border rounded-2xl p-4">
          <ShieldCheck size={28} className="text-blue-500 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-text">Conexión segura</p>
            <p className="text-xs text-text-muted">Solo residentes autorizados pueden acceder.</p>
          </div>
        </div>

        {/* INTRA-CARD BRANDING - Stage 28 */}
        <BrandedFooter isInternal className="pointer-events-none" />
      </div>

      <div className="absolute top-10 left-10 text-text/[0.03] text-[15vw] font-display font-black pointer-events-none select-none uppercase tracking-tighter leading-none h-[120px] overflow-hidden">
        CONJUNTOS
      </div>
    </div>
  );
}

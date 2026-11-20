"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Copy,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

export default function InstalarPwaPage() {
  const [platform, setPlatform] = useState<Platform>("android");
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installedNow, setInstalledNow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent || "";
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isInStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    setIsStandalone(isInStandalone);

    if (isIOS) {
      // Detect non-Safari browsers on iOS (Chrome, Firefox, Instagram, WhatsApp WebView)
      const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line|MicroMessenger/i.test(
        ua
      );
      setPlatform(isOtherIosBrowser ? "ios-other" : "ios-safari");
    } else if (isAndroid) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalledNow(true);
      setDeferredPrompt(null);
      toast.success("¡ConjuntOS® se instaló correctamente!");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalledNow(true);
        setDeferredPrompt(null);
      }
    } catch {
      toast.error("No se pudo abrir el instalador automático.");
    } finally {
      setInstalling(false);
    }
  };

  const copyInstallLink = async () => {
    const url = "https://app.conjuntos.app/instalar";
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado. Pégalo en Safari para instalar.");
    } catch {
      toast.info(url);
    }
  };

  return (
    <main className="min-h-dvh w-full bg-[#08090d] text-white flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-[#009df2]/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 left-1/2 -translate-x-1/2 w-[360px] h-[360px] rounded-full bg-[#57bf00]/10 blur-[110px]" />

      <div className="relative z-10 w-full max-w-[420px] flex flex-col items-center gap-6">
        {/* Brand Hero */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-24 h-24 rounded-[28px] bg-[#0e1017] border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-2 flex items-center justify-center overflow-hidden">
            <img
              src="/icons/conjuntos-post-icon.png"
              alt="ConjuntOS®"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#009df2] bg-[#009df2]/15 border border-[#009df2]/30 px-3 py-1 rounded-full mb-2">
              <Sparkles size={11} /> App Oficial · Sin tiendas
            </span>
            <h1 className="text-2xl font-display font-black tracking-tight text-white">
              Instala ConjuntOS®
            </h1>
            <p className="text-xs text-white/65 mt-1 max-w-xs mx-auto leading-relaxed">
              Citofonía digital, novedades, encuestas, visitas y pagos en un toque desde tu pantalla de inicio.
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className="w-full rounded-[32px] bg-white/[0.06] backdrop-blur-xl border border-white/12 p-6 shadow-2xl flex flex-col gap-5">
          {isStandalone || installedNow ? (
            <div className="flex flex-col items-center text-center gap-4 py-2">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={30} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  ¡ConjuntOS® ya está instalado!
                </h2>
                <p className="text-xs text-white/65 mt-1">
                  Abre la app desde el ícono en tu pantalla de inicio para iniciar sesión y activar las alertas.
                </p>
              </div>
              <Link
                href="/login"
                className="w-full py-3.5 px-5 rounded-2xl bg-[#009df2] hover:bg-[#0086d1] text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
              >
                <span>Abrir ConjuntOS®</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          ) : platform === "ios-other" ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-amber-500/15 border border-amber-500/35 p-4 text-xs text-amber-200 leading-relaxed">
                <strong>Estás abriendo esto fuera de Safari.</strong> En iPhone, Apple solo permite instalar la app desde <strong>Safari</strong>.
              </div>
              <button
                type="button"
                onClick={copyInstallLink}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#009df2] hover:bg-[#0086d1] text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all cursor-pointer"
              >
                <Copy size={15} />
                <span>Copiar enlace para abrir en Safari</span>
              </button>
              <p className="text-[11px] text-white/55 text-center">
                Pega el enlace en Safari y sigue los 3 pasos para instalarla en segundos.
              </p>
            </div>
          ) : platform === "ios-safari" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#009df2]">
                  Instalar en iPhone (Safari)
                </span>
                <span className="text-[10px] text-white/50 font-semibold">3 pasos · 10 seg</span>
              </div>

              <ol className="flex flex-col gap-3">
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#009df2]/20 text-[#009df2] flex items-center justify-center shrink-0">
                    <Share size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">1. Toca el botón Compartir</strong>
                    <span className="text-white/65">
                      Es el ícono del cuadro con la flecha hacia arriba en la barra inferior de Safari.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <PlusSquare size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">2. Elige &ldquo;Agregar a inicio&rdquo;</strong>
                    <span className="text-white/65">
                      Desliza hacia abajo en el menú y toca <em>Agregar a pantalla de inicio</em>.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <BellRing size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">3. Toca &ldquo;Agregar&rdquo; y ábrela</strong>
                    <span className="text-white/65">
                      Inicia sesión desde el ícono nuevo y activa las notificaciones para recibir llamadas de portería.
                    </span>
                  </div>
                </li>
              </ol>
            </div>
          ) : (
            /* Android & Desktop */
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#57bf00]">
                  {platform === "android" ? "Instalar en Android" : "Instalar App"}
                </span>
                <span className="text-[10px] text-white/50 font-semibold">Liviana · 0 MB tienda</span>
              </div>

              {deferredPrompt ? (
                <button
                  type="button"
                  onClick={handleNativeInstall}
                  disabled={installing}
                  className="w-full py-4 px-5 rounded-2xl bg-[#57bf00] hover:bg-[#4ca800] text-[#08090d] font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-[0_10px_30px_rgba(87,191,0,0.35)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                >
                  <Download size={18} />
                  <span>{installing ? "Instalando…" : "Instalar ConjuntOS® ahora"}</span>
                </button>
              ) : (
                <ol className="flex flex-col gap-3">
                  <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                    <span className="w-8 h-8 rounded-xl bg-[#57bf00]/20 text-[#57bf00] flex items-center justify-center shrink-0">
                      <MoreVertical size={16} />
                    </span>
                    <div className="text-xs leading-relaxed">
                      <strong className="text-white block">1. Abre el menú del navegador (⋮)</strong>
                      <span className="text-white/65">
                        En Chrome, toca los tres puntos arriba a la derecha.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                    <span className="w-8 h-8 rounded-xl bg-[#009df2]/20 text-[#009df2] flex items-center justify-center shrink-0">
                      <Smartphone size={16} />
                    </span>
                    <div className="text-xs leading-relaxed">
                      <strong className="text-white block">2. Toca &ldquo;Instalar aplicación&rdquo;</strong>
                      <span className="text-white/65">
                        O <em>Agregar a pantalla principal</em> y confirma con <strong>Instalar</strong>.
                      </span>
                    </div>
                  </li>
                </ol>
              )}

              <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.03] border border-white/10 p-3 text-[11px] text-white/65">
                <BellRing size={15} className="text-[#009df2] shrink-0" />
                <span>
                  Al abrir la app instalada, recuerda activar las notificaciones para recibir llamadas de citofonía.
                </span>
              </div>
            </div>
          )}

          {/* Secondary login link */}
          {!isStandalone && !installedNow && (
            <div className="pt-2 border-t border-white/10 flex flex-col items-center gap-2">
              <Link
                href="/login"
                className="text-xs font-bold text-white/75 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <span>Ya la tengo o entrar sin instalar</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>

        <p className="text-[10px] text-white/35 tracking-widest uppercase font-bold">
          ConjuntOS® · Gestión Residencial Inteligente
        </p>
      </div>
    </main>
  );
}

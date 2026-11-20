"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BellRing,
  Check,
  Copy,
  ExternalLink,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
} from "lucide-react";

type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

const APP_URL = "https://app.conjuntos.app";

export default function InstalarConjuntOSPage() {
  const [platform, setPlatform] = useState<Platform>("android");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent || "";
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);

    if (isIOS) {
      const isOtherIosBrowser =
        /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line|MicroMessenger/i.test(
          ua
        );
      setPlatform(isOtherIosBrowser ? "ios-other" : "ios-safari");
    } else if (isAndroid) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }
  }, []);

  const copyAppLink = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="min-h-dvh w-full bg-[#08090d] text-white flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-[#009df2]/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 left-1/2 -translate-x-1/2 w-[360px] h-[360px] rounded-full bg-[#57bf00]/10 blur-[110px]" />

      <div className="relative z-10 w-full max-w-[430px] flex flex-col items-center gap-6">
        {/* Brand Header */}
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
              <Sparkles size={11} /> App Web Oficial · Sin tiendas
            </span>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Instala ConjuntOS®
            </h1>
            <p className="text-xs text-white/65 mt-1 max-w-xs mx-auto leading-relaxed">
              Citofonía digital, novedades, encuestas, visitas y pagos en un toque desde la pantalla de inicio de tu celular.
            </p>
          </div>
        </div>

        {/* Platform Switcher */}
        <div className="w-full grid grid-cols-2 gap-1.5 bg-white/[0.05] p-1 rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={() => setPlatform("ios-safari")}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              platform === "ios-safari" || platform === "ios-other"
                ? "bg-[#009df2] text-white shadow-sm"
                : "text-white/65 hover:text-white"
            }`}
          >
            iPhone (iOS)
          </button>
          <button
            type="button"
            onClick={() => setPlatform("android")}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              platform === "android" || platform === "desktop"
                ? "bg-[#57bf00] text-[#08090d] shadow-sm"
                : "text-white/65 hover:text-white"
            }`}
          >
            Android (Chrome)
          </button>
        </div>

        {/* Main Instructions Card */}
        <div className="w-full rounded-[32px] bg-white/[0.06] backdrop-blur-xl border border-white/12 p-6 shadow-2xl flex flex-col gap-5">
          {platform === "ios-safari" || platform === "ios-other" ? (
            <div className="flex flex-col gap-4">
              {platform === "ios-other" && (
                <div className="rounded-2xl bg-amber-500/15 border border-amber-500/35 p-3.5 text-xs text-amber-200 leading-relaxed">
                  <strong>Importante en iPhone:</strong> Apple solo permite instalar la app desde <strong>Safari</strong>. Copia el enlace y ábrelo en Safari.
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#009df2]">
                  Pasos en iPhone (Safari)
                </span>
                <span className="text-[10px] text-white/50 font-semibold">15 segundos</span>
              </div>

              <ol className="flex flex-col gap-3">
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#009df2]/20 text-[#009df2] flex items-center justify-center shrink-0">
                    <ExternalLink size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">1. Abre app.conjuntos.app en Safari</strong>
                    <span className="text-white/65">
                      Toca el botón azul de abajo (o copia el enlace y pégalo en Safari).
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#009df2]/20 text-[#009df2] flex items-center justify-center shrink-0">
                    <Share size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">2. Toca Compartir</strong>
                    <span className="text-white/65">
                      Es el cuadro con la flecha hacia arriba en la barra inferior de Safari.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <PlusSquare size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">3. Agregar a pantalla de inicio</strong>
                    <span className="text-white/65">
                      Desliza hacia abajo, elige <em>Agregar a pantalla de inicio</em> y toca <strong>Agregar</strong>.
                    </span>
                  </div>
                </li>
              </ol>

              <a
                href={APP_URL}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#009df2] hover:bg-[#0086d1] text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
              >
                <span>Abrir ConjuntOS® en Safari</span>
                <ArrowRight size={15} />
              </a>

              <button
                type="button"
                onClick={copyAppLink}
                className="w-full py-2.5 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/12 text-white/85 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? "¡Enlace copiado! Pégalo en Safari" : "Copiar enlace (app.conjuntos.app)"}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#57bf00]">
                  Pasos en Android (Chrome)
                </span>
                <span className="text-[10px] text-white/50 font-semibold">Sin Play Store</span>
              </div>

              <ol className="flex flex-col gap-3">
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#57bf00]/20 text-[#57bf00] flex items-center justify-center shrink-0">
                    <ExternalLink size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">1. Abre app.conjuntos.app en Chrome</strong>
                    <span className="text-white/65">
                      Toca el botón verde de abajo para abrir la app oficial.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#57bf00]/20 text-[#57bf00] flex items-center justify-center shrink-0">
                    <MoreVertical size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">2. Toca el menú (⋮) arriba a la derecha</strong>
                    <span className="text-white/65">
                      Elige <em>Instalar aplicación</em> o <em>Agregar a pantalla principal</em>.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#009df2]/20 text-[#009df2] flex items-center justify-center shrink-0">
                    <Smartphone size={16} />
                  </span>
                  <div className="text-xs leading-relaxed">
                    <strong className="text-white block">3. Confirma en &ldquo;Instalar&rdquo;</strong>
                    <span className="text-white/65">
                      El ícono de ConjuntOS® quedará en tu pantalla como una app normal.
                    </span>
                  </div>
                </li>
              </ol>

              <a
                href={APP_URL}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#57bf00] hover:bg-[#4ca800] text-[#08090d] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(87,191,0,0.3)] active:scale-[0.98] transition-all"
              >
                <span>Abrir ConjuntOS® para instalar</span>
                <ArrowRight size={15} />
              </a>
            </div>
          )}

          <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.03] border border-white/10 p-3 text-[11px] text-white/65">
            <BellRing size={15} className="text-[#009df2] shrink-0" />
            <span>
              Al abrir el ícono instalado, inicia sesión y toca <strong>Activar notificaciones</strong> para recibir llamadas de portería.
            </span>
          </div>
        </div>

        <p className="text-[10px] text-white/35 tracking-widest uppercase font-bold">
          ConjuntOS® · Gestión Residencial Inteligente
        </p>
      </div>
    </main>
  );
}

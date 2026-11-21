"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import QRCode from "react-qr-code";
import { Hand, Sparkles } from "lucide-react";
import type { AdSpaceFeedDto } from "@/lib/api/types";
import { api } from "@/lib/api/client";

function isVideoMedia(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mov");
}

interface TrainingSlide {
  kind: "training";
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  qrUrl: string;
  qrLabel: string;
  accent: string;
}

interface AdSlide {
  kind: "ad";
  id: string;
  ad: AdSpaceFeedDto;
}

type StandbySlide = TrainingSlide | AdSlide;

const TRAINING_SLIDES: TrainingSlide[] = [
  {
    kind: "training",
    id: "install-pwa",
    badge: "RESIDENTES · APP OFICIAL",
    title: "Instala ConjuntOS® en tu celular en 30 segundos",
    subtitle:
      "Recibe avisos instantáneos de paquetería, llamadas de portería, anuncios y encuestas sin descargar nada de tiendas.",
    qrUrl: "https://conjuntos.app/instalar",
    qrLabel: "Escanea para instalar",
    accent: "from-[#009df2]/25 via-[#08090d] to-[#57bf00]/15",
  },
  {
    kind: "training",
    id: "kiosko-guide",
    badge: "DOMICILIARIOS Y MENSAJERÍA",
    title: "Registra tu entrega en 3 toques e imprime el sticker",
    subtitle:
      "Selecciona el apartamento, escribe el destinatario y el tipo de paquete. El residente recibe notificación en vivo al instante.",
    qrUrl: "https://conjuntos.app/instalar",
    qrLabel: "Conoce ConjuntOS®",
    accent: "from-[#57bf00]/20 via-[#08090d] to-[#009df2]/20",
  },
];

interface KioskoStandbyOverlayProps {
  visible: boolean;
  ads: AdSpaceFeedDto[];
  conjuntoLabel?: string;
  onWake: () => void;
}

export default function KioskoStandbyOverlay({
  visible,
  ads,
  conjuntoLabel = "LAS BRISAS PH · LA FELICIDAD",
  onWake,
}: KioskoStandbyOverlayProps) {
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Interleave active ads with training slides (e.g. Ad 1 -> Ad 2 -> Training 1 -> Ad 3 -> Training 2)
  const playlist: StandbySlide[] = useMemo(() => {
    if (ads.length === 0) return TRAINING_SLIDES;
    const out: StandbySlide[] = [];
    let tIdx = 0;
    ads.forEach((ad, i) => {
      out.push({ kind: "ad", id: `ad-${ad.id}`, ad });
      if ((i + 1) % 2 === 0 || i === ads.length - 1) {
        out.push(TRAINING_SLIDES[tIdx % TRAINING_SLIDES.length]);
        tIdx++;
      }
    });
    return out;
  }, [ads]);

  const currentSlide = playlist[index % playlist.length];

  // Register public Kiosko impression whenever an ad slide becomes visible
  useEffect(() => {
    if (!visible || !currentSlide || currentSlide.kind !== "ad") return;
    api.post(`/public/kiosko/ads/${currentSlide.ad.id}/impress`, {}).catch(() => {});
  }, [visible, currentSlide]);

  // Auto-advance timer (9s for images/training, 25s safety cap for videos — videos also advance onEnded)
  useEffect(() => {
    if (!visible || playlist.length <= 1 || !currentSlide) return;
    const isVid = currentSlide.kind === "ad" && isVideoMedia(currentSlide.ad.imagenUrl);
    const ms = isVid ? 25000 : 9000;
    const timer = setTimeout(() => {
      setIndex((prev) => (prev + 1) % playlist.length);
    }, ms);
    return () => clearTimeout(timer);
  }, [visible, index, playlist.length, currentSlide]);

  // Reset to first slide when waking up
  useEffect(() => {
    if (!visible) setIndex(0);
  }, [visible]);

  if (!visible || !currentSlide) return null;

  const isVideo = currentSlide.kind === "ad" && isVideoMedia(currentSlide.ad.imagenUrl);

  return (
    <div
      onClick={onWake}
      onTouchStart={onWake}
      className="fixed inset-0 z-[120] bg-[#08090d] text-white select-none cursor-pointer overflow-hidden flex flex-col justify-between animate-in fade-in duration-500"
    >
      {/* MAIN CONTENT AREA */}
      {currentSlide.kind === "ad" ? (
        <div className="absolute inset-0 w-full h-full">
          {currentSlide.ad.imagenUrl ? (
            isVideo ? (
              <video
                ref={videoRef}
                key={currentSlide.ad.imagenUrl}
                src={currentSlide.ad.imagenUrl}
                autoPlay
                muted
                playsInline
                onEnded={() => setIndex((prev) => (prev + 1) % playlist.length)}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                key={currentSlide.ad.imagenUrl}
                src={currentSlide.ad.imagenUrl}
                alt={currentSlide.ad.nombre}
                className="w-full h-full object-cover"
              />
            )
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-amber-500/25 via-[#08090d] to-[#009df2]/25 flex flex-col items-center justify-center p-12 text-center">
              {currentSlide.ad.empresa && (
                <span className="text-sm font-mono uppercase tracking-[0.3em] text-amber-400 mb-3">
                  {currentSlide.ad.empresa}
                </span>
              )}
              <h2 className="text-5xl font-display font-black max-w-4xl leading-tight">
                {currentSlide.ad.nombre}
              </h2>
            </div>
          )}
          {/* Subtle bottom gradient for crisp readability */}
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none" />
        </div>
      ) : (
        <div
          className={`absolute inset-0 w-full h-full bg-gradient-to-br ${currentSlide.accent} flex items-center justify-between px-12 lg:px-20 py-14 gap-12`}
        >
          <div className="flex flex-col gap-5 max-w-2xl">
            <div className="inline-flex items-center gap-2 self-start px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-mono uppercase tracking-[0.2em] text-[#009df2]">
              <Sparkles size={13} />
              <span>{currentSlide.badge}</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-display font-black tracking-tight leading-[1.08] text-white">
              {currentSlide.title}
            </h2>
            <p className="text-base lg:text-lg text-white/75 leading-relaxed max-w-xl">
              {currentSlide.subtitle}
            </p>
            <div className="mt-2 bg-white rounded-2xl px-4 py-2.5 self-start shadow-lg">
              <Image
                src="/ConjuntOS_Horizontal.png"
                alt="ConjuntOS®"
                width={170}
                height={46}
                className="object-contain"
                unoptimized
              />
            </div>
          </div>

          <div className="shrink-0 bg-white text-black rounded-[32px] p-6 shadow-2xl flex flex-col items-center gap-3 border border-white/20">
            <QRCode value={currentSlide.qrUrl} size={210} />
            <span className="text-xs font-mono font-black uppercase tracking-wider text-black">
              {currentSlide.qrLabel}
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              conjuntos.app/instalar
            </span>
          </div>
        </div>
      )}

      {/* TOP BAR (Conjunto badge + slide indicators) */}
      <div className="relative z-10 flex items-center justify-between px-8 pt-6">
        <div className="px-4 py-2 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[11px] font-mono uppercase tracking-[0.2em] text-white/85">
          {conjuntoLabel}
        </div>
        {playlist.length > 1 && (
          <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-3 py-2 rounded-full border border-white/15">
            {playlist.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index % playlist.length ? "w-6 bg-white" : "w-1.5 bg-white/35"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM BAR: Wake CTA + Advertiser QR (when on ad slide) */}
      <div className="relative z-10 flex items-end justify-between gap-6 px-8 pb-7">
        {/* Left: Touch to wake */}
        <div className="flex flex-col gap-2">
          {currentSlide.kind === "ad" && (
            <div className="flex flex-col">
              {currentSlide.ad.empresa && (
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-amber-400 font-bold">
                  {currentSlide.ad.empresa} · Patrocinado
                </span>
              )}
              <span className="text-2xl font-display font-black text-white drop-shadow">
                {currentSlide.ad.nombre}
              </span>
            </div>
          )}
          <div className="inline-flex items-center gap-2.5 self-start px-5 py-3 rounded-full bg-white text-black font-mono text-xs font-black uppercase tracking-[0.15em] shadow-2xl animate-pulse">
            <Hand size={16} />
            <span>Toca la pantalla para registrar un paquete</span>
          </div>
        </div>

        {/* Right: Auto-generated QR for advertiser WhatsApp / URL */}
        {currentSlide.kind === "ad" && currentSlide.ad.linkUrl && (
          <div className="shrink-0 bg-white text-black rounded-2xl p-3.5 shadow-2xl flex items-center gap-3.5 border border-black/10">
            <QRCode value={currentSlide.ad.linkUrl} size={96} />
            <div className="flex flex-col max-w-[140px]">
              <span className="text-[10px] font-mono uppercase font-black text-amber-600 tracking-wider">
                Escanea aquí
              </span>
              <span className="text-xs font-bold leading-snug text-black mt-0.5">
                {currentSlide.ad.ctaTexto || "Ver promoción"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

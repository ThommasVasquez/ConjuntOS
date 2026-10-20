"use client";

import React, { useRef } from "react";
import QRCode from "react-qr-code";
import Image from "next/image";
import { Printer, X } from "lucide-react";

export interface StickerData {
  id: string;
  bloque?: string | null;
  casa?: string | null;
  torre?: string | null;
  apto?: string | null;
  destinatario: string;
  tipo: string;
  tipoEtiqueta?: string;
  remitente: string;
  fecha?: string;
  documentoMensajero?: string | null;
}

export function formatTipoBadge(tipo: string): { label: string; emoji: string; color: string } {
  const t = tipo.toUpperCase();
  if (t === "COMIDA") {
    return { label: "COMIDA URGENTE", emoji: "🍔", color: "bg-red-500 text-white" };
  }
  if (t === "CADENA_FRIO" || t === "MEDICAMENTOS") {
    return { label: "CADENA DE FRÍO", emoji: "❄️", color: "bg-cyan-600 text-white" };
  }
  if (t === "ENERGIA") {
    return { label: "RECIBO ENERGÍA", emoji: "⚡", color: "bg-amber-500 text-black" };
  }
  if (t === "AGUA") {
    return { label: "RECIBO AGUA", emoji: "💧", color: "bg-blue-600 text-white" };
  }
  if (t === "GAS") {
    return { label: "RECIBO GAS", emoji: "🔥", color: "bg-orange-600 text-white" };
  }
  if (t === "TELECOMUNICACIONES") {
    return { label: "RECIBO TELECOM", emoji: "🌐", color: "bg-purple-600 text-white" };
  }
  if (t === "CARTA_BANCO") {
    return { label: "CARTA BANCARIA", emoji: "✉️", color: "bg-indigo-600 text-white" };
  }
  if (t === "PAQUETE" || t === "PAQUETE_GRANDE") {
    return { label: "PAQUETERÍA", emoji: "📦", color: "bg-emerald-600 text-white" };
  }
  if (t === "PERIODICO" || t === "REVISTA") {
    return { label: "PRENSA / REVISTA", emoji: "📰", color: "bg-slate-700 text-white" };
  }
  return { label: "CORRESPONDENCIA", emoji: "📄", color: "bg-gray-800 text-white" };
}

interface StickerProps {
  data: StickerData;
  onClose?: () => void;
  autoPrint?: boolean;
}

export default function StickerEtiqueta({ data, onClose, autoPrint = false }: StickerProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const badge = formatTipoBadge(data.tipo);

  const bloqueTexto = data.bloque || data.torre;
  const casaTexto = data.casa || data.apto;

  const handlePrint = () => {
    window.print();
  };

  React.useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const nowFormatted = data.fecha || new Date().toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const qrValue = `BRISAS-PKG-${data.id}`;

  return (
    <div className="flex flex-col items-center">
      {/* Print Controls (hidden during print) */}
      <div className="print:hidden w-full flex items-center justify-between mb-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent">
            <Printer size={16} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text">Sticker Térmico Adhesivo</h4>
            <p className="text-[11px] text-text/60">Formato estándar 60mm × 40mm • Las Brisas PH</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-on-accent text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-transform active:scale-95"
          >
            <Printer size={14} />
            Imprimir
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-surface-2 hover:bg-text/10 text-text/70 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* STICKER CONTAINER: 60mm x 40mm simulation on screen and exact print styles */}
      <div
        ref={printRef}
        id="sticker-thermal-printable"
        className="sticker-card bg-white text-black p-2.5 rounded-lg border-2 border-black/20 shadow-lg flex flex-col justify-between overflow-hidden relative"
        style={{
          width: "340px",
          height: "228px",
          minWidth: "340px",
          minHeight: "228px",
        }}
      >
        {/* Header with Logos */}
        <div className="flex items-center justify-between border-b border-black/20 pb-1 w-full">
          {/* Las Brisas Logo */}
          <div className="flex items-center gap-1.5">
            <div className="relative w-32 h-8">
              <Image
                src="/images/las-brisas-logo.png"
                alt="Las Brisas La Felicidad"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </div>

          {/* ConjuntOS Logo */}
          <div className="flex items-center gap-1">
            <div className="relative w-20 h-6">
              <Image
                src="/logo.png"
                alt="ConjuntOS"
                fill
                className="object-contain object-right"
                priority
              />
            </div>
          </div>
        </div>

        {/* Big Destination Label (Giant font: BLOQUE y CASA para Las Brisas PH) */}
        <div className="my-1 text-center bg-black/5 py-1 rounded border border-black/10">
          <div className="text-[22px] font-black tracking-tight leading-none text-black uppercase font-mono">
            {bloqueTexto ? `BLOQUE ${bloqueTexto} - ` : ""}
            {casaTexto ? `CASA ${casaTexto}` : "PORTERÍA"}
          </div>
        </div>

        {/* Content Body + QR Code */}
        <div className="flex items-center justify-between gap-2 flex-1 mt-0.5">
          {/* Metadata */}
          <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-1 text-[11px] leading-tight">
            <div className="truncate font-bold text-black text-[12px]">
              <span className="text-black/60 font-semibold">Para: </span>
              {data.destinatario}
            </div>

            {/* Delivery badge */}
            <div className="my-0.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-black text-white">
                <span>{badge.emoji}</span>
                <span>{badge.label}</span>
              </span>
            </div>

            <div className="truncate text-[10.5px]">
              <span className="text-black/60 font-semibold">De: </span>
              <span className="font-bold text-black">{data.remitente}</span>
            </div>

            <div className="text-[9.5px] text-black/70 font-mono mt-0.5">
              {nowFormatted}
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center justify-center p-1 bg-white rounded border border-black/20 shrink-0">
            <QRCode
              value={qrValue}
              size={64}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox="0 0 64 64"
            />
            <span className="text-[7.5px] font-mono font-bold text-black/80 mt-0.5">
              {data.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-black/15 pt-0.5 flex items-center justify-between text-[8px] font-mono text-black/60">
          <span>RECEPCIÓN PORTERÍA • BRISAS PH</span>
          <span>ConjuntOS® Verificado</span>
        </div>
      </div>

      {/* Print Specific CSS Style Injection */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #sticker-thermal-printable,
          #sticker-thermal-printable * {
            visibility: visible !important;
          }
          #sticker-thermal-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            width: 60mm !important;
            height: 40mm !important;
            min-width: 60mm !important;
            min-height: 40mm !important;
            max-width: 60mm !important;
            max-height: 40mm !important;
            padding: 2.5mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: 60mm 40mm;
            margin: 0mm;
          }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, X, ScanLine } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";

// BarcodeDetector is a browser-native API (Chromium/Android) not yet in the TS DOM
// lib, so declare the minimal shape we use and feature-detect it at runtime.
type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

interface ScanVisita {
  id: string;
  nombre: string;
  tipo: string;
}

type Verdict = { ok: true; nombre: string } | { ok: false; reason: string };

/**
 * Gate QR scanner: decode a visitor pass with the device camera (where supported)
 * and validate it server-side, with a manual code-entry fallback that always works.
 */
export default function QrScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  const detectorCtor = (
    globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  ).BarcodeDetector;

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  // Tear the camera down when the component unmounts.
  useEffect(() => () => stopCamera(), []);

  async function submitToken(token: string) {
    const t = token.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const dto = await api.post<ScanVisita>("/visitas/scan", { token: t });
      setVerdict({ ok: true, nombre: dto.nombre });
      setManual("");
    } catch (e) {
      setVerdict({
        ok: false,
        reason: e instanceof ApiError ? e.detail : "Error de conexión",
      });
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    setVerdict(null);
    if (!detectorCtor) return; // manual entry only
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const detector = new detectorCtor({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const token = codes[0].rawValue;
            stopCamera();
            void submitToken(token);
            return;
          }
        } catch {
          // transient decode error — keep scanning
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stopCamera(); // permission denied / no camera → manual fallback remains
    }
  }

  return (
    <div className="fade-up liquid-glass rounded-3xl p-6 border border-border flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
          <ScanLine size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text">Escanear pase QR</h2>
          <p className="text-xs text-text/70">Valida el código del visitante</p>
        </div>
      </div>

      {verdict && (
        <div
          className={`rounded-2xl p-4 border flex items-center gap-3 ${
            verdict.ok
              ? "bg-emerald-500/10 border-emerald-500/40"
              : "bg-red-500/10 border-red-500/40"
          }`}
        >
          {verdict.ok ? (
            <Check className="text-emerald-400" size={22} />
          ) : (
            <X className="text-red-400" size={22} />
          )}
          <div>
            <p
              className={`text-sm font-bold ${
                verdict.ok ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {verdict.ok ? "Ingreso autorizado" : "Código rechazado"}
            </p>
            <p className="text-[11px] text-text/60">
              {verdict.ok ? verdict.nombre : verdict.reason}
            </p>
          </div>
        </div>
      )}

      {scanning ? (
        <div className="relative rounded-2xl overflow-hidden border border-border">
          <video
            ref={videoRef}
            className="w-full aspect-square object-cover"
            muted
            playsInline
          />
          <button
            onClick={stopCamera}
            className="absolute top-2 right-2 px-3 py-1.5 rounded-xl bg-black/60 text-white text-xs font-bold"
          >
            Detener
          </button>
        </div>
      ) : (
        detectorCtor && (
          <button
            onClick={startCamera}
            className="w-full py-3 rounded-2xl bg-accent text-primary font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Camera size={18} /> Escanear con cámara
          </button>
        )
      )}

      {/* Manual fallback — always available. */}
      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="o escribe el código (VIS-…)"
          className="flex-1 bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => submitToken(manual)}
          disabled={busy || !manual.trim()}
          className="px-4 rounded-2xl bg-text/10 border border-border text-text text-sm font-bold disabled:opacity-50"
        >
          Validar
        </button>
      </div>
      {!detectorCtor && (
        <p className="text-[10px] text-text/40">
          La cámara no está disponible en este navegador; usa el código manual.
        </p>
      )}
    </div>
  );
}

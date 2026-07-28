"use client";

import { useState, useCallback, useRef } from "react";
import { Camera, Check, X, ScanLine } from "lucide-react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { api, ApiError } from "@/lib/api/client";

interface ScanVisita {
  id: string;
  nombre: string;
  tipo: string;
}

type Verdict = { ok: true; nombre: string } | { ok: false; reason: string };

export default function QrScanner() {
  const [showCamera, setShowCamera] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const processingRef = useRef(false);

  async function submitToken(token: string) {
    const t = token.trim();
    if (!t || busy || processingRef.current) return;
    processingRef.current = true;
    setBusy(true);
    try {
      const dto = await api.post<ScanVisita>("/visitas/scan", { token: t });
      setVerdict({ ok: true, nombre: dto.nombre });
      setManual("");
      setShowCamera(false);
    } catch (e) {
      setVerdict({
        ok: false,
        reason: e instanceof ApiError ? e.detail : "Error de conexion",
      });
    } finally {
      setBusy(false);
      processingRef.current = false;
    }
  }

  const handleScan = useCallback(
    (detectedCodes: { rawValue: string }[]) => {
      if (detectedCodes.length > 0 && !processingRef.current) {
        void submitToken(detectedCodes[0].rawValue);
      }
    },
    [busy]
  );

  const handleScanError = useCallback((error: any) => {
    const kind = error?.kind || error?.name || '';
    if (kind === 'permission-denied') {
      setCameraError("Permiso de cámara denegado. Habilita el acceso en tu navegador.");
    } else if (kind === 'no-camera') {
      setCameraError("No se detectó cámara en este dispositivo.");
    } else if (!window.isSecureContext) {
      setCameraError("Se requiere HTTPS para acceder a la cámara.");
    } else {
      setCameraError("Cámara no disponible. Usa el ingreso manual.");
    }
  }, []);

  return (
    <div className="bg-primary-light shadow-sm rounded-3xl p-6 border border-border flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)', color: 'var(--color-info)' }}
        >
          <ScanLine size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-text leading-tight">Escanear pase QR</h2>
          <p className="text-[11px] text-text/55 mt-0.5">Valida el codigo del visitante</p>
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
            <Check size={22} style={{ color: 'var(--color-success)' }} />
          ) : (
            <X size={22} style={{ color: 'var(--color-danger)' }} />
          )}
          <div>
            <p
              className="text-sm font-bold"
              style={{ color: verdict.ok ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              {verdict.ok ? "Ingreso autorizado" : "Codigo rechazado"}
            </p>
            <p className="text-[11px] text-text/60">
              {verdict.ok ? verdict.nombre : verdict.reason}
            </p>
          </div>
        </div>
      )}

      {showCamera ? (
        <div className="relative rounded-2xl overflow-hidden border border-border">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center p-6 gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl">
              <p className="text-xs text-center" style={{ color: 'var(--color-danger)' }}>{cameraError}</p>
              <button
                onClick={() => { setShowCamera(false); setCameraError(null); }}
                className="text-xs font-bold px-3 py-1.5 rounded-xl"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)', color: 'var(--color-info)' }}
              >
                Cerrar
              </button>
            </div>
          ) : (
            <Scanner
              onScan={handleScan}
              onError={handleScanError}
              constraints={{ facingMode: "environment" }}
              styles={{
                container: { width: "100%", aspectRatio: "1", borderRadius: "1rem" },
                video: { width: "100%", height: "100%", objectFit: "cover" },
              }}
            />
          )}
          <button
            onClick={() => setShowCamera(false)}
            className="absolute top-2 right-2 px-3 py-1.5 rounded-xl bg-black/60 text-white text-xs font-bold z-10"
          >
            Detener
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setVerdict(null);
            setCameraError(null);
            if (!window.isSecureContext) {
              setCameraError("Se requiere HTTPS para acceder a la cámara.");
              return;
            }
            setShowCamera(true);
          }}
          style={{ backgroundColor: 'var(--color-info)' }}
          className="w-full py-3 rounded-2xl text-white font-bold flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-95 transition-all"
        >
          <Camera size={18} /> Escanear con camara
        </button>
      )}

      {/* Manual fallback */}
      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitToken(manual);
          }}
          placeholder="o escribe el codigo (VIS-\u2026)"
          className="flex-1 bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => void submitToken(manual)}
          disabled={busy || !manual.trim()}
          className="px-4 rounded-2xl bg-text/10 border border-border text-text text-sm font-bold disabled:opacity-50"
        >
          Validar
        </button>
      </div>
    </div>
  );
}

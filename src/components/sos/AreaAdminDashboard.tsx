"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { QrCode, Camera, X, Check, Clock, User, MapPin, Home, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ProfileHeader from "@/components/shell/ProfileHeader";
import RoleSwitcher from "@/components/shell/RoleSwitcher";

interface ReservaAdmin {
  id: string;
  areaId: string;
  areaNombre: string;
  usuarioNombre: string;
  usuarioTorre?: string;
  usuarioApto?: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  notas?: string;
}

export default function AreaAdminDashboard() {
  const { user } = useAuth();
  const role = user?.rol;
  const [reservas, setReservas] = useState<ReservaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificada, setVerificada] = useState<ReservaAdmin | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const areaNombre = role === "ADMINISTRADOR_PISCINA" ? "Piscina" : "Gimnasio";
  const areaColor = role === "ADMINISTRADOR_PISCINA" ? "cyan" : "emerald";

  const fetchReservas = async () => {
    if (!user) return;
    try {
      // Primero obtenemos el ID del área
      const areas = await api.get<{ id: string; nombre: string }[]>("/areas-comunes");
      const area = areas.find(
        (a) => a.nombre.toLowerCase() === areaNombre.toLowerCase()
      );
      if (!area) return;
      const data = await api.get<ReservaAdmin[]>(
        `/reservas/area/${area.id}/hoy`
      );
      setReservas(data);
    } catch {
      // Silencioso — API puede no tener autorización aún
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchReservas();
  }, [user]);

  // Release the camera + scan interval if the component unmounts mid-scan
  // (e.g. the operator navigates away) so the camera light/track doesn't leak.
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const startScanner = async () => {
    setScanning(true);
    setVerificada(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Check for QR codes every 500ms
      scanIntervalRef.current = setInterval(scanFrame, 500);
    } catch {
      toast.error("No se pudo acceder a la cámara");
      setScanning(false);
    }
  };

  const stopScanner = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const scanFrame = async () => {
    if (!videoRef.current) return;
    try {
      // @ts-expect-error BarcodeDetector API
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const barcodes = await detector.detect(videoRef.current);
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        stopScanner();
        await verificarQR(code);
      }
    } catch {
      // BarcodeDetector no disponible en este navegador
    }
  };

  const verificarQR = async (code: string) => {
    setVerifying(true);
    try {
      const data = await api.get<ReservaAdmin>(`/reservas/${code}/verificar`);
      setVerificada(data);
      toast.success(`✅ Reserva verificada: ${data.usuarioNombre}`);
    } catch {
      toast.error("❌ Reserva no encontrada o inválida");
      setVerificada(null);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const ahora = new Date();
  const reservasActivas = reservas.filter(
    (r) => r.estado !== "CANCELADA" && new Date(r.fechaFin) > ahora
  );
  const reservasPasadas = reservas.filter(
    (r) => r.estado !== "CANCELADA" && new Date(r.fechaFin) <= ahora
  );

  return (
    <div className="min-h-screen bg-primary flex flex-col p-6 pt-16 pb-32 gap-6">
      <ProfileHeader />
      <RoleSwitcher />

      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-text">
          {role === "ADMINISTRADOR_PISCINA" ? "🏊 Admin. Piscina" : "🏋️ Admin. Gym"}
        </h1>
        <p className="text-xs text-text/60">
          Reservas del día — {areaNombre}
        </p>
      </div>

      {/* Escáner QR */}
      <button
        onClick={() => (scanning ? stopScanner() : startScanner())}
        className={`w-full rounded-2xl p-4 border-2 flex items-center justify-center gap-3 font-bold text-sm transition-all active:scale-95 ${
          scanning
            ? "border-red-500 bg-red-500/20 text-red-400"
            : "border-accent bg-accent/10 text-accent"
        }`}
      >
        {scanning ? (
          <>
            <X size={20} /> Detener escáner
          </>
        ) : (
          <>
            <Camera size={20} /> Escanear QR de reserva
          </>
        )}
      </button>

      {/* Vista de cámara */}
      {scanning && (
        <div className="relative w-full aspect-square rounded-3xl overflow-hidden border-2 border-accent/40 bg-black">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <div className="absolute inset-0 border-[3px] border-accent/60 rounded-3xl m-8 pointer-events-none" />
          <p className="absolute bottom-4 left-0 right-0 text-center text-white text-xs bg-black/50 py-2">
            Apunta al código QR de la reserva
          </p>
        </div>
      )}

      {/* Verificando */}
      {verifying && (
        <div className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-accent/10 border border-accent/20">
          <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full" />
          <span className="text-sm text-accent font-bold">Verificando reserva...</span>
        </div>
      )}

      {/* Resultado verificación */}
      {verificada && (
        <div className="rounded-2xl p-4 border-2 border-[#57bf00] bg-[#57bf00]/10 space-y-2">
          <div className="flex items-center gap-2 text-[#57bf00] font-bold">
            <Check size={20} /> ¡Reserva válida!
          </div>
          <div className="space-y-1 text-sm text-text">
            <p className="flex items-center gap-2"><User size={14} /> {verificada.usuarioNombre}</p>
            {verificada.usuarioTorre && verificada.usuarioApto && (
              <p className="flex items-center gap-2"><Home size={14} /> Torre {verificada.usuarioTorre}, Apto {verificada.usuarioApto}</p>
            )}
            <p className="flex items-center gap-2"><Clock size={14} />
              {new Date(verificada.fechaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              {" → "}
              {new Date(verificada.fechaFin).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="flex items-center gap-2"><MapPin size={14} /> {verificada.areaNombre}</p>
          </div>
        </div>
      )}

      {/* Lista de reservas activas */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-accent px-1">
          Reservas activas hoy ({reservasActivas.length})
        </h3>
        {reservasActivas.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-border rounded-3xl">
            <Clock className="mx-auto text-text/30 mb-2" size={32} />
            <p className="text-text/50 text-xs">No hay reservas activas hoy</p>
          </div>
        )}
        {reservasActivas.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl p-4 border border-border bg-surface flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent shrink-0">
              <User size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text truncate">{r.usuarioNombre}</p>
              <p className="text-[10px] text-text/60">
                {r.usuarioTorre && r.usuarioApto
                  ? `Torre ${r.usuarioTorre}, Apto ${r.usuarioApto}`
                  : "Sin unidad"}
                {" · "}
                {new Date(r.fechaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                {" → "}
                {new Date(r.fechaFin).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <span
              className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                r.estado === "CONFIRMADA"
                  ? "bg-[#57bf00]/20 text-[#57bf00]"
                  : "bg-text/10 text-text/60"
              }`}
            >
              {r.estado === "CONFIRMADA" ? "Activa" : r.estado}
            </span>
          </div>
        ))}
      </section>

      {/* Reservas pasadas */}
      {reservasPasadas.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text/40 px-1">
            Finalizadas hoy ({reservasPasadas.length})
          </h3>
          {reservasPasadas.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl p-4 border border-border/50 bg-surface/50 flex items-center gap-3 opacity-60"
            >
              <div className="w-10 h-10 rounded-xl bg-text/10 flex items-center justify-center text-text/40 shrink-0">
                <Check size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{r.usuarioNombre}</p>
                <p className="text-[10px] text-text/40">
                  {new Date(r.fechaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {new Date(r.fechaFin).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

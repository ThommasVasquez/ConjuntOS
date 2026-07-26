"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { Camera, X, Check, Clock, User, MapPin, Home } from "lucide-react";
import { Scanner } from "@yudiel/react-qr-scanner";
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const processingRef = useRef(false);

  const areaNombre = role === "ADMINISTRADOR_PISCINA" ? "Piscina" : "Gimnasio";
  const areaColor = role === "ADMINISTRADOR_PISCINA" ? "cyan" : "emerald";

  const fetchReservas = async () => {
    if (!user) return;
    try {
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
      // Silent — API may not have authorization yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchReservas();
  }, [user]);

  const verificarQR = async (code: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setVerifying(true);
    setScanning(false);
    try {
      const data = await api.get<ReservaAdmin>(`/reservas/${code}/verificar`);
      setVerificada(data);
      toast.success(`Reserva verificada: ${data.usuarioNombre}`);
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : "Error de conexion";
      toast.error(detail);
      setVerificada(null);
    } finally {
      setVerifying(false);
      processingRef.current = false;
    }
  };

  const handleScan = useCallback(
    (detectedCodes: { rawValue: string }[]) => {
      if (detectedCodes.length > 0 && !processingRef.current) {
        void verificarQR(detectedCodes[0].rawValue);
      }
    },
    []
  );

  const handleScanError = useCallback((error: any) => {
    const kind = error?.kind || error?.name || '';
    if (kind === 'permission-denied') {
      setCameraError("Permiso de cámara denegado.");
    } else if (kind === 'no-camera') {
      setCameraError("No se detectó cámara.");
    } else if (!window.isSecureContext) {
      setCameraError("Se requiere HTTPS para la cámara.");
    } else {
      setCameraError("Cámara no disponible.");
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
 <div className="animate-pulse bg-text/10 h-6 w-6 rounded-full" />
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
          Reservas del dia — {areaNombre}
        </p>
      </div>

      {/* Scanner toggle */}
      <button
        onClick={() => {
          if (scanning) {
            setScanning(false);
            setVerificada(null);
            setCameraError(null);
          } else {
            if (!window.isSecureContext) {
              setCameraError("Se requiere HTTPS para la cámara.");
              return;
            }
            setCameraError(null);
            setScanning(true);
            setVerificada(null);
          }
        }}
        className={`w-full rounded-2xl p-4 border-2 flex items-center justify-center gap-3 font-bold text-sm transition-all active:scale-95 ${
          scanning
            ? "border-red-500 bg-red-500/20 text-red-400"
            : "border-accent bg-accent/10 text-accent"
        }`}
      >
        {scanning ? (
          <>
            <X size={20} /> Detener escaner
          </>
        ) : (
          <>
            <Camera size={20} /> Escanear QR de reserva
          </>
        )}
      </button>

      {/* Camera view */}
      {scanning && (
        <div className="relative w-full aspect-square rounded-3xl overflow-hidden border-2 border-accent/40 bg-black">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center h-full p-6 gap-3 bg-red-500/10 border border-red-500/30 rounded-3xl">
              <p className="text-xs text-red-400 text-center">{cameraError}</p>
              <button onClick={() => { setScanning(false); setCameraError(null); }} className="text-xs font-bold text-accent px-3 py-1.5 rounded-xl bg-accent/10">Cerrar</button>
            </div>
          ) : (
            <>
              <Scanner
                onScan={handleScan}
                onError={handleScanError}
                constraints={{ facingMode: "environment" }}
                styles={{
                  container: { width: "100%", height: "100%", borderRadius: "1.5rem" },
                  video: { width: "100%", height: "100%", objectFit: "cover" },
                }}
              />
              <div className="absolute inset-0 border-[3px] border-accent/60 rounded-3xl m-8 pointer-events-none" />
              <p className="absolute bottom-4 left-0 right-0 text-center text-white text-xs bg-black/50 py-2">
                Apunta al codigo QR de la reserva
              </p>
            </>
          )}
        </div>
      )}

      {/* Verifying */}
      {verifying && (
        <div className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-accent/10 border border-accent/20">
 <div className="animate-pulse bg-text/10 h-5 w-5 rounded-full" />
          <span className="text-sm text-accent font-bold">Verificando reserva...</span>
        </div>
      )}

      {/* Verification result */}
      {verificada && (
        <div className="rounded-2xl p-4 border-2 border-[#57bf00] bg-[#57bf00]/10 space-y-2">
          <div className="flex items-center gap-2 text-[#57bf00] font-bold">
            <Check size={20} /> Reserva valida!
          </div>
          <div className="space-y-1 text-sm text-text">
            <p className="flex items-center gap-2"><User size={14} /> {verificada.usuarioNombre}</p>
            {verificada.usuarioTorre && verificada.usuarioApto && (
              <p className="flex items-center gap-2"><Home size={14} /> Torre {verificada.usuarioTorre}, Apto {verificada.usuarioApto}</p>
            )}
            <p className="flex items-center gap-2"><Clock size={14} />
              {new Date(verificada.fechaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              {" \u2192 "}
              {new Date(verificada.fechaFin).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="flex items-center gap-2"><MapPin size={14} /> {verificada.areaNombre}</p>
          </div>
        </div>
      )}

      {/* Active reservations */}
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
                {" \u00b7 "}
                {new Date(r.fechaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                {" \u2192 "}
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

      {/* Past reservations */}
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
                  {" \u2192 "}
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

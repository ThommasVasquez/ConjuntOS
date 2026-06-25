"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Calendar, Clock, Car, User, DoorOpen, Dumbbell, Waves, QrCode, X, Maximize2 } from "lucide-react";
import ReservaSection from "@/components/reservas/ReservaSection";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface MiPaseDto {
  id: string;
  nombre_anfitrion: string;
  nombre_huesped: string;
  codigo_acceso: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  permiso_gimnasio: boolean;
  permiso_piscina: boolean;
  permiso_entrada_salida: boolean;
  permiso_vehiculo: boolean;
  permiso_asamblea: boolean;
  vehiculos: { placa: string; marca?: string; modelo?: string; color?: string }[];
}

export default function MiEstanciaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [pase, setPase] = useState<MiPaseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }

    api.get<MiPaseDto>("/pases-temporales/mi-pase")
      .then(data => setPase(data))
      .catch(() => toast.error("No tienes una estancia activa"))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!pase) {
    return (
      <div className="min-h-screen bg-primary">
        <ProfileHeader />
        <div className="p-6 text-center">
          <User size={48} className="mx-auto text-text-secondary mb-4" />
          <p className="text-text text-lg mb-2">No tienes una estancia activa</p>
          <p className="text-text-secondary text-sm">
            Contacta al administrador de tu conjunto para obtener acceso.
          </p>
        </div>
      </div>
    );
  }

  const inicio = new Date(pase.fecha_inicio + "T00:00:00");
  const fin = new Date(pase.fecha_fin + "T00:00:00");
  const hoy = new Date();
  const diasRestantes = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-primary pt-16 pb-28">
      <ProfileHeader className="px-4" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* Info del anfitrión */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border">
          <h2 className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-3">Anfitrión</h2>
          <div className="flex items-center gap-3">
            <div className="bg-accent/10 rounded-full p-2">
              <User size={20} className="text-accent" />
            </div>
            <div>
              <span className="text-text font-medium text-lg">{pase.nombre_anfitrion}</span>
            </div>
          </div>
        </div>

        {/* Fechas */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border">
          <h2 className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-3">Estancia</h2>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-text-secondary text-xs mb-1">Check-in</p>
              <p className="text-text font-medium">{inicio.toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" })}</p>
            </div>
            <div className="text-right">
              <p className="text-text-secondary text-xs mb-1">Check-out</p>
              <p className="text-text font-medium">{fin.toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" })}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
            <Clock size={16} className={diasRestantes <= 1 ? "text-red-400" : "text-accent"} />
            <span className="text-text text-sm">
              {diasRestantes <= 0
                ? "Último día"
                : `${diasRestantes} día${diasRestantes !== 1 ? "s" : ""} restante${diasRestantes !== 1 ? "s" : ""}`
              }
            </span>
          </div>
        </div>

        {/* Permisos */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border">
          <h2 className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-3">Permisos</h2>
          <div className="grid grid-cols-2 gap-2">
            {pase.permiso_entrada_salida && <PermisoBadge icon={DoorOpen} label="Entrada/Salida" />}
            {pase.permiso_gimnasio && <PermisoBadge icon={Dumbbell} label="Gimnasio" />}
            {pase.permiso_piscina && <PermisoBadge icon={Waves} label="Piscina" />}
            {pase.permiso_vehiculo && <PermisoBadge icon={Car} label="Vehículo" />}
            {pase.permiso_asamblea && <PermisoBadge icon={Calendar} label="Asamblea" />}
          </div>
          {!pase.permiso_entrada_salida && !pase.permiso_gimnasio && !pase.permiso_piscina && !pase.permiso_vehiculo && !pase.permiso_asamblea && (
            <p className="text-text-secondary text-sm">Sin permisos especiales</p>
          )}
        </div>

        {/* Reservar áreas comunes */}
        {(() => {
          const excludedAreas: string[] = [];
          if (!pase.permiso_gimnasio) excludedAreas.push("Gimnasio");
          if (!pase.permiso_piscina) excludedAreas.push("Piscina");
          return (
            <div className="bg-surface-2 rounded-xl p-4 border border-border">
              <h2 className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-3">Reservar áreas</h2>
              <ReservaSection excludedAreas={excludedAreas} />
            </div>
          );
        })()}

        {/* Vehículos */}
        {pase.vehiculos && pase.vehiculos.length > 0 && (
          <div className="bg-surface-2 rounded-xl p-4 border border-border">
            <h2 className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-3">Vehículos</h2>
            <div className="space-y-2">
              {pase.vehiculos.map((v, i) => (
                <div key={i} className="flex items-center gap-3 bg-surface rounded-lg p-3">
                  <Car size={18} className="text-accent" />
                  <div>
                    <span className="text-text font-mono font-bold">{v.placa}</span>
                    {(v.marca || v.color) && (
                      <span className="text-text-secondary text-sm ml-2">
                        {[v.marca, v.color].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Código de acceso */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border text-center">
          <QrCode size={24} className="mx-auto text-accent mb-2" />
          <p className="text-text-secondary text-xs mb-1">Tu código de acceso</p>
          <p className="text-3xl font-mono font-bold text-accent tracking-[0.3em] select-all">{pase.codigo_acceso}</p>
          <button
            onClick={() => setShowQR(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-surface border border-border text-text text-sm font-medium hover:bg-surface-2 transition-colors"
          >
            <Maximize2 size={16} />
            Mostrar código QR
          </button>
          <p className="text-text-secondary text-xs mt-2">Muéstralo en portería al ingresar</p>
        </div>

        {/* Modal QR */}
        {showQR && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowQR(false)}>
            <div
              className="bg-primary border border-border rounded-[28px] p-6 flex flex-col items-center gap-4 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between w-full">
                <h2 className="text-lg font-bold text-text">Código QR de acceso</h2>
                <button onClick={() => setShowQR(false)} className="text-text/60 hover:text-text">
                  <X size={22} />
                </button>
              </div>
              <div className="bg-white rounded-2xl p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pase.codigo_acceso)}`}
                  alt="QR de acceso"
                  width={250}
                  height={250}
                  className="rounded-lg"
                />
              </div>
              <p className="text-3xl font-mono font-bold text-accent tracking-[0.3em] select-all">{pase.codigo_acceso}</p>
              <p className="text-text-secondary text-xs text-center">Muestra este QR en portería para validar tu ingreso</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function PermisoBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-surface rounded-lg p-2.5">
      <Icon size={16} className="text-accent" />
      <span className="text-sm text-text">{label}</span>
    </div>
  );
}

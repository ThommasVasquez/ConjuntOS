"use client";

import { useEffect, useRef, useState } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { 
  Eye, Activity, Clock, Shield, Check, RotateCcw, Maximize2, Play, Pause, AlertTriangle, ChevronLeft, ClipboardList
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { gsap } from "gsap";
import { api } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface Camera {
  id: number;
  name: string;
  location: string;
  status: "ONLINE" | "ALERTA";
  fps: number;
}

export default function SeguridadPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const role = user?.rol;

  const [activeTab, setActiveTab] = useState<"cctv" | "rondas">("cctv");
  const [selectedCam, setSelectedCam] = useState<Camera | null>(null);
  const [thermalFilter, setThermalFilter] = useState(false);
  const [camStatus, setCamStatus] = useState<"LIVE" | "PAUSED">("LIVE");

  // References for Canvas animations
  const canvasRefs = [
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLCanvasElement>(null)
  ];

  const cameras: Camera[] = [
    { id: 1, name: "CAM-01", location: "Lobby Principal", status: "ONLINE", fps: 30 },
    { id: 2, name: "CAM-02", location: "Sótano Parqueadero", status: "ONLINE", fps: 24 },
    { id: 3, name: "CAM-03", location: "Portería Principal", status: "ONLINE", fps: 30 },
    { id: 4, name: "CAM-04", location: "Ascensores Torres", status: "ONLINE", fps: 25 }
  ];

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    gsap.fromTo(".fade-up", { opacity: 0, y: 15 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
  }, [user, authLoading, role, router]);

  // Handle drawing mock security feed inside canvases
  useEffect(() => {
    if (activeTab !== "cctv" || camStatus === "PAUSED") return;

    const animIds: number[] = [];

    cameras.forEach((cam, index) => {
      const canvas = canvasRefs[index].current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let width = canvas.width = 320;
      let height = canvas.height = 240;
      let frameCount = 0;

      // Draw loop
      const draw = () => {
        if ((camStatus as string) === "PAUSED") return;
        frameCount++;

        // Clear
        ctx.fillStyle = thermalFilter ? "#110022" : "#0a0f0d";
        ctx.fillRect(0, 0, width, height);

        // Draw simulated grids & elements
        ctx.strokeStyle = thermalFilter ? "rgba(180, 50, 240, 0.1)" : "rgba(52, 211, 153, 0.1)";
        ctx.lineWidth = 1;
        
        // Horizontal grid lines
        for (let y = 0; y < height; y += 20) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        // Vertical grid lines
        for (let x = 0; x < width; x += 20) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        // Draw simulated CCTV artifacts
        // 1. Scanning lines moving down
        const scanY = (frameCount * 2) % height;
        ctx.fillStyle = thermalFilter ? "rgba(239, 68, 68, 0.08)" : "rgba(52, 211, 153, 0.06)";
        ctx.fillRect(0, scanY, width, 4);

        // 2. Mock 3D rooms / shapes simulating security views
        ctx.strokeStyle = thermalFilter ? "#ef4444" : "#10b981";
        ctx.lineWidth = 2;
        
        if (index === 0) {
          // Lobby - walls perspective
          ctx.beginPath();
          ctx.moveTo(30, 30); ctx.lineTo(100, 70); ctx.lineTo(100, 170); ctx.lineTo(30, 210);
          ctx.moveTo(290, 30); ctx.lineTo(220, 70); ctx.lineTo(220, 170); ctx.lineTo(290, 210);
          ctx.moveTo(100, 70); ctx.lineTo(220, 70);
          ctx.moveTo(100, 170); ctx.lineTo(220, 170);
          ctx.stroke();

          // Simulating a person moving back and forth
          const px = 140 + Math.sin(frameCount * 0.03) * 30;
          ctx.fillStyle = thermalFilter ? "#f59e0b" : "#34d399";
          ctx.beginPath();
          ctx.arc(px, 120, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(px - 4, 128, 8, 20);
        } else if (index === 1) {
          // Parking basement columns
          ctx.beginPath();
          ctx.rect(50, 40, 30, 160);
          ctx.rect(240, 40, 30, 160);
          ctx.stroke();

          // Parking car silhouette (bounding box)
          const carX = 110 + Math.cos(frameCount * 0.01) * 5;
          ctx.strokeStyle = thermalFilter ? "#ec4899" : "#60a5fa";
          ctx.beginPath();
          ctx.rect(carX, 110, 100, 50);
          ctx.stroke();
        } else if (index === 2) {
          // Entrance Gate
          ctx.beginPath();
          ctx.moveTo(10, 180); ctx.lineTo(310, 180);
          ctx.moveTo(80, 80); ctx.lineTo(240, 80);
          ctx.stroke();

          // Bouncing Gate Arm
          const angle = Math.abs(Math.sin(frameCount * 0.01)) * 40;
          ctx.save();
          ctx.translate(60, 150);
          ctx.rotate((-angle * Math.PI) / 180);
          ctx.strokeStyle = "#f43f5e";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(150, 0);
          ctx.stroke();
          ctx.restore();
        } else {
          // Elevators doors
          ctx.beginPath();
          ctx.rect(60, 60, 90, 120);
          ctx.rect(170, 60, 90, 120);
          ctx.stroke();
          
          // Slider doors moving
          const doorW = 40 - Math.abs(Math.sin(frameCount * 0.01)) * 30;
          ctx.fillStyle = "rgba(52, 211, 153, 0.2)";
          ctx.fillRect(60, 60, doorW, 120);
          ctx.fillRect(150 - doorW, 60, doorW, 120);
        }

        // Noise glitches
        if (Math.random() > 0.98) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
          ctx.fillRect(Math.random() * width, Math.random() * height, 100, 2);
        }

        // Overlay text details
        ctx.fillStyle = thermalFilter ? "#f87171" : "#10b981";
        ctx.font = "bold 9px monospace";
        ctx.fillText(`${cam.name} - ${cam.location.toUpperCase()}`, 12, 20);
        ctx.fillText(`FPS: ${cam.fps} [${cam.status}]`, 12, 32);

        // Flashing REC text
        if (Math.floor(frameCount / 30) % 2 === 0) {
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(295, 17, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = "bold 8px monospace";
          ctx.fillText("REC", 274, 20);
        }

        // Realtime Clock overlay
        ctx.fillStyle = thermalFilter ? "#f87171" : "#10b981";
        ctx.font = "bold 9px monospace";
        ctx.fillText(new Date().toLocaleString(), 12, 225);

        animIds[index] = requestAnimationFrame(draw);
      };

      draw();
    });

    return () => {
      animIds.forEach(id => cancelAnimationFrame(id));
    };
  }, [activeTab, thermalFilter, camStatus]);

interface RondaDto {
  id: string;
  hallazgos: string | null;
  completada: boolean;
  fecha: string;
}

interface PuntoRondaDto {
  id: string;
  nfc_uid: string;
  nombre: string;
  ubicacion: string | null;
  orden: number;
  activo: boolean;
}

interface CheckpointRondaDto {
  id: string;
  punto_id: string;
  nfc_uid: string;
  punto_nombre: string;
  verificado_en: string;
}

interface RondaConCheckpointsDto extends RondaDto {
  puntos_totales: number;
  checkpoints: CheckpointRondaDto[];
  completada_nfc: boolean;
}

  // ── Rondas NFC (backend + Web NFC) ──────────────────────────────────
  const [rondaHoy, setRondaHoy] = useState<RondaDto | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRondaDto[]>([]);
  const [puntosRonda, setPuntosRonda] = useState<PuntoRondaDto[]>([]);
  const [puntosTotales, setPuntosTotales] = useState(0);
  const [completadaNfc, setCompletadaNfc] = useState(false);
  const [hallazgos, setHallazgos] = useState("");
  const [rondaLoading, setRondaLoading] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [lastTapPoint, setLastTapPoint] = useState<string | null>(null);

  // Detectar soporte Web NFC (solo Chrome Android)
  useEffect(() => {
    setNfcSupported(typeof window !== "undefined" && "NDEFReader" in window);
  }, []);

  const fetchPuntosRonda = async () => {
    try {
      const pts = await api.get<PuntoRondaDto[]>('/parqueadero/puntos-ronda');
      setPuntosRonda(pts || []);
      setPuntosTotales(pts?.length || 0);
    } catch {}
  };

  const fetchRonda = async () => {
    try {
      const data = await api.get<RondaDto | null>('/parqueadero/rondas');
      setRondaHoy(data);
      if (data?.hallazgos) setHallazgos(data.hallazgos);
      if (data?.id) {
        try {
          const cp = await api.get<RondaConCheckpointsDto>(`/parqueadero/rondas/${data.id}/checkpoints`);
          setCheckpoints(cp?.checkpoints || []);
          setCompletadaNfc(cp?.completada_nfc || false);
          setPuntosTotales(cp?.puntos_totales || 0);
        } catch {}
      }
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    fetchRonda();
    fetchPuntosRonda();
  }, [user]);

  // Real-time WebSocket subscription for ronda checkpoint updates
  useWsSubscription('ronda', () => {
    fetchRonda();
    fetchPuntosRonda();
  });

  const startRound = async () => {
    setRondaLoading(true);
    try {
      const r = await api.post<RondaDto>('/parqueadero/rondas', { hallazgos: "", completada: false });
      setRondaHoy(r);
      setCheckpoints([]);
      setCompletadaNfc(false);
      setHallazgos("");
      setNfcError(null);
      toast.success("Ronda de vigilancia iniciada");
    } catch {
      toast.error("Error al iniciar ronda");
    } finally {
      setRondaLoading(false);
    }
  };

  const submitRound = async () => {
    if (!hallazgos.trim()) {
      toast.error("Registra al menos una observación en los hallazgos");
      return;
    }
    setRondaLoading(true);
    try {
      const r = await api.post<RondaDto>('/parqueadero/rondas', { hallazgos: hallazgos.trim(), completada: true });
      setRondaHoy(r);
      toast.success("Ronda completada y registrada");
    } catch {
      toast.error("Error al registrar ronda");
    } finally {
      setRondaLoading(false);
    }
  };

  // Escanear NFC y registrar checkpoint
  const scanNfc = async () => {
    if (!nfcSupported) {
      setNfcError("NFC no soportado en este dispositivo/navegador. Usa Chrome en Android.");
      return;
    }
    if (!rondaHoy || rondaHoy.completada) {
      setNfcError("Inicia una ronda primero");
      return;
    }
    setNfcScanning(true);
    setNfcError(null);
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      toast.success("Acerca el celular a un tag NFC...");

      ndef.onreading = async ({ serialNumber }: { serialNumber: string }) => {
        setNfcScanning(false);
        setLastTapPoint("Tag detectado: " + serialNumber);
        try {
          const cp = await api.post<CheckpointRondaDto>('/parqueadero/rondas/checkpoint', {
            nfc_uid: serialNumber,
            ronda_id: rondaHoy!.id,
          });
          setCheckpoints(prev => [...prev, cp]);
          setNfcError(null);
          const nuevoTotal = checkpoints.length + 1;
          setCompletadaNfc(nuevoTotal >= puntosTotales);
          toast.success("✓ " + cp.punto_nombre + " registrado");
          setLastTapPoint(null);
        } catch (err: any) {
          const msg = err?.message || err?.error || "Error al registrar";
          setNfcError(msg.includes("duplicate") || msg.includes("ya fue registrado")
            ? "Este punto ya fue registrado en esta ronda"
            : msg);
          toast.error("Error al registrar checkpoint");
        }
      };

      ndef.onreadingerror = () => {
        setNfcScanning(false);
        setNfcError("Error al leer el tag NFC. Intenta de nuevo.");
      };
    } catch (err: any) {
      setNfcScanning(false);
      setNfcError(err?.message || "Error al activar el lector NFC");
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
      <ProfileHeader />

      {/* HEADER SECTION */}
      <div className="fade-up flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/inicio')} 
            className="w-10 h-10 rounded-full bg-text/5 hover:bg-text/10 flex items-center justify-center text-text transition-all cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-text flex items-center gap-2">
              <Shield className="text-blue-400" size={22} /> Central de Seguridad
            </h2>
            <p className="text-xs text-text/70">Monitoreo CCTV y Rondas de Vigilancia</p>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="fade-up flex border-b border-border/50 pb-2 gap-6 z-10">
        <button 
          onClick={() => setActiveTab("cctv")}
          className={`text-xs font-black uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
            activeTab === "cctv" ? "border-blue-400 text-blue-400" : "border-transparent text-text/50 hover:text-text/70"
          }`}
        >
          CCTV Monitor Grid
        </button>
        <button 
          onClick={() => setActiveTab("rondas")}
          className={`text-xs font-black uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
            activeTab === "rondas" ? "border-blue-400 text-blue-400" : "border-transparent text-text/50 hover:text-text/70"
          }`}
        >
          Control de Rondas
        </button>
      </div>

      {/* TAB CONTENT: CCTV */}
      {activeTab === "cctv" && (
        <div className="fade-up flex flex-col gap-6 z-10">
          
          {/* CONTROLS */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-2/30 p-3 rounded-2xl border border-border/50 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setCamStatus(prev => prev === "LIVE" ? "PAUSED" : "LIVE")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary border border-border hover:bg-primary-light rounded-xl text-[10px] font-bold text-text/80 cursor-pointer"
              >
                {camStatus === "LIVE" ? <Pause size={12}/> : <Play size={12}/>}
                {camStatus === "LIVE" ? "Congelar Feeds" : "Reanudar"}
              </button>
              <button 
                onClick={() => setThermalFilter(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-[10px] font-bold cursor-pointer transition-all ${
                  thermalFilter 
                    ? "bg-purple-600 border-purple-500 text-white" 
                    : "bg-primary border-border hover:bg-primary-light text-text/80"
                }`}
              >
                <Activity size={12}/>
                {thermalFilter ? "Filtro Térmico: Activo" : "Filtro Térmico"}
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-text/50 uppercase tracking-widest font-black">Servidor CCTV Online</span>
            </div>
          </div>

          {/* GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cameras.map((cam, i) => (
              <div 
                key={cam.id} 
                className="liquid-glass border border-border/70 rounded-[28px] overflow-hidden flex flex-col shadow-xl"
              >
                <div className="relative aspect-[4/3] bg-black">
                  <canvas 
                    ref={canvasRefs[i]} 
                    className={`w-full h-full object-cover transition-all ${thermalFilter ? 'hue-rotate-60 invert-0' : ''}`}
                  />
                  <div className="absolute top-3 right-3 flex gap-2">
                    <button 
                      onClick={() => setSelectedCam(cam)}
                      className="w-7 h-7 bg-black/60 rounded-lg flex items-center justify-center text-white hover:bg-black/80 transition-all cursor-pointer"
                    >
                      <Maximize2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between border-t border-border/40">
                  <div>
                    <h4 className="text-sm font-bold text-text mb-0.5">{cam.location}</h4>
                    <p className="text-[10px] text-text/50">Dispositivo: {cam.name} • Resolución: 720p</p>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                    cam.status === "ONLINE" 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}>
                    {cam.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: RONDAS */}
      {activeTab === "rondas" && (
        <div className="fade-up flex flex-col gap-6 z-10">
          
          <div className="liquid-glass rounded-3xl p-6 border border-border shadow-xl flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-4">
              <div>
                <h3 className="text-base font-bold text-text">Bitácora de Rondas de Guardia</h3>
                <p className="text-xs text-text/60">Auditoría obligatoria de seguridad con verificación NFC</p>
              </div>
              
              {!rondaHoy || rondaHoy.completada ? (
                <button 
                  onClick={startRound}
                  disabled={rondaLoading}
                  className="bg-blue-500 hover:bg-blue-600 text-black text-xs font-black uppercase tracking-widest px-4 py-3 rounded-2xl transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  {rondaLoading ? "Iniciando…" : "Iniciar Ronda"}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-2xl">
                    <Clock size={14} /> En curso
                  </div>
                  <button 
                    onClick={submitRound}
                    disabled={rondaLoading || !completadaNfc}
                    className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-black uppercase tracking-widest px-4 py-3 rounded-2xl transition-all cursor-pointer shadow-lg disabled:opacity-50"
                    title={!completadaNfc ? "Debes visitar todos los puntos NFC primero" : "Concluir ronda"}
                  >
                    {rondaLoading ? "Registrando…" : "Concluir Ronda"}
                  </button>
                </div>
              )}
            </div>

            {/* ── Progreso de checkpoints NFC ── */}
            {rondaHoy && !rondaHoy.completada && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text/60">
                    Puntos de Ronda NFC
                  </label>
                  <span className="text-[10px] font-bold text-text/50">
                    {checkpoints.length}/{puntosTotales || puntosRonda.length}
                  </span>
                </div>
                
                {/* Barra de progreso */}
                <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-400 rounded-full transition-all duration-500"
                    style={{ width: `${puntosTotales > 0 ? (checkpoints.length / (puntosTotales || puntosRonda.length)) * 100 : 0}%` }}
                  />
                </div>

                {/* Lista de puntos con estado */}
                <div className="grid gap-1.5">
                  {(puntosRonda.length > 0 ? puntosRonda : []).map((punto) => {
                    const verificado = checkpoints.some(cp => cp.punto_id === punto.id);
                    return (
                      <div 
                        key={punto.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all ${
                          verificado 
                            ? "bg-emerald-500/10 border border-emerald-500/20" 
                            : "bg-surface-2/50 border border-border/30"
                        }`}
                      >
                        {verificado 
                          ? <Check size={14} className="text-emerald-400 shrink-0" />
                          : <div className="w-3.5 h-3.5 rounded-full border-2 border-text/20 shrink-0" />
                        }
                        <span className={verificado ? "text-emerald-400 font-medium" : "text-text/60"}>
                          {punto.nombre}
                        </span>
                        {punto.ubicacion && (
                          <span className="text-text/30 truncate ml-auto text-[10px]">{punto.ubicacion}</span>
                        )}
                      </div>
                    );
                  })}
                  {puntosRonda.length === 0 && (
                    <p className="text-[10px] text-text/30 italic text-center py-2">
                      No hay puntos NFC configurados. Contacta al administrador.
                    </p>
                  )}
                </div>

                {/* Botón NFC */}
                <button
                  onClick={scanNfc}
                  disabled={nfcScanning || !nfcSupported || !!rondaHoy?.completada}
                  className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                    nfcSupported
                      ? "bg-[#009df2] hover:bg-[#0088d4] text-white shadow-lg"
                      : "bg-surface-2 border border-border text-text/40"
                  } disabled:opacity-50`}
                >
                  {nfcScanning ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Escaneando…
                    </>
                  ) : nfcSupported ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 8a6 6 0 0 1 12 0c0 7-6 14-6 14S6 15 6 8"/><circle cx="12" cy="8" r="2"/>
                      </svg>
                      Escanear Tag NFC
                    </>
                  ) : (
                    "NFC no disponible"
                  )}
                </button>

                {/* Mensajes NFC */}
                {!nfcSupported && (
                  <p className="text-[10px] text-amber-400/80 text-center">
                    ⚠️ El escaneo NFC solo funciona en Chrome para Android. Usa un celular Android compatible.
                  </p>
                )}

                {lastTapPoint && (
                  <p className="text-[11px] text-blue-400 font-mono text-center bg-blue-500/5 rounded-lg py-1.5 animate-pulse">
                    {lastTapPoint}
                  </p>
                )}

                {nfcError && (
                  <p className="text-[11px] text-red-400 bg-red-500/10 rounded-lg px-3 py-2 text-center">
                    {nfcError}
                  </p>
                )}
              </div>
            )}

            {/* Hallazgos textarea */}
            {rondaHoy && !rondaHoy.completada && (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text/60">Hallazgos / Observaciones</label>
                <textarea
                  value={hallazgos}
                  onChange={(e) => setHallazgos(e.target.value)}
                  placeholder="Registra aquí cualquier novedad: luces apagadas, puertas abiertas, personas sospechosas, vehículos mal estacionados…"
                  rows={4}
                  className="w-full bg-surface-2 border border-border rounded-2xl p-4 text-sm text-text focus:outline-none focus:border-text/30 resize-none placeholder:text-text/30"
                />
              </div>
            )}

            {/* Ronda completada hoy */}
            {rondaHoy?.completada && (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Check size={18} className="text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-400">Ronda completada hoy</span>
                </div>
                {checkpoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-7">
                    {checkpoints.map(cp => (
                      <span key={cp.id} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                        ✓ {cp.punto_nombre}
                      </span>
                    ))}
                  </div>
                )}
                {rondaHoy.hallazgos && (
                  <p className="text-xs text-text/70 italic pl-7">«{rondaHoy.hallazgos}»</p>
                )}
                <button
                  onClick={startRound}
                  disabled={rondaLoading}
                  className="self-start mt-2 px-4 py-2 bg-surface border border-border rounded-xl text-xs font-bold text-text hover:bg-surface-2 transition-all disabled:opacity-50"
                >
                  <RotateCcw size={12} className="inline mr-1.5" />
                  Iniciar otra ronda
                </button>
              </div>
            )}

            {/* Sin ronda hoy */}
            {!rondaHoy && (
              <div className="p-8 rounded-2xl bg-surface-3/30 border border-dashed border-border/40 flex flex-col items-center gap-3 text-center">
                <ClipboardList size={32} className="text-text/30" />
                <p className="text-xs text-text/50 font-medium">No hay rondas registradas hoy</p>
                <p className="text-[10px] text-text/40">Inicia una ronda para recorrer los puntos NFC de inspección</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CAM ZOOM VIEW */}
      {selectedCam && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedCam(null)} />
          <div className="liquid-glass-card rounded-[32px] overflow-hidden w-full max-w-[640px] border border-border relative z-10 flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border/50 flex justify-between items-center bg-surface-2/50">
              <div>
                <h3 className="text-base font-bold text-text">{selectedCam.location}</h3>
                <p className="text-[10px] text-text/60">Monitoreo Ampliado • Dispositivo: {selectedCam.name}</p>
              </div>
              <button 
                onClick={() => setSelectedCam(null)}
                className="w-8 h-8 rounded-full bg-text/5 hover:bg-text/10 flex items-center justify-center text-text/70 transition-all cursor-pointer"
              >
                <Check size={18} />
              </button>
            </div>
            
            <div className="relative aspect-[4/3] bg-black">
              {/* Draw zoomed visual placeholder */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <AlertTriangle size={32} className="text-blue-400 mb-2 animate-bounce" />
                <p className="text-sm font-bold text-text">Feed Principal en Alta Definición</p>
                <p className="text-xs text-text/50 mt-1 leading-relaxed">
                  Para optimizar ancho de banda, la transmisión fluida HD se proyecta en la consola central.
                  Estado del enlace de red: <span className="text-emerald-400 font-bold">EXCELENTE (99.8%)</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

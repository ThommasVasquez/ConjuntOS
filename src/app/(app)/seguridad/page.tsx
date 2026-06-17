"use client";

import { useEffect, useRef, useState } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { 
  Eye, Activity, Clock, Shield, Check, RotateCcw, Maximize2, Play, Pause, AlertTriangle, ChevronLeft
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { gsap } from "gsap";

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
  const [roundProgress, setRoundProgress] = useState({
    lobby: false,
    sotano: false,
    ascensores: false,
    perimetro: false
  });
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [roundStartTime, setRoundStartTime] = useState<string | null>(null);

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

  // Round management handlers
  const toggleCheckpoint = (key: keyof typeof roundProgress) => {
    if (!isRoundActive) {
      toast.warning("Inicia la ronda antes de registrar los puntos de control.");
      return;
    }
    setRoundProgress(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const startRound = () => {
    setIsRoundActive(true);
    setRoundStartTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setRoundProgress({ lobby: false, sotano: false, ascensores: false, perimetro: false });
    toast.success("Ronda de vigilancia iniciada. Registra todos los puntos de control.");
  };

  const submitRound = () => {
    const allChecked = Object.values(roundProgress).every(val => val);
    if (!allChecked) {
      toast.error("Debes verificar todos los puntos de control para concluir la ronda.");
      return;
    }

    // Save round novelty inside database logs
    fetch('/api/vigilancia/novedades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo: "Ronda de Seguridad Concluida",
        descripcion: `Ronda de vigilancia nocturna completada sin incidentes. Iniciada a las ${roundStartTime} y cerrada a las ${new Date().toLocaleTimeString()}. Todos los puntos verificados.`,
        tipo: "RONDAS"
      })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        toast.success("Ronda de vigilancia cerrada y registrada en la bitácora.");
        setIsRoundActive(false);
        setRoundStartTime(null);
      } else {
        toast.error("Error al reportar ronda");
      }
    })
    .catch(() => {
      toast.error("Error de conexión");
    });
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
                <p className="text-xs text-text/60">Auditoría obligatoria de seguridad por turnos</p>
              </div>
              
              {!isRoundActive ? (
                <button 
                  onClick={startRound}
                  className="bg-blue-500 hover:bg-blue-600 text-black text-xs font-black uppercase tracking-widest px-4 py-3 rounded-2xl transition-all cursor-pointer shadow-lg"
                >
                  Iniciar Ronda Nocturna
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-2xl">
                    <Clock size={14} className="animate-spin" style={{ animationDuration: '3s' }} /> Inició: {roundStartTime}
                  </div>
                  <button 
                    onClick={submitRound}
                    className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-black uppercase tracking-widest px-4 py-3 rounded-2xl transition-all cursor-pointer shadow-lg"
                  >
                    Concluir y Registrar
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              
              <div 
                onClick={() => toggleCheckpoint("lobby")}
                className={`p-5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  roundProgress.lobby 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                    : isRoundActive ? "bg-surface border-border hover:border-text/30" : "bg-surface-3/30 border-border/40 opacity-60"
                }`}
              >
                <div>
                  <h4 className="text-sm font-bold text-text mb-0.5">Punto 1: Lobby Principal</h4>
                  <p className="text-[10px] text-text/50">Cerradura y citófonos</p>
                </div>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                  roundProgress.lobby ? "bg-emerald-500 border-emerald-500 text-black" : "border-border"
                }`}>
                  {roundProgress.lobby && <Check size={14} />}
                </div>
              </div>

              <div 
                onClick={() => toggleCheckpoint("sotano")}
                className={`p-5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  roundProgress.sotano 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                    : isRoundActive ? "bg-surface border-border hover:border-text/30" : "bg-surface-3/30 border-border/40 opacity-60"
                }`}
              >
                <div>
                  <h4 className="text-sm font-bold text-text mb-0.5">Punto 2: Sótano Parqueaderos</h4>
                  <p className="text-[10px] text-text/50">Inspección de vehículos e iluminación</p>
                </div>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                  roundProgress.sotano ? "bg-emerald-500 border-emerald-500 text-black" : "border-border"
                }`}>
                  {roundProgress.sotano && <Check size={14} />}
                </div>
              </div>

              <div 
                onClick={() => toggleCheckpoint("ascensores")}
                className={`p-5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  roundProgress.ascensores 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                    : isRoundActive ? "bg-surface border-border hover:border-text/30" : "bg-surface-3/30 border-border/40 opacity-60"
                }`}
              >
                <div>
                  <h4 className="text-sm font-bold text-text mb-0.5">Punto 3: Cuarto de Máquinas y Ascensores</h4>
                  <p className="text-[10px] text-text/50">Cuadros eléctricos de torres</p>
                </div>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                  roundProgress.ascensores ? "bg-emerald-500 border-emerald-500 text-black" : "border-border"
                }`}>
                  {roundProgress.ascensores && <Check size={14} />}
                </div>
              </div>

              <div 
                onClick={() => toggleCheckpoint("perimetro")}
                className={`p-5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  roundProgress.perimetro 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                    : isRoundActive ? "bg-surface border-border hover:border-text/30" : "bg-surface-3/30 border-border/40 opacity-60"
                }`}
              >
                <div>
                  <h4 className="text-sm font-bold text-text mb-0.5">Punto 4: Puerta Perimetral Trasera</h4>
                  <p className="text-[10px] text-text/50">Cercas eléctricas y candado</p>
                </div>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                  roundProgress.perimetro ? "bg-emerald-500 border-emerald-500 text-black" : "border-border"
                }`}>
                  {roundProgress.perimetro && <Check size={14} />}
                </div>
              </div>

            </div>
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

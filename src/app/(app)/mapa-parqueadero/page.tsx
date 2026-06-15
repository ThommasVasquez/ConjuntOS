"use client";

import { 
  AlertCircle, ArrowRight, Car, CheckCircle, ClipboardCheck, 
<<<<<<< Updated upstream
  Clock, History, Map, X, Bike, CalendarClock 
=======
  Clock, HelpCircle, History, Map, ShieldCheck, X, Search,
  Phone, Lock, AlertTriangle, BarChart2, Users, Plus, Trash2,
  Bell, TrendingUp, Timer, Calendar
>>>>>>> Stashed changes
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { gsap } from "gsap";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
<<<<<<< Updated upstream
import { useWsSubscription } from "@/hooks/useWebSocket";
=======
import { useCall } from "@/components/providers/CallContext";
>>>>>>> Stashed changes

// ─── Types ────────────────────────────────────────────────────────────────────
interface WaitlistEntry {
  id: string;
  plate: string;
  contact: string;
  note: string;
  arrivedAt: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MapaParqueaderoPage() {
  const [parqueaderos, setParqueaderos] = useState<any[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [lastRound, setLastRound] = useState<any>(null);
  const [reservasProximas, setReservasProximas] = useState<any[]>([]);
  const [busyReservaLlegada, setBusyReservaLlegada] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFloor, setSelectedFloor] = useState("Sótano 1");
  const [activeTab, setActiveTab] = useState<"mapa" | "analytics" | "espera" | "agendamientos">("mapa");
  const [agendados, setAgendados] = useState<any[]>([]);
  const [isLoadingAgendados, setIsLoadingAgendados] = useState(false);
  const [selectedVisitForCell, setSelectedVisitForCell] = useState<any>(null);
  const [showAssignCellModal, setShowAssignCellModal] = useState(false);

  // Search & Directory State
  const [searchQuery, setSearchQuery] = useState("");
  const [residentes, setResidentes] = useState<any[]>([]);
  const [selectedDestinatarioId, setSelectedDestinatarioId] = useState("");

  // Incident Novelty state
  const [isNoveltyFormOpen, setIsNoveltyFormOpen] = useState(false);
  const [novedadTitulo, setNovedadTitulo] = useState("");
  const [novedadDesc, setNovedadDesc] = useState("");
  const [novedadTipo, setNovedadTipo] = useState("INCIDENTE");
  const [timerTick, setTimerTick] = useState(0);
  
  // Modal State
  const [cellToRelease, setCellToRelease] = useState<any>(null);
  // Sesión de cobro de visitante asociada a la celda que se va a liberar.
  const [sesionCobro, setSesionCobro] = useState<any>(null);
  // Reloj que tiquea cada segundo mientras el modal de cobro está abierto, para
  // mostrar el tiempo transcurrido y el monto acumulado EN VIVO (no congelado).
  const [ahora, setAhora] = useState<number>(Date.now());
  useEffect(() => {
    if (!sesionCobro) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sesionCobro]);
  const [liquidando, setLiquidando] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

<<<<<<< Updated upstream
  // Asignación de celda de VISITANTE: requiere elegir el residente que recibe la
  // visita; la asignación la aprueba ese inquilino (no el admin).
  const [cellVisitante, setCellVisitante] = useState<any>(null);
  const [residentes, setResidentes] = useState<any[]>([]);
  const [residenteId, setResidenteId] = useState("");
  const [busquedaRes, setBusquedaRes] = useState("");
  // Tiempo estimado de la visita: minutos, o 'libre' (sin estimado).
  const [tiempoEstimado, setTiempoEstimado] = useState<string>("libre");

  // Asignación de celda de RESIDENTE (permanente): a un apartamento, con placa
  // obligatoria y vigencia opcional. Reemplaza el viejo "Registro de Acceso" sin
  // control. Comparte el selector de residentes (residenteId/busquedaRes).
  const [cellResidente, setCellResidente] = useState<any>(null);
  const [placaResidente, setPlacaResidente] = useState("");
  const [mesesResidente, setMesesResidente] = useState<string>("sin");

  // Nivel/sótano seleccionado. El backend no tiene campo de nivel, así que se
  // deriva del prefijo del número de celda (ej. "S1-01" -> Sótano 1, "S2-..." ->
  // Sótano 2). Las celdas sin prefijo reconocible caen en "Sótano 1" por defecto.
  const [nivel, setNivel] = useState<number>(1);
  const nivelDeCelda = (p: any): number => {
    const m = /^\s*S(?:[ÓO]TANO)?\s*-?\s*(\d+)/i.exec(String(p?.numero || ""));
    return m ? parseInt(m[1], 10) : 1;
  };
  const nivelesDisponibles = Array.from(
    new Set(parqueaderos.map(nivelDeCelda))
  ).sort((a, b) => a - b);
  const celdasDelNivel = parqueaderos.filter((p) => nivelDeCelda(p) === nivel);

=======
<<<<<<< Updated upstream
>>>>>>> Stashed changes
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  // Real-time WebSocket subscription
  useWsSubscription('parqueadero', () => {
    loadData();
    loadExtra();
  });
=======
  // Waiting list state
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [wlPlate, setWlPlate] = useState("");
  const [wlContact, setWlContact] = useState("");
  const [wlNote, setWlNote] = useState("");

  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;
  const { startCall } = useCall();

  // ── Load waitlist from API on mount ──
  useEffect(() => {
    async function fetchWaitlist() {
      try {
        const res = await fetch('/api/parqueadero/lista-espera');
        const data = await res.json();
        if (data.success) {
          setWaitlist(data.data.map((item: any) => ({
             id: item.id,
             plate: item.placa,
             contact: item.apto || "",
             note: "",
             arrivedAt: new Date(item.creadoEn).getTime()
          })));
        }
      } catch { /* ignore */ }
    }
    fetchWaitlist();
  }, []);
>>>>>>> Stashed changes

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ['ENCARGADO_PARQUEADERO', 'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    loadData();
    loadExtra();
<<<<<<< Updated upstream
  }, [user, authLoading, role, router]);
=======
    loadDirectory();
    loadAgendados();
  }, [session, status, role, router]);
>>>>>>> Stashed changes

  // ── Refresh timer every 30s for overtime badge ──
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  async function loadDirectory() {
    try {
      const res = await fetch('/api/user/directory');
      const data = await res.json();
      if (data.success) {
        setResidentes(data.data);
      }
    } catch (e) {
      console.warn("Error loading directory", e);
    }
  }

  async function loadData() {
    try {
      const data = await api.get<any[]>('/parqueadero/mapa');
      setParqueaderos(data);
    } catch (e) {
      toast.error("Error al cargar mapa");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, stagger: 0.05, duration: 0.4 });
    }
  }, [loading]);

  async function loadExtra() {
    try {
      const [regData, rondData] = await Promise.all([
        api.get<any[]>('/parqueadero/registros'),
        api.get<any>('/parqueadero/rondas')
      ]);
<<<<<<< Updated upstream
      setRegistros(regData);
      setLastRound(rondData);
    } catch {
      // Non-critical: historic data unavailable
=======
      const [regData, rondData] = await Promise.all([regRes.json(), rondRes.json()]);
      
      if(regData.success) setRegistros(regData.data);
      if(rondData.success) {
        const rondas = Array.isArray(rondData.data) ? rondData.data : [rondData.data].filter(Boolean);
        setLastRound(rondas[0] ?? null);
      }
    } catch (e) {
      console.warn("Error cargando históricos");
>>>>>>> Stashed changes
    }
    // Directorio de residentes para asignar celdas de visitante (no crítico).
    try {
      const dir = await api.get<any[]>('/directorio');
      setResidentes(dir);
    } catch { /* sin permiso para directorio */ }
    // Reservas de cupo de visitante próximas (no crítico).
    try {
      const res = await api.get<any[]>('/parqueadero/reservas/proximas');
      setReservasProximas(res ?? []);
    } catch { /* sin permiso */ }
  }

<<<<<<< Updated upstream
  const marcarLlegadaReserva = async (id: string) => {
    setBusyReservaLlegada(id);
    try {
      await api.post(`/parqueadero/reservas/${id}/llegada`, {});
      toast.success("Llegada registrada. Asigna la celda de visitante al residente.");
      loadExtra();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo registrar la llegada");
    } finally {
      setBusyReservaLlegada(null);
    }
=======
  async function loadAgendados() {
    setIsLoadingAgendados(true);
    try {
      const res = await fetch('/api/vigilancia/visitas');
      const data = await res.json();
      if (data.success) {
        const filtered = data.data.filter((v: any) => 
          v.tipo === 'VEHICULAR' && 
          ['PENDIENTE', 'CELDA_ASIGNADA', 'CONFIRMADA', 'EXPIRADA'].includes(v.estadoVisita)
        );
        setAgendados(filtered);
      }
    } catch (e) {
      console.warn("Error cargando agendados:", e);
    } finally {
      setIsLoadingAgendados(false);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const parseObservacion = (obsText: string) => {
    if (!obsText) return { cleanObs: "", residentId: "", apto: "" };
    const match = obsText.match(/^\[Destino:\s*Apto\s*([^|]+)\s*\|\s*ResidentId:\s*([^\]]+)\]\s*(.*)$/);
    if (match) {
      return {
        apto: match[1].trim(),
        residentId: match[2].trim(),
        cleanObs: match[3].trim()
      };
    }
    return { cleanObs: obsText, residentId: "", apto: "" };
  };

  const getElapsedTimeStr = (fecha: string) => {
    if (!fecha) return "";
    const diffMs = Date.now() - new Date(fecha).getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  const getElapsedMs = (fecha: string) => {
    if (!fecha) return 0;
    return Date.now() - new Date(fecha).getTime();
  };

  const isOvertime = (fecha: string) => {
    if (!fecha) return false;
    return getElapsedMs(fecha) >= 4 * 3600000; // 4 hours limit
>>>>>>> Stashed changes
  };

  const handleCellClick = (cell: any) => {
    setSelectedCell(cell);
    setIsNoveltyFormOpen(false);
    if (cell.estado === 'DISPONIBLE') {
<<<<<<< Updated upstream
      // Celda de VISITANTE: se asigna a un residente que la debe aprobar.
      if (cell.tipo === 'VISITANTE') {
        setCellVisitante(cell);
        setResidenteId("");
        setBusquedaRes("");
        return;
      }
      // Celda de RESIDENTE: se ASIGNA a un apartamento con placa obligatoria
      // (ya no hay "registro de acceso" libre sin dueño).
      setCellResidente(cell);
      setResidenteId("");
      setBusquedaRes("");
      setPlacaResidente("");
      setMesesResidente("sin");
    } else if (cell.usuarioId || cell.asignadoHasta) {
      // Celda con asignación PERMANENTE: abrir modal de confirmación con nuestro
      // diseño (en vez del confirm() nativo del navegador).
      setSesionCobro(null);
      setCellToRelease(cell);
      // Si es una celda de visitante, traer la sesión de cobro (monto en vivo).
      if (cell.tipo === 'VISITANTE') {
        api.get<any>(`/parqueadero/sesiones/celda/${cell.id}`)
          .then((s) => setSesionCobro(s))
          .catch(() => setSesionCobro(null));
      }
    } else {
      processToggle(cell.id, 'DISPONIBLE');
=======
      setPlaca("");
      setObs("");
      setSelectedDestinatarioId("");
>>>>>>> Stashed changes
    }
  };

  // Cierra la sesión de cobro con la liquidación elegida (vehículo en portería).
  const cerrarSesionLiquidando = async (liquidacion: 'VISITANTE_PAGO' | 'CARGADO_APTO') => {
    if (!sesionCobro?.id) { liberarCelda(cellToRelease.id); return; }
    setLiquidando(true);
    try {
      const r: any = await api.post(`/parqueadero/sesiones/${sesionCobro.id}/cerrar`, { liquidacion });
      const monto = Number(r?.montoFinal || r?.montoActual || 0);
      if (liquidacion === 'CARGADO_APTO' && r?.estado === 'RETENIDA') {
        toast.success(`Cobro de $${monto.toLocaleString('es-CO')} enviado al residente. El vehículo queda RETENIDO hasta que apruebe.`, { duration: 6000 });
      } else if (liquidacion === 'CARGADO_APTO' && monto > 0) {
        toast.success(`Cargo de $${monto.toLocaleString('es-CO')} enviado al residente para su aprobación.`, { duration: 5000 });
      } else if (monto > 0) {
        toast.success(`Visitante pagó $${monto.toLocaleString('es-CO')}. Celda liberada.`, { duration: 5000 });
      } else {
        toast.success("Celda liberada dentro de las 2h gratis (sin cobro).");
      }
      loadData();
      loadExtra();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cerrar la sesión");
    } finally {
      setLiquidando(false);
      setCellToRelease(null);
      setSesionCobro(null);
    }
  };

  const asignarVisitante = async () => {
    if (!residenteId) { toast.error("Selecciona el residente que recibe la visita"); return; }
    setIsSubmitting(true);
    try {
      const estimadoMinutos = tiempoEstimado === "libre" ? null : parseInt(tiempoEstimado, 10);
      const r: any = await api.post(`/parqueadero/celdas/${cellVisitante.id}/asignar`, { usuarioId: residenteId, estimadoMinutos });
      if (r?.pendiente) {
        toast.success("Solicitud enviada. El residente debe aprobarla desde su app.", { duration: 5000 });
      } else {
        toast.success("Celda asignada.");
      }
      loadData();
      loadExtra();
    } catch (e: any) {
      toast.error(e?.message || "Error al asignar la celda");
    } finally {
      setIsSubmitting(false);
      setCellVisitante(null);
      setTiempoEstimado("libre");
    }
  };

  const asignarResidente = async () => {
    if (!residenteId) { toast.error("Selecciona el apartamento/residente"); return; }
    if (!placaResidente.trim()) { toast.error("La placa del vehículo es obligatoria"); return; }
    setIsSubmitting(true);
    try {
      const meses = mesesResidente === "sin" ? null : parseInt(mesesResidente, 10);
      const r: any = await api.post(`/parqueadero/celdas/${cellResidente.id}/asignar`, {
        usuarioId: residenteId,
        placa: placaResidente.trim().toUpperCase(),
        meses,
      });
      if (r?.pendiente) {
        toast.success("Solicitud enviada a aprobación del administrador.", { duration: 5000 });
      } else {
        toast.success("Celda asignada al apartamento.");
      }
      loadData();
      loadExtra();
    } catch (e: any) {
      toast.error(e?.message || "Error al asignar la celda");
    } finally {
      setIsSubmitting(false);
      setCellResidente(null);
      setPlacaResidente("");
      setMesesResidente("sin");
    }
  };

  const liberarCelda = async (id: string) => {
    setIsSubmitting(true);
    try {
      const r: any = await api.post(`/parqueadero/celdas/${id}/liberar`, {});
      if (r?.pendiente) {
        toast.success("Solicitud enviada a aprobación del administrador.", { duration: 5000 });
      } else {
        toast.success("Celda liberada. Ahora está disponible.");
      }
      loadData();
      loadExtra();
    } catch (e: any) {
      toast.error(e?.message || "Error al liberar la celda");
      loadData();
    } finally {
      setIsSubmitting(false);
      setCellToRelease(null);
    }
  };

  const processToggle = async (id: string, newEstado: string) => {
    setIsSubmitting(true);
    setParqueaderos(prev => prev.map(p => p.id === id ? { ...p, estado: newEstado } : p));

    try {
      const r: any = await api.put(`/parqueadero/celdas/${id}`, {
           estado: newEstado,
         });
<<<<<<< Updated upstream
      if (r?.pendiente) {
        toast.success("Solicitud enviada a aprobación del administrador.", { duration: 5000 });
        loadData(); // revierte el cambio optimista: aún no se aplicó
      } else {
        toast.success("Celda liberada");
=======
      {
        toast.success(newEstado === 'OCUPADO' ? `Ingreso registrado en celda ${selectedCell?.numero || ""}` : "Celda liberada");
        loadExtra();
        loadData();
>>>>>>> Stashed changes
      }
      loadExtra();
    } catch {
      toast.error("Error de red");
      loadData();
    } finally {
      setIsSubmitting(false);
    }
  };

<<<<<<< Updated upstream
=======
  const handleConfirmAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;

    let finalObs = obs;
    if (selectedDestinatarioId) {
      const destUser = residentes.find(r => r.id === selectedDestinatarioId);
      if (destUser) {
        const aptoStr = destUser.torre ? `${destUser.torre}-${destUser.numero}` : 'S/N';
        finalObs = `[Destino: Apto ${aptoStr} | ResidentId: ${destUser.id}] ${obs}`;
      }
    }

    processToggle(selectedCell.id, 'OCUPADO', placa, finalObs);
  };

  const handleCreateNovelty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;
    
    const { residentId } = parseObservacion(selectedCell.observacionIngreso || "");
    const notifyId = residentId || selectedCell.usuarioId;

    const toastId = toast.loading("Registrando novedad...");
    try {
      const res = await fetch('/api/parqueadero/novedades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: `${selectedCell.numero}: ${novedadTitulo}`,
          descripcion: novedadDesc,
          tipo: novedadTipo,
          notificarUsuarioId: notifyId || null
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Novedad registrada y notificada con éxito", { id: toastId });
        setNovedadTitulo("");
        setNovedadDesc("");
        setIsNoveltyFormOpen(false);
        setSelectedCell(null);
        loadExtra();
      } else {
        toast.error(data.error || "Error al registrar novedad", { id: toastId });
      }
    } catch {
      toast.error("Error de red", { id: toastId });
    }
  };

>>>>>>> Stashed changes
  const handlePerformRound = async () => {
    const toastId = toast.loading("Registrando ronda de verificación...");
    try {
      await api.post('/parqueadero/rondas', { completada: true, hallazgos: [] });
      {
        toast.success("Ronda registrada correctamente", { id: toastId });
        loadExtra();
      }
    } catch {
      toast.error("Error al registrar ronda", { id: toastId });
    }
  };

  // ─── Waitlist Handlers ────────────────────────────────────────────────────
  const handleAddToWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wlPlate.trim()) return;
    const toastId = toast.loading("Agregando a lista...");
    try {
      const res = await fetch('/api/parqueadero/lista-espera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: wlPlate.trim().toUpperCase(), apto: wlContact.trim() })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${data.data.placa} agregado a la lista de espera`, { id: toastId });
        setWlPlate("");
        setWlContact("");
        setWlNote("");
        const reload = await fetch('/api/parqueadero/lista-espera').then(r => r.json());
        if (reload.success) {
          setWaitlist(reload.data.map((item: any) => ({
             id: item.id,
             plate: item.placa,
             contact: item.apto || "",
             note: "",
             arrivedAt: new Date(item.creadoEn).getTime()
          })));
        }
      }
    } catch {
      toast.error("Error de red", { id: toastId });
    }
  };

  const handleRemoveFromWaitlist = async (id: string, plate: string) => {
    try {
      await fetch('/api/parqueadero/lista-espera', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: 'CANCELADO' })
      });
      setWaitlist(prev => prev.filter(e => e.id !== id));
      toast.info(`${plate} removido de la lista de espera`);
    } catch {
      toast.error("Error al remover");
    }
  };

  const handleAssignFromWaitlist = async (entry: WaitlistEntry) => {
    try {
      await fetch('/api/parqueadero/lista-espera', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, estado: 'ASIGNADO' })
      });
      setWaitlist(prev => prev.filter(e => e.id !== entry.id));
      setActiveTab("mapa");
      setSearchQuery(entry.plate);
      toast.info(`Buscando celda disponible para ${entry.plate}...`);
    } catch {
      toast.error("Error al asignar");
    }
  };

  const handleConfirmReservationArrival = async (visita: any) => {
    const toastId = toast.loading(`Registrando ingreso de ${visita.nombre}...`);
    try {
      const res = await fetch('/api/vigilancia/visitas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitaId: visita.id, action: 'ARRIVE' })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Ingreso de visita registrado con éxito", { id: toastId });
        loadAgendados();
        loadData();
        loadExtra();
      } else {
        toast.error(data.error || "Error al registrar ingreso", { id: toastId });
      }
    } catch {
      toast.error("Error de red", { id: toastId });
    }
  };

  const handleReleaseReservation = async (visitaId: string) => {
    const toastId = toast.loading("Liberando celda...");
    try {
      const res = await fetch('/api/vigilancia/visitas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitaId, action: 'RELEASE' })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Celda liberada correctamente", { id: toastId });
        loadAgendados();
        loadData();
        loadExtra();
      } else {
        toast.error(data.error || "Error al liberar celda", { id: toastId });
      }
    } catch {
      toast.error("Error de red", { id: toastId });
    }
  };

  const handleAssignCellSubmit = async (visitaId: string, celdaId: string) => {
    const toastId = toast.loading("Asignando celda...");
    try {
      const res = await fetch('/api/vigilancia/visitas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitaId, action: 'ASSIGN_CELL', celdaId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Celda asignada con éxito", { id: toastId });
        setShowAssignCellModal(false);
        setSelectedVisitForCell(null);
        loadAgendados();
        loadData();
        loadExtra();
      } else {
        toast.error(data.error || "Error al asignar celda", { id: toastId });
      }
    } catch {
      toast.error("Error de red", { id: toastId });
    }
  };

  // ─── Analytics ────────────────────────────────────────────────────────────
  const totalSpots = parqueaderos.length;
  const visitantSpots = parqueaderos.filter(p => p.tipo === 'VISITANTE');
  const residentSpots = parqueaderos.filter(p => p.tipo === 'RESIDENTE');
  const occupiedVisitant = visitantSpots.filter(p => p.estado === 'OCUPADO');
  const occupiedResident = residentSpots.filter(p => p.estado === 'OCUPADO');
  const overtimeSpots = parqueaderos.filter(p => p.tipo === 'VISITANTE' && p.estado === 'OCUPADO' && isOvertime(p.fechaIngreso));
  const occupancyRate = totalSpots > 0 ? Math.round((parqueaderos.filter(p => p.estado === 'OCUPADO').length / totalSpots) * 100) : 0;

  // floor-level stats
  const floorStats = ['Sótano 1', 'Sótano 2'].map(floor => {
    const spots = parqueaderos.filter(p => p.torre === floor);
    const occupied = spots.filter(p => p.estado === 'OCUPADO').length;
    const available = spots.filter(p => p.estado === 'DISPONIBLE' && p.tipo !== 'RESIDENTE').length;
    return { floor, total: spots.length, occupied, available };
  });

  // Today's entries from registros
  const today = new Date().toDateString();
  const todayIngresos = registros.filter(r => r.tipo === 'INGRESO' && new Date(r.fecha).toDateString() === today);
  const todaySalidas = registros.filter(r => r.tipo === 'SALIDA' && new Date(r.fecha).toDateString() === today);

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-text/25 border-t-accent rounded-full animate-spin" /></div>;

  const currentFloorParqueaderos = parqueaderos.filter((p) => p.torre === selectedFloor);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       {/* ── Round Status Bar ─────────────────────────────────────────── */}
       <section className="fade-up liquid-glass rounded-3xl p-5 border border-border/40 shadow-xl flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
<<<<<<< Updated upstream
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${lastRound ? 'bg-text/10 border-text/30 text-text dark:text-text' : 'bg-text/10 border-text/30 text-text dark:text-text animate-pulse'}`}>
                {lastRound ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
             </div>
             <div>
                <h3 className="text-text font-bold text-sm">Rondas de Verificación</h3>
                <p className="text-[10px] text-text uppercase tracking-widest mt-0.5">
                   {lastRound ? `Última: ${new Date(lastRound.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} por ${lastRound.usuario.nombre}` : 'Pendiente hoy'}
=======
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${lastRound ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 animate-pulse'}`}>
               {lastRound ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
             </div>
             <div>
                <h3 className="text-text font-bold text-sm">Rondas de Verificación</h3>
                <p className="text-[10px] text-text/60 uppercase tracking-widest mt-0.5">
                   {lastRound ? `Última: ${new Date(lastRound.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} por ${lastRound.usuario?.nombre ?? 'Encargado'}` : 'Pendiente hoy'}
>>>>>>> Stashed changes
                </p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            {overtimeSpots.length > 0 && (
              <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-xl animate-pulse">
                <Timer size={12} className="text-rose-500" />
                <span className="text-[10px] text-rose-500 font-black uppercase tracking-widest">{overtimeSpots.length} excedido{overtimeSpots.length > 1 ? 's' : ''}</span>
              </div>
            )}
            <button 
              onClick={handlePerformRound}
              className="bg-text/5 hover:bg-text/10 border border-border/40 px-4 py-2 rounded-xl text-[10px] text-text font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
            >
               <ClipboardCheck size={14} /> Iniciar Ronda
            </button>
          </div>
       </section>

<<<<<<< Updated upstream
       {/* RESERVAS DE CUPO DE VISITANTE PRÓXIMAS */}
       {reservasProximas.length > 0 && (
          <section className="fade-up liquid-glass rounded-3xl p-5 border border-accent/30 shadow-xl flex flex-col gap-3">
             <div className="flex items-center gap-2">
                <CalendarClock size={18} className="text-accent" />
                <h3 className="text-text font-bold text-sm">Reservas de visitante próximas</h3>
                <span className="ml-auto text-[10px] font-black text-accent bg-accent/10 px-2 py-1 rounded-full border border-accent/30">{reservasProximas.length}</span>
             </div>
             <div className="flex flex-col gap-2">
                {reservasProximas.map((r) => (
                   <div key={r.id} className="bg-text/5 border border-border rounded-2xl p-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                         {r.categoria === 'MOTO' ? <Bike size={16} /> : <Car size={16} />}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                         <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-text truncate">{r.residenteNombre}</span>
                            {r.estado === 'LLEGO' && (
                               <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#57bf00]/15 text-[#57bf00] shrink-0">Llegó</span>
                            )}
                         </div>
                         <span className="text-[11px] text-text/60 truncate">
                            {new Date(r.llegadaEstimada).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {' · '}{r.tiempoLibre ? 'tiempo libre' : `~${r.duracionMinutos} min`}
                            {r.placa ? ` · ${r.placa}` : ''}
                         </span>
                      </div>
                      {r.estado === 'PENDIENTE' && (
                         <button
                            disabled={busyReservaLlegada === r.id}
                            onClick={() => marcarLlegadaReserva(r.id)}
                            className="shrink-0 bg-accent text-on-accent text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-50"
                         >
                            {busyReservaLlegada === r.id ? '...' : 'Llegó'}
                         </button>
                      )}
                   </div>
                ))}
             </div>
             <p className="text-[10px] text-text/50 leading-relaxed">
                Marca "Llegó" cuando el visitante entre, luego asígnale una celda de visitante en el mapa.
             </p>
          </section>
       )}

       <div className="liquid-glass rounded-3xl p-6 border border-border/40 shadow-2xl relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-text/10 border border-text/30 flex items-center justify-center text-text dark:text-text">
                  <Map size={24} />
               </div>
               <div>
                 <h2 className="text-xl font-bold text-text">Mapa Interactivo</h2>
                 <p className="text-xs text-text">Celdas de estacionamiento</p>
               </div>
            </div>
          </div>

          {/* SELECTOR DE NIVEL / SÓTANO */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto hide-scrollbar">
             {(nivelesDisponibles.length > 0 ? nivelesDisponibles : [1, 2]).map((n) => {
                const activo = nivel === n;
                const count = parqueaderos.filter((p) => nivelDeCelda(p) === n).length;
                return (
                   <button
                      key={n}
                      onClick={() => setNivel(n)}
                      className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${
                         activo
                            ? 'bg-accent text-on-accent border-accent shadow-lg shadow-accent/20'
                            : 'bg-text/5 text-text border-border/40 hover:bg-text/10'
                      }`}
                   >
                      Sótano {n}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${activo ? 'bg-black/20' : 'bg-text/10'}`}>{count}</span>
                   </button>
                );
             })}
          </div>

          <div className="flex gap-4 mb-6 pt-2 pb-4 border-b border-border/10 overflow-x-auto hide-scrollbar">
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#57bf00] border border-[#57bf00] shadow-[0_0_6px_rgba(87,191,0,0.6)]"></div><span className="text-[10px] text-text uppercase font-bold tracking-widest">Libre</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#EF4444] border border-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.6)]"></div><span className="text-[10px] text-text uppercase font-bold tracking-widest">Ocupado</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#FACC15] border border-[#FACC15] shadow-[0_0_6px_rgba(250,204,21,0.6)]"></div><span className="text-[10px] text-text uppercase font-bold tracking-widest">Reservado</span></div>
          </div>

          {/* Equivalencia física de espacios */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5 -mt-2">
             <span className="text-[10px] text-text/60 font-bold uppercase tracking-widest">Equivalencia:</span>
             <span className="text-[10px] text-text/80">🚗 1 carro</span>
             <span className="text-[10px] text-text/40">=</span>
             <span className="text-[10px] text-text/80">🏍️ 4 motos</span>
             <span className="text-[10px] text-text/40">=</span>
             <span className="text-[10px] text-text/80">🚲 5 bicis</span>
          </div>
          
          {/* MAPA TIPO PLANO AÉREO: bahías a ambos lados de un carril central */}
          {celdasDelNivel.length === 0 ? (
             <div className="py-16 flex flex-col items-center justify-center gap-2 text-center">
                <Map size={40} className="text-text/40" />
                <p className="text-xs text-text/70 font-bold">
                   {parqueaderos.length === 0 ? "No hay celdas registradas todavía" : `Sin celdas en Sótano ${nivel}`}
                </p>
             </div>
          ) : (() => {
             // Una bahía de estacionamiento. La proporción física se respeta:
             // en el cajón de un carro caben 4 motos (perpendiculares) o 5 bicis,
             // por eso la moto ocupa 1/4 del ancho y la bici 1/5 (flex-wrap las
             // empaqueta solas: 4 motos por fila, 5 bicis por fila, 1 carro por fila).
             const bay = (p: any, side: 'left' | 'right') => {
                const isLibre = p.estado === 'DISPONIBLE';
                const isReservado = p.estado === 'RESERVADO';
                const vencida = p.asignadoHasta ? new Date(p.asignadoHasta).getTime() < Date.now() : false;
                // Libre=verde, Ocupado=rojo, Reservado=amarillo.
                const stateColor = isLibre ? '#57bf00' : isReservado ? '#FACC15' : '#EF4444';
                const cat = p.categoria || 'CARRO';
                const catIcon = cat === 'MOTO' ? '🏍️' : cat === 'BICI' ? '🚲' : '🚗';
                // Para celdas de VISITANTE ocupadas: a qué residente (torre/apto)
                // está asignada la visita. El backend lo entrega en `ocupante`.
                const esVisitante = p.tipo === 'VISITANTE';
                const ocup = p.ocupante;
                const ubicOcup = ocup
                  ? [ocup.torre ? `T${ocup.torre}` : null, ocup.apto ? `Apto ${ocup.apto}` : null]
                      .filter(Boolean).join(' · ')
                  : '';
                const tooltip = esVisitante && !isLibre && ocup
                  ? `Celda ${p.numero} · Visitante de ${ocup.nombre}${ubicOcup ? ` (${ubicOcup})` : ''}`
                  : `Celda ${p.numero} · ${p.estado}`;

                // MOTO / BICI: tiles compactos que ocupan una fracción del ancho del
                // cajón de carro (1/4 y 1/5), para que se vea cuántas caben.
                if (cat === 'MOTO' || cat === 'BICI') {
                   const widthCls = cat === 'MOTO' ? 'w-[25%]' : 'w-[20%]';
                   return (
                      <button
                         key={p.id}
                         onClick={() => handleCellClick(p)}
                         title={`Celda ${p.numero} · ${cat} · ${p.estado}`}
                         className={`group relative ${widthCls} h-11 flex flex-col items-center justify-center gap-0.5 border border-white/15 transition-all active:scale-[0.95] hover:brightness-150`}
                         style={{ backgroundColor: stateColor + '26' }}
                      >
                         <span className="text-[11px] leading-none" style={{ opacity: isLibre ? 0.35 : 1 }}>{catIcon}</span>
                         <span className="font-display font-bold text-[8px] leading-none text-text truncate max-w-full px-0.5">{p.numero}</span>
                         {vencida && <span className="absolute bottom-0 inset-x-0 text-center text-[6px] font-black uppercase text-[#EF4444]">venc</span>}
                      </button>
                   );
                }

                // CARRO: bahía completa, ocupa todo el ancho del cajón.
                const numEl = (
                   <span key="n" className="font-display font-bold text-xs leading-none break-all text-text px-1 flex flex-col items-start gap-0.5">
                      {p.numero}
                      {esVisitante && !isLibre && ubicOcup && (
                         <span className="font-sans font-bold text-[7px] leading-none text-[#009df2] uppercase tracking-tight">{ubicOcup}</span>
                      )}
                   </span>
                );
                const carEl = (
                   <span key="c" className="text-[11px] leading-none shrink-0" style={{ opacity: isLibre ? 0.3 : 1 }} title={cat}>{catIcon}</span>
                );
                return (
                   <button
                      key={p.id}
                      onClick={() => handleCellClick(p)}
                      title={tooltip}
                      className="group relative w-full flex items-center justify-between h-11 px-2 border-t border-white/20 transition-all active:scale-[0.98] hover:brightness-150"
                      style={{ backgroundColor: stateColor + '26' }}
                   >
                      {/* tope de rueda en el extremo exterior */}
                      <span className={`absolute inset-y-1.5 w-1 rounded-full ${side === 'left' ? 'left-0.5' : 'right-0.5'}`} style={{ backgroundColor: stateColor }} />
                      {side === 'left' ? <>{numEl}{carEl}</> : <>{carEl}{numEl}</>}
                      {vencida && <span className="absolute bottom-0 inset-x-0 text-center text-[6px] font-black uppercase tracking-wide text-[#EF4444]">vencida</span>}
                   </button>
                );
             };
             const mid = Math.ceil(celdasDelNivel.length / 2);
             const leftCells = celdasDelNivel.slice(0, mid);
             const rightCells = celdasDelNivel.slice(mid);
             return (
                <div className="fade-up relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                     style={{ background: 'repeating-linear-gradient(45deg, #0d0d0d 0 6px, #121212 6px 12px)' }}>
                   {/* Marca de agua "P" */}
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                      <span className="font-display font-black text-white/[0.04] leading-none select-none" style={{ fontSize: '38vw' }}>P</span>
                   </div>

                   {/* ENTRADA */}
                   <div className="relative flex items-center justify-center h-7 border-b-2 border-dashed border-[#57bf00]/60">
                      <div className="absolute inset-0 bg-[#57bf00]/10" />
                      <span className="relative text-[8px] font-black tracking-[0.3em] text-[#57bf00] uppercase">▲ Entrada</span>
                   </div>

                   {/* CUERPO: peatonal · bahías · carril · bahías · peatonal */}
                   <div className="relative flex items-stretch">
                      <div className="w-1.5 bg-[#57bf00]/30" />
                      <div className="flex-1 flex flex-row flex-wrap content-start border-r-2 border-white/40">
                         {leftCells.map((p) => bay(p, 'left'))}
                      </div>
                      {/* Carril central con línea amarilla y flechas */}
                      <div className="w-10 relative flex flex-col items-center justify-between py-3 shrink-0">
                         <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px]"
                              style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #FACC15 0 8px, transparent 8px 18px)' }} />
                         <ArrowRight size={16} className="relative text-white/70 -rotate-90" />
                         <ArrowRight size={16} className="relative text-white/70 rotate-90" />
                      </div>
                      <div className="flex-1 flex flex-row flex-wrap content-start border-l-2 border-white/40">
                         {rightCells.map((p) => bay(p, 'right'))}
                      </div>
                      <div className="w-1.5 bg-[#57bf00]/30" />
                   </div>

                   {/* SALIDA */}
                   <div className="relative flex items-center justify-center h-7 border-t-2 border-dashed border-white/30">
                      <span className="relative text-[8px] font-black tracking-[0.3em] text-text/70 uppercase">Salida ▼</span>
                   </div>
                </div>
             );
          })()}
       </div>

       <section className="fade-up flex flex-col gap-4 mt-2">
          <div className="flex justify-between items-center px-2">
             <h3 className="text-text font-display font-medium text-lg tracking-wide flex items-center gap-2"><History size={18} className="text-text"/> Mi Actividad</h3>
             <span className="text-[10px] text-text font-bold uppercase tracking-widest">Últimos 50</span>
          </div>

          <div className="flex flex-col gap-3">
             {registros.length === 0 && (
               <div className="liquid-glass rounded-3xl p-8 border border-dashed border-border/30 text-center">
                  <p className="text-text text-xs italic">No has registrado movimientos recientemente.</p>
               </div>
             )}
             {registros.map((reg, idx) => (
                <div key={idx} className="liquid-glass p-4 rounded-3xl border border-border/20 flex items-center justify-between group hover:border-border/55 transition-all">
                   <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${reg.tipo === 'INGRESO' ? 'bg-text/10 border-text/20 text-text dark:text-text' : 'bg-text/10 border-text/20 text-text dark:text-text'}`}>
                         {reg.tipo === 'INGRESO' ? <ArrowRight size={18} className="rotate-45" /> : <ArrowRight size={18} className="-rotate-135" />}
                      </div>
                      <div className="flex flex-col">
                         <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-text">Celda {reg.celdaNumero}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-text/5 text-text uppercase font-black">{reg.celdaTipo?.slice(0,3)}</span>
                         </div>
                         <div className="flex items-center gap-2 mt-0.5">
                            <Clock size={10} className="text-text" />
                            <span className="text-[10px] text-text font-medium">{new Date(reg.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} • {reg.placa || 'Sin placa'}</span>
                         </div>
                      </div>
                   </div>
                   {reg.observacion && (
                     <div className="hidden sm:block max-w-[150px] truncate text-[10px] italic text-text">
=======
       {/* ── Tab Navigation ────────────────────────────────────────────── */}
       <div className="fade-up flex bg-text/5 p-1 rounded-2xl gap-1 border border-border/20">
         {[
           { id: "mapa", label: "Mapa", icon: Map },
           { id: "analytics", label: "Estadísticas", icon: BarChart2 },
           { id: "espera", label: `Lista de Espera${waitlist.length > 0 ? ` (${waitlist.length})` : ""}`, icon: Users },
           { id: "agendamientos", label: `Agendados${agendados.filter(a => a.estadoVisita === 'PENDIENTE').length > 0 ? ` (${agendados.filter(a => a.estadoVisita === 'PENDIENTE').length})` : ""}`, icon: Calendar }
         ].map(({ id, label, icon: Icon }) => (
           <button
             key={id}
             type="button"
             onClick={() => setActiveTab(id as any)}
             className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
               activeTab === id
                 ? 'bg-linear-to-r from-accent to-violet-600 text-white shadow-md'
                 : 'text-text/60 hover:text-text hover:bg-text/5'
             }`}
           >
             <Icon size={14} />
             <span className="hidden sm:inline">{label}</span>
             <span className="sm:hidden">{id === "espera" ? "Espera" : id === "agendamientos" ? "Agendados" : label}</span>
           </button>
         ))}
       </div>

       {/* ═══════════════════════════════════════════════════════════════════
           TAB: MAPA INTERACTIVO
       ═══════════════════════════════════════════════════════════════════ */}
       {activeTab === "mapa" && (
         <div className="liquid-glass rounded-3xl p-6 border border-border/40 shadow-2xl relative overflow-hidden fade-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                 <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Map size={24} />
                 </div>
                 <div>
                   <h2 className="text-xl font-bold text-text">Mapa Interactivo</h2>
                   <p className="text-xs text-text/60">Celdas de estacionamiento</p>
                 </div>
              </div>
              
              {/* Floor Selector */}
              <div className="flex bg-text/5 p-1 rounded-xl gap-1 border border-border/20 self-start sm:self-center">
                {['Sótano 1', 'Sótano 2'].map((floor) => (
                  <button
                    key={floor}
                    type="button"
                    onClick={() => setSelectedFloor(floor)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                      selectedFloor === floor
                        ? 'bg-linear-to-r from-accent to-violet-600 text-white shadow-md'
                        : 'text-text/60 hover:text-text hover:bg-text/5'
                    }`}
                  >
                    {floor}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mb-6">
              <input 
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por placa, residente, apartamento o celda..."
                className="w-full bg-text/5 border border-border/40 rounded-2xl py-3 pl-12 pr-4 text-sm text-text placeholder:text-text/40 focus:outline-none focus:border-accent/40 focus:bg-text/10 transition-all"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text/40">
                <Search size={18} />
              </div>
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text/40 hover:text-text cursor-pointer animate-in fade-in"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mb-6 pt-2 pb-4 border-b border-border/10 overflow-x-auto hide-scrollbar">
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-text/15 border border-text/30"></div>
                 <span className="text-[10px] text-text/60 uppercase font-bold tracking-widest">
                   Libre ({currentFloorParqueaderos.filter(p => p.estado === 'DISPONIBLE' && p.tipo !== 'RESIDENTE').length})
                 </span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-accent/25 border border-accent"></div>
                 <span className="text-[10px] text-text/60 uppercase font-bold tracking-widest">
                   Ocupado ({currentFloorParqueaderos.filter(p => p.estado === 'OCUPADO').length})
                 </span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-blue-500/25 border border-blue-500"></div>
                 <span className="text-[10px] text-text/60 uppercase font-bold tracking-widest">
                   Reservado ({currentFloorParqueaderos.filter(p => p.estado === 'RESERVADO' || (p.tipo === 'RESIDENTE' && p.estado !== 'OCUPADO')).length})
                 </span>
               </div>
               {overtimeSpots.filter(p => p.torre === selectedFloor).length > 0 && (
                 <div className="flex items-center gap-2">
                   <div className="w-3 h-3 rounded-full bg-rose-500 border border-rose-600 animate-pulse"></div>
                   <span className="text-[10px] text-rose-500 uppercase font-bold tracking-widest">
                     Tiempo excedido ({overtimeSpots.filter(p => p.torre === selectedFloor).length})
                   </span>
                 </div>
               )}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
               {currentFloorParqueaderos.map((p) => {
                  const isLibre = p.estado === 'DISPONIBLE' && p.tipo !== 'RESIDENTE';
                  const isOcupado = p.estado === 'OCUPADO';
                  const isReservado = p.estado === 'RESERVADO' || (p.tipo === 'RESIDENTE' && p.estado !== 'OCUPADO');
                  const isResident = p.tipo === 'RESIDENTE';
                  const isLocked = (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') && isResident;
                  const assignedPlate = p.placaActiva || p.usuario?.vehiculos?.[0]?.placa;
                  const residentName = p.usuario?.nombre;
                  const overtime = isOcupado && p.tipo === 'VISITANTE' && isOvertime(p.fechaIngreso);

                  // Search filter highlight logic
                  const matchesSearch = !searchQuery || (
                    p.numero.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    p.tipo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (p.placaActiva || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (p.usuario?.vehiculos?.[0]?.placa || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (p.usuario?.nombre || "").toLowerCase().includes(searchQuery.toLowerCase())
                  );

                  return (
                    <button 
                      key={p.id}
                      onClick={() => handleCellClick(p)}
                      className={`fade-up relative flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border transition-all active:scale-95
                        ${overtime
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse-subtle'
                          : isLibre ? 'bg-text/5 border-border/40 hover:bg-text/10 text-text/70' : 
                          isReservado ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400' :
                          'bg-accent/10 border-accent/40 shadow-[0_0_15px_rgba(99,102,241,0.1)] dark:shadow-[0_0_15px_rgba(217,70,239,0.15)] text-accent'}
                        ${searchQuery ? (matchesSearch ? 'opacity-100 ring-2 ring-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'opacity-20 scale-95') : 'opacity-100'}
                        ${isLocked && p.estado !== 'OCUPADO' ? 'cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                       {isResident ? (
                         <ShieldCheck size={20} className={isOcupado ? 'text-accent/60' : 'text-blue-500/60'} />
                       ) : (
                         <HelpCircle size={20} className={isLibre ? 'text-blue-500/30 dark:text-blue-400/30' : isReservado ? 'text-blue-600 dark:text-blue-400' : overtime ? 'text-rose-500' : 'text-accent'} />
                       )}
                       
                       <span className="font-display font-bold text-xl">{p.numero}</span>
                       
                       {isOcupado && (
                         <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                             <div className="flex items-center gap-1">
                               {p.tipo === 'VISITANTE' && p.fechaIngreso && (
                                 <span className={`text-[8px] font-bold px-1 py-0.5 rounded-sm flex items-center gap-0.5 ${
                                   overtime
                                     ? 'bg-rose-500 text-white' 
                                     : 'bg-emerald-500/20 text-emerald-500'
                                 }`}>
                                   <Clock size={8} /> {getElapsedTimeStr(p.fechaIngreso)}
                                 </span>
                               )}
                               <Car size={14} className={`${overtime ? 'text-rose-500' : 'text-accent animate-bounce-subtle'}`} />
                             </div>
                             {assignedPlate && <span className="text-[8px] font-black bg-accent text-primary px-1 rounded-sm">{assignedPlate}</span>}
                         </div>
                       )}

                       {residentName && (
                           <span className="text-[7px] uppercase font-bold text-text/50 absolute top-2 left-2 max-w-[70px] truncate">{residentName}</span>
                       )}

                       {isLocked && p.estado !== 'OCUPADO' && (
                         <span className="absolute top-2 right-2 text-[10px] opacity-60" title="Celda de Residente - Bloqueada para Vigilancia">
                           🔒
                         </span>
                       )}

                       <span className="text-[9px] uppercase font-bold tracking-widest absolute bottom-2 opacity-50">
                          {p.tipo}
                       </span>
                    </button>
                  )
               })}
            </div>
         </div>
       )}

       {/* ═══════════════════════════════════════════════════════════════════
           TAB: ANALYTICS
       ═══════════════════════════════════════════════════════════════════ */}
       {activeTab === "analytics" && (
         <div className="flex flex-col gap-5 fade-up">
           <h2 className="text-xl font-bold text-text flex items-center gap-2 px-1">
             <BarChart2 size={20} className="text-accent" /> Estadísticas del Parqueadero
           </h2>

           {/* KPI Cards */}
           <div className="grid grid-cols-2 gap-4">
             <div className="liquid-glass rounded-3xl p-5 border border-border/40 flex flex-col gap-2">
               <span className="text-[10px] text-text/50 uppercase font-black tracking-widest">Ocupación Global</span>
               <div className="flex items-end gap-2">
                 <span className="text-4xl font-display font-black text-text">{occupancyRate}%</span>
               </div>
               <div className="w-full h-2 bg-text/10 rounded-full overflow-hidden mt-1">
                 <div 
                   className={`h-full rounded-full transition-all duration-700 ${occupancyRate > 80 ? 'bg-rose-500' : occupancyRate > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                   style={{ width: `${occupancyRate}%` }}
                 />
               </div>
               <span className="text-[9px] text-text/40 font-medium">{parqueaderos.filter(p => p.estado === 'OCUPADO').length} de {totalSpots} celdas ocupadas</span>
             </div>

             <div className="liquid-glass rounded-3xl p-5 border border-border/40 flex flex-col gap-2">
               <span className="text-[10px] text-text/50 uppercase font-black tracking-widest">Tiempo Excedido</span>
               <div className="flex items-end gap-2">
                 <span className={`text-4xl font-display font-black ${overtimeSpots.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{overtimeSpots.length}</span>
               </div>
               <span className="text-[9px] text-text/40 font-medium">Vehículos visitantes +4h</span>
               {overtimeSpots.length > 0 && (
                 <div className="flex flex-col gap-1 mt-1">
                   {overtimeSpots.map(p => (
                     <div key={p.id} className="flex justify-between items-center bg-rose-500/10 rounded-lg px-2 py-1">
                       <span className="text-[9px] font-black text-rose-500">{p.numero}</span>
                       <span className="text-[9px] text-rose-400">{getElapsedTimeStr(p.fechaIngreso)}</span>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </div>

           {/* Floor breakdown */}
           <div className="liquid-glass rounded-3xl p-6 border border-border/40">
             <h3 className="text-sm font-black text-text uppercase tracking-widest mb-5 flex items-center gap-2">
               <Map size={14} className="text-accent" /> Por Piso
             </h3>
             <div className="flex flex-col gap-4">
               {floorStats.map(({ floor, total, occupied, available }) => {
                 const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
                 return (
                   <div key={floor} className="flex flex-col gap-2">
                     <div className="flex justify-between items-center">
                       <span className="text-xs font-bold text-text">{floor}</span>
                       <div className="flex items-center gap-3">
                         <span className="text-[10px] text-emerald-500 font-black">{available} libre{available !== 1 ? 's' : ''}</span>
                         <span className="text-[10px] text-accent font-black">{occupied} ocupado{occupied !== 1 ? 's' : ''}</span>
                         <span className="text-[10px] text-text/40 font-bold">{pct}%</span>
                       </div>
                     </div>
                     <div className="w-full h-2 bg-text/10 rounded-full overflow-hidden">
                       <div 
                         className={`h-full rounded-full transition-all duration-700 ${pct > 80 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                         style={{ width: `${pct}%` }}
                       />
                     </div>
                   </div>
                 );
               })}
             </div>
           </div>

           {/* Visitant vs Resident breakdown */}
           <div className="grid grid-cols-2 gap-4">
             <div className="liquid-glass rounded-3xl p-5 border border-border/40">
               <span className="text-[10px] text-text/50 uppercase font-black tracking-widest block mb-3">Visitantes</span>
               <div className="flex flex-col gap-1.5">
                 <div className="flex justify-between">
                   <span className="text-xs text-text/60">Celdas totales</span>
                   <span className="text-xs font-bold text-text">{visitantSpots.length}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-xs text-text/60">Ocupadas</span>
                   <span className="text-xs font-bold text-accent">{occupiedVisitant.length}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-xs text-text/60">Disponibles</span>
                   <span className="text-xs font-bold text-emerald-500">{visitantSpots.length - occupiedVisitant.length}</span>
                 </div>
               </div>
             </div>
             <div className="liquid-glass rounded-3xl p-5 border border-border/40">
               <span className="text-[10px] text-text/50 uppercase font-black tracking-widest block mb-3">Residentes</span>
               <div className="flex flex-col gap-1.5">
                 <div className="flex justify-between">
                   <span className="text-xs text-text/60">Celdas totales</span>
                   <span className="text-xs font-bold text-text">{residentSpots.length}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-xs text-text/60">Ocupadas</span>
                   <span className="text-xs font-bold text-accent">{occupiedResident.length}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-xs text-text/60">Vacías hoy</span>
                   <span className="text-xs font-bold text-text/40">{residentSpots.length - occupiedResident.length}</span>
                 </div>
               </div>
             </div>
           </div>

           {/* Today's Activity */}
           <div className="liquid-glass rounded-3xl p-6 border border-border/40">
             <h3 className="text-sm font-black text-text uppercase tracking-widest mb-5 flex items-center gap-2">
               <TrendingUp size={14} className="text-accent" /> Actividad de Hoy
             </h3>
             <div className="flex gap-6">
               <div className="flex flex-col items-center gap-1">
                 <span className="text-3xl font-display font-black text-emerald-500">{todayIngresos.length}</span>
                 <span className="text-[10px] text-text/50 uppercase font-black tracking-widest">Ingresos</span>
               </div>
               <div className="w-px bg-border/20" />
               <div className="flex flex-col items-center gap-1">
                 <span className="text-3xl font-display font-black text-orange-500">{todaySalidas.length}</span>
                 <span className="text-[10px] text-text/50 uppercase font-black tracking-widest">Salidas</span>
               </div>
               <div className="w-px bg-border/20" />
               <div className="flex flex-col items-center gap-1">
                 <span className="text-3xl font-display font-black text-text">{waitlist.length}</span>
                 <span className="text-[10px] text-text/50 uppercase font-black tracking-widest">En Espera</span>
               </div>
             </div>
           </div>
         </div>
       )}

       {/* ═══════════════════════════════════════════════════════════════════
           TAB: LISTA DE ESPERA
       ═══════════════════════════════════════════════════════════════════ */}
       {activeTab === "espera" && (
         <div className="flex flex-col gap-5 fade-up">
           <div className="flex items-center justify-between px-1">
             <h2 className="text-xl font-bold text-text flex items-center gap-2">
               <Users size={20} className="text-accent" /> Lista de Espera
             </h2>
             <span className="text-[10px] text-text/40 font-bold uppercase tracking-widest">{waitlist.length} en espera</span>
           </div>

           {/* Add to waitlist form */}
           <form onSubmit={handleAddToWaitlist} className="liquid-glass rounded-3xl p-6 border border-border/40 shadow-xl flex flex-col gap-4">
             <h3 className="text-sm font-black text-text uppercase tracking-widest flex items-center gap-2">
               <Plus size={14} className="text-accent" /> Agregar Vehículo en Espera
             </h3>
             <div className="grid grid-cols-2 gap-3">
               <div className="flex flex-col gap-1.5">
                 <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Placa *</label>
                 <input 
                   required
                   type="text"
                   value={wlPlate}
                   onChange={e => setWlPlate(e.target.value.toUpperCase())}
                   placeholder="ABC-123"
                   className="w-full bg-text/5 border border-border/50 rounded-2xl py-3 px-4 text-text placeholder:text-text/40 text-sm font-mono tracking-widest focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
                 />
               </div>
               <div className="flex flex-col gap-1.5">
                 <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Apto / Contacto</label>
                 <input 
                   type="text"
                   value={wlContact}
                   onChange={e => setWlContact(e.target.value)}
                   placeholder="Ej: 4B-201"
                   className="w-full bg-text/5 border border-border/50 rounded-2xl py-3 px-4 text-text placeholder:text-text/40 text-sm focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
                 />
               </div>
             </div>
             <div className="flex flex-col gap-1.5">
               <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Nota</label>
               <input 
                 type="text"
                 value={wlNote}
                 onChange={e => setWlNote(e.target.value)}
                 placeholder="Ej: Mudanza, paquetería, visita..."
                 className="w-full bg-text/5 border border-border/50 rounded-2xl py-3 px-4 text-text placeholder:text-text/40 text-sm focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
               />
             </div>
             <button 
               type="submit"
               className="w-full bg-linear-to-r from-accent to-violet-600 rounded-2xl py-3.5 font-bold text-white shadow-xl shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
             >
               <Plus size={16} /> Agregar a Lista de Espera
             </button>
           </form>

           {/* Available visitor spots summary */}
           {visitantSpots.filter(p => p.estado === 'DISPONIBLE').length > 0 && (
             <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
               <CheckCircle size={20} className="text-emerald-500 shrink-0" />
               <div>
                 <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                   {visitantSpots.filter(p => p.estado === 'DISPONIBLE').length} celda{visitantSpots.filter(p => p.estado === 'DISPONIBLE').length !== 1 ? 's' : ''} de visitante disponible{visitantSpots.filter(p => p.estado === 'DISPONIBLE').length !== 1 ? 's' : ''}
                 </p>
                 <p className="text-xs text-text/60 mt-0.5">Puedes asignar el próximo de la lista</p>
               </div>
             </div>
           )}

           {/* Waitlist entries */}
           {waitlist.length === 0 ? (
             <div className="liquid-glass rounded-3xl p-8 border border-dashed border-border/30 text-center">
               <Users size={32} className="text-text/20 mx-auto mb-3" />
               <p className="text-text/40 text-xs italic">No hay vehículos en lista de espera.</p>
             </div>
           ) : (
             <div className="flex flex-col gap-3">
               {waitlist.map((entry, idx) => {
                 const waitMs = Date.now() - entry.arrivedAt;
                 const waitMin = Math.floor(waitMs / 60000);
                 const waitStr = waitMin < 60 ? `${waitMin}m esperando` : `${Math.floor(waitMin/60)}h ${waitMin % 60}m esperando`;
                 const isLongWait = waitMin >= 30;
                 return (
                   <div key={entry.id} className={`liquid-glass rounded-3xl p-5 border transition-all ${isLongWait ? 'border-amber-500/40' : 'border-border/30'}`}>
                     <div className="flex items-start justify-between gap-3">
                       <div className="flex items-center gap-3">
                         <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-display font-black text-sm border ${isLongWait ? 'bg-amber-500/15 border-amber-500/30 text-amber-500' : 'bg-accent/10 border-accent/20 text-accent'}`}>
                           {idx + 1}
                         </div>
                         <div className="flex flex-col gap-0.5">
                           <div className="flex items-center gap-2">
                             <span className="font-mono font-black text-text text-sm tracking-widest">{entry.plate}</span>
                             {entry.contact && <span className="text-[10px] bg-text/10 px-2 py-0.5 rounded-full text-text/60 font-bold">{entry.contact}</span>}
                           </div>
                           <div className="flex items-center gap-2">
                             <Clock size={10} className={isLongWait ? 'text-amber-500' : 'text-text/40'} />
                             <span className={`text-[10px] font-bold ${isLongWait ? 'text-amber-500' : 'text-text/40'}`}>{waitStr}</span>
                             {entry.note && <span className="text-[10px] text-text/40 italic truncate max-w-[120px]">{entry.note}</span>}
                           </div>
                         </div>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                         <button
                           type="button"
                           onClick={() => handleAssignFromWaitlist(entry)}
                           className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1"
                         >
                           <Car size={12} /> Asignar
                         </button>
                         <button
                           type="button"
                           onClick={() => handleRemoveFromWaitlist(entry.id, entry.plate)}
                           className="bg-text/5 hover:bg-rose-500/10 hover:text-rose-500 text-text/40 rounded-xl p-2 transition-all active:scale-95"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                     </div>
                   </div>
                 );
               })}
             </div>
           )}
         </div>
       )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: AGENDAMIENTOS / VISITAS PROGRAMADAS
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "agendamientos" && (
          <div className="flex flex-col gap-5 fade-up">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold text-text flex items-center gap-2">
                <Calendar size={20} className="text-accent" /> Visitas Vehiculares Agendadas
              </h2>
              <span className="text-[10px] text-text/40 font-bold uppercase tracking-widest">{agendados.length} registradas</span>
            </div>

            {isLoadingAgendados ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-text/25 border-t-accent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-text/60 text-xs">Cargando agendamientos...</p>
              </div>
            ) : agendados.length === 0 ? (
              <div className="liquid-glass rounded-3xl p-8 border border-dashed border-border/30 text-center">
                <Calendar size={32} className="text-text/20 mx-auto mb-3" />
                <p className="text-text/40 text-xs italic">No hay visitas vehiculares programadas.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {agendados.map((visita) => {
                  const isPendiente = visita.estadoVisita === 'PENDIENTE';
                  const isAsignada = visita.estadoVisita === 'CELDA_ASIGNADA';
                  const isNotificado = visita.estadoVisita === 'NOTIFICADO_15_MIN';
                  const isConfirmada = visita.estadoVisita === 'CONFIRMADA';
                  const isExpirada = visita.estadoVisita === 'EXPIRADA';

                  // Find assigned cell number if exists
                  const assignedCell = parqueaderos.find(p => p.id === visita.celdaAsignadaId);
                  const celdaNum = assignedCell?.numero || "";

                  return (
                    <div key={visita.id} className={`liquid-glass rounded-3xl p-5 border transition-all ${
                      isExpirada ? 'border-rose-500/30 bg-rose-500/5' :
                      isConfirmada ? 'border-emerald-500/40 bg-emerald-500/5' :
                      isNotificado ? 'border-amber-500/40 bg-amber-500/5 animate-pulse-subtle' :
                      'border-border/30'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${
                            isExpirada ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                            isConfirmada ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                            isNotificado ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                            'bg-accent/10 border-accent/20 text-accent'
                          }`}>
                            <Car size={18} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-text text-sm">{visita.nombre}</span>
                              {visita.placa && (
                                <span className="font-mono font-black text-[10px] bg-accent/10 border border-accent/20 text-accent px-1.5 py-0.5 rounded tracking-wider">
                                  {visita.placa}
                                </span>
                              )}
                              {celdaNum && (
                                <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-black">
                                  Celda {celdaNum}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-text/60">
                              Residente: {visita.usuario?.nombre || "—"} {visita.usuario?.unidad ? `(Apto ${visita.usuario.unidad.torre}-${visita.usuario.unidad.numero})` : ""}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-text/50">
                              <Clock size={10} />
                              <span>Est. Llegada: {visita.horaLlegadaEstimada} • Salida: {visita.horaSalidaEstimada}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {isPendiente && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVisitForCell(visita);
                                setShowAssignCellModal(true);
                              }}
                              className="bg-accent hover:bg-accent/90 text-white rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md"
                            >
                              Asignar Celda
                            </button>
                          )}

                          {(isAsignada || isNotificado) && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleConfirmReservationArrival(visita)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md"
                              >
                                <CheckCircle size={12} /> Confirmar Entrada
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReleaseReservation(visita.id)}
                                className="bg-text/5 hover:bg-rose-500/15 hover:text-rose-500 text-text/60 border border-border/40 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
                              >
                                Liberar Celda
                              </button>
                            </>
                          )}

                          {isConfirmada && (
                            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-emerald-500">
                              <CheckCircle size={12} />
                              <span className="text-[9px] font-black uppercase tracking-widest">En el Conjunto</span>
                            </div>
                          )}

                          {isExpirada && (
                            <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-xl text-rose-500">
                              <Timer size={12} />
                              <span className="text-[9px] font-black uppercase tracking-widest">Expirado (15m)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

       {/* ── Activity Feed ─────────────────────────────────────────────── */}
       {activeTab === "mapa" && (
         <section className="fade-up flex flex-col gap-4 mt-2">
            <div className="flex justify-between items-center px-2">
               <h3 className="text-text font-display font-medium text-lg tracking-wide flex items-center gap-2"><History size={18} className="text-text/40"/>Mi Actividad</h3>
               <span className="text-[10px] text-text/40 font-bold uppercase tracking-widest">Últimos 50</span>
            </div>

            <div className="flex flex-col gap-3">
               {registros.length === 0 && (
                 <div className="liquid-glass rounded-3xl p-8 border border-dashed border-border/30 text-center">
                    <p className="text-text/40 text-xs italic">No has registrado movimientos recientemente.</p>
                 </div>
               )}
               {registros.map((reg, idx) => (
                  <div key={idx} className="liquid-glass p-4 rounded-3xl border border-border/20 flex items-center justify-between group hover:border-border/55 transition-all">
                     <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${reg.tipo === 'INGRESO' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400'}`}>
                           {reg.tipo === 'INGRESO' ? <ArrowRight size={18} className="rotate-45" /> : <ArrowRight size={18} className="-rotate-135" />}
                        </div>
                        <div className="flex flex-col">
                           <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-text">Celda {reg.parqueadero?.numero ?? '—'}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-text/5 text-text/60 uppercase font-black">{reg.parqueadero?.tipo?.slice(0,3) ?? '—'}</span>
                           </div>
                           <div className="flex items-center gap-2 mt-0.5">
                              <Clock size={10} className="text-text/40" />
                              <span className="text-[10px] text-text/60 font-medium">{new Date(reg.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} • {reg.placa || 'Sin placa'}</span>
                           </div>
                        </div>
                     </div>
             {reg.observacion && (
                     <div className="hidden sm:block max-w-[150px] truncate text-[10px] italic text-text/40">
>>>>>>> Stashed changes
                        &quot;{reg.observacion}&quot;
                     </div>
                   )}
                  </div>
               ))}
            </div>
         </section>
       )}

<<<<<<< Updated upstream
       {/* MODAL: ASIGNAR CELDA DE VISITANTE A UN RESIDENTE (aprueba el inquilino) */}
       {cellVisitante && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setCellVisitante(null)} />
             <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
                <div className="flex justify-between items-center mb-6">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em] mb-1">Parqueadero de Visitante</span>
                      <h3 className="text-2xl font-display font-bold text-text">Celda {cellVisitante.numero}</h3>
                   </div>
                   <button type="button" onClick={() => setCellVisitante(null)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text">
                      <X size={20} />
                   </button>
                </div>

                <p className="text-sm text-text/80 leading-relaxed mb-4">
                   Elige el <span className="font-bold">residente</span> que recibe la visita. La asignación
                   queda <span className="font-bold text-[#FACC15]">pendiente</span> hasta que ese residente
                   la <span className="font-bold text-[#57bf00]">apruebe</span> desde su app.
                </p>

                <input
                  type="text"
                  value={busquedaRes}
                  onChange={(e) => setBusquedaRes(e.target.value)}
                  placeholder="Buscar por nombre, torre o apto..."
                  className="w-full bg-text/5 border border-border/50 rounded-2xl py-3 px-4 text-sm text-text placeholder:text-text/50 focus:outline-none focus:border-accent/50 mb-3"
                />

                <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto hide-scrollbar mb-5">
                   {residentes
                     .filter((r) => {
                        const q = busquedaRes.toLowerCase();
                        return !q
                          || r.nombre?.toLowerCase().includes(q)
                          || String(r.torre || '').toLowerCase().includes(q)
                          || String(r.apto || '').toLowerCase().includes(q);
                     })
                     .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setResidenteId(r.id)}
                          className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${residenteId === r.id ? 'bg-accent/15 border-accent' : 'bg-text/5 border-border/40 hover:bg-text/10'}`}
                        >
                           <span className="text-sm font-bold text-text">{r.nombre}</span>
                           <span className="text-[11px] text-text/70">{r.torre ? `Torre ${r.torre}` : ''}{r.apto ? ` · ${r.apto}` : ''}</span>
                        </button>
                     ))}
                   {residentes.length === 0 && (
                      <p className="text-xs text-text/60 text-center py-4">No se pudo cargar el directorio de residentes.</p>
                   )}
                </div>

                {/* Tiempo estimado de la visita (2h gratis, luego $3.000/h). */}
                <div className="mb-5">
                   <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[11px] font-bold text-text/80 uppercase tracking-wider">Tiempo estimado</span>
                      <span className="text-[10px] text-text/50">2h gratis · luego $3.000/h</span>
                   </div>
                   <div className="grid grid-cols-4 gap-2">
                      {[
                        { v: "30", l: "30 min" },
                        { v: "60", l: "1 hora" },
                        { v: "120", l: "2 horas" },
                        { v: "libre", l: "Libre" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setTiempoEstimado(opt.v)}
                          className={`py-2.5 rounded-xl text-[11px] font-bold border transition-all ${tiempoEstimado === opt.v ? 'bg-accent text-on-accent border-accent shadow-lg shadow-accent/20' : 'bg-text/5 text-text border-border hover:bg-text/10'}`}
                        >
                          {opt.l}
                        </button>
                      ))}
                   </div>
                </div>

                {/* Aviso: el apto del residente seleccionado ya tiene una visita
                    activa → este visitante paga desde la llegada (sin gratis). */}
                {residenteId && parqueaderos.some(
                  (c) => c.tipo === 'VISITANTE' && c.estado === 'OCUPADO' && c.usuarioId === residenteId
                ) && (
                   <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-[#FACC15]/40 bg-[#FACC15]/10 p-3.5">
                      <AlertCircle size={18} className="text-[#FACC15] shrink-0 mt-0.5" />
                      <p className="text-[12px] text-text/90 leading-snug">
                         Este apartamento <span className="font-bold">ya tiene una visita activa</span>. El tiempo gratis es para un visitante a la vez, así que <span className="font-bold text-[#FACC15]">este pagará desde la llegada</span>.
                      </p>
                   </div>
                )}

                <button
                  type="button"
                  disabled={isSubmitting || !residenteId}
                  onClick={asignarVisitante}
                  className="w-full py-4 rounded-2xl bg-accent text-on-accent font-bold text-sm shadow-xl shadow-accent/20 active:scale-95 transition-all disabled:opacity-50"
                >
                   {isSubmitting ? "Enviando..." : "Enviar para aprobación del residente"}
                </button>
             </div>
          </div>
       )}

       {/* MODAL: CONFIRMAR LIBERACIÓN DE CELDA (reemplaza el confirm() nativo) */}
       {cellToRelease && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setCellToRelease(null)} />
             <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
                <div className="flex flex-col items-center text-center gap-4">
                   <div className="w-16 h-16 rounded-full bg-[#FACC15]/15 border border-[#FACC15]/40 flex items-center justify-center">
                      <AlertCircle size={30} className="text-[#FACC15]" />
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em]">Liberar Celda</span>
                      <h3 className="text-2xl font-display font-bold text-text">Celda {cellToRelease.numero}</h3>
                   </div>
                   <p className="text-sm text-text/80 leading-relaxed">
                      {cellToRelease.asignadoHasta ? (
                         <>
                            Esta celda tiene una asignación{" "}
                            <span className="font-bold" style={{ color: new Date(cellToRelease.asignadoHasta).getTime() < Date.now() ? '#EF4444' : '#57bf00' }}>
                               {new Date(cellToRelease.asignadoHasta).getTime() < Date.now()
                                  ? 'VENCIDA'
                                  : `vigente hasta el ${new Date(cellToRelease.asignadoHasta).toLocaleDateString('es-CO')}`}
                            </span>.{" "}
                         </>
                      ) : null}
                      Quedará <span className="font-bold text-[#57bf00]">disponible</span> para una nueva asignación.
                   </p>

                   {/* Cobro de visitante: tiempo transcurrido y monto EN VIVO. */}
                   {sesionCobro && (() => {
                      const ini = new Date(sesionCobro.inicio).getTime();
                      const finGratis = new Date(sesionCobro.finGratis).getTime();
                      const transcurridoMin = Math.max(0, Math.floor((ahora - ini) / 60000));
                      const hh = Math.floor(transcurridoMin / 60);
                      const mm = transcurridoMin % 60;
                      const transcurridoTxt = hh > 0 ? `${hh}h ${mm}min` : `${mm}min`;
                      const enCobro = ahora >= finGratis;
                      const minCobrables = Math.max(0, Math.floor((ahora - finGratis) / 60000));
                      const porMin = Number(sesionCobro.tarifaHora || 3000) / 60;
                      const monto = enCobro ? Math.round(minCobrables * porMin) : 0;
                      const segGratisRest = Math.max(0, Math.floor((finGratis - ahora) / 1000));
                      const ghh = Math.floor(segGratisRest / 3600);
                      const gmm = Math.floor((segGratisRest % 3600) / 60);
                      const gss = segGratisRest % 60;
                      return (
                         <div className="w-full bg-text/5 border border-border rounded-2xl p-4 flex flex-col gap-2 mt-1">
                            <div className="flex justify-between items-center">
                               <span className="text-[11px] text-text/70 uppercase tracking-wider font-bold">Tiempo transcurrido</span>
                               <span className="text-sm font-bold text-text font-mono">{transcurridoTxt}</span>
                            </div>
                            <div className="flex justify-between items-center">
                               <span className="text-[11px] text-text/70 uppercase tracking-wider font-bold">{enCobro ? 'Cobrable' : 'Gratis restante'}</span>
                               <span className={`text-sm font-bold font-mono ${enCobro ? 'text-[#FACC15]' : 'text-[#57bf00]'}`}>
                                  {enCobro
                                     ? `${minCobrables} min`
                                     : `${ghh > 0 ? `${ghh}:` : ''}${String(gmm).padStart(2,'0')}:${String(gss).padStart(2,'0')}`}
                               </span>
                            </div>
                            <div className="flex justify-between items-center border-t border-border/50 pt-2 mt-0.5">
                               <span className="text-[11px] text-text/70 uppercase tracking-wider font-bold">A cobrar</span>
                               <span className={`text-xl font-display font-bold ${monto > 0 ? 'text-[#FACC15]' : 'text-[#57bf00]'}`}>
                                  ${monto.toLocaleString('es-CO')}
                               </span>
                            </div>
                         </div>
                      );
                   })()}

                   {/* Si está RETENIDA: esperando aprobación del residente.
                       El vehículo no sale salvo válvula de escape (paga en sitio). */}
                   {sesionCobro && sesionCobro.estado === 'RETENIDA' ? (
                      <div className="flex flex-col gap-3 w-full mt-2">
                         <div className="w-full bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-2xl p-4 text-center">
                            <p className="text-xs text-text/90 leading-relaxed">
                               🔒 <span className="font-bold">Vehículo retenido.</span> El cobro de{" "}
                               <span className="font-bold text-[#FACC15]">${Number(sesionCobro.montoFinal || sesionCobro.montoActual || 0).toLocaleString('es-CO')}</span>{" "}
                               está esperando que el residente lo apruebe. No autorices la salida hasta que apruebe, o cobra al visitante en sitio.
                            </p>
                         </div>
                         <button
                            type="button"
                            disabled={liquidando}
                            onClick={() => cerrarSesionLiquidando('VISITANTE_PAGO')}
                            className="w-full py-4 rounded-2xl bg-[#57bf00] text-white font-bold text-sm shadow-xl shadow-[#57bf00]/20 active:scale-95 transition-all disabled:opacity-60"
                         >
                            {liquidando ? "Procesando..." : "Visitante pagó en sitio → liberar"}
                         </button>
                         <button
                            type="button"
                            onClick={() => setCellToRelease(null)}
                            className="w-full py-3 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-sm hover:bg-text/10 active:scale-95 transition-all"
                         >
                            Cerrar (sigue retenido)
                         </button>
                      </div>
                   ) : sesionCobro && (ahora >= new Date(sesionCobro.finGratis).getTime()) ? (
                      <div className="flex flex-col gap-3 w-full mt-2">
                         <button
                            type="button"
                            disabled={liquidando}
                            onClick={() => cerrarSesionLiquidando('VISITANTE_PAGO')}
                            className="w-full py-4 rounded-2xl bg-[#57bf00] text-white font-bold text-sm shadow-xl shadow-[#57bf00]/20 active:scale-95 transition-all disabled:opacity-60"
                         >
                            {liquidando ? "Procesando..." : "Visitante pagó en sitio"}
                         </button>
                         <button
                            type="button"
                            disabled={liquidando}
                            onClick={() => cerrarSesionLiquidando('CARGADO_APTO')}
                            className="w-full py-4 rounded-2xl bg-accent text-on-accent font-bold text-sm shadow-xl shadow-accent/20 active:scale-95 transition-all disabled:opacity-60"
                         >
                            {liquidando ? "Procesando..." : "Cargar al apartamento (retiene el vehículo)"}
                         </button>
                         <button
                            type="button"
                            onClick={() => setCellToRelease(null)}
                            className="w-full py-3 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-sm hover:bg-text/10 active:scale-95 transition-all"
                         >
                            Cancelar
                         </button>
                      </div>
                   ) : (
                   <div className="flex gap-3 w-full mt-2">
                      <button
                         type="button"
                         onClick={() => setCellToRelease(null)}
                         className="flex-1 py-4 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-sm hover:bg-text/10 active:scale-95 transition-all"
                      >
                         Cancelar
                      </button>
                      <button
                         type="button"
                         disabled={isSubmitting || liquidando}
                         onClick={() => sesionCobro ? cerrarSesionLiquidando('VISITANTE_PAGO') : liberarCelda(cellToRelease.id)}
                         className="flex-1 py-4 rounded-2xl bg-accent text-on-accent font-bold text-sm shadow-xl shadow-accent/20 active:scale-95 transition-all disabled:opacity-60"
                      >
                         {(isSubmitting || liquidando) ? "Liberando..." : "Liberar Celda"}
                      </button>
                   </div>
                   )}
                </div>
             </div>
          </div>
       )}

       {/* MODAL: ASIGNAR CELDA DE RESIDENTE A UN APARTAMENTO (con placa) */}
       {cellResidente && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setCellResidente(null)} />
             <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
                <div className="flex justify-between items-center mb-6">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em] mb-1">Asignar a Apartamento</span>
                      <h3 className="text-2xl font-display font-bold text-text">Celda {cellResidente.numero}</h3>
                   </div>
                   <button type="button" onClick={() => setCellResidente(null)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text">
                      <X size={20} />
                   </button>
                </div>

                <p className="text-sm text-text/80 leading-relaxed mb-4">
                   Esta celda se asigna a un <span className="font-bold">apartamento</span>. Elige el residente
                   e indica la <span className="font-bold">placa</span> del vehículo. La placa es obligatoria.
                </p>

                <input
                  type="text"
                  value={busquedaRes}
                  onChange={(e) => setBusquedaRes(e.target.value)}
                  placeholder="Buscar por nombre, torre o apto..."
                  className="w-full bg-text/5 border border-border/50 rounded-2xl py-3 px-4 text-sm text-text placeholder:text-text/50 focus:outline-none focus:border-accent/50 mb-3"
                />

                <div className="flex flex-col gap-2 max-h-[32vh] overflow-y-auto hide-scrollbar mb-4">
                   {residentes
                     .filter((r) => {
                        const q = busquedaRes.toLowerCase();
                        return !q
                          || r.nombre?.toLowerCase().includes(q)
                          || String(r.torre || '').toLowerCase().includes(q)
                          || String(r.apto || '').toLowerCase().includes(q);
                     })
                     .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setResidenteId(r.id)}
                          className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${residenteId === r.id ? 'bg-accent/15 border-accent' : 'bg-text/5 border-border/40 hover:bg-text/10'}`}
                        >
                           <span className="text-sm font-bold text-text">{r.nombre}</span>
                           <span className="text-[11px] text-text/70">{r.torre ? `Torre ${r.torre}` : ''}{r.apto ? ` · ${r.apto}` : ''}</span>
                        </button>
                     ))}
                   {residentes.length === 0 && (
                      <p className="text-xs text-text/60 text-center py-4">No se pudo cargar el directorio de residentes.</p>
                   )}
                </div>

                {/* Placa obligatoria */}
                <div className="flex flex-col gap-2 mb-4">
                   <label className="text-[10px] text-text/80 font-bold uppercase tracking-widest ml-1">Placa del Vehículo *</label>
                   <input
                     type="text"
                     value={placaResidente}
                     onChange={(e) => setPlacaResidente(e.target.value.toUpperCase())}
                     placeholder="ABC-123"
                     className="w-full bg-text/5 border border-border/50 rounded-2xl py-4 px-6 text-text placeholder:text-text/40 text-lg font-mono tracking-widest focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
                   />
                </div>

                {/* Vigencia opcional */}
                <div className="mb-5">
                   <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[11px] font-bold text-text/80 uppercase tracking-wider">Vigencia</span>
                      <span className="text-[10px] text-text/50">opcional</span>
                   </div>
                   <div className="grid grid-cols-4 gap-2">
                      {[
                        { v: "sin", l: "Sin venc." },
                        { v: "6", l: "6 meses" },
                        { v: "12", l: "1 año" },
                        { v: "24", l: "2 años" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setMesesResidente(opt.v)}
                          className={`py-2.5 rounded-xl text-[11px] font-bold border transition-all ${mesesResidente === opt.v ? 'bg-accent text-on-accent border-accent shadow-lg shadow-accent/20' : 'bg-text/5 text-text border-border hover:bg-text/10'}`}
                        >
                          {opt.l}
                        </button>
                      ))}
                   </div>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting || !residenteId || !placaResidente.trim()}
                  onClick={asignarResidente}
                  className="w-full py-4 rounded-2xl bg-accent text-on-accent font-bold text-sm shadow-xl shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                   <Car size={18} /> {isSubmitting ? "Asignando..." : "Asignar al apartamento"}
                </button>
             </div>
=======
       {/* ═══════════════════════════════════════════════════════════════════
           MODAL: Cell Details / Check-in / Novelty
       ═══════════════════════════════════════════════════════════════════ */}
       {selectedCell && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => { setSelectedCell(null); setIsNoveltyFormOpen(false); }} />
             
             {selectedCell.estado === 'DISPONIBLE' && (
               <form 
                 onSubmit={handleConfirmAccess}
                 className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300"
               >
                 <div className="flex justify-between items-center mb-8">
                    <div className="flex flex-col">
                       <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em] mb-1">Registro de Acceso</span>
                       <h3 className="text-2xl font-display font-medium text-text">Celda {selectedCell.numero}</h3>
                    </div>
                    <button type="button" onClick={() => setSelectedCell(null)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text/40 hover:text-text transition-all">
                       <X size={20} />
                    </button>
                 </div>

                 <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Placa del Vehículo</label>
                       <input 
                         required
                         autoFocus
                         type="text" 
                         value={placa}
                         onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                         placeholder="ABC-123" 
                         className="w-full bg-text/5 border border-border/50 rounded-2xl py-4 px-6 text-text placeholder:text-text/40 text-lg font-mono tracking-widest focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
                       />
                    </div>

                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Destinatario / Residente (Opcional)</label>
                       <select
                         value={selectedDestinatarioId}
                         onChange={(e) => setSelectedDestinatarioId(e.target.value)}
                         className="w-full bg-text/5 border border-border/50 rounded-2xl py-4 px-5 text-text focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all text-sm bg-primary"
                       >
                         <option value="" className="bg-primary">Celda sin destinatario específico</option>
                         {residentes.map((r: any) => (
                           <option key={r.id} value={r.id} className="bg-primary text-text">
                             Apto {r.torre ? `${r.torre}-${r.numero}` : 'S/N'} — {r.nombre}
                           </option>
                         ))}
                       </select>
                    </div>

                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Observaciones (Opcional)</label>
                       <textarea 
                         value={obs}
                         onChange={(e) => setObs(e.target.value)}
                         placeholder="Ej: Vehículo de mudanza, ingreso temporal..." 
                         className="w-full bg-text/5 border border-border/50 rounded-2xl p-4 text-sm text-text placeholder:text-text/40 resize-none h-24 focus:outline-none focus:border-accent/50 transition-all"
                       />
                    </div>

                    <button 
                      disabled={isSubmitting}
                      type="submit" 
                      className="w-full bg-linear-to-r from-accent to-violet-600 rounded-2xl py-4 font-bold text-white shadow-xl shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmitting ? "Procesando..." : <><Car size={18} /> Confirmar Ingreso</>}
                    </button>
                 </div>
               </form>
             )}

             {selectedCell.estado !== 'DISPONIBLE' && (
               <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
                 
                 {isNoveltyFormOpen ? (
                   <form onSubmit={handleCreateNovelty}>
                     <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                           <span className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mb-1">Reportar Incidente / Novedad</span>
                           <h3 className="text-xl font-display font-medium text-text">Celda {selectedCell.numero}</h3>
                        </div>
                        <button type="button" onClick={() => setIsNoveltyFormOpen(false)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text/40 hover:text-text transition-all">
                           <X size={20} />
                        </button>
                     </div>

                     <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Tipo de Novedad</label>
                           <select 
                             value={novedadTipo}
                             onChange={e => setNovedadTipo(e.target.value)}
                             className="w-full bg-text/5 border border-border/50 rounded-2xl py-3 px-4 text-text focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all text-sm bg-primary"
                           >
                             <option value="INCIDENTE">⚠️ Incidente / Alarma</option>
                             <option value="DAÑO">🔧 Daño / Fuga</option>
                             <option value="SOSPECHOSO">🚫 Actividad Sospechosa</option>
                             <option value="OTRO">📝 Novedad General</option>
                           </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Título / Resumen</label>
                           <input 
                             required
                             type="text" 
                             placeholder="Ej: Fuga de aceite, Vidrio abajo..." 
                             value={novedadTitulo}
                             onChange={e => setNovedadTitulo(e.target.value)}
                             className="w-full bg-text/5 border border-border/50 rounded-2xl py-3 px-4 text-text placeholder:text-text/40 text-sm focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
                           />
                        </div>

                        <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Descripción Detallada</label>
                           <textarea 
                             required
                             placeholder="Detalles de la novedad. El residente será notificado de inmediato." 
                             value={novedadDesc}
                             onChange={e => setNovedadDesc(e.target.value)}
                             className="w-full bg-text/5 border border-border/50 rounded-2xl p-4 text-sm text-text placeholder:text-text/40 resize-none h-24 focus:outline-none focus:border-accent/50 transition-all"
                           />
                        </div>

                        <div className="flex gap-3 mt-2">
                           <button 
                             type="button"
                             onClick={() => setIsNoveltyFormOpen(false)}
                             className="flex-1 bg-text/5 hover:bg-text/10 rounded-2xl py-3 font-bold text-text transition-all text-sm cursor-pointer"
                           >
                             Volver
                           </button>
                           <button 
                             type="submit" 
                             className="flex-1 bg-amber-600 hover:bg-amber-700 rounded-2xl py-3 font-bold text-white shadow-xl shadow-amber-600/10 transition-all text-sm cursor-pointer"
                           >
                             Enviar Reporte
                           </button>
                        </div>
                     </div>
                   </form>
                 ) : (
                   <div>
                     <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                           <span className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-1 ${isOvertime(selectedCell.fechaIngreso) ? 'text-rose-500' : 'text-accent'}`}>
                             {isOvertime(selectedCell.fechaIngreso) ? '⚠️ Tiempo Excedido · ' : ''}Detalles de Estacionamiento
                           </span>
                           <h3 className="text-2xl font-display font-medium text-text">Celda {selectedCell.numero}</h3>
                        </div>
                        <button type="button" onClick={() => { setSelectedCell(null); setIsNoveltyFormOpen(false); }} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text/40 hover:text-text transition-all">
                           <X size={20} />
                        </button>
                     </div>

                     <div className="flex flex-col gap-6">
                        {/* Summary Card */}
                        <div className="bg-text/5 border border-border/30 rounded-2xl p-5 flex flex-col gap-3">
                           <div className="flex justify-between items-center pb-2 border-b border-border/10">
                              <span className="text-[10px] text-text/40 uppercase font-black tracking-widest">Tipo de celda</span>
                              <span className="text-xs font-bold text-text bg-text/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">{selectedCell.tipo}</span>
                           </div>

                           <div className="flex justify-between items-center pb-2 border-b border-border/10">
                              <span className="text-[10px] text-text/40 uppercase font-black tracking-widest">Placa Activa</span>
                              <span className="text-sm font-mono font-black text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                                {selectedCell.placaActiva || selectedCell.usuario?.vehiculos?.[0]?.placa || "Sin placa registrada"}
                              </span>
                           </div>

                           {selectedCell.fechaIngreso && (
                             <div className="flex justify-between items-center pb-2 border-b border-border/10">
                                <span className="text-[10px] text-text/40 uppercase font-black tracking-widest">Tiempo transcurrido</span>
                                <span className={`text-xs font-bold ${isOvertime(selectedCell.fechaIngreso) ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>
                                  {getElapsedTimeStr(selectedCell.fechaIngreso)}
                                  {isOvertime(selectedCell.fechaIngreso) && ' ⚠️'}
                                </span>
                             </div>
                           )}

                           {selectedCell.usuario?.nombre && (
                             <div className="flex justify-between items-center pb-2 border-b border-border/10">
                                <span className="text-[10px] text-text/40 uppercase font-black tracking-widest">Asignada a</span>
                                <span className="text-xs font-bold text-text max-w-[180px] truncate">{selectedCell.usuario?.nombre}</span>
                             </div>
                           )}

                           {selectedCell.observacionIngreso && (
                             <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-text/40 uppercase font-black tracking-widest">Observación de ingreso</span>
                                <p className="text-xs text-text/70 italic">&ldquo;{parseObservacion(selectedCell.observacionIngreso).cleanObs || 'Sin observaciones'}&rdquo;</p>
                                {parseObservacion(selectedCell.observacionIngreso).apto && (
                                  <span className="text-[9px] text-accent/80 font-bold mt-1">Destino: Apto {parseObservacion(selectedCell.observacionIngreso).apto}</span>
                                )}
                             </div>
                           )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3">
                           {/* Citofonía call button */}
                           {(() => {
                             const targetRes = residentes.find(r => r.id === parseObservacion(selectedCell.observacionIngreso).residentId) || selectedCell.usuario;
                             const torre = targetRes?.unidad?.torre || targetRes?.torre;
                             const numero = targetRes?.unidad?.numero || targetRes?.numero;

                             if (torre && numero) {
                               return (
                                 <button 
                                   type="button"
                                   onClick={() => startCall(`${torre}${numero}`)}
                                   className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-600/10 transition-all cursor-pointer"
                                 >
                                    <Phone size={16} /> Llamar al Apto {torre}{numero} ({targetRes.nombre})
                                 </button>
                               )
                             }
                             return null;
                           })()}

                           <button 
                             type="button"
                             onClick={() => setIsNoveltyFormOpen(true)}
                             className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/10 transition-all cursor-pointer"
                           >
                            <AlertTriangle size={16} /> Reportar Incidente / Novedad
                           </button>

                           {/* Free spot action (Check-out) — only for visitors or admins */}
                           {selectedCell.estado === 'OCUPADO' && (role !== 'VIGILANTE' && role !== 'SUPERVISOR_VIGILANCIA' ? true : selectedCell.tipo === 'VISITANTE') && (
                             <button 
                               type="button"
                               onClick={() => processToggle(selectedCell.id, 'DISPONIBLE')}
                               className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 text-sm shadow-lg shadow-rose-600/10 transition-all cursor-pointer"
                             >
                                <Car size={16} /> Registrar Salida (Liberar Celda)
                             </button>
                           )}
                        </div>
                     </div>
                   </div>
                 )}
               </div>
             )}
>>>>>>> Stashed changes
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            MODAL: Asignar Celda
        ═══════════════════════════════════════════════════════════════════ */}
        {showAssignCellModal && selectedVisitForCell && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => { setShowAssignCellModal(false); setSelectedVisitForCell(null); }} />
            
            <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
              <div className="flex justify-between items-center mb-6">
                <div className="flex flex-col">
                  <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em] mb-1">Asignar Celda de Visitante</span>
                  <h3 className="text-xl font-display font-medium text-text">{selectedVisitForCell.nombre}</h3>
                </div>
                <button type="button" onClick={() => { setShowAssignCellModal(false); setSelectedVisitForCell(null); }} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text/40 hover:text-text transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-6">
                <p className="text-xs text-text/60">
                  Selecciona una celda disponible para parqueadero de visitantes. Esta celda quedará en estado <strong>RESERVADA</strong> para esta visita.
                </p>

                <div className="grid grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {parqueaderos.filter(p => p.tipo === 'VISITANTE' && p.estado === 'DISPONIBLE').length === 0 ? (
                    <div className="col-span-3 text-center py-6 text-xs text-text/40 italic">
                      No hay celdas de visitantes disponibles.
                    </div>
                  ) : (
                    parqueaderos.filter(p => p.tipo === 'VISITANTE' && p.estado === 'DISPONIBLE').map((cell) => (
                      <button
                        key={cell.id}
                        type="button"
                        onClick={() => handleAssignCellSubmit(selectedVisitForCell.id, cell.id)}
                        className="py-3.5 bg-text/5 border border-border/40 hover:bg-accent/15 hover:border-accent hover:text-accent rounded-xl text-center text-sm font-bold transition-all active:scale-95 cursor-pointer text-text"
                      >
                        {cell.numero}
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => { setShowAssignCellModal(false); setSelectedVisitForCell(null); }}
                  className="w-full bg-text/5 hover:bg-text/10 rounded-2xl py-3.5 font-bold text-text transition-all text-sm cursor-pointer text-center text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

       <style dangerouslySetInnerHTML={{__html: `
         @keyframes bounce-subtle {
           0%, 100% { transform: translateY(0); }
           50% { transform: translateY(-4px); }
         }
         .animate-bounce-subtle {
           animation: bounce-subtle 2s infinite ease-in-out;
         }
         @keyframes pulse-subtle {
           0%, 100% { opacity: 1; }
           50% { opacity: 0.7; }
         }
         .animate-pulse-subtle {
           animation: pulse-subtle 2s infinite ease-in-out;
         }
       `}} />
    </div>
  );
}

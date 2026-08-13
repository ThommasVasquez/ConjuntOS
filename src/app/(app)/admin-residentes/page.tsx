"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  Search,
  User,
  Mail,
  Phone,
  Building2,
  Car,
  Dog,
  Pencil,
  UserPlus,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Upload,
  FileSpreadsheet,
  FileText,
  Download,
  Trash2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";
import type { Rol } from "@/lib/api/types";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";

// ---------------------------------------------------------------------------
// Local type shapes for admin resident endpoints
// ---------------------------------------------------------------------------

interface AdminResidenteItem {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  torre: string | null;
  apto: string | null;
  activo: boolean;
  interno: string | null;
}

interface VehiculoResumen {
  placa: string;
  marca: string | null;
  modelo: string | null;
  tipo: string;
}

interface MascotaResumen {
  nombre: string;
  tipo: string;
  raza: string | null;
}

interface PagoAdminResumen {
  id: string;
  concepto: string;
  monto: string;
  estado: string;
  fechaVencimiento: string;
}

interface AdminResidenteDetalle {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  torre: string | null;
  apto: string | null;
  activo: boolean;
  interno: string | null;
  unidad: {
    torre: string | null;
    numero: string;
    piso: number | null;
    tipo: string;
  } | null;
  vehiculos: VehiculoResumen[];
  mascotas: MascotaResumen[];
  ultimosPagos: PagoAdminResumen[];
}

interface InvitarResidenteRequest {
  email: string;
  nombre: string;
  rol: Rol;
  torre?: string;
  apto?: string;
}

interface EditarResidenteRequest {
  nombre: string;
  telefono?: string;
  torre?: string;
  apto?: string;
  rol: Rol;
  activo: boolean;
}

// Role badge helper
const ROL_LABELS: Record<Rol, string> = {
  PROPIETARIO: "Propietario",
  ARRENDATARIO: "Arrendatario",
  CONCEJO: "Concejo",
  ADMINISTRADOR: "Administrador",
  VIGILANTE: "Vigilante",
  SUPERVISOR_VIGILANCIA: "Supervisor Vigilancia",
  ENCARGADO_PARQUEADERO: "Encargado Parqueadero",
  SUPER_ADMIN: "Super Admin",
  HUESPED_TEMPORAL: "Huésped",
  ADMINISTRADOR_PISCINA: "Admin. Piscina",
  ADMINISTRADOR_GYM: "Admin. Gym",
  MANTENIMIENTO_LOCATIVO: "Mantenimiento",
  OPERARIO_LIMPIEZA: "Limpieza",
};

const ROL_FILTER_OPTIONS: { label: string; value: Rol | "TODOS" }[] = [
  { label: "Todos", value: "TODOS" },
  { label: "Propietario", value: "PROPIETARIO" },
  { label: "Arrendatario", value: "ARRENDATARIO" },
  { label: "Concejo", value: "CONCEJO" },
];

export default function AdminResidentesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const containerRef = useRef<HTMLDivElement>(null);

  // List state
  const [loading, setLoading] = useState(true);
  const [residentes, setResidentes] = useState<AdminResidenteItem[]>([]);
  const [search, setSearch] = useState("");
  const [rolFilter, setRolFilter] = useState<Rol | "TODOS">("TODOS");

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<AdminResidenteDetalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<EditarResidenteRequest>({
    nombre: "",
    telefono: "",
    torre: "",
    apto: "",
    rol: "PROPIETARIO",
    activo: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState<InvitarResidenteRequest>({
    email: "",
    nombre: "",
    rol: "PROPIETARIO",
    torre: "",
    apto: "",
  });
  const [sendingInvite, setSendingInvite] = useState(false);

  // Mass Import modal
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<"FILE" | "PASTE">("FILE");
  const [rawTextImport, setRawTextImport] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedImportItems, setParsedImportItems] = useState<
    {
      email: string;
      nombre: string;
      torre?: string;
      apto?: string;
      rol: Rol;
      valid: boolean;
      errorMsg?: string;
    }[]
  >([]);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const handleParseContent = (text: string) => {
    if (!text.trim()) {
      setParsedImportItems([]);
      return;
    }

    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const parsed: {
      email: string;
      nombre: string;
      torre?: string;
      apto?: string;
      rol: Rol;
      valid: boolean;
      errorMsg?: string;
    }[] = [];

    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

    lines.forEach((line, index) => {
      // Ignore header row if it contains 'email' or 'correo' in first line
      if (
        index === 0 &&
        (line.toLowerCase().includes("email") || line.toLowerCase().includes("correo"))
      ) {
        return;
      }

      const parts = line.split(/[,;\t|]+/).map((p) => p.trim());
      const emailMatch = line.match(emailRegex);
      const email = emailMatch ? emailMatch[1].toLowerCase() : "";

      if (!email) {
        parsed.push({
          email: parts[1] || "",
          nombre: parts[0] || `Fila ${index + 1}`,
          rol: "PROPIETARIO",
          valid: false,
          errorMsg: "Correo electrónico no detectado",
        });
        return;
      }

      let nombre = parts[0] || "";
      if (!nombre || nombre.toLowerCase().includes(email)) {
        nombre = parts[1] && !parts[1].includes("@") ? parts[1] : email.split("@")[0];
      }

      let torre = parts[2] || "";
      let apto = parts[3] || "";
      let rolStr = (parts[4] || "PROPIETARIO").toUpperCase();
      let rol: Rol = "PROPIETARIO";
      if (rolStr.includes("ARREND")) rol = "ARRENDATARIO";
      if (rolStr.includes("CONCEJ")) rol = "CONCEJO";

      parsed.push({
        email,
        nombre,
        torre: torre || undefined,
        apto: apto || undefined,
        rol,
        valid: true,
      });
    });

    setParsedImportItems(parsed);
  };

  const handleFileChange = (file: File) => {
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        handleParseContent(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Nombre,Email,Torre,Apto,Rol\n" +
      "Carlos Mendoza,carlos@ejemplo.com,1,101,PROPIETARIO\n" +
      "Ana Maria Gomez,ana@ejemplo.com,2,304,ARRENDATARIO\n" +
      "Pedro Ramirez,pedro@ejemplo.com,1,502,PROPIETARIO\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_importacion_residentes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Plantilla de importación CSV descargada");
  };

  const handleRemoveParsedItem = (index: number) => {
    setParsedImportItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateParsedItem = (index: number, field: string, value: string) => {
    setParsedImportItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
        updated.valid =
          emailRegex.test(updated.email) && updated.nombre.trim().length > 0;
        return updated;
      })
    );
  };

  const handleMassImportSubmit = async () => {
    const validItems = parsedImportItems.filter((item) => item.valid);
    if (validItems.length === 0) {
      toast.error("No hay registros válidos para importar");
      return;
    }

    setIsProcessingImport(true);
    setImportProgress(0);
    let successCount = 0;

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      try {
        await api.post("/admin/usuarios/invitar", {
          email: item.email,
          nombre: item.nombre,
          rol: item.rol,
          torre: item.torre || undefined,
          apto: item.apto || undefined,
        });
        successCount++;
      } catch {
        // Continue processing batch
      }
      setImportProgress(Math.round(((i + 1) / validItems.length) * 100));
    }

    setIsProcessingImport(false);
    toast.success(
      `Importación completada: ${successCount} de ${validItems.length} invitaciones enviadas.`
    );
    setShowImport(false);
    setParsedImportItems([]);
    setImportFile(null);
    setRawTextImport("");
    fetchResidentes();
  };

  // -------- Data fetching --------

  const fetchResidentes = async () => {
    setLoading(true);
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      const data = await api.get<AdminResidenteItem[]>(
        `/admin/usuarios${qs}`
      );
      setResidentes(data);
    } catch {
      toast.error("Error al cargar residentes");
    } finally {
      setLoading(false);
    }
  };

  const fetchDetalle = async (id: string) => {
    setLoadingDetalle(true);
    try {
      const data = await api.get<AdminResidenteDetalle>(
        `/admin/usuarios/${id}`
      );
      setDetalle(data);
    } catch {
      toast.error("Error al cargar detalle del residente");
    } finally {
      setLoadingDetalle(false);
    }
  };

  // Real-time WS subscription
  useWsSubscription("usuario", () => fetchResidentes());

  // -------- Auth guard --------

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ["ADMINISTRADOR", "SUPER_ADMIN"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    fetchResidentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  // Re-fetch on search change (debounced)
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(fetchResidentes, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, user]);

  // -------- Animations --------

  useEffect(() => {
    if (!loading) {
      const ctx = gsap.context(() => {
        
}, containerRef);
      return () => ctx.revert();
    }
  }, [loading]);

  // -------- Filters --------

  const filteredResidentes = residentes.filter((r) => {
    if (rolFilter !== "TODOS" && r.rol !== rolFilter) return false;
    return true;
  });

  // -------- Handlers --------

  const openDetalle = (id: string) => {
    setSelectedId(id);
    fetchDetalle(id);
  };

  const closeDetalle = () => {
    setSelectedId(null);
    setDetalle(null);
    setShowEdit(false);
  };

  const openEdit = () => {
    if (!detalle) return;
    setEditForm({
      nombre: detalle.nombre,
      telefono: detalle.telefono || "",
      torre: detalle.torre || "",
      apto: detalle.apto || "",
      rol: detalle.rol,
      activo: detalle.activo,
    });
    setShowEdit(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setSavingEdit(true);
    try {
      const body: EditarResidenteRequest = {
        ...editForm,
        telefono: editForm.telefono || undefined,
        torre: editForm.torre || undefined,
        apto: editForm.apto || undefined,
      };
      await api.put(`/admin/usuarios/${selectedId}`, body);
      toast.success("Residente actualizado exitosamente");
      setShowEdit(false);
      fetchResidentes();
      fetchDetalle(selectedId);
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError ? e.detail : "Error al actualizar residente"
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.nombre.trim()) {
      toast.error("Email y nombre son obligatorios");
      return;
    }
    setSendingInvite(true);
    try {
      const body: InvitarResidenteRequest = {
        ...inviteForm,
        torre: inviteForm.torre || undefined,
        apto: inviteForm.apto || undefined,
      };
      await api.post("/admin/usuarios/invitar", body);
      toast.success("Invitación enviada exitosamente");
      setShowInvite(false);
      setInviteForm({
        email: "",
        nombre: "",
        rol: "PROPIETARIO",
        torre: "",
        apto: "",
      });
      fetchResidentes();
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError ? e.detail : "Error al enviar invitación"
      );
    } finally {
      setSendingInvite(false);
    }
  };

  // -------- Loading state --------

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SkeletonRows />
      </div>
    );
  }

  // -------- Render --------

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden"
    >
      <ProfileHeader />

      {/* Header + buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-medium text-text tracking-wide">
            Residentes
          </h1>
          <p className="text-sm text-text" style={{ opacity: 0.6 }}>
            Gestión de unidades y usuarios
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-surface-2 border border-border text-text hover:bg-accent/10 hover:border-accent/40 rounded-full px-4 py-2.5 text-sm font-bold active:scale-95 transition-all cursor-pointer shadow-md"
          >
            <Upload size={17} className="text-accent" />
            <span>Importar</span>
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 bg-[#57bf00] text-white rounded-full shadow-lg shadow-[#57bf00]/30 px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform cursor-pointer"
          >
            <UserPlus size={18} />
            <span>Invitar</span>
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-5 top-1/2 -translate-y-1/2 text-text"
          style={{ opacity: 0.5 }}
        />
        <input
          type="text"
          placeholder="Buscar por nombre, email o apto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface-2 border border-border rounded-xl py-3 pl-14 pr-4 text-sm text-text focus:outline-none focus:border-accent transition-all placeholder:text-text"
          style={{ "--placeholder-opacity": "0.4" } as React.CSSProperties}
        />
      </div>

      {/* Role filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ROL_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRolFilter(opt.value)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
              rolFilter === opt.value
                ? "bg-[#009df2] text-white shadow-lg shadow-[#009df2]/30"
                : "bg-text/5 border border-border text-text hover:bg-text/10"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Resident listing */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="w-full py-12 flex justify-center">
            <SkeletonRows />
          </div>
        ) : filteredResidentes.length === 0 ? (
          <div className="liquid-glass rounded-3xl p-8 border border-border text-center">
            <User size={40} className="mx-auto text-text mb-3" style={{ opacity: 0.4 }} />
            <p className="text-text font-medium">
              {search || rolFilter !== "TODOS"
                ? "Sin resultados"
                : "No hay residentes registrados"}
            </p>
            <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
              {search || rolFilter !== "TODOS"
                ? "Intenta con otros filtros o términos de búsqueda."
                : "Invita a los residentes usando el botón superior."}
            </p>
          </div>
        ) : (
          filteredResidentes.map((r) => (
            <div
              key={r.id}
              onClick={() => openDetalle(r.id)}
              className="liquid-glass rounded-3xl p-6 border border-border flex flex-col gap-3 group hover:border-accent/30 transition-all cursor-pointer active:scale-[0.98]"
            >
              {/* Top row: name + status */}
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text">
                    <User size={22} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-text">
                      {r.nombre}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          r.activo ? "bg-[#57bf00]" : "bg-text/30"
                        }`}
                      />
                      <span className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                        {r.activo ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="bg-text/10 text-text border border-text/20 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                  {ROL_LABELS[r.rol] || r.rol}
                </span>
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 text-xs text-text truncate">
                  <Mail size={13} style={{ opacity: 0.5 }} />
                  <span className="truncate">{r.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text truncate">
                  <Phone size={13} style={{ opacity: 0.5 }} />
                  <span>{r.telefono || "—"}</span>
                </div>
              </div>

              {/* Torre / Apto + Interno */}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-text" style={{ opacity: 0.5 }} />
                  <span className="text-xs text-text font-bold">
                    {r.torre && r.apto
                      ? `Torre ${r.torre} - Apto ${r.apto}`
                      : "Sin unidad asignada"}
                  </span>
                </div>
                {r.interno && (
                  <span className="text-[10px] bg-surface-2 border border-border text-text rounded-lg px-2 py-0.5 font-mono">
                    #{r.interno}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ============================================================ */}
      {/* DETAIL MODAL */}
      {/* ============================================================ */}
      {selectedId && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={closeDetalle}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[500px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            {/* Close button */}
            <button
              onClick={closeDetalle}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors z-20"
            >
              <X size={20} />
            </button>

            {loadingDetalle ? (
              <div className="py-12 flex justify-center">
                <SkeletonRows />
              </div>
            ) : detalle ? (
              <div className="flex flex-col gap-5 pt-4">
                {/* Avatar + name */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text">
                    <User size={28} />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-text">
                      {detalle.nombre}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          detalle.activo ? "bg-[#57bf00]" : "bg-text/30"
                        }`}
                      />
                      <span className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                        {detalle.activo ? "Activo" : "Inactivo"}
                      </span>
                      <span className="bg-text/10 text-text border border-text/20 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                        {ROL_LABELS[detalle.rol] || detalle.rol}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-surface-2 border border-border">
                  <div className="flex items-center gap-2 text-sm text-text">
                    <Mail size={14} style={{ opacity: 0.5 }} />
                    <span>{detalle.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-text">
                    <Phone size={14} style={{ opacity: 0.5 }} />
                    <span>{detalle.telefono || "No registrado"}</span>
                  </div>
                  {detalle.interno && (
                    <div className="flex items-center gap-2 text-sm text-text">
                      <Building2 size={14} style={{ opacity: 0.5 }} />
                      <span>Interno #{detalle.interno}</span>
                    </div>
                  )}
                </div>

                {/* Unidad */}
                {detalle.unidad && (
                  <div className="p-4 rounded-2xl bg-surface-2 border border-border">
                    <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black block mb-2">
                      Unidad Asignada
                    </span>
                    <div className="flex items-center gap-3">
                      <Building2 size={18} className="text-text" style={{ opacity: 0.6 }} />
                      <div>
                        <p className="text-sm font-bold text-text">
                          {detalle.unidad.torre
                            ? `Torre ${detalle.unidad.torre} - ${detalle.unidad.numero}`
                            : detalle.unidad.numero}
                        </p>
                        <p className="text-xs text-text" style={{ opacity: 0.5 }}>
                          {detalle.unidad.tipo} • Piso {detalle.unidad.piso ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Vehículos */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 opacity-70">
                    <Car size={16} className="text-text" />
                    <h5 className="text-[11px] text-text font-black uppercase tracking-[0.2em]">
                      Vehículos ({detalle.vehiculos.length})
                    </h5>
                  </div>
                  {detalle.vehiculos.length === 0 ? (
                    <div className="p-4 rounded-xl bg-surface-2 border border-dashed border-border text-center">
                      <span className="text-[10px] text-text font-bold uppercase tracking-wider">
                        Sin vehículos registrados
                      </span>
                    </div>
                  ) : (
                    detalle.vehiculos.map((v, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-surface-2 border border-border flex justify-between items-center"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-text/5 border border-border flex items-center justify-center text-text font-black text-sm uppercase">
                            {v.placa.slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-black text-text tracking-wider">
                              {v.placa}
                            </p>
                            <p className="text-[10px] font-bold text-text uppercase">
                              {v.marca} {v.modelo}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] bg-text/10 border border-border text-text rounded-full px-2 py-0.5 uppercase font-bold">
                          {v.tipo}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Mascotas */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 opacity-70">
                    <Dog size={16} className="text-text" />
                    <h5 className="text-[11px] text-text font-black uppercase tracking-[0.2em]">
                      Mascotas ({detalle.mascotas.length})
                    </h5>
                  </div>
                  {detalle.mascotas.length === 0 ? (
                    <div className="p-4 rounded-xl bg-surface-2 border border-dashed border-border text-center">
                      <span className="text-[10px] text-text font-bold uppercase tracking-wider">
                        Sin mascotas registradas
                      </span>
                    </div>
                  ) : (
                    detalle.mascotas.map((m, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-surface-2 border border-border flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-text/5 border border-border flex items-center justify-center text-text">
                          <Dog size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-text uppercase">
                            {m.nombre}
                          </p>
                          <span className="text-[10px] font-bold text-text uppercase">
                            {m.tipo} • {m.raza || "—"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Últimos pagos */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 opacity-70">
                    <ShieldCheck size={16} className="text-text" />
                    <h5 className="text-[11px] text-text font-black uppercase tracking-[0.2em]">
                      Últimos Pagos ({detalle.ultimosPagos.length})
                    </h5>
                  </div>
                  {detalle.ultimosPagos.length === 0 ? (
                    <div className="p-4 rounded-xl bg-surface-2 border border-dashed border-border text-center">
                      <span className="text-[10px] text-text font-bold uppercase tracking-wider">
                        Sin pagos recientes
                      </span>
                    </div>
                  ) : (
                    detalle.ultimosPagos.map((p, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-surface-2 border border-border flex justify-between items-center"
                      >
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-text">
                            {p.concepto}
                          </span>
                          <span className="text-[9px] text-text" style={{ opacity: 0.5 }}>
                            Vence: {new Date(p.fechaVencimiento).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-text">
                            ${Number(p.monto).toLocaleString()}
                          </span>
                          <span
                            className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                              p.estado === "PAGADO"
                                ? "bg-[#57bf00]/10 text-[#57bf00] border-[#57bf00]/30"
                                : p.estado === "VENCIDO"
                                ? "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30"
                                : "bg-text/10 text-text border-text/20"
                            }`}
                          >
                            {p.estado}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Edit button */}
                <button
                  onClick={openEdit}
                  className="w-full py-3.5 rounded-full bg-[#57bf00] text-white font-bold text-sm shadow-lg shadow-[#57bf00]/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 mt-2"
                >
                  <Pencil size={18} />
                  Editar Residente
                </button>
              </div>
            ) : (
              <div className="py-12 text-center">
                <XCircle size={40} className="mx-auto text-text mb-3" style={{ opacity: 0.4 }} />
                <p className="text-text">No se pudo cargar el residente</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EDIT MODAL */}
      {/* ============================================================ */}
      {showEdit && selectedId && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={() => setShowEdit(false)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[450px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text">Editar Residente</h3>
              <button
                onClick={() => setShowEdit(false)}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
              {/* Nombre */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.nombre}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, nombre: e.target.value }))
                  }
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>

              {/* Teléfono */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={editForm.telefono || ""}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      telefono: e.target.value,
                    }))
                  }
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>

              {/* Torre + Apto */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                    Torre
                  </label>
                  <input
                    type="text"
                    value={editForm.torre || ""}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        torre: e.target.value,
                      }))
                    }
                    className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                    Apto
                  </label>
                  <input
                    type="text"
                    value={editForm.apto || ""}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        apto: e.target.value,
                      }))
                    }
                    className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Rol */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Rol
                </label>
                <select
                  value={editForm.rol}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      rol: e.target.value as Rol,
                    }))
                  }
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                >
                  <option value="PROPIETARIO">Propietario</option>
                  <option value="ARRENDATARIO">Arrendatario</option>
                  <option value="CONCEJO">Concejo</option>
                  <option value="ADMINISTRADOR">Administrador</option>
                  <option value="VIGILANTE">Vigilante</option>
                  <option value="SUPERVISOR_VIGILANCIA">
                    Supervisor Vigilancia
                  </option>
                  <option value="ENCARGADO_PARQUEADERO">
                    Encargado Parqueadero
                  </option>
                </select>
              </div>

              {/* Activo toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-sm text-text font-medium">
                  Estado de la cuenta
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditForm((prev) => ({ ...prev, activo: !prev.activo }))
                  }
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    editForm.activo ? "bg-[#57bf00]" : "bg-text/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      editForm.activo ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Save button */}
              <button
                type="submit"
                disabled={savingEdit}
                className="w-full py-3.5 rounded-full bg-[#57bf00] text-white font-bold text-sm shadow-lg shadow-[#57bf00]/30 active:scale-[0.98] transition-transform disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
              >
                {savingEdit ? (
                  <>
                    <Skeleton className="w-5 h-5 rounded-full" />
                    Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* INVITE MODAL */}
      {/* ============================================================ */}
      {showInvite && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={() => setShowInvite(false)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[450px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text">
                Invitar Residente
              </h3>
              <button
                onClick={() => setShowInvite(false)}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSendInvite}
              className="flex flex-col gap-4"
            >
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder="residente@ejemplo.com"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
                />
              </div>

              {/* Nombre */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={inviteForm.nombre}
                  onChange={(e) =>
                    setInviteForm((prev) => ({
                      ...prev,
                      nombre: e.target.value,
                    }))
                  }
                  placeholder="Nombre completo"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
                />
              </div>

              {/* Rol */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Rol
                </label>
                <select
                  value={inviteForm.rol}
                  onChange={(e) =>
                    setInviteForm((prev) => ({
                      ...prev,
                      rol: e.target.value as Rol,
                    }))
                  }
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                >
                  <option value="PROPIETARIO">Propietario</option>
                  <option value="ARRENDATARIO">Arrendatario</option>
                  <option value="CONCEJO">Concejo</option>
                </select>
              </div>

              {/* Torre + Apto */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                    Torre
                  </label>
                  <input
                    type="text"
                    value={inviteForm.torre || ""}
                    onChange={(e) =>
                      setInviteForm((prev) => ({
                        ...prev,
                        torre: e.target.value,
                      }))
                    }
                    className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                    Apto
                  </label>
                  <input
                    type="text"
                    value={inviteForm.apto || ""}
                    onChange={(e) =>
                      setInviteForm((prev) => ({
                        ...prev,
                        apto: e.target.value,
                      }))
                    }
                    className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Send button */}
              <button
                type="submit"
                disabled={sendingInvite}
                className="w-full py-3.5 rounded-full bg-[#57bf00] text-white font-bold text-sm shadow-lg shadow-[#57bf00]/30 active:scale-[0.98] transition-transform disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
              >
                {sendingInvite ? (
                  <>
                    <Skeleton className="w-5 h-5 rounded-full" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Invitación"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MASS IMPORT MODAL */}
      {/* ============================================================ */}
      {showImport && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={() => !isProcessingImport && setShowImport(false)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[650px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent shrink-0">
                  <Upload size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text">Importación Masiva</h3>
                  <p className="text-xs text-text/70">
                    Carga o pega tus bases de datos (Excel, CSV, PDF, TXT)
                  </p>
                </div>
              </div>
              <button
                disabled={isProcessingImport}
                onClick={() => setShowImport(false)}
                className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Template download banner */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-accent/10 border border-accent/30 text-text">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileSpreadsheet size={20} className="text-accent shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-text">¿Necesitas una plantilla de ejemplo?</span>
                  <span className="text-[10px] text-text/70 truncate">Formato óptimo: Nombre, Email, Torre, Apto, Rol</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-on-accent text-xs font-bold shrink-0 hover:bg-accent/90 transition-all cursor-pointer shadow-sm"
              >
                <Download size={14} />
                <span>Plantilla CSV</span>
              </button>
            </div>

            {/* Import Mode Tabs */}
            <div className="flex bg-surface-2 p-1 rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setImportTab("FILE")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  importTab === "FILE"
                    ? "bg-accent text-on-accent shadow-md"
                    : "text-text/70 hover:text-text"
                }`}
              >
                <FileSpreadsheet size={15} /> Subir Archivo (Excel / CSV / PDF / TXT)
              </button>
              <button
                type="button"
                onClick={() => setImportTab("PASTE")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  importTab === "PASTE"
                    ? "bg-accent text-on-accent shadow-md"
                    : "text-text/70 hover:text-text"
                }`}
              >
                <FileText size={15} /> Pegar Texto / Tabla
              </button>
            </div>

            {/* Input options */}
            {importTab === "FILE" ? (
              <div className="flex flex-col gap-3">
                <label className="border-2 border-dashed border-accent/40 hover:border-accent bg-surface-2/60 rounded-3xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:bg-accent/5 group">
                  <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                    <Upload size={24} />
                  </div>
                  <span className="text-sm font-bold text-text text-center">
                    {importFile ? importFile.name : "Haz clic para seleccionar o arrastra un archivo"}
                  </span>
                  <span className="text-xs text-text/60 text-center">
                    Formatos soportados: .xlsx, .xls, .csv, .pdf, .txt, .tsv
                  </span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf,.txt,.tsv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
                  Pegar Filas de Excel o CSV directamente
                </label>
                <textarea
                  rows={5}
                  value={rawTextImport}
                  onChange={(e) => {
                    setRawTextImport(e.target.value);
                    handleParseContent(e.target.value);
                  }}
                  placeholder={"Nombre, Email, Torre, Apto, Rol\nCarlos Mendoza, carlos@ejemplo.com, 1, 101, PROPIETARIO\nAna Gomez, ana@ejemplo.com, 2, 204, ARRENDATARIO"}
                  className="w-full bg-surface-2 border border-border rounded-2xl p-4 text-xs font-mono text-text focus:outline-none focus:border-accent"
                />
              </div>
            )}

            {/* Parsed Preview Table */}
            {parsedImportItems.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text flex items-center gap-1.5">
                    <Sparkles size={14} className="text-accent" />
                    Vista Previa de Registros Detectados ({parsedImportItems.filter((i) => i.valid).length} válidos de {parsedImportItems.length})
                  </span>
                </div>

                <div className="max-h-[220px] overflow-y-auto border border-border rounded-2xl overflow-hidden hide-scrollbar bg-surface-2/40">
                  <table className="w-full text-left text-xs text-text">
                    <thead className="bg-surface-2 border-b border-border/60 uppercase font-mono text-[9px] text-text/70 sticky top-0">
                      <tr>
                        <th className="p-3">Nombre</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Torre / Apto</th>
                        <th className="p-3">Rol</th>
                        <th className="p-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {parsedImportItems.map((item, index) => (
                        <tr key={index} className={item.valid ? "hover:bg-accent/5" : "bg-red-500/10 text-red-400"}>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.nombre}
                              onChange={(e) => handleUpdateParsedItem(index, "nombre", e.target.value)}
                              placeholder="Nombre"
                              className="w-full bg-surface-2 border border-border/60 rounded-lg px-2.5 py-1 text-xs text-text font-semibold focus:outline-none focus:border-accent"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="email"
                              value={item.email}
                              onChange={(e) => handleUpdateParsedItem(index, "email", e.target.value)}
                              placeholder="correo@ejemplo.com"
                              className="w-full bg-surface-2 border border-border/60 rounded-lg px-2.5 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={item.torre || ""}
                                onChange={(e) => handleUpdateParsedItem(index, "torre", e.target.value)}
                                placeholder="Torre"
                                className="w-14 bg-surface-2 border border-border/60 rounded-lg px-1.5 py-1 text-xs text-text focus:outline-none focus:border-accent"
                              />
                              <input
                                type="text"
                                value={item.apto || ""}
                                onChange={(e) => handleUpdateParsedItem(index, "apto", e.target.value)}
                                placeholder="Apto"
                                className="w-16 bg-surface-2 border border-border/60 rounded-lg px-1.5 py-1 text-xs text-text focus:outline-none focus:border-accent"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            <select
                              value={item.rol}
                              onChange={(e) => handleUpdateParsedItem(index, "rol", e.target.value)}
                              className="bg-surface-2 border border-border/60 rounded-lg px-2 py-1 text-[11px] font-bold text-text focus:outline-none focus:border-accent uppercase cursor-pointer"
                            >
                              <option value="PROPIETARIO">PROPIETARIO</option>
                              <option value="ARRENDATARIO">ARRENDATARIO</option>
                              <option value="CONCEJO">CONCEJO</option>
                            </select>
                          </td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveParsedItem(index)}
                              className="p-1.5 rounded-lg text-text/60 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Eliminar fila"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Batch Progress Bar */}
            {isProcessingImport && (
              <div className="flex flex-col gap-2 p-4 rounded-2xl bg-accent/10 border border-accent/40">
                <div className="flex justify-between items-center text-xs font-bold text-text">
                  <span>Procesando invitaciones masivas...</span>
                  <span className="font-mono text-accent">{importProgress}%</span>
                </div>
                <div className="w-full bg-surface-2 rounded-full h-2.5 overflow-hidden border border-border">
                  <div
                    className="bg-accent h-full transition-all duration-200 rounded-full"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2 border-t border-border/40">
              <button
                type="button"
                disabled={isProcessingImport}
                onClick={() => setShowImport(false)}
                className="py-3 px-5 rounded-2xl border border-border text-xs font-bold uppercase tracking-wider text-text bg-surface hover:bg-surface-2 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessingImport || parsedImportItems.filter((i) => i.valid).length === 0}
                onClick={handleMassImportSubmit}
                className="py-3 px-6 rounded-2xl bg-accent hover:bg-accent/90 text-on-accent text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-accent/20 flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessingImport ? (
                  <>Procesando {importProgress}%...</>
                ) : (
                  <>
                    <Upload size={16} /> Enviar {parsedImportItems.filter((i) => i.valid).length} Invitaciones Masivas
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

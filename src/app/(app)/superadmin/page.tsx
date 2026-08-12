"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Building2, Plus, FileText, ShieldCheck, MapPin,
  User, Calendar, Layers, Upload, Edit3, Home, Grid, ToggleLeft, ToggleRight
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import type { ConjuntoDto } from "@/lib/api/types";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { SkeletonRows } from "@/components/ui/Skeleton";

export default function SuperAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;
  const containerRef = useRef<HTMLDivElement>(null);

  const [conjuntos, setConjuntos] = useState<ConjuntoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tab, setTab] = useState<"CREAR" | "LISTAR">("CREAR");
  const [editingConjuntoId, setEditingConjuntoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    nombre: "",
    nit: "",
    subdominio: "",
    direccion: "",
    ciudad: "",
    representanteLegal: "",
    notariaEscritura: "",
    numeroEscritura: "",
    fechaEscritura: "",
    matriculaInmobiliaria: "",
    totalUnidades: "1",
    tipoAgrupacion: "Torre", // "Torre", "Interior", "Bloque", "Etapa", "Sin Bloque", "Custom"
    tipoAgrupacionCustom: "",
    tipoUnidadPrivada: "Apartamento", // "Apartamento", "Casa", "Local", "Oficina", "Penthouse", "Custom"
    tipoUnidadCustom: "",
    tieneSubdominiosBloques: true,
    ejemploBloque: "4",
    ejemploUnidad: "1410",
    logoUrl: "",
    colorPrimario: "#404040",
  });

  const handleEditClick = (c: ConjuntoDto) => {
    setEditingConjuntoId(c.id);
    const tipoAgrup = c.tipoAgrupacion || "Torre";
    const isAgrupKnown = ["Torre", "Interior", "Bloque", "Etapa", "Sin Bloque"].includes(tipoAgrup);
    const tipoUnidad = c.tipoUnidadPrivada || "Apartamento";
    const isUnidadKnown = ["Apartamento", "Casa", "Local", "Oficina", "Penthouse"].includes(tipoUnidad);

    setFormData({
      nombre: c.nombre || "",
      nit: c.nit || "",
      subdominio: c.subdominio || "",
      direccion: c.direccion || "",
      ciudad: c.ciudad || "",
      representanteLegal: c.representanteLegal || "",
      notariaEscritura: c.notariaEscritura || "",
      numeroEscritura: c.numeroEscritura || "",
      fechaEscritura: c.fechaEscritura ? new Date(c.fechaEscritura).toISOString().split("T")[0] : "",
      matriculaInmobiliaria: c.matriculaInmobiliaria || "",
      totalUnidades: c.totalUnidades ? String(c.totalUnidades) : "1",
      tipoAgrupacion: isAgrupKnown ? tipoAgrup : "Custom",
      tipoAgrupacionCustom: isAgrupKnown ? "" : tipoAgrup,
      tipoUnidadPrivada: isUnidadKnown ? tipoUnidad : "Custom",
      tipoUnidadCustom: isUnidadKnown ? "" : tipoUnidad,
      tieneSubdominiosBloques: c.tieneSubdominiosBloques ?? true,
      ejemploBloque: "4",
      ejemploUnidad: "1410",
      logoUrl: c.logoUrl || "",
      colorPrimario: c.colorPrimario || "#404040",
    });
    setTab("CREAR");
  };

  const handleCancelEdit = () => {
    setEditingConjuntoId(null);
    setFormData({
      nombre: "",
      nit: "",
      subdominio: "",
      direccion: "",
      ciudad: "",
      representanteLegal: "",
      notariaEscritura: "",
      numeroEscritura: "",
      fechaEscritura: "",
      matriculaInmobiliaria: "",
      totalUnidades: "1",
      tipoAgrupacion: "Torre",
      tipoAgrupacionCustom: "",
      tipoUnidadPrivada: "Apartamento",
      tipoUnidadCustom: "",
      tieneSubdominiosBloques: true,
      ejemploBloque: "4",
      ejemploUnidad: "1410",
      logoUrl: "",
      colorPrimario: "#404040",
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error("El tamaño de la imagen supera el límite de 5MB");
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, logoUrl: reader.result as string }));
        toast.success("Logotipo cargado correctamente");
        setIsUploading(false);
      };
      reader.onerror = () => {
        toast.error("Error al leer la imagen");
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: unknown) {
      toast.error("Error al cargar imagen: " + (err instanceof Error ? err.message : String(err)));
      setIsUploading(false);
    }
  };

  const fetchConjuntos = async () => {
    try {
      const data = await api.get<ConjuntoDto[]>("/superadmin/conjuntos");
      setConjuntos(data);
    } catch {
      toast.error("Error al cargar conjuntos registrados");
    } finally {
      setLoading(false);
    }
  };

  useWsSubscription("conjunto", () => fetchConjuntos());

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    if (role !== "SUPER_ADMIN") {
      toast.error("No autorizado. Esta sección es exclusiva de SuperAdministradores.");
      router.push("/inicio");
      return;
    }

    fetchConjuntos();
  }, [user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      const ctx = gsap.context(() => {}, containerRef);
      return () => ctx.revert();
    }
  }, [loading, tab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.nombre || !formData.nit || !formData.subdominio || !formData.direccion || !formData.ciudad) {
      return toast.error("Por favor completa todos los campos obligatorios");
    }

    setIsSubmitting(true);
    try {
      const resolvedTipoAgrupacion =
        formData.tipoAgrupacion === "Custom"
          ? formData.tipoAgrupacionCustom.trim() || "Bloque"
          : formData.tipoAgrupacion;

      const resolvedTipoUnidad =
        formData.tipoUnidadPrivada === "Custom"
          ? formData.tipoUnidadCustom.trim() || "Unidad"
          : formData.tipoUnidadPrivada;

      const payload: Record<string, unknown> = {
        tipoAgrupacion: resolvedTipoAgrupacion,
        tipoUnidadPrivada: resolvedTipoUnidad,
        tieneSubdominiosBloques: formData.tieneSubdominiosBloques,
        formatoNomenclatura: formData.tieneSubdominiosBloques && resolvedTipoAgrupacion !== "Sin Bloque"
          ? `${resolvedTipoAgrupacion} {bloque} - ${resolvedTipoUnidad} {unidad}`
          : `${resolvedTipoUnidad} {unidad}`,
      };

      Object.entries(formData).forEach(([key, value]) => {
        if (
          key === "tipoAgrupacion" ||
          key === "tipoAgrupacionCustom" ||
          key === "tipoUnidadPrivada" ||
          key === "tipoUnidadCustom" ||
          key === "tieneSubdominiosBloques" ||
          key === "ejemploBloque" ||
          key === "ejemploUnidad"
        ) {
          return;
        }

        if (value === "" || value === null || value === undefined) return;
        if (key === "totalUnidades") {
          const n = parseInt(String(value), 10);
          if (!Number.isNaN(n)) payload[key] = n;
        } else {
          payload[key] = value;
        }
      });

      if (editingConjuntoId) {
        await api.put(`/superadmin/conjuntos/${editingConjuntoId}`, payload);
      } else {
        await api.post("/superadmin/conjuntos", payload);
      }
      toast.success(
        editingConjuntoId
          ? "Copropiedad actualizada con éxito"
          : "Conjunto de Propiedad Horizontal registrado con éxito",
      );
      handleCancelEdit();
      fetchConjuntos();
      setTab("LISTAR");
    } catch {
      toast.error("Error de conexión al servidor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAgrupacionLabel = () => {
    if (formData.tipoAgrupacion === "Custom") {
      return formData.tipoAgrupacionCustom.trim() || "Bloque";
    }
    return formData.tipoAgrupacion;
  };

  const getUnidadLabel = () => {
    if (formData.tipoUnidadPrivada === "Custom") {
      return formData.tipoUnidadCustom.trim() || "Inmueble";
    }
    return formData.tipoUnidadPrivada;
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SkeletonRows />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 p-4 md:p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden max-w-7xl mx-auto w-full"
    >
      <ProfileHeader />

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent italic truncate block">
            SuperAdmin Dashboard
          </span>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-text leading-none mt-1 truncate">
            Registrar Copropiedad
          </h1>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shrink-0">
          <Building2 size={22} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface-2 rounded-full p-1 border border-border w-full">
        <button
          onClick={() => setTab("CREAR")}
          className={`flex-1 py-3 px-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all truncate ${
            tab === "CREAR"
              ? "bg-accent/10 text-accent shadow-inner"
              : "text-text hover:text-text"
          }`}
        >
          Nuevo Registro
        </button>
        <button
          onClick={() => setTab("LISTAR")}
          className={`flex-1 py-3 px-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all truncate ${
            tab === "LISTAR"
              ? "bg-surface text-text border border-border shadow-md"
              : "text-text hover:text-text"
          }`}
        >
          Ver Registrados ({conjuntos.length})
        </button>
      </div>

      {tab === "CREAR" ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full">
          {editingConjuntoId && (
            <div className="flex items-center justify-between gap-2 bg-accent/15 border border-accent/20 rounded-2xl p-4 text-xs text-text shadow-lg">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping shrink-0" />
                <span className="truncate">
                  Modo edición activo: Editando{" "}
                  <strong>{formData.nombre || "copropiedad"}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="py-1.5 px-3 rounded-xl border border-border text-[9px] font-black uppercase tracking-wider bg-surface hover:bg-text/5 text-text cursor-pointer transition-all active:scale-95 shrink-0"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* SECCIÓN 1: IDENTIFICACIÓN GENERAL */}
          <div className="liquid-glass rounded-[28px] p-5 md:p-6 border border-border shadow-2xl flex flex-col gap-4 w-full">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 truncate">
              <Building2 size={16} className="text-accent shrink-0" /> 1. Datos Generales de la Copropiedad
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Nombre Comercial *
                </label>
                <input
                  required
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Residencial Club del Sol"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                />
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  NIT *
                </label>
                <input
                  required
                  type="text"
                  value={formData.nit}
                  onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                  placeholder="Ej: 900.123.456-1"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <div className="flex flex-col gap-1.5 md:col-span-2 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Dirección de Ubicación *
                </label>
                <input
                  required
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Ej: Calle 26 # 69-76"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                />
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Municipio / Ciudad *
                </label>
                <input
                  required
                  type="text"
                  value={formData.ciudad}
                  onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                  placeholder="Ej: Medellín"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 w-full">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                Subdominio Único (Tenant ID) *
              </label>
              <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3 focus-within:border-accent transition-colors w-full min-w-0">
                <input
                  required
                  type="text"
                  value={formData.subdominio}
                  onChange={(e) => setFormData({ ...formData, subdominio: e.target.value })}
                  placeholder="clubdelsol"
                  className="bg-transparent border-none outline-none text-sm text-text flex-1 min-w-0"
                />
                <span className="text-xs text-text font-mono shrink-0 ml-2">.conjuntos.app</span>
              </div>
              <p className="text-[9px] text-text/70 pl-1 mt-0.5">
                Identificador de URL único para acceso directo al portal de residentes.
              </p>
            </div>
          </div>

          {/* SECCIÓN 2: REGISTRO DE PERSONERÍA JURÍDICA */}
          <div className="liquid-glass rounded-[28px] p-5 md:p-6 border border-border shadow-2xl flex flex-col gap-4 w-full">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 truncate">
              <FileText size={16} className="text-accent shrink-0" /> 2. Registro de Personería Jurídica y Representación
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Representante Legal (Administrador)
                </label>
                <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3 w-full min-w-0">
                  <User size={16} className="text-text mr-2 shrink-0" />
                  <input
                    type="text"
                    value={formData.representanteLegal}
                    onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
                    placeholder="Nombre completo"
                    className="bg-transparent border-none outline-none text-sm text-text flex-1 min-w-0"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Notaría del Reglamento H.P.
                </label>
                <input
                  type="text"
                  value={formData.notariaEscritura}
                  onChange={(e) => setFormData({ ...formData, notariaEscritura: e.target.value })}
                  placeholder="Ej: Notaría Primera de Envigado"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Número Escritura Pública
                </label>
                <input
                  type="text"
                  value={formData.numeroEscritura}
                  onChange={(e) => setFormData({ ...formData, numeroEscritura: e.target.value })}
                  placeholder="Ej: Escritura 4289"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                />
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Fecha de la Escritura
                </label>
                <div className="flex items-center bg-surface-2 border border-border rounded-xl px-3 py-3 w-full min-w-0">
                  <Calendar size={16} className="text-text mr-2 shrink-0" />
                  <input
                    type="date"
                    value={formData.fechaEscritura}
                    onChange={(e) => setFormData({ ...formData, fechaEscritura: e.target.value })}
                    className="bg-transparent border-none outline-none text-xs md:text-sm text-text flex-1 min-w-0"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Matrícula Principal Oficina Registro
                </label>
                <input
                  type="text"
                  value={formData.matriculaInmobiliaria}
                  onChange={(e) => setFormData({ ...formData, matriculaInmobiliaria: e.target.value })}
                  placeholder="Ej: 001-1234567"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 w-full">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                Total Unidades Privadas (Aptos / Casas)
              </label>
              <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3 w-full min-w-0">
                <Layers size={16} className="text-text mr-2 shrink-0" />
                <input
                  type="number"
                  min="1"
                  value={formData.totalUnidades}
                  onChange={(e) => setFormData({ ...formData, totalUnidades: e.target.value })}
                  className="bg-transparent border-none outline-none text-sm text-text flex-1 min-w-0"
                />
              </div>
              <p className="text-[9px] text-text/70 pl-1 mt-0.5">
                Define la cantidad de inmuebles que componen la asamblea general de copropietarios.
              </p>
            </div>
          </div>

          {/* SECCIÓN 3: ESTRUCTURA FÍSICA Y NOMENCLATURA INTERNA */}
          <div className="liquid-glass rounded-[28px] p-5 md:p-6 border border-border shadow-2xl flex flex-col gap-5 w-full">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 truncate">
              <Grid size={16} className="text-accent shrink-0" /> 3. Estructura Física y Nomenclatura Interna
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
              {/* 1. Tipo de Agrupación Principal Dropdown */}
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Denominación de Bloque / Edificación Principal *
                </label>
                <select
                  value={formData.tipoAgrupacion}
                  onChange={(e) => setFormData({ ...formData, tipoAgrupacion: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent cursor-pointer min-w-0"
                >
                  <option value="Torre">🏢 Torre (Ej: Torre 4)</option>
                  <option value="Interior">🏠 Interior (Ej: Interior 2)</option>
                  <option value="Bloque">🧩 Bloque (Ej: Bloque B)</option>
                  <option value="Etapa">🌿 Etapa (Ej: Etapa 1)</option>
                  <option value="Sin Bloque">🏡 Sin Bloque (Casas directas / Sin agrupador)</option>
                  <option value="Custom">✏️ Personalizado (Escribir texto manualmente)</option>
                </select>

                {formData.tipoAgrupacion === "Custom" && (
                  <div className="flex flex-col gap-1 mt-1.5 min-w-0 w-full">
                    <label className="text-[9px] text-text/80 font-bold uppercase tracking-widest pl-1 truncate">
                      Escribe la nomenclatura personalizada para la agrupación:
                    </label>
                    <input
                      type="text"
                      value={formData.tipoAgrupacionCustom}
                      onChange={(e) => setFormData({ ...formData, tipoAgrupacionCustom: e.target.value })}
                      placeholder="Ej: Módulo, Sector, Manzana, Villa, Cluster..."
                      className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                    />
                  </div>
                )}
              </div>

              {/* 2. Tipo de Inmueble / Unidad Privada Dropdown */}
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                  Tipo de Inmueble / Unidad Privada *
                </label>
                <select
                  value={formData.tipoUnidadPrivada}
                  onChange={(e) => setFormData({ ...formData, tipoUnidadPrivada: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent cursor-pointer min-w-0"
                >
                  <option value="Apartamento">🚪 Apartamento (Ej: Apto 1410)</option>
                  <option value="Casa">🏠 Casa (Ej: Casa 15)</option>
                  <option value="Local">🏪 Local Comercial (Ej: Local 101)</option>
                  <option value="Oficina">🏢 Oficina (Ej: Oficina 302)</option>
                  <option value="Penthouse">🌟 Penthouse (Ej: PH 1201)</option>
                  <option value="Custom">✏️ Personalizado (Escribir texto manualmente)</option>
                </select>

                {formData.tipoUnidadPrivada === "Custom" && (
                  <div className="flex flex-col gap-1 mt-1.5 min-w-0 w-full">
                    <label className="text-[9px] text-text/80 font-bold uppercase tracking-widest pl-1 truncate">
                      Escribe la nomenclatura personalizada para la unidad privada:
                    </label>
                    <input
                      type="text"
                      value={formData.tipoUnidadCustom}
                      onChange={(e) => setFormData({ ...formData, tipoUnidadCustom: e.target.value })}
                      placeholder="Ej: Suite, Depósito, Bodega, Chalet, Estudio..."
                      className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent min-w-0"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 3. Subdominios y Direccionamiento Interno */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-surface-2 border border-border rounded-2xl p-4 mt-1 w-full">
              <div className="flex flex-col gap-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text truncate">
                    ¿Tendrá subdominios / bloques de agrupación?
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        tieneSubdominiosBloques: !formData.tieneSubdominiosBloques,
                      })
                    }
                    className="text-accent cursor-pointer transition-transform active:scale-95 shrink-0"
                    title="Alternar subdominios internos"
                  >
                    {formData.tieneSubdominiosBloques ? (
                      <ToggleRight size={32} className="text-accent" />
                    ) : (
                      <ToggleLeft size={32} className="text-text/40" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-text/70 leading-relaxed">
                  {formData.tieneSubdominiosBloques
                    ? "Formato activado con prefijos de bloques/torres (Ej: Torre 4 - Apto 1410)."
                    : "Formato directo sin bloques internos (Ej: Casa 42 o Apto 101)."}
                </p>
              </div>

              {/* Live Preview Box */}
              <div className="bg-surface border border-accent/30 rounded-xl p-3.5 flex items-center gap-3 shadow-md min-w-0">
                <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                  <Home size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-accent italic block truncate">
                    Vista previa de nomenclatura interna:
                  </span>
                  <p className="text-sm font-bold text-text font-mono mt-0.5 truncate">
                    {formData.tieneSubdominiosBloques && formData.tipoAgrupacion !== "Sin Bloque"
                      ? `${getAgrupacionLabel()} ${formData.ejemploBloque || "4"} - ${getUnidadLabel()} ${formData.ejemploUnidad || "1410"}`
                      : `${getUnidadLabel()} ${formData.ejemploUnidad || "1410"}`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: PERSONALIZACIÓN */}
          <div className="liquid-glass rounded-[28px] p-5 md:p-6 border border-border shadow-2xl flex flex-col gap-4 w-full">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 truncate">
              <Plus size={16} className="text-accent shrink-0" /> 4. Personalización del Portal ConjuntOS
            </h3>

            <div className="flex flex-col gap-1.5 min-w-0 w-full">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                Logotipo de la Copropiedad
              </label>

              <div className="flex flex-col sm:flex-row gap-4 items-center bg-surface-2 border border-border rounded-2xl p-4 w-full">
                {formData.logoUrl ? (
                  <div className="w-16 h-16 rounded-xl bg-white border border-border overflow-hidden flex items-center justify-center p-1 relative group shrink-0">
                    <Image
                      src={formData.logoUrl}
                      alt="Vista previa del logotipo"
                      width={64}
                      height={64}
                      unoptimized
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, logoUrl: "" })}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-wider transition-opacity cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-surface/40 border border-dashed border-border flex items-center justify-center text-text shrink-0">
                    <Building2 size={24} />
                  </div>
                )}

                <div className="flex-1 flex flex-col gap-2 w-full min-w-0">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={isUploading}
                      id="logo-file-input"
                      className="hidden"
                    />
                    <label
                      htmlFor="logo-file-input"
                      className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border text-xs font-bold uppercase tracking-wider text-text bg-surface hover:bg-text/5 cursor-pointer active:scale-98 transition-all ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      {isUploading ? (
                        <>Subiendo...</>
                      ) : (
                        <>
                          <Upload size={12} className="text-accent" />{" "}
                          {formData.logoUrl ? "Cambiar Logotipo" : "Subir Logotipo"}
                        </>
                      )}
                    </label>
                  </div>
                  <p className="text-[9px] text-text/70 leading-tight truncate">
                    Formatos permitidos: PNG, JPG, WebP, SVG. Max 5MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 w-full">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 truncate">
                Color de Marca Primario
              </label>
              <div className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl px-4 py-2 w-full min-w-0">
                <input
                  type="color"
                  value={formData.colorPrimario}
                  onChange={(e) => setFormData({ ...formData, colorPrimario: e.target.value })}
                  className="w-10 h-10 border-0 rounded-full cursor-pointer bg-transparent shrink-0"
                />
                <span className="text-xs text-text font-mono font-bold truncate">
                  {formData.colorPrimario}
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            className="w-full py-4 bg-accent hover:bg-accent/90 transition-all rounded-2xl font-black uppercase text-xs tracking-widest text-on-accent shadow-xl shadow-accent/20 active:scale-[0.98] flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>Guardando...</>
            ) : (
              <>
                <ShieldCheck size={18} />{" "}
                {editingConjuntoId
                  ? "Guardar Cambios de Personería"
                  : "Validar y Crear Personería Jurídica"}
              </>
            )}
          </button>
        </form>
      ) : (
        /* LISTADO DE CONJUNTOS REGISTRADOS */
        <div className="flex flex-col gap-4 w-full">
          {conjuntos.length === 0 ? (
            <p className="text-center text-text text-sm py-12">
              No hay conjuntos registrados en el sistema.
            </p>
          ) : (
            conjuntos.map((c, idx) => (
              <div
                key={c.id || idx}
                className="liquid-glass-card rounded-[24px] p-5 border border-border flex flex-col gap-3 relative overflow-hidden group hover:border-accent/40 transition-all w-full"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none translate-x-1/2 -translate-y-1/2 group-hover:bg-accent/15 transition-all"></div>

                <div className="flex justify-between items-start gap-4">
                  <div className="flex gap-3 items-center min-w-0 flex-1">
                    {c.logoUrl && (
                      <div className="w-10 h-10 rounded-lg bg-white border border-border overflow-hidden p-0.5 flex items-center justify-center shrink-0">
                        <Image
                          src={c.logoUrl}
                          alt="Logotipo de la copropiedad"
                          width={40}
                          height={40}
                          unoptimized
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-text leading-tight truncate">{c.nombre}</h3>
                      <p className="text-accent font-mono text-[10px] tracking-widest uppercase font-black truncate">
                        {c.nit}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    <span className="bg-surface-2 px-3 py-1 rounded-full border border-border text-[9px] font-black text-text font-mono truncate">
                      {c.subdominio}.conjuntos.app
                    </span>
                    <button
                      onClick={() => handleEditClick(c)}
                      className="inline-flex items-center gap-1 py-1.5 px-3 rounded-xl border border-border text-[10px] font-black uppercase tracking-wider text-accent bg-accent/5 hover:bg-accent/10 active:scale-95 transition-all cursor-pointer"
                    >
                      <Edit3 size={10} /> Editar
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-xs text-text border-t border-border/40 pt-3 mt-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={12} className="text-text shrink-0" />
                    <span className="truncate">
                      {c.direccion}, {c.ciudad}
                    </span>
                  </div>
                  {c.representanteLegal && (
                    <div className="flex items-center gap-2 min-w-0">
                      <User size={12} className="text-text shrink-0" />
                      <span className="truncate">
                        Rep. Legal: <strong>{c.representanteLegal}</strong>
                      </span>
                    </div>
                  )}
                  {c.tipoAgrupacion && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Grid size={12} className="text-accent shrink-0" />
                      <span className="truncate">
                        Estructura:{" "}
                        <strong>
                          {c.tipoAgrupacion} / {c.tipoUnidadPrivada || "Apartamento"}
                        </strong>{" "}
                        ({c.tieneSubdominiosBloques ? "Con Subdominios de Bloque" : "Sin Bloque Directo"})
                      </span>
                    </div>
                  )}
                  {c.numeroEscritura && (
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldCheck size={12} className="text-text shrink-0" />
                      <span className="truncate">
                        {c.notariaEscritura || "Deed"}: {c.numeroEscritura} (
                        {c.fechaEscritura ? new Date(c.fechaEscritura).toLocaleDateString() : "N/A"})
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers size={12} className="text-text shrink-0" />
                    <span className="truncate">
                      Unidades Totales: <strong>{c.totalUnidades || 1} celdas/unidades</strong>
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

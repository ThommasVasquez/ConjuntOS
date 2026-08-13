"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Building2, Plus, FileText, ShieldCheck, MapPin,
  User, Calendar, Layers, Upload, Edit3, Home, Grid, ToggleLeft, ToggleRight,
  UserPlus, Key, Mail, Phone, CheckCircle2, X
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
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

  // Modal State for Assigning Administrator
  const [adminModalConjunto, setAdminModalConjunto] = useState<ConjuntoDto | null>(null);
  const [isAssigningAdmin, setIsAssigningAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({
    nombre: "",
    email: "",
    telefono: "",
    password: "Admin2026!",
  });

  // Form State for Copropiedad
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

  const handleOpenAssignAdminModal = (c: ConjuntoDto) => {
    setAdminModalConjunto(c);
    setAdminForm({
      nombre: c.representanteLegal || "",
      email: `${c.subdominio}@conjuntos.app`,
      telefono: "",
      password: `Admin${Math.floor(1000 + Math.random() * 9000)}!`,
    });
  };

  const handleAssignAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminModalConjunto) return;

    if (!adminForm.nombre || !adminForm.email || !adminForm.password) {
      return toast.error("Por favor completa el nombre, correo y contraseña temporal");
    }

    setIsAssigningAdmin(true);
    try {
      const payload = {
        conjuntoId: adminModalConjunto.id,
        nombre: adminForm.nombre.trim(),
        email: adminForm.email.trim().toLowerCase(),
        telefono: adminForm.telefono.trim() || undefined,
        password: adminForm.password.trim(),
        rol: "ADMINISTRADOR",
      };

      try {
        await api.post(`/superadmin/conjuntos/${adminModalConjunto.id}/administrador`, payload);
      } catch {
        // Fallback endpoint
        await api.post(`/admin/residentes`, payload);
      }

      // Update local representant legal name on conjunto
      await api.put(`/superadmin/conjuntos/${adminModalConjunto.id}`, {
        representanteLegal: adminForm.nombre.trim(),
      });

      toast.success(
        `Administrador ${adminForm.nombre} asignado a "${adminModalConjunto.nombre}" con éxito.`,
      );
      setAdminModalConjunto(null);
      fetchConjuntos();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail || err.message
          : err instanceof Error
          ? err.message
          : "Error al asignar administrador al conjunto";
      toast.error(msg);
    } finally {
      setIsAssigningAdmin(false);
    }
  };

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

    const cleanSubdominio = formData.subdominio
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "");

    if (!cleanSubdominio) {
      return toast.error("El subdominio debe ser un identificador válido (solo letras, números y guiones)");
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
        nombre: formData.nombre.trim(),
        subdominio: cleanSubdominio,
        direccion: formData.direccion.trim(),
        ciudad: formData.ciudad.trim(),
        tipoAgrupacion: resolvedTipoAgrupacion,
        tipoUnidadPrivada: resolvedTipoUnidad,
        tieneSubdominiosBloques: formData.tieneSubdominiosBloques,
        formatoNomenclatura:
          formData.tieneSubdominiosBloques && resolvedTipoAgrupacion !== "Sin Bloque"
            ? `${resolvedTipoAgrupacion} {bloque} - ${resolvedTipoUnidad} {unidad}`
            : `${resolvedTipoUnidad} {unidad}`,
      };

      if (formData.nit.trim()) payload.nit = formData.nit.trim();
      if (formData.representanteLegal.trim()) payload.representanteLegal = formData.representanteLegal.trim();
      if (formData.notariaEscritura.trim()) payload.notariaEscritura = formData.notariaEscritura.trim();
      if (formData.numeroEscritura.trim()) payload.numeroEscritura = formData.numeroEscritura.trim();

      if (formData.fechaEscritura.trim()) {
        const d = formData.fechaEscritura.trim();
        payload.fechaEscritura = d.includes("T") ? d : `${d}T00:00:00Z`;
      }

      if (formData.matriculaInmobiliaria.trim()) payload.matriculaInmobiliaria = formData.matriculaInmobiliaria.trim();

      const numUnidades = parseInt(formData.totalUnidades, 10);
      if (!Number.isNaN(numUnidades) && numUnidades > 0) {
        payload.totalUnidades = numUnidades;
      }

      if (formData.logoUrl) payload.logoUrl = formData.logoUrl;
      if (formData.colorPrimario) payload.colorPrimario = formData.colorPrimario;

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
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail || err.message
          : err instanceof Error
          ? err.message
          : "Error de validación al registrar copropiedad";
      toast.error(msg);
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
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent italic block">
            SuperAdmin Dashboard
          </span>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-text leading-tight mt-1">
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
          className={`flex-1 py-3 px-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all text-center ${
            tab === "CREAR"
              ? "bg-accent/10 text-accent shadow-inner"
              : "text-text hover:text-text"
          }`}
        >
          Nuevo Registro
        </button>
        <button
          onClick={() => setTab("LISTAR")}
          className={`flex-1 py-3 px-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all text-center ${
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
                <span className="break-words">
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
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 leading-relaxed">
              <Building2 size={16} className="text-accent shrink-0" /> 1. Datos Generales de la Copropiedad
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
              <p className="text-[9px] text-text/70 pl-1 mt-0.5 leading-normal">
                Identificador de URL único para acceso directo al portal de residentes.
              </p>
            </div>
          </div>

          {/* SECCIÓN 2: REGISTRO DE PERSONERÍA JURÍDICA */}
          <div className="liquid-glass rounded-[28px] p-5 md:p-6 border border-border shadow-2xl flex flex-col gap-4 w-full">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 leading-relaxed">
              <FileText size={16} className="text-accent shrink-0" /> 2. Registro de Personería Jurídica y Representación
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
                  Representante Legal (Administrador)
                </label>
                <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3 w-full min-w-0">
                  <User size={16} className="text-text mr-2 shrink-0" />
                  <input
                    type="text"
                    value={formData.representanteLegal}
                    onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
                    placeholder="Nombre completo del administrador"
                    className="bg-transparent border-none outline-none text-sm text-text flex-1 min-w-0"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
              <p className="text-[9px] text-text/70 pl-1 mt-0.5 leading-normal">
                Define la cantidad de inmuebles que componen la asamblea general de copropietarios.
              </p>
            </div>
          </div>

          {/* SECCIÓN 3: ESTRUCTURA FÍSICA Y NOMENCLATURA INTERNA */}
          <div className="liquid-glass rounded-[28px] p-5 md:p-6 border border-border shadow-2xl flex flex-col gap-5 w-full">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 leading-relaxed">
              <Grid size={16} className="text-accent shrink-0" /> 3. Estructura Física y Nomenclatura Interna
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
              {/* 1. Tipo de Agrupación Principal Dropdown */}
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                    <label className="text-[9px] text-text/80 font-bold uppercase tracking-widest pl-1 leading-normal">
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
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                    <label className="text-[9px] text-text/80 font-bold uppercase tracking-widest pl-1 leading-normal">
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
                  <span className="text-xs font-bold text-text leading-normal">
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
                  <span className="text-[9px] font-black uppercase tracking-wider text-accent italic block leading-normal">
                    Vista previa de nomenclatura interna:
                  </span>
                  <p className="text-sm font-bold text-text font-mono mt-0.5 break-words">
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
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2 leading-relaxed">
              <Plus size={16} className="text-accent shrink-0" /> 4. Personalización del Portal ConjuntOS
            </h3>

            <div className="flex flex-col gap-1.5 min-w-0 w-full">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
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
                  <p className="text-[9px] text-text/70 leading-normal">
                    Formatos permitidos: PNG, JPG, WebP, SVG. Max 5MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 w-full">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1 leading-normal">
                Color de Marca Primario
              </label>
              <div className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl px-4 py-2 w-full min-w-0">
                <input
                  type="color"
                  value={formData.colorPrimario}
                  onChange={(e) => setFormData({ ...formData, colorPrimario: e.target.value })}
                  className="w-10 h-10 border-0 rounded-full cursor-pointer bg-transparent shrink-0"
                />
                <span className="text-xs text-text font-mono font-bold">
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
                className="liquid-glass-card rounded-[24px] p-5 border border-border flex flex-col gap-3 relative overflow-hidden group hover:border-accent/40 transition-all w-full shadow-lg"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none translate-x-1/2 -translate-y-1/2 group-hover:bg-accent/15 transition-all"></div>

                <div className="flex flex-col gap-3.5 w-full">
                  {/* Header row: Logo + Nombre + Subdominio */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto flex-1">
                      {c.logoUrl && (
                        <div className="w-12 h-12 rounded-xl bg-white border border-border overflow-hidden p-1 flex items-center justify-center shrink-0 shadow-sm">
                          <Image
                            src={c.logoUrl}
                            alt="Logotipo de la copropiedad"
                            width={48}
                            height={48}
                            unoptimized
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-bold text-text leading-snug break-words">
                          {c.nombre}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-accent font-mono text-[10px] tracking-widest uppercase font-black">
                            NIT: {c.nit}
                          </span>
                          <span className="bg-surface-2 px-2.5 py-0.5 rounded-full border border-border text-[10px] font-black text-text font-mono">
                            {c.subdominio}.conjuntos.app
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones: Botones */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-start sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 shrink-0">
                      <button
                        onClick={() => handleOpenAssignAdminModal(c)}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl border border-accent/40 text-[11px] font-black uppercase tracking-wider text-on-accent bg-accent hover:bg-accent/90 active:scale-95 transition-all cursor-pointer shadow-md shadow-accent/20"
                      >
                        <UserPlus size={14} /> Asignar Administrador
                      </button>
                      <button
                        onClick={() => handleEditClick(c)}
                        className="inline-flex items-center justify-center gap-1 py-2 px-3 rounded-xl border border-border text-[11px] font-black uppercase tracking-wider text-text bg-surface-2 hover:bg-surface-2/80 active:scale-95 transition-all cursor-pointer"
                      >
                        <Edit3 size={12} /> Editar
                      </button>
                    </div>
                  </div>

                  {/* Detalle e información */}
                  <div className="flex flex-col gap-2 text-xs text-text border-t border-border/40 pt-3 w-full">
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin size={14} className="text-accent shrink-0 mt-0.5" />
                      <span className="break-words font-medium">
                        {c.direccion}, {c.ciudad}
                      </span>
                    </div>
                    {c.representanteLegal ? (
                      <div className="flex items-center gap-2 min-w-0 text-accent">
                        <CheckCircle2 size={14} className="text-accent shrink-0" />
                        <span className="break-words">
                          Administrador Asignado: <strong>{c.representanteLegal}</strong>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0 text-text/60 italic">
                        <User size={14} className="text-text/50 shrink-0" />
                        <span>Sin administrador asignado en sistema</span>
                      </div>
                    )}
                    {c.tipoAgrupacion && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Grid size={14} className="text-accent shrink-0" />
                        <span className="break-words">
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
                        <ShieldCheck size={14} className="text-text shrink-0" />
                        <span className="break-words">
                          {c.notariaEscritura || "Notaría"}: {c.numeroEscritura} (
                          {c.fechaEscritura ? new Date(c.fechaEscritura).toLocaleDateString() : "N/A"})
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers size={14} className="text-text shrink-0" />
                      <span>
                        Unidades Totales: <strong>{c.totalUnidades || 1} celdas/unidades</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL: ASIGNAR ADMINISTRADOR DE COPROPIEDAD */}
      {adminModalConjunto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="liquid-glass rounded-[32px] border border-border p-6 md:p-8 max-w-lg w-full shadow-2xl flex flex-col gap-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setAdminModalConjunto(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:text-text cursor-pointer transition-transform active:scale-95"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 border-b border-border/40 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                <UserPlus size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-accent block">
                  Asignación de Acceso
                </span>
                <h3 className="text-lg font-bold text-text leading-tight break-words">
                  Asignar Administrador Principal
                </h3>
                <p className="text-xs text-text/70 mt-0.5 truncate">
                  {adminModalConjunto.nombre} ({adminModalConjunto.subdominio}.conjuntos.app)
                </p>
              </div>
            </div>

            <form onSubmit={handleAssignAdminSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
                  Nombre Completo del Administrador *
                </label>
                <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3">
                  <User size={16} className="text-text mr-2 shrink-0" />
                  <input
                    required
                    type="text"
                    value={adminForm.nombre}
                    onChange={(e) => setAdminForm({ ...adminForm, nombre: e.target.value })}
                    placeholder="Ej: Sergio Vásquez Meneses"
                    className="bg-transparent border-none outline-none text-sm text-text flex-1"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
                  Correo Electrónico (Login de Acceso) *
                </label>
                <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3">
                  <Mail size={16} className="text-text mr-2 shrink-0" />
                  <input
                    required
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                    placeholder="admin@conjunto.com"
                    className="bg-transparent border-none outline-none text-sm text-text flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
                    Teléfono Móvil
                  </label>
                  <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3">
                    <Phone size={16} className="text-text mr-2 shrink-0" />
                    <input
                      type="text"
                      value={adminForm.telefono}
                      onChange={(e) => setAdminForm({ ...adminForm, telefono: e.target.value })}
                      placeholder="Ej: 300 123 4567"
                      className="bg-transparent border-none outline-none text-sm text-text flex-1"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
                    Contraseña Temporal *
                  </label>
                  <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3">
                    <Key size={16} className="text-accent mr-2 shrink-0" />
                    <input
                      required
                      type="text"
                      value={adminForm.password}
                      onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                      placeholder="Contraseña"
                      className="bg-transparent border-none outline-none text-sm text-text flex-1 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-surface-2 border border-border rounded-2xl p-4 text-xs text-text/80 leading-relaxed mt-1">
                <p>
                  💡 <strong>Nota del Sistema:</strong> Se registrará una cuenta con rol{" "}
                  <strong className="text-accent">ADMINISTRADOR</strong> vinculada al Tenant ID{" "}
                  <strong className="font-mono text-text">{adminModalConjunto.subdominio}</strong>.
                  El administrador podrá acceder a través del portal con este correo y clave temporal.
                </p>
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setAdminModalConjunto(null)}
                  className="py-3 px-5 rounded-2xl border border-border text-xs font-bold uppercase tracking-wider text-text bg-surface hover:bg-surface-2 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAssigningAdmin}
                  className="py-3 px-6 rounded-2xl bg-accent hover:bg-accent/90 text-on-accent text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-accent/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {isAssigningAdmin ? (
                    <>Asignando...</>
                  ) : (
                    <>
                      <UserPlus size={16} /> Crear Acceso de Administrador
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

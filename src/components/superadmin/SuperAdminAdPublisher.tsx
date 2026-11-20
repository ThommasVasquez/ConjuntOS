"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import type {
  AdCampaignMetricsDto,
  AdCampaignSummaryDto,
  ConjuntoDto,
} from "@/lib/api/types";
import { SkeletonRows } from "@/components/ui/Skeleton";

const WEEKDAYS = [
  { id: "1", label: "L" },
  { id: "2", label: "M" },
  { id: "3", label: "X" },
  { id: "4", label: "J" },
  { id: "5", label: "V" },
  { id: "6", label: "S" },
  { id: "7", label: "D" },
];

function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export default function SuperAdminAdPublisher({
  conjuntos,
}: {
  conjuntos: ConjuntoDto[];
}) {
  const [campaigns, setCampaigns] = useState<AdCampaignSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // Composer state
  const [nombre, setNombre] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen supera el límite de 5MB");
      return;
    }
    setUploadingImage(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(file);
      });
      const res = await api.post<{ url: string }>("/uploads/imagen", {
        data: dataUrl,
        carpeta: "pauta",
      });
      setImagenUrl(res.url);
      toast.success("Imagen subida correctamente");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Error al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };
  const [linkMode, setLinkMode] = useState<"URL" | "WHATSAPP">("URL");
  const [linkUrl, setLinkUrl] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [waMessage, setWaMessage] = useState("Hola, vi tu anuncio en ConjuntOS® y quiero más información.");
  const [ctaTexto, setCtaTexto] = useState("Ver promoción");

  const [scope, setScope] = useState<"ALL" | "SELECTED">("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchConjunto, setSearchConjunto] = useState("");

  const [inicioEn, setInicioEn] = useState(() => toLocalDatetimeInput(new Date()));
  const [finEn, setFinEn] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toLocalDatetimeInput(d);
  });
  const [horaInicio, setHoraInicio] = useState(0);
  const [horaFin, setHoraFin] = useState(23);
  const [diasSemana, setDiasSemana] = useState<string[]>(["1", "2", "3", "4", "5", "6", "7"]);
  const [prioridad, setPrioridad] = useState<number>(2);
  const [maxImpresiones, setMaxImpresiones] = useState("");
  const [maxPorUsuarioDia, setMaxPorUsuarioDia] = useState("");

  // Metrics modal
  const [metricsModal, setMetricsModal] = useState<AdCampaignMetricsDto | null>(null);
  const [loadingMetricsId, setLoadingMetricsId] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const data = await api.get<AdCampaignSummaryDto[]>("/superadmin/ad-spaces");
      setCampaigns(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const toggleConjunto = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleDay = (dayId: string) => {
    setDiasSemana((prev) =>
      prev.includes(dayId)
        ? prev.length > 1
          ? prev.filter((d) => d !== dayId)
          : prev
        : [...prev, dayId].sort()
    );
  };

  const resolvedLink = (): string | undefined => {
    if (linkMode === "WHATSAPP") {
      const digits = waNumber.replace(/\D/g, "");
      if (!digits) return undefined;
      const full = digits.startsWith("57") ? digits : `57${digits}`;
      const text = encodeURIComponent(waMessage.trim() || "Hola, vi tu anuncio en ConjuntOS®.");
      return `https://wa.me/${full}?text=${text}`;
    }
    return linkUrl.trim() || undefined;
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error("El título de la campaña es obligatorio");
      return;
    }
    if (scope === "SELECTED" && selectedIds.length === 0) {
      toast.error("Selecciona al menos un conjunto");
      return;
    }
    const startIso = new Date(inicioEn).toISOString();
    const endIso = new Date(finEn).toISOString();
    if (new Date(endIso) <= new Date(startIso)) {
      toast.error("La fecha de fin debe ser posterior a la fecha de inicio");
      return;
    }

    setPublishing(true);
    try {
      const created = await api.post<AdCampaignSummaryDto>("/superadmin/ad-spaces", {
        nombre: nombre.trim(),
        empresa: empresa.trim() || undefined,
        posicion: "FEED",
        imagenUrl: imagenUrl.trim() || undefined,
        linkUrl: resolvedLink(),
        ctaTexto: ctaTexto.trim() || undefined,
        inicioEn: startIso,
        finEn: endIso,
        horaInicio,
        horaFin,
        diasSemana: diasSemana.join(","),
        prioridad,
        maxImpresiones: maxImpresiones ? parseInt(maxImpresiones, 10) : undefined,
        maxPorUsuarioDia: maxPorUsuarioDia ? parseInt(maxPorUsuarioDia, 10) : undefined,
        conjuntoIds: scope === "SELECTED" ? selectedIds : undefined,
      });
      setCampaigns((prev) => [created, ...prev]);
      setNombre("");
      setEmpresa("");
      setImagenUrl("");
      setLinkUrl("");
      setWaNumber("");
      setMaxImpresiones("");
      setMaxPorUsuarioDia("");
      if (scope === "SELECTED") setSelectedIds([]);
      toast.success(`Campaña publicada en ${created.conjuntosCount} conjunto(s).`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo publicar la campaña");
    } finally {
      setPublishing(false);
    }
  };

  const handleToggle = async (campanaId: string) => {
    try {
      const res = await api.put<{ activo: boolean }>(`/superadmin/ad-spaces/${campanaId}/toggle`, {});
      setCampaigns((prev) =>
        prev.map((c) => (c.campanaId === campanaId ? { ...c, activo: res.activo } : c))
      );
      toast.success(res.activo ? "Campaña reanudada" : "Campaña pausada");
    } catch {
      toast.error("No se pudo cambiar el estado");
    }
  };

  const handleDelete = async (campanaId: string) => {
    try {
      await api.delete(`/superadmin/ad-spaces/${campanaId}`);
      setCampaigns((prev) => prev.filter((c) => c.campanaId !== campanaId));
      toast.success("Campaña eliminada de todos los conjuntos");
    } catch {
      toast.error("No se pudo eliminar la campaña");
    }
  };

  const openMetrics = async (campanaId: string) => {
    setLoadingMetricsId(campanaId);
    try {
      const data = await api.get<AdCampaignMetricsDto>(`/superadmin/ad-spaces/${campanaId}/metrics`);
      setMetricsModal(data);
    } catch {
      toast.error("No se pudieron cargar las métricas");
    } finally {
      setLoadingMetricsId(null);
    }
  };

  const copyAdvertiserReport = (m: AdCampaignMetricsDto) => {
    const topHours = [...m.porHora]
      .filter((h) => h.impresiones > 0)
      .sort((a, b) => b.impresiones - a.impresiones)
      .slice(0, 3)
      .map((h) => `${formatHour(h.hora)} (${h.impresiones} vistas)`)
      .join(", ");

    const byConjunto = m.porConjunto
      .map((c) => `• ${c.conjuntoNombre}: ${c.impresiones} vistas · ${c.clics} clics (${c.ctr}% CTR)`)
      .join("\n");

    const report = [
      `📊 *Reporte de Pauta — ConjuntOS®*`,
      `Campaña: *${m.nombre}*${m.empresa ? ` (${m.empresa})` : ""}`,
      ``,
      `👁️ Impresiones totales: *${m.impresiones}*`,
      `👥 Residentes únicos alcanzados: *${m.usuariosUnicos}*`,
      `🖱️ Clics totales: *${m.clics}*`,
      `📈 CTR promedio: *${m.ctr}%*`,
      m.horaPico !== null ? `⏰ Hora pico de vistas: *${formatHour(m.horaPico)}*` : "",
      topHours ? `🔥 Mejores franjas: ${topHours}` : "",
      ``,
      `🏢 *Desglose por conjunto:*`,
      byConjunto,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard?.writeText(report);
    toast.success("Reporte copiado — listo para pegar por WhatsApp al anunciante.");
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* COMPOSER FORM */}
      <form
        onSubmit={handlePublish}
        className="liquid-glass rounded-[32px] p-6 border border-amber-500/30 flex flex-col gap-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-base font-display font-bold text-text">
              Publicador de Pauta Publicitaria
            </h3>
            <p className="text-xs text-text/60">
              Segmenta por conjunto, fechas, días y franja horaria (hora Colombia) con métricas por hora.
            </p>
          </div>
        </div>

        {/* Nombre + Empresa */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text pl-1">
              Título del anuncio *
            </label>
            <input
              required
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: 2x1 en Pizza Artesanal hoy"
              className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text pl-1">
              Empresa / Anunciante
            </label>
            <input
              type="text"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Ej: Pizzería La Toscana"
              className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Segmentación por conjunto */}
        <div className="flex flex-col gap-2.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-text pl-1">
            Conjuntos destino *
          </label>
          <div className="grid grid-cols-2 gap-2 bg-surface-2 p-1.5 rounded-2xl border border-border">
            <button
              type="button"
              onClick={() => setScope("ALL")}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                scope === "ALL" ? "bg-amber-500 text-white shadow-sm" : "text-text/70 hover:text-text"
              }`}
            >
              Todos ({conjuntos.length})
            </button>
            <button
              type="button"
              onClick={() => setScope("SELECTED")}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                scope === "SELECTED" ? "bg-amber-500 text-white shadow-sm" : "text-text/70 hover:text-text"
              }`}
            >
              Seleccionados ({selectedIds.length})
            </button>
          </div>

          {scope === "SELECTED" && (
            <div className="bg-surface-2 border border-border rounded-2xl p-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 bg-surface border border-border rounded-xl px-3 py-2">
                  <Search size={14} className="text-text/50 shrink-0" />
                  <input
                    type="text"
                    value={searchConjunto}
                    onChange={(e) => setSearchConjunto(e.target.value)}
                    placeholder="Buscar conjunto..."
                    className="w-full bg-transparent text-xs text-text outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds(
                      selectedIds.length === conjuntos.length ? [] : conjuntos.map((c) => c.id)
                    )
                  }
                  className="text-[10px] font-bold uppercase px-2.5 py-2 rounded-xl border border-border bg-surface text-text/80 cursor-pointer"
                >
                  {selectedIds.length === conjuntos.length ? "Limpiar" : "Todos"}
                </button>
              </div>
              <div className="max-h-44 overflow-y-auto flex flex-col gap-1.5">
                {conjuntos
                  .filter((c) => {
                    const q = searchConjunto.trim().toLowerCase();
                    return !q || c.nombre.toLowerCase().includes(q) || c.subdominio.toLowerCase().includes(q);
                  })
                  .map((c) => {
                    const checked = selectedIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleConjunto(c.id)}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left cursor-pointer ${
                          checked ? "border-amber-500 bg-amber-500/10" : "border-border bg-surface/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-text block truncate">{c.nombre}</span>
                          <span className="text-[10px] text-text/55 font-mono block truncate">
                            {c.subdominio}.conjuntos.app
                          </span>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            checked ? "bg-amber-500 border-amber-500 text-white" : "border-text/30"
                          }`}
                        >
                          {checked && <Check size={12} />}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Fechas de vigencia */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text pl-1">
              Fecha inicio *
            </label>
            <input
              required
              type="datetime-local"
              value={inicioEn}
              onChange={(e) => setInicioEn(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text pl-1">
              Fecha fin *
            </label>
            <input
              required
              type="datetime-local"
              value={finEn}
              onChange={(e) => setFinEn(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Franja horaria + Días de la semana */}
        <div className="bg-surface-2/70 border border-border rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-text">
            <Clock size={14} className="text-amber-500" />
            <span>Programación por horario (hora Colombia)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text/60 font-bold uppercase">Desde las</label>
              <select
                value={horaInicio}
                onChange={(e) => setHoraInicio(Number(e.target.value))}
                className="bg-surface border border-border rounded-xl py-2 px-3 text-xs text-text outline-none"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text/60 font-bold uppercase">Hasta las</label>
              <select
                value={horaFin}
                onChange={(e) => setHoraFin(Number(e.target.value))}
                className="bg-surface border border-border rounded-xl py-2 px-3 text-xs text-text outline-none"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 justify-between">
            {WEEKDAYS.map((d) => {
              const active = diasSemana.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                    active
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "bg-surface border-border text-text/50"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Destino: URL o WhatsApp directo + CTA */}
        <div className="bg-surface-2/70 border border-border rounded-2xl p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 bg-surface p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setLinkMode("URL")}
              className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                linkMode === "URL" ? "bg-[#009df2] text-white" : "text-text/70"
              }`}
            >
              Enlace Web (URL)
            </button>
            <button
              type="button"
              onClick={() => {
                setLinkMode("WHATSAPP");
                if (ctaTexto === "Ver promoción") setCtaTexto("Pedir por WhatsApp");
              }}
              className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                linkMode === "WHATSAPP" ? "bg-emerald-500 text-white" : "text-text/70"
              }`}
            >
              WhatsApp Directo
            </button>
          </div>

          {linkMode === "URL" ? (
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://sitio-del-anunciante.com"
              className="w-full bg-surface border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="tel"
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                placeholder="WhatsApp (Ej: 3001234567)"
                className="w-full bg-surface border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none"
              />
              <input
                type="text"
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                placeholder="Mensaje prellenado"
                className="w-full bg-surface border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none"
              />
            </div>
          )}

          <input
            type="text"
            value={ctaTexto}
            onChange={(e) => setCtaTexto(e.target.value)}
            placeholder="Texto del botón (Ej: Pedir por WhatsApp / Ver oferta)"
            className="w-full bg-surface border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none"
          />
        </div>

        {/* Subir imagen del banner + Prioridad + Topes */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text pl-1">
              Imagen del banner (opcional · máx. 5MB)
            </label>
            {imagenUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-border h-40">
                <img src={imagenUrl} alt="Banner" className="w-full h-full object-cover" />
                <div className="absolute top-2.5 right-2.5 flex gap-2">
                  <label className="bg-amber-500 hover:bg-amber-600 text-white rounded-full p-2 cursor-pointer shadow-md active:scale-90 transition-all">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleBannerUpload}
                      disabled={uploadingImage}
                    />
                    <Upload size={14} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setImagenUrl("")}
                    className="bg-black/70 hover:bg-black text-white rounded-full p-2 cursor-pointer shadow-md active:scale-90 transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-bold text-white">
                    Subiendo imagen…
                  </div>
                )}
              </div>
            ) : (
              <label className="border-2 border-dashed border-border hover:border-amber-500/50 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-surface-2/40 hover:bg-surface-2/70">
                <Upload size={22} className="text-amber-500" />
                <span className="text-xs font-bold text-text">
                  {uploadingImage ? "Subiendo imagen…" : "Subir imagen del banner (PNG, JPG, WebP)"}
                </span>
                <span className="text-[10px] text-text/50">Recomendado 1200×600 · máx. 5MB</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerUpload}
                  disabled={uploadingImage}
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text/60 font-bold uppercase pl-1">Prioridad</label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(Number(e.target.value))}
                className="bg-surface-2 border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none"
              >
                <option value={1}>Estándar (1)</option>
                <option value={2}>Destacado (2)</option>
                <option value={3}>Premium (3)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text/60 font-bold uppercase pl-1">Tope impresiones</label>
              <input
                type="number"
                min={1}
                value={maxImpresiones}
                onChange={(e) => setMaxImpresiones(e.target.value)}
                placeholder="Sin límite"
                className="bg-surface-2 border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text/60 font-bold uppercase pl-1">Máx. vistas/día/usuario</label>
              <input
                type="number"
                min={1}
                value={maxPorUsuarioDia}
                onChange={(e) => setMaxPorUsuarioDia(e.target.value)}
                placeholder="Sin límite"
                className="bg-surface-2 border border-border rounded-xl py-2.5 px-3 text-xs text-text outline-none"
              />
            </div>
          </div>
        </div>

        {/* Vista previa en vivo */}
        {(nombre.trim() || imagenUrl.trim()) && (
          <div className="rounded-2xl border border-amber-500/25 overflow-hidden bg-surface-2">
            <div className="relative">
              {imagenUrl.trim() ? (
                <img src={imagenUrl} alt="Vista previa" className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-24 bg-gradient-to-br from-amber-500/20 via-[#009df2]/10 to-transparent flex items-center justify-center">
                  <span className="text-sm font-bold text-text">{nombre}</span>
                </div>
              )}
              <span className="absolute top-2 right-2 bg-black/65 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                Patrocinado · Vista previa
              </span>
            </div>
            <div className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                {empresa && (
                  <span className="text-[9px] font-black uppercase text-amber-500 block truncate">
                    {empresa}
                  </span>
                )}
                <span className="text-xs font-bold text-text block truncate">
                  {nombre || "Título del anuncio"}
                </span>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-[#009df2] text-white text-[11px] font-bold shrink-0">
                {ctaTexto || "Ver más"}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={publishing}
          className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          <Megaphone size={15} />
          <span>
            {publishing
              ? "Publicando campaña…"
              : scope === "SELECTED"
              ? `Lanzar campaña en ${selectedIds.length} conjunto(s)`
              : `Lanzar campaña en todos los conjuntos (${conjuntos.length})`}
          </span>
        </button>
      </form>

      {/* LISTA DE CAMPAÑAS */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-text/70 px-1">
          Campañas Publicitarias ({campaigns.length})
        </h4>
        {loading ? (
          <SkeletonRows count={2} />
        ) : campaigns.length === 0 ? (
          <div className="liquid-glass rounded-3xl p-8 border border-border text-center text-xs text-text/50">
            Aún no hay campañas publicitarias creadas.
          </div>
        ) : (
          campaigns.map((c) => (
            <div
              key={c.campanaId}
              className="liquid-glass-card rounded-3xl p-4 border border-border flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        c.activo
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-text/10 text-text/60"
                      }`}
                    >
                      {c.activo ? "Activa" : "Pausada"}
                    </span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
                      {c.conjuntosCount} {c.conjuntosCount === 1 ? "conjunto" : "conjuntos"}
                    </span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-text/5 text-text/70">
                      ⏰ {formatHour(c.horaInicio)}–{formatHour(c.horaFin)}
                    </span>
                  </div>
                  <h5 className="text-sm font-bold text-text mt-1">{c.nombre}</h5>
                  {c.empresa && (
                    <p className="text-[11px] text-text/60">{c.empresa}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openMetrics(c.campanaId)}
                    disabled={loadingMetricsId === c.campanaId}
                    className="p-2 rounded-xl bg-[#009df2]/15 text-[#009df2] hover:bg-[#009df2]/25 cursor-pointer"
                    title="Ver métricas por hora"
                  >
                    <BarChart3 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(c.campanaId)}
                    className="p-2 rounded-xl bg-surface-2 border border-border text-text hover:text-amber-500 cursor-pointer"
                    title={c.activo ? "Pausar campaña" : "Reanudar campaña"}
                  >
                    {c.activo ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.campanaId)}
                    className="p-2 rounded-xl bg-danger/10 text-danger hover:bg-danger/20 cursor-pointer"
                    title="Eliminar campaña"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-surface-2/60 rounded-2xl p-2.5 text-center">
                <div>
                  <span className="text-[9px] uppercase font-bold text-text/50 block">Vistas</span>
                  <span className="text-sm font-black text-text tabular-nums">{c.impresiones}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-text/50 block">Clics</span>
                  <span className="text-sm font-black text-text tabular-nums">{c.clics}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-text/50 block">CTR</span>
                  <span className="text-sm font-black text-emerald-500 tabular-nums">{c.ctr}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-text/55 px-1">
                <span>
                  {new Date(c.inicioEn).toLocaleDateString()} → {new Date(c.finEn).toLocaleDateString()}
                </span>
                {c.linkUrl && (
                  <a
                    href={c.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#009df2] flex items-center gap-1 font-bold"
                  >
                    Destino <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL DE MÉTRICAS POR HORA */}
      {metricsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="liquid-glass rounded-[32px] border border-border p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col gap-5 relative">
            <button
              type="button"
              onClick={() => setMetricsModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text cursor-pointer"
            >
              <X size={16} />
            </button>

            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#009df2]">
                Analítica de Pauta
              </span>
              <h3 className="text-lg font-display font-bold text-text mt-0.5 pr-8">
                {metricsModal.nombre}
              </h3>
              {metricsModal.empresa && (
                <p className="text-xs text-text/60">{metricsModal.empresa}</p>
              )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-surface-2 rounded-2xl p-3 border border-border">
                <span className="text-[9px] font-bold uppercase text-text/50 flex items-center gap-1">
                  <Eye size={11} /> Vistas
                </span>
                <span className="text-lg font-black text-text tabular-nums">{metricsModal.impresiones}</span>
              </div>
              <div className="bg-surface-2 rounded-2xl p-3 border border-border">
                <span className="text-[9px] font-bold uppercase text-text/50 flex items-center gap-1">
                  <Users size={11} /> Únicos
                </span>
                <span className="text-lg font-black text-text tabular-nums">{metricsModal.usuariosUnicos}</span>
              </div>
              <div className="bg-surface-2 rounded-2xl p-3 border border-border">
                <span className="text-[9px] font-bold uppercase text-text/50 flex items-center gap-1">
                  <MousePointerClick size={11} /> Clics
                </span>
                <span className="text-lg font-black text-text tabular-nums">{metricsModal.clics}</span>
              </div>
              <div className="bg-surface-2 rounded-2xl p-3 border border-border">
                <span className="text-[9px] font-bold uppercase text-text/50">CTR</span>
                <span className="text-lg font-black text-emerald-500 tabular-nums">{metricsModal.ctr}%</span>
              </div>
            </div>

            {/* Gráfica por hora del día (0h - 23h) */}
            <div className="bg-surface-2 rounded-2xl p-4 border border-border flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text">Vistas por hora del día (Colombia)</span>
                {metricsModal.horaPico !== null && (
                  <span className="text-[10px] font-black text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded-full">
                    Hora pico: {formatHour(metricsModal.horaPico)}
                  </span>
                )}
              </div>
              {(() => {
                const maxVal = Math.max(1, ...metricsModal.porHora.map((h) => h.impresiones));
                return (
                  <div className="flex items-end gap-1 h-28 pt-2">
                    {metricsModal.porHora.map((h) => {
                      const pct = Math.round((h.impresiones / maxVal) * 100);
                      const isPeak = metricsModal.horaPico === h.hora && h.impresiones > 0;
                      return (
                        <div key={h.hora} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                          <div
                            title={`${formatHour(h.hora)}: ${h.impresiones} vistas · ${h.clics} clics`}
                            className={`w-full rounded-t-sm transition-all ${
                              isPeak
                                ? "bg-amber-500"
                                : h.impresiones > 0
                                ? "bg-[#009df2]"
                                : "bg-text/10"
                            }`}
                            style={{ height: `${Math.max(h.impresiones > 0 ? 12 : 4, pct)}%` }}
                          />
                          {h.hora % 4 === 0 && (
                            <span className="text-[8px] text-text/50 tabular-nums">{h.hora}h</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Desglose por conjunto */}
            {metricsModal.porConjunto.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-text">Rendimiento por conjunto</span>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {metricsModal.porConjunto.map((cj) => (
                    <div
                      key={cj.conjuntoId}
                      className="flex items-center justify-between text-xs bg-surface-2 px-3 py-2 rounded-xl border border-border"
                    >
                      <span className="font-bold text-text truncate">{cj.conjuntoNombre}</span>
                      <span className="text-text/70 shrink-0 tabular-nums">
                        {cj.impresiones} vistas · {cj.clics} clics ({cj.ctr}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => copyAdvertiserReport(metricsModal)}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
            >
              <Copy size={14} /> Copiar reporte para anunciante (WhatsApp)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

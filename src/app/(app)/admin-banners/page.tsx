"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import ProfileHeader from "@/components/shell/ProfileHeader";
import type { AdSpaceDto, CreateAdSpaceRequest, UpdateAdSpaceRequest } from "@/lib/api/types";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminBannersPage() {
  const { user } = useAuth();
  const [ads, setAds] = useState<AdSpaceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateAdSpaceRequest>({
    nombre: "",
    posicion: "FEED_MID",
    imagenUrl: "",
    linkUrl: "",
    empresa: "",
    inicioEn: new Date().toISOString(),
    finEn: new Date(Date.now() + 30 * 86400000).toISOString(),
  });

  const isAdmin = user?.rol === "ADMINISTRADOR" || user?.rol === "SUPER_ADMIN";
  const isConcejo = user?.rol === "CONCEJO";

  const fetchAds = async () => {
    try {
      const data = await api.get<AdSpaceDto[]>("/admin/ad-spaces");
      setAds(data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (isAdmin || isConcejo)) fetchAds();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        const changes: UpdateAdSpaceRequest = {};
        if (form.nombre) changes.nombre = form.nombre;
        if (form.posicion) changes.posicion = form.posicion;
        if (form.imagenUrl !== undefined) changes.imagenUrl = form.imagenUrl || "";
        if (form.linkUrl !== undefined) changes.linkUrl = form.linkUrl || "";
        if (form.empresa !== undefined) changes.empresa = form.empresa || "";
        if (form.inicioEn) changes.inicioEn = form.inicioEn;
        if (form.finEn) changes.finEn = form.finEn;
        await api.put(`/admin/ad-spaces/${editingId}`, changes);
        toast.success("Banner actualizado");
      } else {
        await api.post("/admin/ad-spaces", form);
        toast.success("Banner creado");
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      fetchAds();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : "Error") || "Error al guardar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este banner?")) return;
    try {
      await api.delete(`/admin/ad-spaces/${id}`);
      toast.success("Banner eliminado");
      fetchAds();
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const handleToggleActive = async (ad: AdSpaceDto) => {
    try {
      await api.put(`/admin/ad-spaces/${ad.id}`, { activo: !ad.activo });
      toast.success(ad.activo ? "Banner desactivado" : "Banner activado");
      fetchAds();
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  const startEdit = (ad: AdSpaceDto) => {
    setEditingId(ad.id);
    setForm({
      nombre: ad.nombre,
      posicion: ad.posicion,
      imagenUrl: ad.imagenUrl || "",
      linkUrl: ad.linkUrl || "",
      empresa: ad.empresa || "",
      inicioEn: ad.inicioEn,
      finEn: ad.finEn,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      nombre: "",
      posicion: "FEED_MID",
      imagenUrl: "",
      linkUrl: "",
      empresa: "",
      inicioEn: new Date().toISOString(),
      finEn: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
  };

  if (user && !isAdmin && !isConcejo) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center pt-16">
        <p className="text-text text-sm">Acceso restringido</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col pt-16 pb-32">
      <ProfileHeader className="px-4" />

      <div className="px-4 py-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-text">
              Banners Publicitarios
            </h1>
            <p className="text-text/60 text-sm mt-1">
              Gestiona espacios publicitarios para el feed
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setEditingId(null); setShowForm(true); }}
            className="bg-accent text-white rounded-full p-3 hover:opacity-90 transition-opacity"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={handleSubmit}
              className="bg-primary border border-border rounded-[28px] p-6 w-full max-w-md flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-lg font-bold text-text">
                {editingId ? "Editar Banner" : "Nuevo Banner"}
              </h2>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Nombre</span>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
                  required
                  placeholder="Ej: Promo Gimnasio"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Empresa</span>
                <input
                  value={form.empresa}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
                  placeholder="Nombre del anunciante"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Posición</span>
                <select
                  value={form.posicion}
                  onChange={(e) => setForm({ ...form, posicion: e.target.value })}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
                >
                  <option value="FEED_TOP">Arriba del feed</option>
                  <option value="FEED_MID">Mitad del feed</option>
                  <option value="FEED_BOTTOM">Abajo del feed</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">URL de imagen</span>
                <input
                  value={form.imagenUrl}
                  onChange={(e) => setForm({ ...form, imagenUrl: e.target.value })}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
                  placeholder="https://..."
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Link (al hacer clic)</span>
                <input
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
                  placeholder="https://..."
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Inicio</span>
                  <input
                    type="datetime-local"
                    value={form.inicioEn.slice(0, 16)}
                    onChange={(e) => setForm({ ...form, inicioEn: new Date(e.target.value).toISOString() })}
                    className="bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-xs text-text"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Fin</span>
                  <input
                    type="datetime-local"
                    value={form.finEn.slice(0, 16)}
                    onChange={(e) => setForm({ ...form, finEn: new Date(e.target.value).toISOString() })}
                    className="bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-xs text-text"
                    required
                  />
                </label>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="flex-1 py-2.5 rounded-2xl bg-surface-2 border border-border text-text text-sm font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-2xl bg-accent text-white text-sm font-bold"
                >
                  {editingId ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Ads List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-accent" />
          </div>
        ) : ads.length === 0 ? (
          <div className="text-center py-20">
            <BarChart3 size={32} className="text-text/40 mx-auto mb-3" />
            <p className="text-text/60 text-sm">No hay banners publicitarios</p>
            <p className="text-text/40 text-xs mt-1">Crea el primero con el botón +</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {ads.map((ad) => {
              const ctr = ad.impresiones > 0
                ? ((ad.clics / ad.impresiones) * 100).toFixed(1)
                : "0";
              const active = new Date(ad.inicioEn) <= new Date() && new Date(ad.finEn) >= new Date() && ad.activo;
              return (
                <div
                  key={ad.id}
                  className={`liquid-glass-card rounded-[24px] p-4 border transition-all ${
                    active ? "border-accent/30" : "border-border/30 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-text truncate">{ad.nombre}</h3>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          active ? "bg-[#57bf00]/20 text-[#57bf00]" : "bg-text/10 text-text/50"
                        }`}>
                          {active ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      {ad.empresa && (
                        <p className="text-[10px] text-text/60 mt-0.5">{ad.empresa}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-text/60">
                        <span>Pos: {ad.posicion}</span>
                        <span>👁 {ad.impresiones.toLocaleString()}</span>
                        <span>👆 {ad.clics.toLocaleString()}</span>
                        <span className="font-bold text-accent">CTR {ctr}%</span>
                      </div>
                      <p className="text-[9px] text-text/40 mt-1">
                        {new Date(ad.inicioEn).toLocaleDateString("es-CO")} → {new Date(ad.finEn).toLocaleDateString("es-CO")}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleActive(ad)}
                        className="p-2 rounded-full hover:bg-surface-2 transition-colors"
                        title={ad.activo ? "Desactivar" : "Activar"}
                      >
                        {ad.activo ? <EyeOff size={14} className="text-text/60" /> : <Eye size={14} className="text-text/60" />}
                      </button>
                      <button
                        onClick={() => startEdit(ad)}
                        className="p-2 rounded-full hover:bg-surface-2 transition-colors"
                        title="Editar"
                      >
                        <ExternalLink size={14} className="text-text/60" />
                      </button>
                      <button
                        onClick={() => handleDelete(ad.id)}
                        className="p-2 rounded-full hover:bg-[#EF4444]/10 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={14} className="text-[#EF4444]" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

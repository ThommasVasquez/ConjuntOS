"use client";

import { FileText, Upload, Trash2, Edit3, Eye, EyeOff, X, Search, FolderOpen, Download } from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { DocumentoDto, CatDoc, CreateDocumentoRequest } from "@/lib/api/types";
import { gsap } from "gsap";
import { toast } from "sonner";

const CAT_DOC_OPTIONS: { value: CatDoc; label: string }[] = [
  { value: "REGLAMENTO", label: "Reglamento" },
  { value: "CONVIVENCIA", label: "Convivencia" },
  { value: "MASCOTAS", label: "Mascotas" },
  { value: "PARQUEADERO", label: "Parqueadero" },
  { value: "INFORME_EMPRESA", label: "Informe de Empresa" },
  { value: "ACTA", label: "Acta" },
  { value: "CONTRATO", label: "Contrato" },
  { value: "CUENTA_COBRO", label: "Cuenta de Cobro" },
  { value: "CIRCULAR", label: "Circular" },
  { value: "OTRO", label: "Otro" },
];

const CAT_COLORS: Record<string, string> = {
  REGLAMENTO: "bg-blue-100 text-blue-700",
  CONVIVENCIA: "bg-green-100 text-green-700",
  MASCOTAS: "bg-amber-100 text-amber-700",
  PARQUEADERO: "bg-purple-100 text-purple-700",
  INFORME_EMPRESA: "bg-rose-100 text-rose-700",
  ACTA: "bg-indigo-100 text-indigo-700",
  CONTRATO: "bg-cyan-100 text-cyan-700",
  CUENTA_COBRO: "bg-orange-100 text-orange-700",
  CIRCULAR: "bg-teal-100 text-teal-700",
  OTRO: "bg-gray-100 text-gray-700",
};

interface FormData {
  nombre: string;
  descripcion: string;
  categoria: CatDoc;
  url: string;
  version: string;
  visibleResidentes: boolean;
}

const EMPTY_FORM: FormData = {
  nombre: "",
  descripcion: "",
  categoria: "INFORME_EMPRESA",
  url: "",
  version: "",
  visibleResidentes: true,
};

export default function AdminDocumentosPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [docs, setDocs] = useState<DocumentoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("TODOS");

  useEffect(() => {
    loadDocs();
  }, []);

  useEffect(() => {
    if (!isLoading && containerRef.current) {
      gsap.fromTo(
        containerRef.current.querySelectorAll(".doc-card"),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: "power2.out" }
      );
    }
  }, [isLoading, docs]);

  async function loadDocs() {
    try {
      setIsLoading(true);
      const data = await api.get<DocumentoDto[]>("/documentos");
      setDocs(data);
    } catch {
      toast.error("Error al cargar documentos");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(doc: DocumentoDto) {
    setEditingId(doc.id);
    setForm({
      nombre: doc.nombre,
      descripcion: doc.descripcion || "",
      categoria: doc.categoria as CatDoc,
      url: doc.url,
      version: doc.version || "",
      visibleResidentes: doc.visibleResidentes,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.url.trim()) {
      toast.error("Nombre y URL son obligatorios");
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/documentos/${editingId}`, {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          categoria: form.categoria,
          url: form.url.trim(),
          version: form.version.trim() || null,
          visibleResidentes: form.visibleResidentes,
        });
        toast.success("Documento actualizado");
      } else {
        const payload: CreateDocumentoRequest = {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          categoria: form.categoria,
          url: form.url.trim(),
          version: form.version.trim() || undefined,
          visibleResidentes: form.visibleResidentes,
        };
        await api.post("/documentos", payload);
        toast.success("Documento publicado");
      }
      setShowForm(false);
      loadDocs();
    } catch (err: any) {
      toast.error(err?.detail || "Error al guardar");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      await api.delete(`/documentos/${id}`);
      toast.success("Documento eliminado");
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error("Error al eliminar");
    }
  }

  const filtered = docs.filter((d) => {
    const matchSearch =
      !search ||
      d.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (d.descripcion && d.descripcion.toLowerCase().includes(search.toLowerCase()));
    const matchCat = filterCat === "TODOS" || d.categoria === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <ProfileHeader />

      <div ref={containerRef} className="max-w-6xl mx-auto px-4 py-6">
        {/* Header actions */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar documentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Nuevo Documento
          </button>
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {["TODOS", ...CAT_DOC_OPTIONS.map((c) => c.value)].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterCat === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {cat === "TODOS" ? "Todos" : CAT_DOC_OPTIONS.find((c) => c.value === cat)?.label || cat}
            </button>
          ))}
        </div>

        {/* Documents list */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay documentos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="doc-card bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 text-sm">{doc.nombre}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          CAT_COLORS[doc.categoria] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {CAT_DOC_OPTIONS.find((c) => c.value === doc.categoria)?.label || doc.categoria}
                      </span>
                      {doc.version && (
                        <span className="text-[10px] text-gray-400">v{doc.version}</span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-gray-400">
                        {doc.visibleResidentes ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                        {doc.visibleResidentes ? "Visible" : "Oculto"}
                      </span>
                    </div>
                    {doc.descripcion && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.descripcion}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      {doc.subidoPorNombre && <span>Por: {doc.subidoPorNombre}</span>}
                      <span>{new Date(doc.fechaPublicacion).toLocaleDateString("es-CO")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => openEdit(doc)}
                      className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">
                {editingId ? "Editar Documento" : "Nuevo Documento"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre del documento *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Informe mensual de aseo - Julio 2026"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripcion</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Descripcion breve del documento..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoria *</label>
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value as CatDoc })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {CAT_DOC_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Version</label>
                  <input
                    type="text"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    placeholder="Ej: v1.0"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  URL del documento *
                </label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Sube el archivo a S3/MinIO y pega la URL aqui
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="visibleResidentes"
                  checked={form.visibleResidentes}
                  onChange={(e) => setForm({ ...form, visibleResidentes: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600"
                />
                <label htmlFor="visibleResidentes" className="text-xs text-gray-600">
                  Visible para residentes
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Guardando..." : editingId ? "Actualizar" : "Publicar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

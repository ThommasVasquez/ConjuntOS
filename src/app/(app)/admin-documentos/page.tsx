'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  X,
  Search,
  FolderOpen,
  Download,
  Plus,
  RefreshCw,
  Sparkles,
  Shield,
  Calendar,
  User,
  CheckCircle2,
  FileCode,
  ExternalLink,
  Layers,
  FileCheck,
  Paperclip,
} from 'lucide-react';
import ProfileHeader from '@/components/shell/ProfileHeader';
import { api } from '@/lib/api/client';
import type { DocumentoDto, CatDoc, CreateDocumentoRequest } from '@/lib/api/types';
import { gsap } from 'gsap';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const CAT_DOC_OPTIONS: { value: CatDoc; label: string; icon: string; color: string }[] = [
  { value: 'REGLAMENTO', label: 'Reglamento', icon: '📜', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'CONVIVENCIA', label: 'Convivencia', icon: '🤝', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { value: 'MASCOTAS', label: 'Mascotas', icon: '🐾', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'PARQUEADERO', label: 'Parqueadero', icon: '🚗', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { value: 'INFORME_EMPRESA', label: 'Informe de Empresa', icon: '📊', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  { value: 'ACTA', label: 'Acta', icon: '📝', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  { value: 'CONTRATO', label: 'Contrato', icon: '📄', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  { value: 'CUENTA_COBRO', label: 'Cuenta de Cobro', icon: '💰', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { value: 'CIRCULAR', label: 'Circular', icon: '📢', color: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  { value: 'OTRO', label: 'Otro Documento', icon: '📁', color: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
];

interface FormData {
  nombre: string;
  descripcion: string;
  categoria: CatDoc;
  url: string;
  version: string;
  visibleResidentes: boolean;
}

const EMPTY_FORM: FormData = {
  nombre: '',
  descripcion: '',
  categoria: 'REGLAMENTO',
  url: '',
  version: 'v1.0',
  visibleResidentes: true,
};

export default function AdminDocumentosPage() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<DocumentoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('TODOS');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadDocs();
  }, []);

  useEffect(() => {
    if (!isLoading && containerRef.current) {
      gsap.fromTo(
        containerRef.current.querySelectorAll('.doc-card'),
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }, [isLoading, docs, filterCat, search]);

  async function loadDocs() {
    try {
      setIsLoading(true);
      const data = await api.get<DocumentoDto[]>('/documentos');
      setDocs(data);
    } catch (err: any) {
      toast.error(err?.message || 'Error al cargar repositorio documental');
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
      descripcion: doc.descripcion || '',
      categoria: (doc.categoria as CatDoc) || 'REGLAMENTO',
      url: doc.url,
      version: doc.version || 'v1.0',
      visibleResidentes: doc.visibleResidentes,
    });
    setShowForm(true);
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      return toast.error('El archivo supera el límite máximo de 15MB');
    }

    setIsUploadingFile(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Error al leer el archivo local'));
        reader.readAsDataURL(file);
      });

      const res = await api.post<{ url: string }>('/uploads/imagen', {
        data: dataUrl,
        carpeta: 'documentos',
      });

      setForm((prev) => ({
        ...prev,
        url: res.url,
        nombre: prev.nombre || file.name.replace(/\.[^/.]+$/, ''),
      }));
      toast.success('Archivo adjuntado y subido correctamente');
    } catch (err: any) {
      toast.error(err?.message || 'Error al subir el archivo');
    } finally {
      setIsUploadingFile(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.url.trim()) {
      toast.error('Indica el nombre y la URL o archivo adjunto');
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
        toast.success('Documento institucional actualizado');
      } else {
        const payload: CreateDocumentoRequest = {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          categoria: form.categoria,
          url: form.url.trim(),
          version: form.version.trim() || undefined,
          visibleResidentes: form.visibleResidentes,
        };
        await api.post('/documentos', payload);
        toast.success('Documento publicado exitosamente');
      }
      setShowForm(false);
      loadDocs();
    } catch (err: any) {
      toast.error(err?.detail || err?.message || 'Error al guardar el documento');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/documentos/${id}`);
      toast.success('Documento eliminado del repositorio');
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar el documento');
    }
  }

  const filtered = docs.filter((d) => {
    const matchSearch =
      !search ||
      d.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (d.descripcion && d.descripcion.toLowerCase().includes(search.toLowerCase()));
    const matchCat = filterCat === 'TODOS' || d.categoria === filterCat;
    return matchSearch && matchCat;
  });

  const totalVisibles = docs.filter((d) => d.visibleResidentes).length;
  const totalOcultos = docs.filter((d) => !d.visibleResidentes).length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 pt-16 pb-32 min-h-screen w-full max-w-full overflow-x-hidden relative">
      <ProfileHeader />

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-medium text-text tracking-wide">
              Gestión Documental e Institucional
            </h1>
            <span className="text-[#57bf00] text-[10px] font-black uppercase tracking-widest bg-[#57bf00]/15 px-2.5 py-0.5 rounded-full border border-[#57bf00]/30">
              ConjuntOS®
            </span>
          </div>
          <p className="text-xs text-text/70 mt-1">
            Repositorio digital de reglamentos, manuales de convivencia, actas, estados financieros y contratos
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={loadDocs}
            className="p-2.5 rounded-2xl liquid-glass border border-border text-text hover:bg-surface-2 transition-all active:scale-95"
            title="Actualizar listado"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#57bf00]/20"
          >
            <Plus size={16} />
            Publicar Documento
          </button>
        </div>
      </div>

      {/* STATS METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        <div className="liquid-glass-card rounded-[24px] p-4 border border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#57bf00]/15 border border-[#57bf00]/30 flex items-center justify-center text-[#57bf00]">
              <Layers size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-text/60">Total Documentos</span>
              <span className="text-xl font-bold text-text">{docs.length}</span>
            </div>
          </div>
        </div>

        <div className="liquid-glass-card rounded-[24px] p-4 border border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Eye size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-text/60">Visibles a Residentes</span>
              <span className="text-xl font-bold text-text">{totalVisibles}</span>
            </div>
          </div>
        </div>

        <div className="liquid-glass-card rounded-[24px] p-4 border border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <EyeOff size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-text/60">Privados / Solo Admin</span>
              <span className="text-xl font-bold text-text">{totalOcultos}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH AND CATEGORY FILTERS */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text/40" />
          <input
            type="text"
            placeholder="Buscar por título, categoría o palabra clave..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-10 py-3.5 rounded-2xl liquid-glass border border-border text-xs text-text placeholder:text-text/40 focus:outline-none focus:border-[#57bf00] transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text/40 hover:text-text"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setFilterCat('TODOS')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterCat === 'TODOS'
                ? 'bg-[#57bf00] text-black border-[#57bf00] shadow-md shadow-[#57bf00]/20'
                : 'liquid-glass border-border text-text/70 hover:bg-surface-2'
            }`}
          >
            📂 Todos ({docs.length})
          </button>

          {CAT_DOC_OPTIONS.map((c) => {
            const count = docs.filter((d) => d.categoria === c.value).length;
            if (count === 0 && filterCat !== c.value) return null;
            return (
              <button
                key={c.value}
                onClick={() => setFilterCat(c.value)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  filterCat === c.value
                    ? 'bg-[#57bf00] text-black border-[#57bf00] shadow-md shadow-[#57bf00]/20'
                    : 'liquid-glass border-border text-text/70 hover:bg-surface-2'
                }`}
              >
                <span>{c.icon}</span>
                <span>{c.label}</span>
                <span className="opacity-70 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DOCUMENT LIST */}
      <div ref={containerRef} className="flex flex-col gap-3.5 w-full">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#57bf00] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="liquid-glass rounded-[32px] p-10 border border-border text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#57bf00]/15 border border-[#57bf00]/30 flex items-center justify-center text-[#57bf00]">
              <FolderOpen size={28} />
            </div>
            <h3 className="text-base font-bold text-text">No hay documentos en este filtro</h3>
            <p className="text-xs text-text/60 max-w-sm">
              {search ? 'Intenta modificar el término de búsqueda' : 'Publica reglamentos, actas o circulares para la copropiedad.'}
            </p>
          </div>
        ) : (
          filtered.map((doc) => {
            const catOption = CAT_DOC_OPTIONS.find((c) => c.value === doc.categoria) || {
              label: doc.categoria,
              icon: '📁',
              color: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
            };

            const fechaObj = doc.fechaPublicacion ? new Date(doc.fechaPublicacion) : new Date();

            return (
              <div
                key={doc.id}
                className="doc-card liquid-glass-card rounded-[28px] p-4 sm:p-5 border border-border hover:border-[#57bf00]/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform">
                    {catOption.icon}
                  </div>

                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-text truncate group-hover:text-[#57bf00] transition-colors">
                        {doc.nombre}
                      </h3>
                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${catOption.color}`}>
                        {catOption.label}
                      </span>
                      {doc.version && (
                        <span className="text-[10px] font-bold text-text/50 bg-surface-2 px-2 py-0.5 rounded-md border border-border">
                          {doc.version}
                        </span>
                      )}
                      {doc.visibleResidentes ? (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Eye size={11} /> Visible
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <EyeOff size={11} /> Solo Admin
                        </span>
                      )}
                    </div>

                    {doc.descripcion && (
                      <p className="text-xs text-text/70 line-clamp-2 mt-0.5">{doc.descripcion}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-text/50 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} className="text-[#57bf00]" />
                        {fechaObj.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      {doc.subidoPorNombre && (
                        <span className="flex items-center gap-1">
                          <User size={12} className="text-[#57bf00]" />
                          {doc.subidoPorNombre}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-[#57bf00]/20 hover:text-[#57bf00] border border-border text-xs font-bold text-text transition-all active:scale-95"
                    title="Ver / Descargar archivo"
                  >
                    <Download size={14} />
                    <span>Ver</span>
                  </a>

                  <button
                    onClick={() => openEdit(doc)}
                    className="p-2 rounded-xl bg-surface-2 hover:bg-amber-500/20 hover:text-amber-400 border border-border text-text/70 transition-all active:scale-95"
                    title="Editar documento"
                  >
                    <Edit3 size={15} />
                  </button>

                  <button
                    onClick={() => setDeleteConfirmId(doc.id)}
                    className="p-2 rounded-xl bg-surface-2 hover:bg-rose-500/20 hover:text-rose-400 border border-border text-text/70 transition-all active:scale-95"
                    title="Eliminar documento"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL CREAR / EDITAR */}
      {showForm && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg liquid-glass rounded-[32px] p-6 border border-border flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-[#57bf00]" />
                {editingId ? 'Editar Documento Institucional' : 'Publicar Nuevo Documento'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-text/5 flex items-center justify-center text-text hover:bg-text/10"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-text uppercase tracking-wider">Nombre del Documento *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Reglamento Interno de Propiedad Horizontal 2026"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="font-bold text-text uppercase tracking-wider">Categoría *</label>
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value as CatDoc })}
                    className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                  >
                    {CAT_DOC_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value} className="bg-background text-text">
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-bold text-text uppercase tracking-wider">Versión</label>
                  <input
                    type="text"
                    placeholder="ej. v1.0 o 2026-A"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-text uppercase tracking-wider">Descripción / Notas</label>
                <textarea
                  rows={2}
                  placeholder="Breve explicación del contenido o alcance del documento..."
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                />
              </div>

              {/* ARCHIVO ADJUNTO / UPLOAD / URL */}
              <div className="flex flex-col gap-2 bg-surface-2/60 p-3.5 rounded-2xl border border-border/40">
                <label className="font-bold text-text uppercase tracking-wider flex items-center justify-between">
                  <span>Archivo o Enlace PDF/Documento *</span>
                  {isUploadingFile && <span className="text-[#57bf00] animate-pulse">Subiendo archivo...</span>}
                </label>

                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    placeholder="https://... o adjunta un archivo abajo"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    className="flex-1 bg-primary-light/40 border border-border rounded-xl p-2.5 text-text text-xs focus:outline-none focus:border-[#57bf00]"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingFile}
                    className="px-3.5 py-2.5 rounded-xl bg-[#57bf00]/20 border border-[#57bf00]/40 text-[#57bf00] font-bold text-xs hover:bg-[#57bf00]/30 transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Paperclip size={14} />
                    Adjuntar
                  </button>
                </div>
              </div>

              {/* TOGGLE VISIBILIDAD */}
              <div className="flex items-center justify-between bg-primary-light/30 p-3.5 rounded-2xl border border-border/30">
                <div className="flex flex-col">
                  <span className="font-bold text-text">Visible para Residentes</span>
                  <span className="text-[10px] text-text/60">Si se desmarca, solo la Administración podrá verlo</span>
                </div>
                <input
                  type="checkbox"
                  id="visibleResidentesModal"
                  checked={form.visibleResidentes}
                  onChange={(e) => setForm({ ...form, visibleResidentes: e.target.checked })}
                  className="w-5 h-5 accent-[#57bf00] cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-text font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingFile}
                  className="px-5 py-2.5 rounded-xl bg-[#57bf00] text-black font-bold uppercase tracking-wider hover:brightness-110"
                >
                  {isSubmitting ? 'Guardando...' : editingId ? 'Actualizar Documento' : 'Publicar Documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMAR ELIMINACIÓN MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm liquid-glass rounded-[32px] p-6 border border-border flex flex-col gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text">¿Eliminar Documento?</h3>
              <p className="text-xs text-text/60 mt-1">Esta acción retirará el archivo del repositorio institucional.</p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs text-text font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-bold text-xs uppercase tracking-wider"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

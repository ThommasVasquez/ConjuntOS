'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Download,
  Search,
  FolderOpen,
  Calendar,
  User,
  RefreshCw,
  Eye,
  EyeOff,
  Building2,
  X,
  FileCheck,
} from 'lucide-react';
import ProfileHeader from '@/components/shell/ProfileHeader';
import { api } from '@/lib/api/client';
import type { DocumentoDto } from '@/lib/api/types';
import { gsap } from 'gsap';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const CAT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  REGLAMENTO: { label: 'Reglamento', icon: '📜', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  CONVIVENCIA: { label: 'Convivencia', icon: '🤝', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  MASCOTAS: { label: 'Mascotas', icon: '🐾', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  PARQUEADERO: { label: 'Parqueadero', icon: '🚗', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  INFORME_EMPRESA: { label: 'Informe de Empresa', icon: '📊', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  ACTA: { label: 'Acta', icon: '📝', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  CONTRATO: { label: 'Contrato', icon: '📄', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  CUENTA_COBRO: { label: 'Cuenta de Cobro', icon: '💰', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  CIRCULAR: { label: 'Circular', icon: '📢', color: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  OTRO: { label: 'Otro Documento', icon: '📁', color: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
};

export default function DocumentosPage() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  const [docs, setDocs] = useState<DocumentoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('TODOS');

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
    } catch {
      toast.error('Error al cargar los documentos de la copropiedad');
    } finally {
      setIsLoading(false);
    }
  }

  const categories = ['TODOS', ...Array.from(new Set(docs.map((d) => d.categoria)))];

  const filtered = docs.filter((d) => {
    const matchSearch =
      !search ||
      d.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (d.descripcion && d.descripcion.toLowerCase().includes(search.toLowerCase()));
    const matchCat = filterCat === 'TODOS' || d.categoria === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 pt-16 pb-32 min-h-screen w-full max-w-full overflow-x-hidden relative">
      <ProfileHeader />

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-medium text-text tracking-wide">
              Documentos Institucionales
            </h1>
            <span className="text-[#57bf00] text-[10px] font-black uppercase tracking-widest bg-[#57bf00]/15 px-2.5 py-0.5 rounded-full border border-[#57bf00]/30">
              ConjuntOS®
            </span>
          </div>
          <p className="text-xs text-text/70 mt-1">
            Consulta oficial de reglamentos, manuales de convivencia, circulares e informes de la copropiedad
          </p>
        </div>

        <button
          onClick={loadDocs}
          className="p-2.5 rounded-2xl liquid-glass border border-border text-text hover:bg-surface-2 transition-all active:scale-95 self-end sm:self-center"
          title="Actualizar listado"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* SEARCH AND CATEGORY FILTERS */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text/40" />
          <input
            type="text"
            placeholder="Buscar por nombre o palabra clave..."
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
          {categories.map((cat) => {
            const catInfo = CAT_LABELS[cat] || { label: cat, icon: '📁' };
            const label = cat === 'TODOS' ? 'Todos' : catInfo.label;
            const icon = cat === 'TODOS' ? '📂' : catInfo.icon;
            const count = cat === 'TODOS' ? docs.length : docs.filter((d) => d.categoria === cat).length;

            return (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  filterCat === cat
                    ? 'bg-[#57bf00] text-black border-[#57bf00] shadow-md shadow-[#57bf00]/20'
                    : 'liquid-glass border-border text-text/70 hover:bg-surface-2'
                }`}
              >
                <span>{icon}</span>
                <span>{label}</span>
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
            <h3 className="text-base font-bold text-text">No hay documentos disponibles</h3>
            <p className="text-xs text-text/60 max-w-sm">
              {search || filterCat !== 'TODOS'
                ? 'No se encontraron documentos con los filtros seleccionados'
                : 'La administración publicará pronto reglamentos e informes aquí.'}
            </p>
          </div>
        ) : (
          filtered.map((doc) => {
            const catOption = CAT_LABELS[doc.categoria] || {
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

                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md shadow-[#57bf00]/15 self-end sm:self-center shrink-0"
                >
                  <Download size={14} />
                  <span>Ver Documento</span>
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

"use client";

import { FileText, Download, Search, FolderOpen, Calendar, User } from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { DocumentoDto } from "@/lib/api/types";
import { gsap } from "gsap";
import { toast } from "sonner";

const CAT_LABELS: Record<string, string> = {
  REGLAMENTO: "Reglamento",
  CONVIVENCIA: "Convivencia",
  MASCOTAS: "Mascotas",
  PARQUEADERO: "Parqueadero",
  INFORME_EMPRESA: "Informe de Empresa",
  ACTA: "Acta",
  CONTRATO: "Contrato",
  CUENTA_COBRO: "Cuenta de Cobro",
  CIRCULAR: "Circular",
  OTRO: "Otro",
};

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

const CAT_ICONS: Record<string, string> = {
  REGLAMENTO: "📋",
  CONVIVENCIA: "🤝",
  MASCOTAS: "🐾",
  PARQUEADERO: "🚗",
  INFORME_EMPRESA: "📊",
  ACTA: "📝",
  CONTRATO: "📄",
  CUENTA_COBRO: "💰",
  CIRCULAR: "📢",
  OTRO: "📁",
};

export default function DocumentosPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [docs, setDocs] = useState<DocumentoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const categories = ["TODOS", ...Array.from(new Set(docs.map((d) => d.categoria)))];

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

      <div ref={containerRef} className="max-w-4xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar documentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterCat === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {cat === "TODOS" ? "Todos" : CAT_LABELS[cat] || cat}
            </button>
          ))}
        </div>

        {/* Documents */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Cargando documentos...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {search || filterCat !== "TODOS"
                ? "No se encontraron documentos con esos filtros"
                : "No hay documentos disponibles"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="doc-card bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{CAT_ICONS[doc.categoria] || "📁"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 text-sm">{doc.nombre}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          CAT_COLORS[doc.categoria] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {CAT_LABELS[doc.categoria] || doc.categoria}
                      </span>
                      {doc.version && (
                        <span className="text-[10px] text-gray-400">v{doc.version}</span>
                      )}
                    </div>
                    {doc.descripcion && (
                      <p className="text-xs text-gray-500 mt-1">{doc.descripcion}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(doc.fechaPublicacion).toLocaleDateString("es-CO", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {doc.subidoPorNombre && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {doc.subidoPorNombre}
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Ver
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

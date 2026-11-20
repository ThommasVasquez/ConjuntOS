export interface AnuncioCta {
  path: string;
  label: string;
}

export interface AnuncioCtaOption {
  value: string;
  label: string;
  defaultButtonText: string;
}

export const ANUNCIO_CTA_DESTINOS: AnuncioCtaOption[] = [
  { value: "", label: "Sin acceso directo", defaultButtonText: "" },
  { value: "/documentos", label: "📄 Documentos (Todos)", defaultButtonText: "Ver documentos" },
  { value: "/documentos?categoria=CONVIVENCIA", label: "🤝 Documentos → Convivencia", defaultButtonText: "Ver manual de convivencia" },
  { value: "/documentos?categoria=REGLAMENTO", label: "📜 Documentos → Reglamento", defaultButtonText: "Ver reglamento" },
  { value: "/documentos?categoria=MASCOTAS", label: "🐾 Documentos → Mascotas", defaultButtonText: "Ver normativa de mascotas" },
  { value: "/documentos?categoria=PARQUEADERO", label: "🚗 Documentos → Parqueadero", defaultButtonText: "Ver normas de parqueadero" },
  { value: "/encuestas", label: "📊 Encuestas", defaultButtonText: "Ir a encuestas" },
  { value: "/pagos", label: "💳 Pagos y Cartera", defaultButtonText: "Ir a pagos" },
  { value: "/citofonia", label: "📞 Citofonía", defaultButtonText: "Abrir citofonía" },
  { value: "/visitantes", label: "🪪 Visitantes", defaultButtonText: "Gestionar visitas" },
  { value: "/pqrs", label: "📝 Solicitudes / PQRS", defaultButtonText: "Ir a solicitudes" },
  { value: "/parqueadero", label: "🅿️ Parqueadero", defaultButtonText: "Ir a parqueadero" },
  { value: "/asamblea", label: "🏛️ Asamblea", defaultButtonText: "Ir a la asamblea" },
  { value: "/asistente", label: "⚖️ Asistente Ley 675", defaultButtonText: "Consultar asistente" },
  { value: "/perfil", label: "👤 Mi Perfil", defaultButtonText: "Ir a mi perfil" },
  { value: "__CUSTOM__", label: "🔗 Ruta personalizada…", defaultButtonText: "Abrir sección" },
];

const CTA_PREFIX = "cta::";

export function encodeAnuncioCta(path: string, label: string): string {
  const cleanPath = path.trim().startsWith("/") ? path.trim() : `/${path.trim()}`;
  const cleanLabel = label.trim() || "Ver sección";
  return `${CTA_PREFIX}${cleanPath}::${cleanLabel}`;
}

export function extractAnuncioCta(archivosUrl?: string[] | null): {
  cta: AnuncioCta | null;
  files: string[];
} {
  if (!Array.isArray(archivosUrl) || archivosUrl.length === 0) {
    return { cta: null, files: [] };
  }
  let cta: AnuncioCta | null = null;
  const files: string[] = [];

  for (const entry of archivosUrl) {
    if (typeof entry === "string" && entry.startsWith(CTA_PREFIX)) {
      const rest = entry.slice(CTA_PREFIX.length);
      const sepIdx = rest.indexOf("::");
      if (sepIdx > 0) {
        const path = rest.slice(0, sepIdx).trim();
        const label = rest.slice(sepIdx + 2).trim() || "Ver sección";
        if (path.startsWith("/")) {
          cta = { path, label };
        }
      }
    } else if (typeof entry === "string" && entry.trim()) {
      files.push(entry);
    }
  }

  return { cta, files };
}

export function mergeAnuncioCta(
  existingArchivos: string[] | undefined,
  cta: AnuncioCta | null
): string[] {
  const { files } = extractAnuncioCta(existingArchivos);
  if (cta && cta.path.trim()) {
    return [...files, encodeAnuncioCta(cta.path, cta.label)];
  }
  return files;
}

export interface AnuncioCta {
  path: string;
  label: string;
}

export interface AnuncioBrand {
  name: string;
  logoUrl?: string;
  badge?: string;
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
  { value: "__CUSTOM__", label: "🔗 Ruta interna o enlace externo (URL / WhatsApp)…", defaultButtonText: "Ver más" },
];

const CTA_PREFIX = "cta::";
const BRAND_PREFIX = "brand::";

export function encodeAnuncioCta(path: string, label: string): string {
  const trimmed = path.trim();
  const isExternal = /^https?:\/\//i.test(trimmed);
  const cleanPath = isExternal ? trimmed : (trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
  const cleanLabel = label.trim() || "Ver más";
  return `${CTA_PREFIX}${cleanPath}::${cleanLabel}`;
}

export function encodeAnuncioBrand(brand: AnuncioBrand): string {
  const name = brand.name.trim();
  const logo = (brand.logoUrl || "").trim();
  const badge = brand.badge === "" ? "__NONE__" : (brand.badge || "Anuncio").trim();
  return `${BRAND_PREFIX}${encodeURIComponent(name)}::${encodeURIComponent(logo)}::${encodeURIComponent(badge)}`;
}

export function extractAnuncioMeta(archivosUrl?: string[] | null): {
  cta: AnuncioCta | null;
  brand: AnuncioBrand | null;
  files: string[];
} {
  if (!Array.isArray(archivosUrl) || archivosUrl.length === 0) {
    return { cta: null, brand: null, files: [] };
  }
  let cta: AnuncioCta | null = null;
  let brand: AnuncioBrand | null = null;
  const files: string[] = [];

  for (const entry of archivosUrl) {
    if (typeof entry !== "string") continue;
    if (entry.startsWith(CTA_PREFIX)) {
      const rest = entry.slice(CTA_PREFIX.length);
      const sepIdx = rest.indexOf("::");
      if (sepIdx > 0) {
        const path = rest.slice(0, sepIdx).trim();
        const label = rest.slice(sepIdx + 2).trim() || "Ver más";
        if (path.startsWith("/") || /^https?:\/\//i.test(path)) {
          cta = { path, label };
        }
      }
    } else if (entry.startsWith(BRAND_PREFIX)) {
      const parts = entry.slice(BRAND_PREFIX.length).split("::");
      const name = decodeURIComponent(parts[0] || "").trim();
      const logoUrl = decodeURIComponent(parts[1] || "").trim() || undefined;
      const rawBadge = decodeURIComponent(parts[2] || "").trim();
      const badge = rawBadge === "__NONE__" ? "" : (rawBadge || "Anuncio");
      if (name) {
        brand = { name, logoUrl, badge };
      }
    } else if (entry.trim()) {
      files.push(entry);
    }
  }

  return { cta, brand, files };
}

export function extractAnuncioCta(archivosUrl?: string[] | null): {
  cta: AnuncioCta | null;
  files: string[];
} {
  const { cta, files } = extractAnuncioMeta(archivosUrl);
  return { cta, files };
}

export function mergeAnuncioMeta(
  existingArchivos: string[] | undefined,
  cta: AnuncioCta | null,
  brand: AnuncioBrand | null
): string[] {
  const { files } = extractAnuncioMeta(existingArchivos);
  const out = [...files];
  if (cta && cta.path.trim()) {
    out.push(encodeAnuncioCta(cta.path, cta.label));
  }
  if (brand && brand.name.trim()) {
    out.push(encodeAnuncioBrand(brand));
  }
  return out;
}

export function mergeAnuncioCta(
  existingArchivos: string[] | undefined,
  cta: AnuncioCta | null
): string[] {
  const { brand } = extractAnuncioMeta(existingArchivos);
  return mergeAnuncioMeta(existingArchivos, cta, brand);
}

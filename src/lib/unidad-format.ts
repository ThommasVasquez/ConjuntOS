/**
 * Helpers centralizados para nomenclatura de unidades por conjunto.
 *
 * - Conjuntos estándar (`usaTorre !== false`): Torre/Bloque + Apto/Casa.
 * - Las Brisas PH (`usaTorre === false`): nomenclatura simple de solo número
 *   (480 apartamentos: 101–180, 201–280, 301–380, 401–480, 501–580, 601–680),
 *   sin palabras como Torre, Bloque, Interior ni Apartamento.
 */

export function usesTorre(user?: { usaTorre?: boolean | null } | null): boolean {
  return user?.usaTorre !== false;
}

export function formatUnidad(
  torre: string | null | undefined,
  apto: string | null | undefined,
  usaTorre = true,
  options?: { compact?: boolean; emptyFallback?: string }
): string {
  const cleanApto = (apto ?? "").trim();
  const cleanTorre = (torre ?? "").trim();
  const fallback = options?.emptyFallback ?? "—";

  if (!usaTorre) {
    return cleanApto || fallback;
  }

  if (options?.compact) {
    if (cleanTorre && cleanApto) return `T${cleanTorre}-${cleanApto}`;
    if (cleanApto) return cleanApto;
    if (cleanTorre) return `T${cleanTorre}`;
    return fallback;
  }

  if (cleanTorre && cleanApto) return `Torre ${cleanTorre} · Apto ${cleanApto}`;
  if (cleanApto) return `Apto ${cleanApto}`;
  if (cleanTorre) return `Torre ${cleanTorre}`;
  return fallback;
}

/** Los 480 números de apartamento válidos en Las Brisas PH (6 pisos × 80 por piso). */
export const LAS_BRISAS_UNIDADES: string[] = (() => {
  const list: string[] = [];
  for (let piso = 1; piso <= 6; piso++) {
    const base = piso * 100;
    for (let n = 1; n <= 80; n++) {
      list.push(String(base + n));
    }
  }
  return list;
})();

const LAS_BRISAS_UNIDADES_SET = new Set(LAS_BRISAS_UNIDADES);

export function isValidLasBrisasUnidad(value: string): boolean {
  return LAS_BRISAS_UNIDADES_SET.has(value.trim());
}

/** Subdominios/slugs reconocidos para el kiosko de Las Brisas PH. */
export function isLasBrisasSlug(slug?: string | null): boolean {
  if (!slug) return false;
  const s = slug.trim().toLowerCase();
  return s === "lasbrisasph" || s === "las-brisas" || s === "lasbrisas";
}

import directorioRealRaw from "@/data/directorioLasBrisasReal.json";

export interface ResidenteLasBrisas {
  id: string;
  nombre: string;
  torre: string; // Bloque en Las Brisas PH
  apto: string;  // Casa en Las Brisas PH
  telefono?: string | null;
}

/**
 * Catálogo canónico con los 479 residentes y casas reales de Las Brisas PH
 * extraídos directamente de la base de datos de producción (api.conjuntos.app).
 */
export const RESIDENTES_REALES_LAS_BRISAS: ResidenteLasBrisas[] =
  directorioRealRaw as ResidenteLasBrisas[];

/**
 * Bloques reales de Las Brisas PH: ["1", "2", "3", "4", "5", "6"]
 */
export const BLOQUES_REALES_LAS_BRISAS: string[] = Array.from(
  new Set(RESIDENTES_REALES_LAS_BRISAS.map((r) => r.torre))
).sort((a, b) => Number(a) - Number(b));

/**
 * Casas reales registradas en cada bloque (exactamente según la base de datos).
 */
export const CASAS_REALES_POR_BLOQUE: Record<string, string[]> =
  RESIDENTES_REALES_LAS_BRISAS.reduce((acc, r) => {
    if (!acc[r.torre]) acc[r.torre] = [];
    if (!acc[r.torre].includes(r.apto)) acc[r.torre].push(r.apto);
    return acc;
  }, {} as Record<string, string[]>);

// Ordenar numéricamente las casas de cada bloque
Object.keys(CASAS_REALES_POR_BLOQUE).forEach((bloque) => {
  CASAS_REALES_POR_BLOQUE[bloque].sort((a, b) => Number(a) - Number(b));
});

export function getCasasRealesDeBloque(bloque: string): string[] {
  return CASAS_REALES_POR_BLOQUE[bloque] || [];
}

export function findResidenteReal(
  bloque: string,
  casa: string
): ResidenteLasBrisas | undefined {
  const cleanBloque = bloque.replace(/^(bloque|torre)\s*/i, "").trim();
  const cleanCasa = casa.replace(/^(casa|apto)\s*/i, "").trim();
  return RESIDENTES_REALES_LAS_BRISAS.find(
    (r) => r.torre === cleanBloque && r.apto === cleanCasa
  );
}

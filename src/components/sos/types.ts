// Mirrors the backend SosDto (domains/sos.rs), camelCase over the wire.
export type TipoSos = "SEGURIDAD" | "MEDICA" | "INCENDIO" | "OTRO";
export type EstadoSos = "ABIERTA" | "ATENDIDA" | "RESUELTA";

export interface SosDto {
  id: string;
  usuarioId: string;
  usuarioNombre: string | null;
  tipo: TipoSos;
  estado: EstadoSos;
  nota: string | null;
  ubicacion: string | null;
  atendidaPorId: string | null;
  fechaAtendida: string | null;
  resueltaPorId: string | null;
  fechaResuelta: string | null;
  createdAt: string;
}

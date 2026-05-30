import db from "@/lib/db";

export interface AgendaItem {
  id: string;
  titulo: string;
  descripcion?: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO';
}

export interface SpeakingTurn {
  id: string;
  usuarioId: string;
  nombre: string;
  apto?: string;
  estado: 'PENDIENTE' | 'HABLANDO' | 'COMPLETADO';
  creadoEn: string;
}

export interface ResidentOpinion {
  id: string;
  usuarioId: string;
  nombre: string;
  apto?: string;
  contenido: string;
  creadoEn: string;
}

export interface AsambleaAsistencia {
  usuarioId: string;
  nombre: string;
  apto: string;
  tipo: 'PRESENCIAL' | 'VIRTUAL';
  verificado: boolean;
  creadoEn: string;
  ip?: string;
  dispositivo?: string;
}

export interface AsambleaPoder {
  id: string;
  otorganteId: string;
  otorganteNombre: string;
  otorganteApto: string;
  apoderadoId: string;
  apoderadoNombre: string;
  documentoUrl: string; // Base64 or URL
  verificado: boolean;
  creadoEn: string;
}

export interface AsambleaVoto {
  usuarioId: string;
  nombre: string;
  apto: string;
  respuesta: string;
  coeficiente: number;
  esVirtual: boolean;
  hashFirma: string;
  creadoEn: string;
}

export interface AsambleaVotacion {
  id: string;
  titulo: string;
  descripcion?: string;
  opciones: string[]; // default ["SI", "NO", "ABSTENCION"]
  activa: boolean;
  votos: AsambleaVoto[];
  creadoEn: string;
  formula?: 'MAYORIA_SIMPLE' | 'QUORUM_CALIFICADO';
}

export interface LiveSubtitle {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
}

export interface AsambleaState {
  activa: boolean;
  ordenDia: AgendaItem[];
  itemActivoIndex: number;
  turnos: SpeakingTurn[];
  opiniones: ResidentOpinion[];
  asistencias: AsambleaAsistencia[];
  poderes: AsambleaPoder[];
  votaciones: AsambleaVotacion[];
  subtitulos: LiveSubtitle[];
}

export const defaultAgenda: AgendaItem[] = [
  { id: "1", titulo: "1. Verificación del Quórum", descripcion: "Llamado a lista y verificación del quórum mínimo reglamentario para deliberar.", estado: "PENDIENTE" },
  { id: "2", titulo: "2. Elección del Presidente y Secretario de la Asamblea", descripcion: "Postulación y votación para los cargos moderadores de la reunión.", estado: "PENDIENTE" },
  { id: "3", titulo: "3. Lectura y Aprobación del Orden del Día", descripcion: "Presentación y aprobación de los puntos propuestos para la jornada.", estado: "PENDIENTE" },
  { id: "4", titulo: "4. Informe de Gestión del Administrador", descripcion: "Presentación de los logros, mantenimientos y gestiones del año anterior.", estado: "PENDIENTE" },
  { id: "5", titulo: "5. Presentación y Aprobación del Presupuesto 2026", descripcion: "Explicación detallada de los ingresos, egresos proyectados y fijación de la cuota de administración.", estado: "PENDIENTE" },
  { id: "6", titulo: "6. Proposiciones y Varios", descripcion: "Espacio para opiniones libres, preguntas y propuestas no contempladas previamente.", estado: "PENDIENTE" }
];

export async function getOrCreateActiveAsamblea(conjuntoId: string = "demo_id"): Promise<any> {
  let junta = await db.junta.findFirst({
    where: { conjuntoId, publicada: false }
  });

  if (!junta) {
    const defaultState: AsambleaState = {
      activa: true,
      ordenDia: defaultAgenda,
      itemActivoIndex: 0,
      turnos: [],
      opiniones: [],
      asistencias: [],
      poderes: [],
      votaciones: [],
      subtitulos: []
    };
    
    junta = await db.junta.create({
      data: {
        conjuntoId,
        tipo: "ORDINARIA",
        fecha: new Date().toISOString(),
        titulo: "Asamblea General Ordinaria de Copropiotarios",
        descripcion: JSON.stringify(defaultState),
        publicada: false
      }
    });
  }

  return junta;
}

export async function saveAsambleaState(juntaId: string, state: AsambleaState): Promise<void> {
  await db.junta.update({
    where: { id: juntaId },
    data: {
      descripcion: JSON.stringify(state)
    }
  });
}

export function parseAsambleaState(junta: any): AsambleaState {
  try {
    if (junta.descripcion) {
      const state = JSON.parse(junta.descripcion);
      if (state.ordenDia && Array.isArray(state.ordenDia)) {
        return {
          activa: state.activa ?? true,
          ordenDia: state.ordenDia,
          itemActivoIndex: state.itemActivoIndex ?? 0,
          turnos: state.turnos || [],
          opiniones: state.opiniones || [],
          asistencias: state.asistencias || [],
          poderes: state.poderes || [],
          votaciones: state.votaciones || [],
          subtitulos: state.subtitulos || []
        };
      }
    }
  } catch (e) {
    console.error("Error parsing assembly state:", e);
  }

  return {
    activa: true,
    ordenDia: defaultAgenda,
    itemActivoIndex: 0,
    turnos: [],
    opiniones: [],
    asistencias: [],
    poderes: [],
    votaciones: [],
    subtitulos: []
  };
}

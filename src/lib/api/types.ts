/**
 * TypeScript DTOs matching the Rust backend (serde rename_all = "camelCase").
 *
 * Organized by domain. Every type mirrors the corresponding `*Dto` / request
 * struct in `backend/api/src/domains/`.  Enum values are UPPER_SNAKE strings
 * matching the CHECK constraints in the database (enums.rs text_enum! macro).
 */

// ===========================================================================
// Enums (from backend/api/src/db/enums.rs)
// ===========================================================================

export type Rol =
  | 'ARRENDATARIO'
  | 'PROPIETARIO'
  | 'ADMINISTRADOR'
  | 'CONCEJO'
  | 'VIGILANTE'
  | 'SUPERVISOR_VIGILANCIA'
  | 'ENCARGADO_PARQUEADERO'
  | 'SUPER_ADMIN'
  | 'HUESPED_TEMPORAL'
  | 'ADMINISTRADOR_PISCINA'
  | 'ADMINISTRADOR_GYM'
  | 'MANTENIMIENTO_LOCATIVO'
  | 'OPERARIO_LIMPIEZA';

export type Plan = 'BASICO' | 'PRO' | 'PREMIUM';

export type TipoUnidad = 'APARTAMENTO' | 'CASA' | 'LOCAL' | 'PARQUEADERO';

export type EstadoReserva = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'COMPLETADA';

export type TipoAnuncio = 'GENERAL' | 'URGENTE' | 'MANTENIMIENTO' | 'EVENTO';

export type TipoTramite = 'MASCOTA' | 'VEHICULO' | 'ARRENDAMIENTO' | 'MUDANZA' | 'OTRO';

export type EstadoTramite = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'VENCIDO' | 'EN_DISPUTA';

export type MetodoPago = 'PSE' | 'TARJETA' | 'NEQUI' | 'DAVIPLATA' | 'EFECTIVO';

export type CatLocal = 'RESTAURANTE' | 'TIENDA' | 'LAVANDERIA' | 'FARMACIA' | 'OTRO';

export type CatServicio =
  | 'PLOMERIA'
  | 'ELECTRICIDAD'
  | 'CARPINTERIA'
  | 'PINTURA'
  | 'CERRAJERIA'
  | 'OTRO';

export type EstadoSolicitud = 'ABIERTA' | 'ASIGNADA' | 'EN_PROGRESO' | 'RESUELTA' | 'CERRADA';

export type PrioridadTicket = 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export type TipoPqr = 'PETICION' | 'QUEJA' | 'RECLAMO' | 'SUGERENCIA' | 'MANTENIMIENTO';

export type TipoNegocio = 'VENTA' | 'ALQUILER';

export type EstadoInmueble = 'DISPONIBLE' | 'VENDIDO' | 'ALQUILADO' | 'OCULTO';

export type TipoVisita = 'PEATONAL' | 'VEHICULAR';

export type EstadoPaquete = 'EN_PORTERIA' | 'ENTREGADO';

export type TipoVehiculo = 'CARRO' | 'MOTO';

export type TipoMascota = 'PERRO' | 'GATO' | 'AVE' | 'OTRO';

export type TipoVehiculoVisita = 'CARRO' | 'MOTO' | 'NINGUNO';

export type EstadoParqueadero = 'DISPONIBLE' | 'OCUPADO' | 'RESERVADO';

export type TipoCeldaParqueadero = 'RESIDENTE' | 'VISITANTE' | 'DISCAPACITADO';

export type TipoRegistroParqueadero = 'INGRESO' | 'SALIDA' | 'VERIFICACION';

export type DecisionTramite = 'APROBADO' | 'RECHAZADO';

// ===========================================================================
// Auth (auth_routes.rs — no rename_all on LoginRequest / LoginResponse)
// ===========================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserDto;
  /** Bearer fallback for clients where the cross-site cookie is blocked. */
  token: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ===========================================================================
// Usuarios
// ===========================================================================

export interface UserDto {
  id: string;
  conjuntoId: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  unidadId: string | null;
  avatar: string | null;
  torre: string | null;
  apto: string | null;
  genero: string | null;
  mustChangePassword: boolean;
  activo: boolean;
  /** True when this account may switch its own role at runtime (tester). */
  isTester?: boolean;
}

export interface UpdateProfileRequest {
  nombre?: string;
  telefono?: string;
  genero?: string;
  avatar?: string;
  torre?: string;
  apto?: string;
}

export interface ProfileResponse extends UserDto {
  unidad: UnidadDto | null;
}

export interface UnidadDto {
  id: string;
  numero: string;
  torre: string | null;
  piso: number | null;
  tipo: TipoUnidad;
  /** Decimal serialized as string. */
  coeficiente: string;
}

// ===========================================================================
// Conjuntos
// ===========================================================================

export interface ConjuntoDto {
  id: string;
  nombre: string;
  nit: string | null;
  subdominio: string;
  direccion: string;
  ciudad: string;
  logoUrl: string | null;
  colorPrimario: string;
  plan: Plan;
  activo: boolean;
  representanteLegal: string | null;
  notariaEscritura: string | null;
  numeroEscritura: string | null;
  fechaEscritura: string | null;
  matriculaInmobiliaria: string | null;
  totalUnidades: number | null;
  creadoEn: string;
}

export interface CreateConjuntoRequest {
  nombre: string;
  subdominio: string;
  direccion: string;
  ciudad: string;
  nit?: string;
  logoUrl?: string;
  colorPrimario?: string;
  plan?: Plan;
  representanteLegal?: string;
  notariaEscritura?: string;
  numeroEscritura?: string;
  fechaEscritura?: string;
  matriculaInmobiliaria?: string;
  totalUnidades?: number;
}

export interface UpdateConjuntoRequest {
  nombre?: string;
  direccion?: string;
  ciudad?: string;
  nit?: string;
  logoUrl?: string;
  colorPrimario?: string;
  plan?: Plan;
  activo?: boolean;
  representanteLegal?: string;
  notariaEscritura?: string;
  numeroEscritura?: string;
  fechaEscritura?: string;
  matriculaInmobiliaria?: string;
  totalUnidades?: number;
}

// ===========================================================================
// Notificaciones
// ===========================================================================

export interface NotificacionDto {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  createdAt: string;
}

export interface MarkReadRequest {
  ids?: string[];
}

export interface MarkReadResponse {
  updated: number;
}

export interface PushSubscribeRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushUnsubscribeRequest {
  endpoint: string;
}

export interface PushSubscriptionDto {
  id: string;
  endpoint: string;
  createdAt: string;
}

// ===========================================================================
// Comunicaciones (Anuncios + Directorio)
// ===========================================================================

export interface AnuncioDto {
  id: string;
  titulo: string;
  contenido: string;
  tipo: TipoAnuncio;
  imagenUrl: string | null;
  archivosUrl: string[];
  fijado: boolean;
  publicadoEn: string;
  expiresEn: string | null;
  vistas: number;
}

export interface CreateAnuncioRequest {
  titulo: string;
  contenido: string;
  tipo: TipoAnuncio;
  imagenUrl?: string;
  archivosUrl?: string[];
  fijado?: boolean;
  expiresEn?: string;
}

export interface DeleteAnuncioResponse {
  deleted: number;
}

export interface DirectorioEntradaDto {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
  telefono: string | null;
}

// ===========================================================================
// Pagos
// ===========================================================================

export interface PagoDto {
  id: string;
  unidadId: string;
  concepto: string;
  /** Money serialized as string. */
  monto: string;
  estado: EstadoPago;
  metodo: MetodoPago | null;
  fechaVencimiento: string;
  fechaPago: string | null;
  comprobante: string | null;
  createdAt: string;
}

export interface ReciboDto {
  id: string;
  unidadId: string;
  servicio: string;
  empresa: string;
  periodo: string;
  /** Money serialized as string. */
  monto: string;
  vencimiento: string;
  urlRecibo: string | null;
  pagado: boolean;
  fechaPago: string | null;
  createdAt: string;
}

export interface PagosResponse {
  pagos: PagoDto[];
  recibos: ReciboDto[];
}

export interface PagarRequest {
  metodo: MetodoPago;
}

// ===========================================================================
// Reservas
// ===========================================================================

export interface AreaComunDto {
  id: string;
  nombre: string;
  descripcion: string | null;
  capacidadMax: number;
  imagenUrl: string | null;
  requiereDeposito: boolean;
  /** Decimal serialized as string. */
  depositoMonto: string | null;
  horaApertura: string;
  horaCierre: string;
  diasDisponibles: string;
  duracionSlot: number;
  activa: boolean;
}

export interface SlotDto {
  fechaInicio: string;
  fechaFin: string;
}

export interface ReservaDto {
  id: string;
  areaId: string;
  fechaInicio: string;
  fechaFin: string;
  estado: EstadoReserva;
  notas: string | null;
  createdAt: string;
  areaNombre: string;
  areaImagenUrl: string | null;
}

export interface CreateReservaRequest {
  areaId: string;
  fechaInicio: string;
  fechaFin: string;
  notas?: string;
}

// ===========================================================================
// Tramites
// ===========================================================================

export interface DocumentoAdjuntoDto {
  nombre: string;
  mimeType: string;
  base64: string;
}

export interface SolicitanteRefDto {
  nombre: string;
  torre: string | null;
  apto: string | null;
}

export interface TramiteDto {
  id: string;
  usuarioId: string;
  tipo: TipoTramite;
  estado: EstadoTramite;
  payload: Record<string, unknown>;
  documentos: DocumentoAdjuntoDto[];
  observacionAdmin: string | null;
  aprobadoPorId: string | null;
  fechaRespuesta: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TramiteConSolicitanteDto extends TramiteDto {
  solicitante: SolicitanteRefDto;
}

export interface CreateTramiteRequest {
  tipo: TipoTramite;
  payload: Record<string, unknown>;
  documentos?: DocumentoAdjuntoDto[];
}

export interface ResolverTramiteRequest {
  decision: DecisionTramite;
  observacion?: string;
}

export interface VehiculoPayload {
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
  tipo: TipoVehiculo;
}

export interface MascotaPayload {
  nombre: string;
  tipo: TipoMascota;
  raza?: string;
}

// ===========================================================================
// Vigilancia (Visitas + Paquetes)
// ===========================================================================

export interface ResidenteRefDto {
  nombre: string;
  torre: string | null;
  apto: string | null;
}

export interface VisitaDto {
  id: string;
  usuarioId: string;
  nombre: string;
  tipo: TipoVisita;
  vehiculoTipo: TipoVehiculoVisita | null;
  placa: string | null;
  fecha: string;
  tieneParqueadero: boolean;
  observacion: string | null;
  createdAt: string;
  documento: string | null;
  estado: EstadoVisita;
}

export type EstadoVisita = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface VisitaVigilanciaDto extends VisitaDto {
  residente: ResidenteRefDto;
}

export interface CreateVisitaVigilanciaRequest {
  usuarioId: string;
  nombre: string;
  documento?: string;
  tipo: TipoVisita;
  vehiculoTipo?: TipoVehiculoVisita;
  placa?: string;
  tieneParqueadero?: boolean;
  observacion?: string;
  fecha?: string;
}

export interface CreateVisitaResidenteRequest {
  nombre: string;
  tipo: TipoVisita;
  vehiculoTipo?: TipoVehiculoVisita;
  placa?: string;
  tieneParqueadero?: boolean;
  observacion?: string;
  fecha?: string;
}

export interface PaqueteDto {
  id: string;
  usuarioId: string;
  descripcion: string;
  remitente: string;
  estado: EstadoPaquete;
  fechaLlegada: string;
  entregadoEn: string | null;
}

export interface PaqueteVigilanciaDto extends PaqueteDto {
  residente: ResidenteRefDto;
}

export interface CreatePaqueteRequest {
  usuarioId: string;
  descripcion: string;
  remitente: string;
}

export interface VigilanciaStatsDto {
  visitasHoy: number;
  paquetesPendientes: number;
  totalResidentes: number;
}

export interface ComunicacionesVigilanciaDto {
  visitas: VisitaDto[];
  paquetes: PaqueteDto[];
}

// ===========================================================================
// Parqueadero
// ===========================================================================

export interface VehiculoDto {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  tipo: TipoVehiculo;
  createdAt: string;
}

export interface CreateVehiculoRequest {
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
  tipo: TipoVehiculo;
}

export interface CeldaDto {
  id: string;
  numero: string;
  torre: string | null;
  tipo: TipoCeldaParqueadero;
  estado: EstadoParqueadero;
  usuarioId: string | null;
  createdAt: string;
}

export interface OcupanteDto {
  nombre: string;
  torre: string | null;
  apto: string | null;
}

export interface CeldaMapaDto extends CeldaDto {
  ocupante: OcupanteDto | null;
}

export interface UpdateCeldaRequest {
  estado: EstadoParqueadero;
}

export interface ParqueaderoMioDto {
  vehiculos: VehiculoDto[];
  celdas: CeldaDto[];
}

export interface RegistroDto {
  id: string;
  parqueaderoId: string;
  usuarioId: string;
  tipo: TipoRegistroParqueadero;
  placa: string | null;
  observacion: string | null;
  fecha: string;
  celdaNumero: string;
  celdaTipo: TipoCeldaParqueadero;
  usuarioNombre: string;
}

export interface HallazgoDto {
  descripcion: string;
  celda: string | null;
}

export interface RondaDto {
  id: string;
  usuarioId: string;
  fecha: string;
  hallazgos: HallazgoDto[];
  completada: boolean;
}

export interface CreateRondaRequest {
  hallazgos?: HallazgoDto[];
  completada: boolean;
}

export interface ParqueaderoStatsDto {
  total: number;
  ocupados: number;
  libres: number;
  porcentajeOcupacion: number;
}

// ===========================================================================
// Inmuebles (Inmobiliaria)
// ===========================================================================

export interface InmuebleDto {
  id: string;
  usuarioId: string;
  titulo: string;
  descripcion: string;
  /** Money serialized as string. */
  precio: string;
  tipoNegocio: TipoNegocio;
  tipoUnidad: TipoUnidad;
  habitaciones: number;
  banos: number;
  /** m2 serialized as string. */
  area: string | null;
  imagenes: string[];
  caracteristicas: string[];
  estado: EstadoInmueble;
  destacado: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInmuebleRequest {
  titulo: string;
  descripcion: string;
  /** Money as string-decimal. */
  precio: string;
  tipoNegocio: TipoNegocio;
  tipoUnidad: TipoUnidad;
  habitaciones?: number;
  banos?: number;
  area?: string;
  imagenes?: string[];
  caracteristicas?: string[];
}

// ===========================================================================
// Clasificados
// ===========================================================================

export interface PropietarioRefDto {
  nombre: string;
  telefono: string | null;
}

export interface ClasificadoDto {
  id: string;
  nombre: string;
  categoria: CatLocal;
  descripcion: string | null;
  /** Money serialized as string. */
  precio: string | null;
  imagenUrl: string | null;
  activo: boolean;
  telefono: string | null;
  whatsapp: string | null;
  propietarioId: string | null;
  createdAt: string;
  propietario: PropietarioRefDto | null;
}

export interface CreateClasificadoRequest {
  nombre: string;
  categoria: CatLocal;
  descripcion?: string;
  precio?: string;
  imagenUrl?: string;
  telefono?: string;
  whatsapp?: string;
}

// ===========================================================================
// Solicitudes (PQR / Servicios)
// ===========================================================================

export interface SolicitudDto {
  id: string;
  usuarioId: string;
  categoria: CatServicio;
  tipo: TipoPqr;
  descripcion: string;
  urgente: boolean;
  imagenes: string[];
  estado: EstadoSolicitud;
  proveedorId: string | null;
  prioridad: PrioridadTicket;
  slaHoras: number;
  slaVencimiento: string | null;
  asignadoAId: string | null;
  fechaAsignacion: string | null;
  fechaResolucion: string | null;
  fechaCierre: string | null;
  createdAt: string;
}

export interface CreateSolicitudRequest {
  categoria: CatServicio;
  tipo?: TipoPqr;
  descripcion: string;
  urgente?: boolean;
  imagenes?: string[];
  prioridad?: PrioridadTicket;
}

export interface UpdateTicketRequest {
  estado?: EstadoSolicitud;
  proveedorId?: string;
  asignadoAId?: string;
  prioridad?: PrioridadTicket;
}

export interface TicketStatsDto {
  total: number;
  abiertos: number;
  asignados: number;
  enProgreso: number;
  resueltos: number;
  cerrados: number;
  slaVencidos: number;
  tiempoPromedioResolucionHoras: number;
}

export interface TicketComentarioDto {
  id: string;
  ticketId: string;
  usuarioId: string;
  contenido: string;
  createdAt: string;
}

export interface TicketTransicionDto {
  id: string;
  ticketId: string;
  estadoAnterior: string;
  estadoNuevo: string;
  usuarioId: string;
  createdAt: string;
}

// ===========================================================================
// Chat
// ===========================================================================

export interface ChatMensajeDto {
  id: string;
  mensaje: string;
  audioUrl: string | null;
  transcripcion: string | null;
  esDeAdmin: boolean;
  leido: boolean;
  createdAt: string;
}

export interface CreateChatRequest {
  mensaje?: string;
  audioBase64?: string;
  transcripcion?: string;
}

export interface AdminChatRequest {
  mensaje?: string;
  audioUrl?: string;
  /** Base64-encoded audio; backend uploads and stores the resulting URL. */
  audioBase64?: string;
  transcripcion?: string;
}

export interface ChatConversacionDto {
  usuarioId: string;
  ultimoMensaje: string;
  ultimoTimestamp: string;
  noLeidos: number;
  residente: ResidenteResumenDto;
}

export interface ResidenteResumenDto {
  nombre: string;
  avatar: string | null;
  torre: string | null;
  apto: string | null;
}

export interface AdminChatThreadDto {
  mensajes: ChatMensajeDto[];
  residentInfo: ResidentInfoDto;
}

export interface ResidentInfoDto {
  profile: ResidenteProfileDto | null;
  vehicles: VehiculoResumenDto[];
  pets: MascotaResumenDto[];
}

export interface ResidenteProfileDto {
  id: string;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  torre: string | null;
  apto: string | null;
  telefono: string | null;
}

export interface VehiculoResumenDto {
  placa: string;
  tipo: string;
  marca: string | null;
}

export interface MascotaResumenDto {
  nombre: string;
  tipo: string;
  raza: string | null;
}

// ===========================================================================
// Admin Stats
// ===========================================================================

export interface AdminStatsDto {
  /** Money serialized as string. */
  recaudoMes: string;
  reservasPendientes: number;
}

// ===========================================================================
// LiveKit (Asamblea video)
// ===========================================================================

export interface LiveKitTokenDto {
  token: string;
  url: string;
}

// ===========================================================================
// Pases Temporales (AirBnB / Alquiler Corto)
// ===========================================================================

export interface PaseTemporalDto {
  id: string;
  nombre_anfitrion: string;
  nombre_huesped: string;
  email_huesped?: string;
  telefono_huesped?: string;
  codigo_acceso: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string;    // YYYY-MM-DD
  permiso_gimnasio: boolean;
  permiso_piscina: boolean;
  permiso_entrada_salida: boolean;
  permiso_vehiculo: boolean;
  permiso_asamblea: boolean;
  estado: "ACTIVO" | "EXPIRADO" | "REVOCADO";
  created_at: string;
  usuario_id?: string;
  vehiculos: VehiculoTemporalDto[];
}

export interface VehiculoTemporalDto {
  id: string;
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
}

export interface CrearPaseTemporalRequest {
  unidad_id: string;
  nombre_anfitrion: string;
  nombre_huesped: string;
  email_huesped?: string;
  telefono_huesped?: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string;    // YYYY-MM-DD
  permiso_gimnasio: boolean;
  permiso_piscina: boolean;
  permiso_entrada_salida: boolean;
  permiso_vehiculo: boolean;
  permiso_asamblea: boolean;
  vehiculos?: VehiculoTemporalInput[];
}

export interface VehiculoTemporalInput {
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
}

export interface ValidacionPaseDto {
  valido: boolean;
  nombre_huesped: string;
  unidad: string;
  dias_restantes: number;
  permisos: PermisosDto;
  vehiculos: VehiculoTemporalDto[];
  motivo?: string;
}

export interface PermisosDto {
  gimnasio: boolean;
  piscina: boolean;
  entrada_salida: boolean;
  vehiculo: boolean;
  asamblea: boolean;
}

// ===========================================================================
// Comité de Convivencia
// ===========================================================================

export type TipoCasoConvivencia =
  | 'RUIDO'
  | 'MASCOTAS'
  | 'OLORES'
  | 'PARQUEADERO'
  | 'BASURAS'
  | 'OBRAS'
  | 'AMENAZAS'
  | 'OTRO';

export type EstadoCasoConvivencia =
  | 'REPORTADO'
  | 'EN_MEDIACION'
  | 'RESUELTO'
  | 'ESCALADO'
  | 'ARCHIVADO';

export interface UnidadEmbedDto {
  id: string;
  torre?: string | null;
  numero: string;
  nombre_residente?: string | null;
}

export interface CreadorEmbedDto {
  id: string;
  nombre: string;
}

export interface CasoConvivenciaDto {
  id: string;
  tipo: TipoCasoConvivencia;
  descripcion: string;
  unidad_reporta: UnidadEmbedDto;
  unidad_reportada: UnidadEmbedDto | null;
  creado_por: CreadorEmbedDto;
  estado: EstadoCasoConvivencia;
  resolucion: string | null;
  fecha_mediacion: string | null;
  acta_reunion: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatsConvivenciaDto {
  total: number;
  reportados: number;
  en_mediacion: number;
  resueltos: number;
  escalados: number;
}

export interface CrearCasoConvivenciaRequest {
  tipo: TipoCasoConvivencia;
  descripcion: string;
  unidad_reporta_id: string;
  unidad_reportada_id?: string;
}

export interface ActualizarCasoConvivenciaRequest {
  estado?: EstadoCasoConvivencia;
  resolucion?: string;
  fecha_mediacion?: string;
  acta_reunion?: string;
}

// ===========================================================================
// Analytics (demografía)
// ===========================================================================

export interface ConteoRolDto {
  rol: string;
  cantidad: number;
}

export interface ConteoTorreDto {
  torre: string;
  cantidad: number;
}

export interface DemografiaDto {
  totalUnidades: number;
  totalUsuarios: number;
  porRol: ConteoRolDto[];
  porTorre: ConteoTorreDto[];
  nuevosEsteMes: number;
  activos30d: number;
}

// ===========================================================================
// Ad Spaces (publicidad)
// ===========================================================================

export interface AdSpaceDto {
  id: string;
  nombre: string;
  posicion: "FEED_TOP" | "FEED_MID" | "FEED_BOTTOM";
  imagenUrl: string | null;
  linkUrl: string | null;
  activo: boolean;
  empresa: string | null;
  inicioEn: string;
  finEn: string;
  impresiones: number;
  clics: number;
}

export interface AdSpaceFeedDto {
  id: string;
  nombre: string;
  posicion: string;
  imagenUrl: string | null;
  linkUrl: string | null;
  empresa: string | null;
}

export interface CreateAdSpaceRequest {
  nombre: string;
  posicion: string;
  imagenUrl?: string;
  linkUrl?: string;
  empresa?: string;
  inicioEn: string;
  finEn: string;
}

export interface UpdateAdSpaceRequest {
  nombre?: string;
  posicion?: string;
  imagenUrl?: string;
  linkUrl?: string;
  activo?: boolean;
  empresa?: string;
  inicioEn?: string;
  finEn?: string;
}


# 009 — Solicitudes (PQRS) & Trámites

Status: **implemented+tested** (M5a).

## Purpose

Replaces `/api/user/solicitudes` (GET own/admin-all, POST + notify admins), `/api/user/tramites`
(POST), `/api/tramites` (GET role-filtered), `/api/tramites/aprobar` (PUT resolver).

## Endpoints — Solicitudes

### `GET /api/v1/solicitudes`
- **Auth**: any authenticated user.
- **Logic**: latest 50 PQRS. ADMINISTRADOR/CONCEJO see all of their conjunto; other roles see only their own.
- **Response**: `SolicitudDto[]` (id, conjuntoId, usuarioId, categoria, tipo, descripcion, urgente, imagenes, estado, creadoEn).

### `POST /api/v1/solicitudes`
- **Auth**: any authenticated user.
- **Body**: `{ categoria: CategoriaPqr, tipo?: TipoPqr, descripcion: string, urgente?: bool, imagenes?: string[] }`.
- **Logic**: creates the solicitud in estado ABIERTA. Notifies every ADMINISTRADOR of the conjunto in the same transaction.
- **Validation**: descripcion must be non-empty after trim.
- **Response**: the created `SolicitudDto`.

## Endpoints — Trámites

### `GET /api/v1/tramites`
- **Auth**: any authenticated user.
- **Logic**: latest 50 trámites with solicitante info (nombre, email, torre, apto). ADMINISTRADOR/CONCEJO see all; other roles see their own.
- **Response**: `TramiteConSolicitanteDto[]` — each entry contains tramite fields + solicitante profile.

### `POST /api/v1/tramites`
- **Auth**: any authenticated user.
- **Body**: `{ tipo: TipoTramite, payload: object, documentos?: object[] }`.
- **Logic**: creates the trámite in estado PENDIENTE. Notifies every ADMINISTRADOR in the same transaction.
- **Validation**: payload must be a JSON object (not array/primitive).
- **Response**: the created `TramiteDto`.

### `PUT /api/v1/tramites/{id}/resolver`
- **Auth**: ADMINISTRADOR only.
- **Body**: `{ decision: "APROBADO" | "RECHAZADO", observacion?: string }`.
- **Logic** (single transaction):
  1. Finds the trámite scoped to the caller's conjunto; 404 if not found (Law 2).
  2. If already resolved → 409.
  3. If APROBADO:
     - VEHICULO tipo → deserialize payload as `VehiculoPayload { placa, marca?, tipo }`, insert into `vehiculos` (placa normalized to uppercase). Duplicate placa → 409 (entire tx rolls back).
     - MASCOTA tipo → deserialize payload as `MascotaPayload { nombre, tipo, raza? }`, insert into `mascotas`.
     - If payload doesn't match the expected shape → 422.
  4. Notify the requester: APROBACION or RECHAZO tipo notification with the observacion.
  5. Update the trámite: estado, resuelto_por, observacion_admin, fecha_respuesta.
- **Response**: the updated `TramiteDto`.

## Enums

- `CategoriaPqr`: PLOMERIA, ELECTRICIDAD, ASCENSOR, ZONAS_COMUNES, SEGURIDAD, CONVIVENCIA, OTRO.
- `TipoPqr`: MANTENIMIENTO, CONVIVENCIA, SEGURIDAD, FINANCIERO, OTRO.
- `EstadoSolicitud`: ABIERTA, EN_PROCESO, CERRADA.
- `TipoTramite`: VEHICULO, MASCOTA, MUDANZA, REMODELACION, OTRO.
- `EstadoTramite`: PENDIENTE, APROBADO, RECHAZADO.

## Invariants

- Resolver side-effects (insert vehiculo/mascota + notification + status update) are a single DB transaction (Law 7).
- Duplicate placa on approval → 409 + full rollback, trámite stays PENDIENTE.
- Resolving an already-resolved trámite → 409 (idempotency guard).
- Tenant isolation: cross-conjunto id probes → 404 (Law 2).

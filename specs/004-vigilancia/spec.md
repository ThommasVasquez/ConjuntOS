# 004 — Vigilancia: visitas, paquetes, stats, comunicaciones

> IMPLEMENTED (M4) — `backend/api/src/domains/vigilancia/`.

## Purpose
Gate operations. Replaces `/api/vigilancia/visitas`, `/api/vigilancia/paquetes`,
`/api/vigilancia/stats`, `/api/user/paquetes`, `/api/user/comunicaciones`.

## Roles
Gate surface (`/vigilancia/*`): VIGILANTE, SUPERVISOR_VIGILANCIA, ADMINISTRADOR.
Resident surface (`/visitas`, `/paquetes/mios`, `/comunicaciones`): any authenticated user,
own data only.

## Surface (implemented)
- `GET /api/v1/vigilancia/visitas` → today's visits (UTC day window on `fecha`),
  conjunto-wide, newest first. Each item: VisitaDto fields flattened +
  `residente: { nombre, torre, apto }`.
- `POST /api/v1/vigilancia/visitas`
  body `{ usuarioId, nombre, tipo: PEATONAL|VEHICULAR, vehiculoTipo?: CARRO|MOTO|NINGUNO,
  placa?, tieneParqueadero?, observacion?, fecha? (default now) }`.
  `usuarioId` must belong to the caller's conjunto → 404 otherwise (Law 2).
- `POST /api/v1/visitas` → resident schedules an own visit (same body minus `usuarioId`).
- `GET /api/v1/vigilancia/paquetes` → latest 50 conjunto-wide (all estados) +
  `residente` join.
- `POST /api/v1/vigilancia/paquetes` body `{ usuarioId, descripcion, remitente }` →
  estado `EN_PORTERIA`; in the SAME transaction creates a `PAQUETE` notification for the
  recipient via `create_notificacion`.
- `PUT /api/v1/vigilancia/paquetes/{id}/entregar` → estado `ENTREGADO`,
  `entregadoEn = now()`. 404 if the package is not in the caller's conjunto.
- `GET /api/v1/vigilancia/stats` → `{ visitasHoy, paquetesPendientes, totalResidentes }`
  (residents = activo usuarios with rol ARRENDATARIO|PROPIETARIO).
- `GET /api/v1/paquetes/mios` → own packages with estado `EN_PORTERIA`.
- `GET /api/v1/comunicaciones` → `{ visitas: own latest 20, paquetes: own EN_PORTERIA latest 20 }`.
  (Legacy `parqueadero` availability blob dropped — lives under /parqueadero/* now.)

## DTOs
VisitaDto `{ id, usuarioId, nombre, tipo, vehiculoTipo, placa, fecha, tieneParqueadero,
observacion, createdAt }`; PaqueteDto `{ id, usuarioId, descripcion, remitente, estado,
fechaLlegada, entregadoEn }`.

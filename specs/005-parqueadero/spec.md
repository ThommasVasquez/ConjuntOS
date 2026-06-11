# 005 — Parqueadero: mapa, registros, rondas, stats, vehiculos

> IMPLEMENTED (M4) — `backend/api/src/domains/parqueadero/`.

## Purpose
Parking management. Replaces `/api/user/parqueadero`, `/api/parqueadero/mapa`,
`/api/parqueadero/registros`, `/api/parqueadero/rondas`, `/api/parqueadero/stats`.

## Roles
- Managers (`mapa`, `celdas/{id}`, `stats`): ENCARGADO_PARQUEADERO, SUPERVISOR_VIGILANCIA,
  ADMINISTRADOR.
- `registros`: managers + VIGILANTE (VIGILANTE sees only own rows).
- `rondas` POST: ENCARGADO_PARQUEADERO, VIGILANTE, SUPERVISOR_VIGILANCIA;
  GET: any authenticated (own latest round today).
- `parqueadero/mio`, `vehiculos`: any authenticated user (own data).

## Surface (implemented)
- `GET /api/v1/parqueadero/mio` → `{ vehiculos: [VehiculoDto], celdas: [CeldaDto] }`
  (own vehicles + permanently assigned cells).
- `POST /api/v1/vehiculos` body `{ placa, marca?, modelo?, color?, tipo: CARRO|MOTO }`.
  Placa is upper-cased; duplicate placa → 409 (UNIQUE).
- `GET /api/v1/parqueadero/mapa` → all cells of the conjunto ordered by numero, each
  CeldaDto flattened + `ocupante: { nombre, torre, apto } | null` (left join usuarios).
- `PUT /api/v1/parqueadero/celdas/{id}` body `{ estado: DISPONIBLE|OCUPADO|RESERVADO }` →
  updates the cell AND inserts a `registros_parqueadero` audit row
  (tipo `VERIFICACION`, observacion `"cambio estado X->Y"`) in ONE transaction.
- `GET /api/v1/parqueadero/registros` → latest 50:
  `{ id, parqueaderoId, usuarioId, tipo, placa, observacion, fecha, celdaNumero,
  celdaTipo, usuarioNombre }`.
- `GET /api/v1/parqueadero/rondas` → today's latest OWN round or `null`:
  `{ id, usuarioId, fecha, hallazgos: [{ descripcion, celda? }], completada }`.
- `POST /api/v1/parqueadero/rondas` body `{ hallazgos: [{ descripcion, celda? }], completada }`
  (hallazgos validated serde types → jsonb, Law 6).
- `GET /api/v1/parqueadero/stats` → `{ total, ocupados, libres, porcentajeOcupacion }`.

## Notes
- Celda tipo RESIDENTE|VISITANTE|DISCAPACITADO; cell creation/assignment is admin tooling
  out of M4 scope (cells seeded via migrator/demo seed).

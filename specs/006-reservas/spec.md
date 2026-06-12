# 006 — Reservas & áreas comunes

Status: **implemented+tested** (M4) — areas-comunes, slots, reservas with GiST no-overlap constraint (409). Test passing.

> IMPLEMENTED (M4) — `backend/api/src/domains/reservas/`.

## Purpose
Amenity bookings. Replaces `/api/user/reservas`, `/api/user/reservas/areas`,
`/api/user/reservas/slots`.

## Surface (implemented)
- `GET /api/v1/areas-comunes` → active areas of the caller's conjunto:
  `{ id, nombre, descripcion, capacidadMax, imagenUrl, requiereDeposito,
  depositoMonto (string|null), horaApertura, horaCierre, diasDisponibles, duracionSlot,
  activa }`.
- `GET /api/v1/areas-comunes/{id}/slots?fecha=YYYY-MM-DD` → occupied pairs
  `[{ fechaInicio, fechaFin }]` from non-CANCELADA reservas starting that UTC day.
  404 if the area is not in the caller's conjunto.
- `GET /api/v1/reservas` → own reservas with `fechaFin >= now`, ordered by fechaInicio asc:
  `{ id, areaId, fechaInicio, fechaFin, estado, notas, createdAt, areaNombre,
  areaImagenUrl }`.
- `POST /api/v1/reservas` body `{ areaId, fechaInicio, fechaFin, notas? }`:
  - 400 if `fechaInicio >= fechaFin`.
  - 404 if the area is not active in the caller's conjunto.
  - 409 on overlap with any non-CANCELADA reserva (`inicio < fin' && fin > inicio'`),
    checked inside the same transaction as the insert.
  - estado = `PENDIENTE` if `area.requiereDeposito` else `CONFIRMADA`.

## Notes
- Legacy auto-seeded demo areas when empty — DROPPED (Law 4); seed via
  `enconjunto-migrate --seed-demo`.
- Deposit/pago linkage (`pago_id`) carried in schema, not exercised in M4.

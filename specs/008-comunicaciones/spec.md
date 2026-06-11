# 008 — Comunicaciones: anuncios, directorio

Status: **implemented+tested** (M5a).

## Purpose

Replaces `/api/user/anuncios` (GET, POST admin, DELETE admin) and `/api/user/directory`
(GET residents of same conjunto, Habeas-Data-limited fields).

## Endpoints

### `GET /api/v1/anuncios`
- **Auth**: any authenticated user.
- **Logic**: returns latest 50 announcements of the caller's conjunto, ordered pinned-first then newest.
- **Response**: `AnuncioDto[]` (id, titulo, contenido, tipo, imagenUrl, archivosUrl, fijado, publicadoEn, expiresEn, vistas).
- **camelCase JSON** (Law 6).

### `POST /api/v1/anuncios`
- **Auth**: ADMINISTRADOR or CONCEJO.
- **Body**: `{ titulo, contenido, tipo: TipoAnuncio, imagenUrl?, archivosUrl?: string[], fijado?: bool, expiresEn?: DateTime }`.
- **Logic**: inserts anuncio, then fans out one INFO notification to every active resident (PROPIETARIO/ARRENDATARIO) of the conjunto — all in one transaction.
- **Validation**: titulo and contenido must be non-empty after trim.
- **Response**: the created `AnuncioDto`.

### `DELETE /api/v1/anuncios/{id}`
- **Auth**: ADMINISTRADOR or CONCEJO.
- **Logic**: deletes the anuncio if it belongs to the caller's conjunto; returns 404 otherwise (Law 2 — no cross-tenant probe).
- **Response**: `{ deleted: 1 }` or 404.

### `GET /api/v1/directorio`
- **Auth**: ADMINISTRADOR, CONCEJO, VIGILANTE, SUPERVISOR_VIGILANCIA.
- **Logic**: returns active residents (PROPIETARIO/ARRENDATARIO, activo=true) of the conjunto, sorted by torre then apto.
- **Habeas Data**: only exposes id, nombre, torre, apto, telefono — no email, avatar, or other PII.
- **Response**: `DirectorioEntradaDto[]`.

## Enums

- `TipoAnuncio`: GENERAL, MANTENIMIENTO, SEGURIDAD, EVENTO, FINANCIERO.

## Invariants

- Notification fan-out is transactional with the anuncio insert (Law 7).
- Tenant isolation on all queries (Law 2).
- Residents cannot publish or delete announcements (Law 3).

# 000 — Foundation

Status: **implemented** — `/api/v1` base, `/healthz`, RFC-7807 errors, CORS, timeout, panic-catch, graceful shutdown all live.

## Purpose

Cross-cutting requirements every domain inherits: API conventions, auth model, tenancy,
error format, pagination, and the workspace skeleton they run on.

## Actors & roles

All roles (see `specs/glossary.md`). Role enum (legacy string values preserved):
`ARRENDATARIO, PROPIETARIO, ADMINISTRADOR, CONCEJO, VIGILANTE, SUPERVISOR_VIGILANCIA,
ENCARGADO_PARQUEADERO, SUPER_ADMIN`.

## Current behavior being replaced

- ~54 Next.js edge API routes under `src/app/api/**` with a 3-layer fallback
  (Prisma → Supabase REST → mock data). Mock fallbacks are dropped (Constitution Law 4).
- next-auth v5 JWT sessions with plaintext password comparison (`src/auth.ts`).
- Tenancy via subdomain → `x-tenant-id` header (`middleware.ts`).

## New API surface conventions

- Base path `/api/v1`. Health: `GET /healthz` (no auth, returns `{"status":"ok"}` + DB ping).
- Auth: `ec_session` httpOnly cookie or `Authorization: Bearer <jwt>`.
- JSON bodies camelCase. IDs are UUID strings.
- Errors: RFC-7807 `application/problem+json`:
  ```json
  { "type": "about:blank", "title": "Forbidden", "status": 403, "detail": "...", "instance": "/api/v1/..." }
  ```
- List endpoints accept `?limit=` (default 20, max 100) and `?before=<created_at cursor>`
  where the legacy route paginated or capped results; otherwise return the same bounded sets
  the legacy routes returned (documented per domain).
- Money/coefficients serialize as JSON strings (`"125000.00"`).
- Timestamps serialize as RFC-3339 UTC.

## Out of scope

- WebSocket/SSE realtime (asamblea keeps REST polling semantics in v1).
- Payment-gateway integration (Wompi ref column carried over, no gateway calls).

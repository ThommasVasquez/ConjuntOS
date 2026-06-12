# 002 — Core entities: conjuntos, usuarios, unidades, superadmin, profile

Status: **implemented+tested** — conjuntos, unidades, usuarios; profile bootstrap test passing.

## Purpose

Tenant root (`conjuntos`), people (`usuarios`), property units (`unidades`), the superadmin
tenant CRUD, user profile management, and admin dashboard stats.

## Legacy routes replaced

- `/api/superadmin/conjuntos` (GET, POST, PUT) — `src/app/api/superadmin/conjuntos/route.ts`
- `/api/user/profile` (GET, PUT), `/api/user/profile-save` (POST) — merged
- `/api/admin/stats` (GET)
- `/api/debug/users` — DROPPED

## New API surface

| Method | Path | Roles | Behavior |
|---|---|---|---|
| GET | `/api/v1/superadmin/conjuntos` | SUPER_ADMIN | List all conjuntos with usage counts. |
| POST | `/api/v1/superadmin/conjuntos` | SUPER_ADMIN | Create; `subdominio` sanitized (lowercase, `[a-z0-9-]`), unique. Ley 675 legal fields optional. |
| PUT | `/api/v1/superadmin/conjuntos/{id}` | SUPER_ADMIN | Update incl. `logoUrl`, `colorPrimario`, legal fields. |
| GET | `/api/v1/usuarios/me/profile` | any | Profile + unidad + vehiculos + mascotas summary. |
| PUT | `/api/v1/usuarios/me/profile` | any | Update nombre, telefono, genero, avatar (reject avatar payloads > 150 KB — legacy threshold), torre/apto (bootstraps `unidad` if missing, matching legacy profile-save). |
| GET | `/api/v1/admin/stats` | ADMINISTRADOR, CONCEJO, SUPER_ADMIN | Recaudo del mes (sum pagos PAGADO in current month), reservas pendientes count. |

## Data model

`conjuntos`, `usuarios`, `unidades` per `specs/000-foundation/data-conventions.md`.
`usuarios.email` globally unique; login resolves conjunto from the user row.

## Edge cases

- Subdominio collision → 409 problem+json.
- Profile PUT must not allow changing `rol`, `email`, or `conjunto_id` (mass-assignment guard:
  explicit DTO fields only).

## Out of scope

User invitation/creation flows for admins (legacy had scripts only); deactivation UI.

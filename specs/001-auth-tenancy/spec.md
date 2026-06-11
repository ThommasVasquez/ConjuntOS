# 001 — Auth & Tenancy

## Purpose

Rust owns authentication: credential login, Argon2id verification, JWT issuance/validation,
role guards, and tenant scoping. Replaces next-auth v5 (`src/auth.ts`, `src/auth.config.ts`)
and the `x-tenant-id` subdomain chain (`middleware.ts`).

## Actors & roles

All authenticated users. `SUPER_ADMIN` has cross-tenant rights only under `/superadmin/*`.

## Current behavior (being replaced)

- `src/auth.ts`: credentials provider, **plaintext** password compare, email normalization
  (`thommy` → `thommy@example.com`), hardcoded demo users (thommy@example.com SUPER_ADMIN,
  milo@enconjunto.com ADMINISTRADOR, admin@example.com ADMINISTRADOR), JWT strategy 30 days,
  callbacks copy `id`/`role`/`conjuntoId` into the token/session.
- `src/app/api/auth/login/route.ts`: edge-safe fallback login.
- Demo users move to `enconjunto-migrate --seed-demo` (Argon2 hashes). Email shorthand
  normalization is dropped — login requires the full email.

## New API surface

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/api/v1/auth/login` | none | Body `{email, password}`. Argon2 verify against `usuarios.password_hash`. 200: sets `ec_session` cookie (httpOnly, Secure, SameSite per env) + returns `{user}` and `{token}` (Bearer fallback). 401 on bad credentials (same message for unknown email vs wrong password). 403 if `activo=false`. Response includes `mustChangePassword`. |
| GET | `/api/v1/auth/me` | required | Returns current user (id, nombre, email, rol, conjuntoId, unidadId, avatar, torre, apto, genero, mustChangePassword). |
| POST | `/api/v1/auth/logout` | required | Clears the cookie. |
| PUT | `/api/v1/auth/password` | required | `{currentPassword, newPassword}`; re-verify, re-hash, clear `must_change_password`. |

## JWT

HS256 with `JWT_SECRET`. Claims: `sub` (user uuid), `conjunto_id`, `rol`, `nombre`, `iat`,
`exp` (now + 30d). Extractor order: `Authorization: Bearer` → `ec_session` cookie.

## Tenancy

- `AuthUser { id, conjunto_id, rol }` extractor; 401 problem+json when missing/invalid.
- Repo functions filter by `conjunto_id` (Constitution Law 2).
- Subdomain handling stays in the Next.js frontend for branding only.

## Edge cases

- Migrated users with unusable hashes → 401 + frontend "reset required" flow (mustChangePassword
  surfaces after admin resets a temp password; v1 has no self-service email reset — out of scope).
- Token for a deactivated user (`activo=false`): extractor does NOT hit the DB per request;
  deactivation takes effect on next login. Admin-initiated hard revocation is out of scope v1.

## Out of scope

OAuth providers, refresh tokens, email-based password reset, per-request DB session checks.

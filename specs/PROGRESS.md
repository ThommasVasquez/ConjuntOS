# Migration progress — Rust backend

Last updated: 2026-06-10. Approved plan: `~/.claude/plans/majestic-wondering-thacker.md`.
Everything below is in the working tree — **nothing committed to git yet**.

## Verification state

```bash
cd backend && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test
```
All green: **65 tests** (22 unit + 7 api_test + 13 m4_test + 12 m5a_test + 9 m5b_test + 2 migrate), clippy 0 warnings.

## Done

### M0 — SDD bootstrap ✅
- `specs/constitution.md` (7 laws), `specs/glossary.md`, `specs/000-foundation/`.
- Full specs: 001–013 (all fleshed out from skeletons).
- `specs/015-frontend-cutover/parity.md` — all 54 legacy routes mapped, all marked implemented+switched or DROPPED.

### M1 — Workspace bootstrap ✅
- `backend/` cargo workspace: `api` (enconjunto-api) + `migrate` (enconjunto-migrate).
- `config.rs`, `error.rs` (RFC-7807 + 503 ServiceUnavailable), `state.rs` (pool + config + push_sender + storage + gemini), tracing, CORS, 2 MiB body limit.
- `/healthz`, `/docs`, `/api/v1/openapi.json`.
- `Dockerfile` (multi-stage, rustls), CI `.github/workflows/backend.yml`.

### M2 — Schema ✅
- 12 Diesel migrations → 31 snake_case/UUID/jsonb tables (including asamblea_subtitulos, asamblea_actas added for M6/M7).
- `diesel migration redo --all` clean on local Postgres 17.
- `api/src/db/schema.rs` generated, `api/src/db/enums.rs`: 33+ enums via `text_enum!`.

### M3 — Auth + tenancy ✅
- Argon2id + JWT (cookie + Bearer), login/me/logout/password, profile, superadmin conjuntos CRUD.

### M4 — Operational domains ✅
- 27 routes: notificaciones, push-subscriptions, vigilancia, parqueadero, reservas, pagos, admin_stats.
- 13 integration tests with tenant isolation.

### M5a — Content domains ✅
- comunicaciones (anuncios + directorio), solicitudes (PQRS), tramites (resolver side-effects), clasificados, inmuebles.
- 12 integration tests.

### M5b — Chat, citofonia, services ✅
- `services/push.rs` (PushSender trait + LogOnly + RecordingPushSender), `services/storage.rs` (StorageService trait + SupabaseStorage + FakeStorage).
- `chat` domain: GET/POST /chat (resident), GET/POST /admin/chat, GET/POST /admin/chat/{usuario_id} (mark-read + resident enrichment).
- `citofonia` domain: POST /citofonia/call-push with 4-pattern peer-ID resolution.
- 9 integration tests (7 peer-ID unit tests + chat tenant isolation + role guards).

### M6 — Asamblea ✅
- 19 handlers across 11 route groups: session (optimistic lock CAS), pairing (Argon2 PIN), votaciones, votos (SHA-256 hash_firma, effective coeficiente with poderes), asistencias (quorum BigDecimal), opiniones, turnos (state machine), poderes.
- All queries filter by conjunto_id (Law 2). Clippy clean.

### M7 — AI services ✅
- `services/gemini.rs` (reqwest → Gemini 2.0-flash, 30s timeout).
- 8 endpoints: copilot, translate (ES short-circuit), consensuar, acta GET/POST (upsert to asamblea_actas), subtitulos GET/POST, search.
- 503 when GEMINI_API_KEY not configured (Law 4 — no mock fallbacks).

### M8 — Data migration binary ✅
- `backend/migrate/`: 8 source files (main, idmap, db, steps, verify, seed, report, legacy).
- 35 migration step functions covering all legacy Prisma models.
- CUID→UUIDv5 deterministic mapping, Argon2 password rehashing, JSON repair, notifPush extraction.
- CLI: `--dry-run`, `--phase <table>`, `--verify`, `--report <csv>`, `--seed-demo`.
- 2 unit tests (idmap).

### M9 — Frontend cutover ✅
- `src/lib/api/client.ts` — centralized `apiFetch` with cookie auth, Bearer fallback, RFC-7807 error parsing.
- `src/lib/api/types.ts` — 769 lines of TypeScript DTOs matching all backend domains.
- `src/hooks/useAuth.ts` — Zustand store replacing SessionProvider.
- `src/components/providers/AuthProvider.tsx` — calls checkAuth() on mount.
- 22 pages rewritten: ~66 raw fetch calls → 108 api client calls.
- `next.config.ts` — rewrites `/api/v1/*` to Rust backend in dev.
- `src/middleware.ts` — cookie-based auth (no next-auth dependency).
- **Deleted**: `src/app/api/` (54 route files), `src/lib/db.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/app/actions/`.
- **Removed deps**: next-auth, @auth/prisma-adapter, @prisma/client, @prisma/adapter-neon, @neondatabase/serverless, pg, @supabase/supabase-js, web-push, @mmmike/web-push, @google/generative-ai.

## Remaining (M10)

### M10 — Go-live ◻
See `specs/M10-RUNBOOK.md` for the operational checklist:
- Final `enconjunto-migrate` run against production
- Flip `NEXT_PUBLIC_API_URL` to production Rust backend
- Smoke test all critical paths
- Soak period (monitor logs + error rates)
- Drop legacy tables after soak
- Rotate Supabase service-role key
- Drop `_migration_id_map` table

## Local environment notes

- Postgres 17: `/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 -l /tmp/enconjunto-pg.log start` (not brew services — restart after reboot).
- DBs: `enconjunto_dev` (migrations), `enconjunto_test` (integration tests).
- Diesel CLI: `~/.cargo/bin/diesel`. Schema regeneration: `DATABASE_URL=postgresql://localhost/enconjunto_dev diesel migration run && diesel print-schema > api/src/db/schema.rs`.

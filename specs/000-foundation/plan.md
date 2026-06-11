# 000 — Foundation plan

1. `backend/` cargo workspace: `api` (Axum binary) + `migrate` (CLI binary).
2. `api` skeleton: `main.rs` (bootstrap), `lib.rs` (`build_router(AppState)` for tests),
   `config.rs` (env-driven; rejects transaction-pooler URLs), `state.rs`, `error.rs`
   (`ApiError` → problem+json), `openapi.rs` (utoipa + `/docs`), `db/mod.rs` (diesel-async +
   deadpool, rustls TLS), `auth/` (jwt, password, extract, guard), `tenancy.rs`.
3. `GET /healthz` with DB ping; tracing-subscriber (env-filter, json in prod).
4. `backend/Dockerfile` multi-stage (rust:slim → debian:bookworm-slim + ca-certificates).
5. CI `.github/workflows/backend.yml`: fmt, clippy -D warnings, test, openapi.json artifact.
6. `backend/.env.example`: `DATABASE_URL` (session pooler), `MIGRATIONS_DATABASE_URL` (direct),
   `JWT_SECRET`, `GEMINI_API_KEY`, `VAPID_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ALLOWED_ORIGINS`, `RUN_MIGRATIONS`.

Module convention per domain: `mod.rs` (router), `models.rs` (Queryable/Insertable),
`dto.rs` (serde + ToSchema), `handlers.rs` (axum + utoipa::path), `repo.rs` (only file
touching `schema.rs`).

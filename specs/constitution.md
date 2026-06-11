# EN-CONJUNTO Backend Constitution

Non-negotiable laws governing the Rust backend (`backend/`) and its migration. Every spec, plan,
and PR is reviewed against this document. Amendments require an explicit decision recorded here.

## Law 1 — Stack invariants

- Rust stable, Axum 0.8, Diesel 2.2 + diesel-async (deadpool pool), Postgres hosted on Supabase.
- Diesel migrations under `backend/migrations/` are the ONLY mechanism for schema change.
  No manual DDL in the Supabase dashboard, no SQL in application code paths.
- The API binary is `enconjunto-api`; the one-time data migrator is `enconjunto-migrate`.

## Law 2 — Tenancy

- Every tenant-owned table carries `conjunto_id uuid NOT NULL REFERENCES conjuntos(id)`.
- Every query in a `repo.rs` filters by `conjunto_id`. Repo functions take `conjunto_id: Uuid`
  as their first parameter.
- The tenant comes from the verified JWT claim — never from a client-supplied body field,
  query param, or the subdomain header. Subdomains are branding/public-route concerns only.
- `SUPER_ADMIN` cross-tenant access exists only under `/api/v1/superadmin/*` behind its guard.

## Law 3 — Auth

- Argon2id only (m=19456 KiB, t=2, p=1). Plaintext or reversible storage is forbidden,
  including for pairing PINs (store `pin_hash`).
- Sessions are JWTs (HS256, 30-day expiry) delivered as an `ec_session` httpOnly Secure cookie,
  with `Authorization: Bearer` accepted as fallback.
- Claims: `sub` (user uuid), `conjunto_id`, `rol`, `nombre`, `iat`, `exp`.
- Role checks happen at the handler boundary via `auth::guard` helpers — explicit and greppable.

## Law 4 — Errors

- No mock-data fallbacks. A failure returns a real error.
- Error format is RFC-7807 `application/problem+json` produced by `error.rs::ApiError`.
- The frontend renders loading/error/empty states; demo data exists only via explicit seeding
  (`enconjunto-migrate --seed-demo`).

## Law 5 — API contract

- Every endpoint is documented with `utoipa` annotations BEFORE its route is merged.
- The exported `openapi.json` is the contract; frontend types are generated from it
  (`openapi-typescript`) and `tsc --noEmit` gates contract drift in CI.
- All routes live under `/api/v1/`. JSON bodies use camelCase field names (matches the
  existing frontend payloads; serde `rename_all = "camelCase"`).

## Law 6 — Data

- UUID primary keys (`gen_random_uuid()`), `timestamptz` timestamps, `NUMERIC` for money and
  coefficients (BigDecimal in Rust, serialized as JSON strings — never floats).
- JSON columns are `jsonb` validated at the boundary by serde types. No stringly-typed JSON.
- Enums are TEXT + CHECK constraints with UPPER_SNAKE Spanish variants (byte-compatible with
  legacy values). Rust-side enums implement ToSql/FromSql via `db/enums.rs`.
- Connection rules: API connects via the Supabase **session pooler** (never the transaction
  pooler, port 6543 — config must refuse it); migrations and the migrator use the direct
  connection (`MIGRATIONS_DATABASE_URL`).

## Law 7 — Testing

- Every endpoint has at least one integration test (testcontainers Postgres + embedded
  migrations) before its route is registered in the router.
- Tenant-isolation tests are parametrized over every list endpoint.
- External services (Gemini, Supabase Storage, web-push) are mocked (`wiremock`, `PushSender`
  trait) — tests never call the network.
- CI: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, OpenAPI export.

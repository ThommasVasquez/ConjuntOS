# 000 — Foundation tasks

- [ ] Cargo workspace `backend/` with `api` + `migrate` members
- [ ] `config.rs` with port-6543 rejection + unit test
- [ ] `error.rs` ApiError → RFC-7807 problem+json + unit test
- [ ] `state.rs` AppState (pool, config, service handles)
- [ ] `db/mod.rs` diesel-async deadpool pool with rustls
- [ ] `/healthz` route + integration test
- [ ] tracing init (env-filter; json formatter behind env flag)
- [ ] `openapi.rs` utoipa doc + swagger-ui at `/docs`
- [ ] Dockerfile (multi-stage, rustls only)
- [ ] `.env.example`
- [ ] CI workflow `.github/workflows/backend.yml`
- [ ] `cargo fmt && cargo clippy -D warnings && cargo test` green

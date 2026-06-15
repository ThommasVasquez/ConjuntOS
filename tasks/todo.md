# TODO — 016 Citofonía LiveKit + TURN (production-ready)

Ref: `tasks/plan.md` · Spec: `specs/016-citofonia-livekit/spec.md`

## Fase A — Fundaciones
- [x] T1 · VAPID keys + env documentados (`DEPLOYMENT_ENV.md`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`)
- [x] T2 · Sanity LiveKit dev (compose `livekit`, devkey/devsecret)

## Fase B — Backend push VAPID
- [x] T3 · `web-push` crate + `WebPushSender` (reqwest rustls) + factory real/`UnconfiguredPushSender` + unit tests (3/3)

## Fase C — Backend endpoints
- [x] T4 · `POST /citofonia/call` (room + token + push + sent real)
- [x] T5 · `GET /citofonia/token?room=` (tenancy del room → 403 cross-tenant)
- [x] T6 · Payload `room` + tests `m5b_test.rs`
- [x] **CP1** · `cargo test` m5b 11/11 verde

## Fase D/E/F — Frontend
- [x] T7 · `CallContext.tsx` → `livekit-client` (audio-only), tonos/UI/voz conservados
- [x] T8 · `sw.js` con `room` + `INCOMING_CALL` (timbre con app abierta) / `ANSWER_CALL`
- [x] T9 · Quitar `peerjs` (package.json + lockfile + 0 refs en src/public)
- [x] **CP2** · `pnpm build` verde, sin peerjs

## Fase G — Docker prod + TURN/TLS
- [x] T10 · `livekit.yaml` prod (TURN embebido TLS + UDP mux 7882)
- [x] T11 · `docker-compose.prod.yml` (TURN 5349, certs, env real VAPID/LIVEKIT)
- [x] T12 · `DEPLOYMENT_ENV.md` (VAPID/LIVEKIT/TURN + runbook) + `FEATURES.md`
- [x] **CP3** · `docker compose ... config` válido

## Fase H — Verificación
- [x] T13 · `cargo check --all-targets` ✅ · push unit 3/3 ✅ · m5b 11/11 ✅ · `pnpm build` ✅ · `graphify update`
- [ ] T14 · E2E manual (audio / push wake / NAT relay) — **requiere host con IP pública + cert TURN; no reproducible en sandbox**
- [~] **CP4** · Todo lo automatizable verde; E2E de TURN/NAT pendiente de entorno real

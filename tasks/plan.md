# Plan — 016 Citofonía sobre LiveKit + TURN (production-ready)

Spec: `specs/016-citofonia-livekit/spec.md`
Decisiones fijadas: LiveKit **self-hosted** · **solo audio** · **reemplazo directo de PeerJS** · push **Web Push VAPID** · **TURN embebido de LiveKit (TLS)** — *no* coturn standalone.

## Decisiones técnicas zanjadas
1. **TURN = embebido de LiveKit sobre TLS** (`turn.enabled` en `livekit.yaml`). Menos ops, ICE-aware, un servicio menos. Requiere dominio + cert TLS reales en prod.
2. **HTTP del push:** usar el crate `web-push` solo para firma VAPID + cifrado del payload, y **enviar con el `reqwest` (rustls) ya presente**. Evita `isahc`/libcurl. El factory `create_push_sender` devuelve el sender real **solo si** `vapid_public_key/private_key/subject` están todas presentes; si no, un stub cuyo `send()` retorna `Err` (nunca `Ok` silencioso).
3. **Modelo de llamada:** sala efímera `citofonia-{conjuntoId}-{uuid}`. El que llama crea la sala y recibe token; el que contesta pide su propio token (`/citofonia/token`), espejando Asamblea (token acuñado para el usuario autenticado, no viaja en el push).

## Grafo de dependencias
```
A (infra/env base) ──► B (push VAPID) ──► C (endpoints call/token) ──► CP1
                                   │
F1 (CallContext LiveKit) ◄── contrato C ──► D (sw.js room) ──► E (quitar peerjs) ──► CP2
C, F ──► G (docker prod + TURN/TLS) ──► CP3 ──► H (verificación + E2E) ──► CP4
```
Backend (B,C) y frontend (D,E,F) comparten solo el **contrato HTTP**, así que F puede desarrollarse contra ese contrato. Infra prod (G) va después de que la lógica funcione en dev (`--dev`).

## Slices verticales (cada tarea = un camino completo + criterio + verificación)

### Fase A — Fundaciones (secretos + LiveKit alcanzable)
- **T1 · VAPID keys + env.** Generar par VAPID (script `web-push generate-vapid-keys` o `openssl`); cargar `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` en `.env` local + `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. `config.rs` ya los lee.
  - *Aceptación:* backend arranca y loguea "push: VAPID enabled" cuando hay keys; "VAPID not configured" cuando no.
  - *Verif.:* `cargo run` arranca; revisar log de boot.
- **T2 · Sanity LiveKit dev.** Confirmar `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=devsecret`, `LIVEKIT_URL=ws://localhost:7880` contra el servicio `livekit` del compose.
  - *Aceptación:* `GET /asambleas/{id}/livekit-token` responde `{token,url}` (sanity, no se modifica).

### Fase B — Backend: push VAPID real
- **T3 · `WebPushSender`.** `Cargo.toml`: añadir `web-push`. En `services/push.rs`: `WebPushSender` (firma VAPID + cifra payload, POST vía `reqwest`); `create_push_sender` real si configurado, stub-que-falla si no. Mapear error de "no configurado" en el handler.
  - *Aceptación:* unit tests: construye request VAPID válida; `send()` ok/err; factory elige real vs stub.
  - *Verif.:* `cargo test -p api push` verde.
- **CP1a** (interno): `cargo build` ok.

### Fase C — Backend: endpoints call + token
- **T4 · `POST /citofonia/call`.** Reemplaza `call_push`. Resuelve targets (reusar `parse_peer_id`/`resolve_targets`), genera `room`, token del llamante (`generate_token`, audio), envía push a targets, responde `{room, token, url, sent}`. `503` si LiveKit no configurado. `sent` = envíos reales.
  - *Aceptación:* con suscripción sembrada → `200 {room,token,url,sent>0}`; sin subs → `sent:0`.
- **T5 · `GET /citofonia/token?room=`.** Verifica `conjuntoId` embebido en `room` == conjunto del usuario; acuña token. Cross-tenant → rechazo (vacío/403).
  - *Aceptación:* mismo conjunto → token; otro conjunto → rechazado.
- **T6 · Payload + tests.** Payload push lleva `room` (no `callerPeerId`). Actualizar `tests/m5b_test.rs` (call → room/token/sent; token cross-tenant; 503).
  - *Verif.:* `cargo test` verde.
- **CP1 — Checkpoint:** backend compila + **todos** los tests pasan.

### Fase D/E/F — Frontend
- **T7 · `CallContext.tsx` → LiveKit.** Quitar `Peer`; usar `Room` de `livekit-client` (audio-only, publicar mic). `startCall` → `POST /citofonia/call` → conectar a `room`. Contestar → `GET /citofonia/token` → conectar. Conservar tonos (Web Audio), UI, estados.
  - *Aceptación:* dos navegadores conectan audio por LiveKit en dev.
- **T8 · `public/sw.js`.** `ANSWER_CALL` lleva `room`; querystring `?answerCall=true&room=...`.
  - *Aceptación:* tocar la notificación abre `/citofonia` y se une a la sala.
- **T9 · Quitar PeerJS.** Eliminar `peerjs` de `package.json`, imports y cualquier `0.peerjs.com`.
  - *Verif.:* `grep -ri peerjs src/ public/ package.json` vacío.
- **CP2 — Checkpoint:** `pnpm build` + typecheck pasan; sin referencias a peerjs.

### Fase G — Docker producción + TURN/TLS
- **T10 · `livekit.yaml` (prod).** keys placeholder, `turn:{ enabled:true, domain, tls_port:5349, cert_file, key_file }`, `rtc:{ use_external_ip:true, udp_port range }`, `port:7880`.
- **T11 · `docker-compose.prod.yml`.** livekit con config montada + puertos UDP (7882 + rango 50000-60000) + TURN 3478/5349 + volumen de certs; backend con env real (VAPID/LIVEKIT). Documentar DNS + Let's Encrypt + firewall UDP.
  - *Verif.:* `docker compose -f docker-compose.prod.yml config` valida.
- **T12 · `DEPLOYMENT_ENV.md`.** VAPID_*, LIVEKIT_* reales, dominio/cert TURN, puertos, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, runbook corto.
- **CP3 — Checkpoint:** compose prod válido + runbook escrito.

### Fase H — Verificación
- **T13 · Gates.** `cargo test` + `pnpm build` (+ `pnpm lint`); `graphify update .`.
- **T14 · E2E manual.** (1) audio con app abierta; (2) app cerrada → push despierta → contesta → audio; (3) tras NAT restrictivo → ICE seleccionado = `relay`. Registrar evidencia.
- **CP4 — Checkpoint:** todo verde + evidencia E2E.

## Riesgos / límites
- **TURN/TLS necesita dominio + cert reales**; la verificación de `relay` tras NAT real **no es reproducible en este sandbox** → se entrega config + runbook; en dev se usan candidatos host/LAN. (Se marcará explícitamente, sin afirmar cobertura que no se probó.)
- **iOS:** Web Push solo en PWA instalada (iOS 16.4+) — constraint conocido, documentar.
- **Secretos nunca al repo** (VAPID private, LiveKit secret, credenciales TURN) — solo placeholders + env.
- No tocar el uso de LiveKit en Asamblea.

# Plan: WebSocket hardening + AI follow-ups

> Source: 43-agent WS coverage review (2026-06-22) cross-referencing backend emitters vs
> frontend subscribers, plus the AI-unification work (`/ai/asistente`, gemini-2.5-flash).
> Flow: this doc (PLAN) → BUILD → VERIFY → SHIP. Deploy = commit → push main → rebuild VPS
> backend (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend`);
> migrations run on startup; never hand-edit the DB.

Backend emits **24** WS domains; frontend subscribes to **25** strings. The gaps below are
verified against source.

---

## Phase 0 — P0: security & reliability (do first)

### WS-1 — Enforce `targetUserId` (cross-user data leak) 🔴 SECURITY
**Problem:** `WsEvent.targetUserId` is declared but `dispatch` (`src/hooks/useWebSocket.ts`)
never checks it. The backend puts per-user events (chat DMs, **multas**, SOS, citofonía,
notifications, recordatorios) on the conjunto-wide bus expecting the client to filter — so
every neighbor in the conjunto receives everyone's private payloads.
**Fix:**
- Store `currentUserId` in the WS store; set it on (re)connect from `useAuth` `UserDto.id`.
- In `dispatch`: `if (event.targetUserId && event.targetUserId !== currentUserId) return;`
- Defense-in-depth (pairs with WS-7): deliver private events per-user on the backend so they
  never enter the conjunto-wide fan-out.
**Files:** `src/hooks/useWebSocket.ts`, `src/components/providers/WebSocketProvider.tsx`.
**Acceptance:** a user only receives events with no `targetUserId` or `targetUserId === me`;
regression test added. **Scope:** S

### WS-2 — Enforce short-lived WS ticket 🔴 SECURITY
**Problem:** `ws_handler` (`backend/api/src/domains/ws.rs`) verifies the `?token=` with default
validation; `Claims` has no token-type, so a 30-day **session JWT** is accepted identically to
the 120s ws ticket → a leaked URL = 30 days of access.
**Fix:** add a discriminator to `Claims` (e.g. `aud: "ws"` or `kind`) set only by
`issue_ws_ticket`; `ws_handler` verifies it's present and rejects full session tokens.
**Files:** `backend/api/src/auth/jwt.rs`, `backend/api/src/domains/ws.rs`.
**Acceptance:** session JWT in `?token=` → rejected; fresh ws-ticket → accepted; expires ≤120s.
**Scope:** S

### WS-3 — Don't die on broadcast lag (dropped SOS) 🔴 RELIABILITY
**Problem:** `ws.rs` send loop is `while let Ok(event) = rx.recv().await`; `tokio::broadcast`
returns `Err(Lagged(n))` when a client falls behind `CHANNEL_CAPACITY` (256). Any `Err` breaks
the loop → `select!` tears down the whole socket on a burst → **SOS/emergency events lost when
busiest**. The JS `dispatch` has the analogous fragility.
**Fix:** match `RecvError` explicitly — on `Lagged(_)` continue (optionally emit
`{action:"resync"}` so the client refetches), break only on `Closed`. Raise/document
`CHANNEL_CAPACITY`.
**Files:** `backend/api/src/domains/ws.rs`, `backend/api/src/services/ws_hub.rs`.
**Acceptance:** simulated lag does not close the socket; client refetches on resync. **Scope:** S

---

## Phase 1 — P1: leaks & races

### WS-4 — Reap idle per-conjunto channels (memory leak)
**Problem:** `ws_hub.rs` `get_sender` inserts a `broadcast::Sender` per `conjunto_id` and never
removes it → unbounded growth over process lifetime (multi-tenant).
**Fix:** after the socket loop ends, if `tx.receiver_count() == 0` remove the entry under the
write lock (guard against a racing new subscriber); or a periodic sweep. Keep `publish` on the
read-lock fast path and skip creation when no sender exists (publish with no receivers is a no-op).
**Files:** `backend/api/src/services/ws_hub.rs`, `backend/api/src/domains/ws.rs`. **Scope:** M

### WS-5 — Fix reconnect race / duplicate sockets
**Problem:** `WebSocketProvider.tsx` `onclose` always reconnects and `onerror` calls `close()`
with no guard that the socket is still `wsRef.current` → duplicate concurrent sockets, duplicate
dispatched events, connection-indicator flap. The effect also re-subscribes on **any** `user`
object change (e.g. avatar edit), not just JWT scope.
**Fix:** per-attempt generation/active flag; guard every callback with
`if (cancelled || ws !== wsRef.current) return;`; null `ws.onclose` before deliberate `close()`;
`AbortController` on the ws-ticket fetch; key the effect on `user?.id` + `user?.conjuntoId` only.
**Files:** `src/components/providers/WebSocketProvider.tsx`. **Scope:** S–M

---

## Phase 2 — P2: robustness (med)

### WS-6 — Reset WS store on auth change + safe dispatch
Module-global store is never reset on logout/login/switchRole → stale handlers from a prior
user/role stay registered (compounds WS-1). `dispatch` calls handlers in `forEach` with no
try/catch (one throw aborts the rest, incl. `*`) and iterates a live `Set` mutated mid-dispatch.
**Fix:** store `reset()` called from logout/switchRole + provider cleanup; set `currentUserId` on
connect; wrap each handler in try/catch; snapshot the `Set` before iterating.
**Files:** `src/hooks/useWebSocket.ts`. **Scope:** S

### WS-7 — Private payloads off the conjunto bus + keep-alive
Targeted events are cloned into every resident's receiver buffer before being filtered at the
send side (broader in-memory exposure, wastes the 256-slot buffer). `recv_task` has no ping/read
timeout → a vanished client (no TCP FIN) parks tasks until an event arrives.
**Fix:** per-`(conjunto,user)` channel or `user_id → sender` registry for private events; add a
periodic server Ping via `select!` and treat missing Pong/timeout as disconnect.
**Files:** `backend/api/src/domains/ws.rs`, `backend/api/src/services/ws_hub.rs`. **Scope:** M

---

## Phase 3 — Coverage gaps ("views that need WS")

### COV-1 — Dead subscriptions (view listens, backend never emits)
`conjunto` (superadmin), `gasto` (admin-finanzas), `usuario` (admin-residentes). The owning
handlers (`conjuntos`, `admin_finanzas`, `usuarios`/`admin_usuarios`) emit no WS at all.
**Fix:** either emit these domains on the relevant create/update/delete, **or** drop the dead
subscriptions. Decide per view (superadmin/admin lists genuinely benefit from live updates →
prefer emitting). **Scope:** M

### COV-2 — Orphan emitters (backend emits, nobody listens)
- `recordatorio` — the expiry-reminder channel for **vehicle docs / pet vaccines / dues** is sent
  but no `useWsSubscription('recordatorio', …)` exists → live reminders are silently dropped.
  **Fix:** subscribe in `/perfil` and/or the notification center (`ProfileHeader`).
- `pase_temporal` — emitted, no listener. **Fix:** subscribe in `/pases-temporales`.
**Scope:** S

### COV-3 — Views missing realtime that should have it
| View | Add domain(s) | Why |
|---|---|---|
| `novedades` | `novedad` | shared security bitácora; only refetches on own submit |
| `cartelera` | `chat` | live admin chat never gets replies in real time |
| `vigilancia` | `visita`, `paquete` | stat counters go stale on an all-day desk view |
| `perfil` | `paquete`, `tramite`, `pago`, `reserva`, `recordatorio` | personal data updates live |
| `chat` | `chat` | replace the 5s poll with WS |
| `citofonia` | `citofonia` | already global via CallContext — verify view-level needs |
| `admin-banners` | `ad-spaces` | **needs a backend emitter first** (`ad_spaces/handlers.rs` has no WS) |
**Scope:** M (per-view, parallelizable)

---

## AI — items that still need fixing / follow-up

| # | Item | Status | Action |
|---|---|---|---|
| AI-1 | SearchModal `contexto` 422 (object vs `Option<String>`) | **fixed, pushed `caf9dde04`** | verify on prod after frontend deploy |
| AI-2 | Free-tier quota (`gemini-2.5-flash` ≈ 250 req/day, shared) | risk | enable billing on the Google project for prod, or monitor; AI 429→502 again under load |
| AI-3 | Per-conjunto **reglamento** RAG | pending (6.2) | ingest each conjunto's reglamento; only Ley 675 is grounded today. RAG only once there are many private docs |
| AI-4 | Full law (~40k tokens) injected on **every** call incl. trivial search | cost | optional: gate law injection by intent/keywords to conserve quota |
| AI-5 | Quota/upstream errors surface as generic 502 | UX | map Gemini 429 to a clear "IA temporalmente no disponible (cuota)" message + retry/backoff |
| AI-6 | Asamblea AI tools (`copilot`/`translate`/`consensuar`/`acta`) stay separate | by design | task-specific, not "ask anything" — documented decision, not a bug |
| AI-7 | `GEMINI_MODEL` env override | done | default `gemini-2.5-flash`; set in server `.env` if changing |

---

## Recommended order

1. **Phase 0 (WS-1/2/3)** — security + reliability. Small, high-impact. Backend rebuild + frontend deploy.
2. **AI-1 verify** (already pushed) + **AI-2** decision (billing) — keeps the just-shipped AI healthy.
3. **Phase 1 (WS-4/5)** — leaks & races.
4. **Phase 3 COV-2** (orphan emitters: `recordatorio`, `pase_temporal`) — cheap, restores already-built features.
5. **Phase 2 (WS-6/7)** + **Phase 3 COV-1/COV-3** — robustness + remaining coverage.

## Verify (per phase)
- `cargo check -p enconjunto-api` + `pnpm exec tsc --noEmit` clean.
- WS-1: two browser sessions in one conjunto — private event reaches only the target.
- WS-3: burst/lag does not drop the socket.
- COV: trigger the mutation in one session, see the listening view update live in another.

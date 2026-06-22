# Implementation Plan: EN-CONJUNTO — Market-Leading Feature Set

> Goal: close every verified gap vs. competitor **miconjunto.co** (15 modules) so EN-CONJUNTO
> matches or beats it on every axis. Flow: DEFINE ✅ → **PLAN (this doc)** → BUILD → VERIFY → REVIEW → SHIP.
> (Previous plan for feature 016 Citofonía/LiveKit is shipped — archived in `tasks/plan-016-citofonia-livekit.archive.md`.)

## Verified gap baseline (DEFINE output)

| # | Competitor module | EN-CONJUNTO today | Action |
|---|---|---|---|
| 1 | Seguridad — **botón de pánico** | ❌ missing | **BUILD** (F1) |
| 2 | **Encuestas** (live results + charts) | ❌ missing (only assembly votes) | **BUILD** (F4) |
| 3 | Vehículos — **SOAT/tecnomecánica** expiry | ❌ `vehiculos` has no doc cols | **BUILD** (F6) |
| 4 | Mascotas — **control de vacunas** | ❌ `mascotas` has no vaccine cols | **BUILD** (F7) |
| 5 | Convivencia — **multas** (monetary) | ❌ casos are text-only, no money | **BUILD** (F5) |
| 6 | Cartera — **real banking (Nequi)** | ⚠️ `pagar` is simulated; `wompi_ref` stub field exists | **UPGRADE** (F3) |
| 7 | Seguridad — **QR visitantes** self check-in | ⚠️ `codigo_acceso` exists, no QR/scan | **UPGRADE** (F2) |
| 8 | Asambleas — **PDF acta export** | ⚠️ online votes exist, no PDF export | **UPGRADE** (F8) |
| 9 | Otto AI for **residents** (Ley 675) | ⚠️ copiloto admin-only; `/search` open | **UPGRADE** (F9) |
| — | Comunicados — **push** | ✅ VAPID web-push already built | none |
| — | Reservas / PQRS / Perfiles / Dashboard / Encomiendas / Clasificados | ✅ at parity or better | none |

## Architecture decisions

- **A1 — Reuse the per-domain module pattern.** Every backend feature is a folder
  `backend/api/src/domains/<name>/{mod.rs,dto.rs,handlers.rs,models.rs,repo.rs}`, a `Router::new()`
  mounted in `backend/api/src/lib.rs`, enums in `backend/api/src/db/enums.rs`. No new framework.
- **A2 — Migrations are additive & reversible.** New tables/columns as Diesel pairs under
  `backend/migrations/<YYYY-MM-DD>-<seq>_<name>/{up.sql,down.sql}`, applied through the project's
  migration runner on deploy. **Never hand-edit the production DB** (memory constraint). All changes
  additive so the React-Native client + web stay compatible.
- **A3 — Extend the existing realtime bus, don't replace it.** `domains/ws.rs` + `state.rs` already
  broadcast conjunto-scoped events. New features publish new event kinds on the same channel; the web
  WS hook and future RN client subscribe identically.
- **A4 — Build 3 cross-cutting services once, reuse across features** (Phase 1):
  - **Expiry-reminder scheduler** — generalize the existing pases-temporales 30-min scheduler into a
    reusable "scan rows with a due date → push + WS + in-app notice" job. Reused by F6 (vehicle docs),
    F7 (pet vaccines), later cartera due dates.
  - **PDF render service** (`services/pdf.rs`) — markup → PDF bytes to MinIO. Reused by F8 (acta) + F5 (multa notice).
  - **QR service** (`services/qr.rs`) — token → QR PNG/SVG. Reused by F2 (visitor) + existing pases codes.
- **A5 — Reuse VAPID push + notificaciones for every alert.** F1 SOS, F4 survey-open, F5 multa, F6/F7
  reminders all fan out through existing `services/push.rs` + `notificaciones` — no new transport.
- **A6 — Role-gated, additive endpoints only.** Honors the 9-role model + Bearer auth so the in-progress
  `mobile/` RN port consumes the same endpoints. Mobile parity = additive endpoints + a one-line client
  note per feature; no RN screens are in scope (`mobile/` is still scaffolding).
- **A7 — Payments isolated behind a gateway trait (provider = Nequi).** F3 introduces `services/payments/`
  with a `Gateway` trait + `NequiGateway` impl; the current simulate path becomes a `MockGateway` for dev/CI
  so tests never hit the network. Nequi uses a **push-to-app** model (no redirect checkout): send a payment
  request to the payer's Nequi phone → they approve in the Nequi app → status arrives via notification/poll.
  Reuse the existing `Pago.wompi_ref` column as the opaque provider transaction id (store Nequi `transactionId`
  there; optional additive rename to `payment_ref`). Only feature with an **external credential dependency**
  → sequenced to fail fast.

## Dependency graph (build order)

```
Phase 1 Foundations ──┬── F1 SOS ────────────┐
  (ws events,         ├── F2 QR visitors      │ independent → parallelizable after Phase 1
   scheduler,         ├── F4 Encuestas        │
   pdf, qr svc)       ├── F5 Multas ──(pdf)───┤
                      ├── F6 Vehicle docs ─(scheduler)
                      ├── F7 Pet vaccines ─(scheduler)
                      ├── F8 Assembly acta PDF ─(pdf)
                      └── F9 Resident AI (independent)
Phase 3 F3 Payments ── external Nequi creds gate (sequenced alone, fail-fast)
```

---

## Phase 1 — Shared foundations

### Task 1.1: Extend realtime event taxonomy
**Description:** Add conjunto-scoped event kinds (`sos`, `encuesta`, `multa`, `recordatorio`) to the broadcast bus so later features publish without touching transport.
**Acceptance criteria:**
- [ ] New event variants serialize over the existing WS channel as `{tipo, conjunto_id, payload}`.
- [ ] Web WS hook handles unknown kinds gracefully (forward-compat, no crash).
**Verification:** `cargo build -p api`; WS client receives a test `sos` event.
**Dependencies:** None. **Files:** `backend/api/src/domains/ws.rs`, `state.rs`, web WS hook. **Scope:** S

### Task 1.2: Reusable expiry-reminder scheduler
**Description:** Generalize the pases-temporales 30-min scheduler into a daily job scanning registered "due-date sources", emitting push + WS + `notificaciones` at configurable lead times (e.g. 30/15/3 days).
**Acceptance criteria:**
- [ ] A `ReminderSource` registration lets a domain expose `(rows due within N days) → notice payload`.
- [ ] Idempotent: no duplicate notice for the same row+lead-time in one day.
- [ ] Runs on the existing scheduler loop; env-configurable; no new infra.
**Verification:** Unit test — fake source with one due row → exactly one notice; re-run same day → zero.
**Dependencies:** 1.1. **Files:** `backend/api/src/services/scheduler*.rs`, `services/push.rs`, `domains/notificaciones/`. **Scope:** M

### Task 1.3: PDF render service
**Description:** `services/pdf.rs` turning templated markup → PDF bytes, stored in MinIO via existing uploads, returning a URL.
**Acceptance criteria:**
- [ ] `render_pdf(template, data) -> (bytes, mime)` works offline (no external API).
- [ ] Output persisted via existing MinIO uploads; returns a stable URL.
**Verification:** Unit test renders a 1-page sample → valid PDF (`%PDF` magic bytes).
**Dependencies:** None. **Files:** `backend/api/src/services/pdf.rs`, `domains/uploads/`. **Scope:** M

### Task 1.4: QR code service
**Description:** `services/qr.rs` encoding a signed/opaque token into QR PNG (and SVG for web); backend is the canonical encoder for gate-scan validation.
**Acceptance criteria:**
- [ ] `make_qr(token) -> png_bytes` round-trips back to the exact token.
- [ ] Token carries no PII (opaque id), validated server-side on scan.
**Verification:** Round-trip encode→decode unit test.
**Dependencies:** None. **Files:** `backend/api/src/services/qr.rs`. **Scope:** S

### ✅ Checkpoint — Foundations
- [ ] `cargo build -p api` + `cargo clippy` clean; `pnpm build` clean.
- [ ] WS test event received; scheduler tests green; PDF & QR round-trips pass.
- [ ] **Human review before feature work.**

---

## Phase 2 — Safety & daily-use

### Task 2.1: Panic / SOS button — backend (F1)
**Description:** New `domains/sos/`. Resident triggers SOS (type: médica/seguridad/incendio + unit context); persists `sos_alertas`, broadcasts WS + push to on-shift VIGILANTE/SUPERVISOR_VIGILANCIA. Handlers to acknowledge/resolve.
**Acceptance criteria:**
- [ ] `POST /sos` (resident roles) creates alert, fans out WS `sos` + push to security < 2s.
- [ ] `/sos/{id}/atender` + `/resolver` transition ABIERTA→ATENDIDA→RESUELTA with actor+timestamp.
- [ ] Rate-limited (max 1 active SOS per user) to prevent spam.
**Verification:** `cargo test -p api sos`; integration: trigger → assert WS + notificacion rows for security.
**Dependencies:** 1.1. **Files:** `backend/migrations/..._sos/{up,down}.sql`, `domains/sos/*`, `lib.rs`, `db/enums.rs`. **Scope:** M

### Task 2.2: Panic / SOS — frontend + security console (F1)
**Description:** Prominent resident SOS action on `/inicio` + `/seguridad` (confirm + live status). Security: live SOS banner/queue on `/vigilancia` + `/novedades-seguridad` with atender/resolver.
**Acceptance criteria:**
- [ ] Resident triggers, sees state change live; security sees alert in real time without refresh.
- [ ] Resolved alerts leave an auditable trail visible to admin.
**Verification:** Two sessions (resident + vigilante) end-to-end; `pnpm lint`/`build`.
**Dependencies:** 2.1. **Files:** `src/app/(app)/{inicio,seguridad,vigilancia,novedades-seguridad}/`, shared SOS client. **Scope:** M
**Mobile parity:** Bearer + additive; RN SOS screen later with zero backend change.

### Task 2.3: QR visitor pre-registration — backend (F2)
**Description:** Resident pre-registers a visitor → server issues opaque token (reuse `codigo_acceso`) + QR via 1.4. `GET` to render QR; `POST /visitas/scan` for the gate to validate scanned token → marks ingreso, broadcasts to vigilancia.
**Acceptance criteria:**
- [ ] Pre-register → QR tied to a single-use/time-boxed token.
- [ ] Scan validates (valid/expired/used), records entry, broadcasts WS to vigilancia.
- [ ] Invalid/expired rejected with a clear reason.
**Verification:** `cargo test -p api visitas`; happy-path + expired + reused.
**Dependencies:** 1.1, 1.4. **Files:** `domains/vigilancia/` (visitas), migration for token fields/state, `db/enums.rs`. **Scope:** M

### Task 2.4: QR visitor — frontend (F2)
**Description:** Resident `/visitantes`: pre-register form + shareable QR (download/WhatsApp). Gate `/control-visitas`: camera scanner calling `/visitas/scan` with green/red verdict.
**Acceptance criteria:**
- [ ] Resident generates & shares a visitor QR; gate scans & admits in one tap.
- [ ] Scanner shows resident name/unit + valid/invalid state.
**Verification:** Generate QR on one device, scan on another; `pnpm build`.
**Dependencies:** 2.3. **Files:** `src/app/(app)/{visitantes,control-visitas}/`. **Scope:** M
**Mobile parity:** the gate scanner is the prime RN use case later — endpoint already mobile-ready.

### ✅ Checkpoint — Safety & daily-use
- [ ] SOS end-to-end < 2s; QR pre-register→scan→admit across two devices.
- [ ] New endpoints role-gated; clippy/lint/build clean. **Human review.**

---

## Phase 3 — Real payments via Nequi (external dependency — fail fast)

> **GATE:** requires **Nequi API credentials** (client_id/secret + API key, sandbox first) from the Nequi
> developer portal before 3.x is verifiable end-to-end. Keeps `MockGateway` for dev/CI so tests never hit
> the network. Clears the **prod-readiness blocker** (memory). Nequi flow is **push-to-app**, not redirect.

### Task 3.1: Payment gateway trait + Nequi adapter (F3)
**Description:** `services/payments/` with a `Gateway` trait (`request_payment(phone, amount, ref)`, `fetch_status(ref)`, `verify_notification`), a `NequiGateway` (OAuth token + "Pagos" push API), and a `MockGateway` (current simulate behavior). Env-selected per environment.
**Acceptance criteria:**
- [ ] Trait abstracts gateway; `MockGateway` reproduces today's simulated success for CI.
- [ ] Nequi adapter authenticates, sends a push payment request for a `Pago`, and reads transaction status by ref.
**Verification:** `cargo test` with MockGateway; manual sandbox call pushes a request and returns a `transactionId`.
**Dependencies:** Phase 1. **Files:** `backend/api/src/services/payments/*`, `domains/pagos/handlers.rs` (`pagar`), `config.rs`. **Scope:** M

### Task 3.2: Nequi status notification + reconciliation (F3)
**Description:** Resolve final payment state via Nequi (webhook/notification if enabled, else a short-lived status poll job). Idempotently transition `Pago.estado` (PENDIENTE→PAGADO/RECHAZADO/EXPIRADO), store provider ref in `wompi_ref`, emit receipt + push.
**Acceptance criteria:**
- [ ] Status update (notification or poll) transitions the payment idempotently (replays/duplicate polls are no-ops).
- [ ] On PAGADO: receipt generated, payer notified, admin finanzas KPIs reflect it.
- [ ] Pending payments that the user never approves expire cleanly (no stuck PENDIENTE).
**Verification:** `cargo test` idempotency + expiry; sandbox approval drives a real status change.
**Dependencies:** 3.1, 1.3 (receipt PDF optional). **Files:** `domains/pagos/{handlers,repo}.rs`, `admin_finanzas.rs`, scheduler (poll). **Scope:** M

### Task 3.3: Real checkout — frontend (F3)
**Description:** `/pagos` replaces "simular pago" with the Nequi flow: enter/confirm Nequi phone → "revisa tu app Nequi" pending state → live PAGADO/RECHAZADO/EXPIRADO from 3.2; downloadable receipt.
**Acceptance criteria:**
- [ ] Resident approves a sandbox payment in Nequi; UI reflects final state from server status (not optimistic).
- [ ] Receipt downloadable; rejected/expired payment retryable.
**Verification:** Full sandbox push→approve→PAGADO; `pnpm build`/`lint`.
**Dependencies:** 3.2. **Files:** `src/app/(app)/pagos/`. **Scope:** M
**Mobile parity:** push-to-app flow is native-friendly (deep-link to Nequi) — same endpoints power RN later.

### ✅ Checkpoint — Payments
- [ ] Sandbox push→approve→PAGADO→receipt→KPI, all real; expiry path clean. MockGateway still green in CI.
- [ ] Security review of Nequi credential handling + notification verification. **Human review + go/no-go for prod keys.**

---

## Phase 4 — Governance & community

### Task 4.1: Encuestas / surveys — backend (F4)
**Description:** New `domains/encuestas/`. Admin/concejo create a survey (single/multi choice, open/close dates, anonymous flag); residents vote once; live tallies. Broadcasts `encuesta` open + result-updated.
**Acceptance criteria:**
- [ ] CRUD survey (admin/concejo); one vote per resident enforced at DB level.
- [ ] `GET /encuestas/{id}/resultados` returns live counts; WS pushes increments.
- [ ] Anonymous surveys store no voter↔option linkage.
**Verification:** `cargo test -p api encuestas` incl. double-vote rejection.
**Dependencies:** 1.1. **Files:** `backend/migrations/..._encuestas/*`, `domains/encuestas/*`, `lib.rs`, `db/enums.rs`. **Scope:** M

### Task 4.2: Encuestas — frontend with live charts (F4)
**Description:** New standalone **`/encuestas`** page: resident voting card + admin creator; live bar/pie results updating over WS. Add it to the nav/dashboard; optionally surface an "encuesta abierta" teaser on `/cartelera`.
**Acceptance criteria:**
- [ ] `/encuestas` route exists and is reachable from nav; resident votes and sees results animate.
- [ ] Second device's vote updates the first live; admin sees real-time chart while open; closing freezes results.
**Verification:** Two sessions; manual live-update; `pnpm build`.
**Dependencies:** 4.1. **Files:** `src/app/(app)/encuestas/` (new), nav, chart component. **Scope:** M

### Task 4.3: Multas / fines — backend (F5)
**Description:** Extend Comité de Convivencia: a `caso` can produce a `multa` with `monto`, due date, state (IMPUESTA→PAGADA/APELADA/ANULADA), optional link to a `Pago` so it surfaces in cartera. PDF notice (1.3) + resident notification.
**Acceptance criteria:**
- [ ] **ADMINISTRADOR only** issues a fine tied to a caso with amount + due date + reason (other roles 403).
- [ ] Fine appears in resident cartera, payable (via F3 Nequi once live; MockGateway otherwise).
- [ ] PDF notice generated + resident notified; appeal toggles state with audit trail (appeal does not block payability).
**Verification:** `cargo test -p api multas`; issue→notify→appears-in-cartera.
**Dependencies:** 1.1, 1.3, pagos link. **Files:** `domains/comite_convivencia/*`, migration `..._multas`, `domains/pagos/` link, `db/enums.rs`. **Scope:** M

### Task 4.4: Multas — frontend (F5)
**Description:** Comité console (`/comite-convivencia`) gains "imponer multa" on a caso; resident sees fines in `/pagos` + `/perfil` with notice download + appeal action.
**Acceptance criteria:**
- [ ] Admin issues a fine from a caso in ≤3 steps; resident sees amount, reason, due date, PDF.
- [ ] Resident can appeal; state reflects live for admin.
**Verification:** Manual issue→view→appeal; `pnpm build`.
**Dependencies:** 4.3. **Files:** `src/app/(app)/{comite-convivencia,pagos,perfil}/`. **Scope:** M

### ✅ Checkpoint — Governance & community
- [ ] Survey live-tally across devices; fine issue→cartera→appeal works. Clippy/lint/build clean. **Human review.**

---

## Phase 5 — Compliance reminders (reuse scheduler)

### Task 5.1: Vehicle document tracking — backend (F6)
**Description:** Add `soat_vence`, `tecnomecanica_vence`, optional doc URLs to `vehiculos` (additive migration). Register a `ReminderSource` (1.2). Endpoints to set/update doc dates.
**Acceptance criteria:**
- [ ] Vehicle stores SOAT + tecnomecánica expiry; owner updates them (optional uploaded doc).
- [ ] Scheduler emits push + in-app notice at lead times; idempotent.
**Verification:** `cargo test`; seed a vehicle due in 3 days → exactly one reminder.
**Dependencies:** 1.2. **Files:** migration `..._vehiculos_documentos`, vehicle repo/handlers, `db`. **Scope:** S–M

### Task 5.2: Pet vaccine control — backend (F7)
**Description:** New `mascotas_vacunas` table (vacuna, fecha_aplicacion, fecha_refuerzo, doc URL) → `mascotas`. Register a `ReminderSource` for upcoming boosters.
**Acceptance criteria:**
- [ ] Owner records vaccines per pet with next-due date + optional certificate.
- [ ] Scheduler reminds before booster due; idempotent.
**Verification:** `cargo test`; booster due in 3 days → one reminder.
**Dependencies:** 1.2. **Files:** migration `..._mascotas_vacunas`, pet repo+handlers, `db`. **Scope:** S–M

### Task 5.3: Vehicle docs & pet vaccines — frontend (F6+F7)
**Description:** `/perfil` (and admin `/admin-residentes` detail) gain doc/vaccine sections with expiry badges (green/amber/red) + upload.
**Acceptance criteria:**
- [ ] Resident sees/edits SOAT, tecnomecánica, and pet vaccines with color-coded expiry.
- [ ] Reminders received via existing push/notification center.
**Verification:** Manual edit + badge states; `pnpm build`.
**Dependencies:** 5.1, 5.2. **Files:** `src/app/(app)/{perfil,admin-residentes}/`. **Scope:** M

### ✅ Checkpoint — Compliance reminders
- [ ] Both reminder sources fire once per lead-time; badges correct. Clippy/lint/build clean. **Human review.**

---

## Phase 6 — Module upgrades

> Offline voting is **out of scope** (decision: online voting only). F8 = acta PDF export only.

### Task 6.1: Assembly acta PDF export (F8)
**Description:** Use 1.3 to export the AI-generated acta + attendance + results + signatures to a downloadable, archived PDF.
**Acceptance criteria:**
- [ ] One-click acta PDF with quórum, votes, attendance, signatures; stored + downloadable.
- [ ] Matches on-screen acta content.
**Verification:** Generate from a closed session; open PDF, verify sections; `pnpm build`.
**Dependencies:** 1.3. **Files:** `domains/asamblea/`, `services/pdf.rs`, `src/app/asamblea/`. **Scope:** S–M

### Task 6.2: Resident-facing Otto AI (Ley 675 / reglamento) (F9)
**Description:** Resident-safe AI grounded in Ley 675 + the conjunto reglamento (RAG over ingested reglamento + curated law snippets). Reuse existing AI domain + semantic search; new role-gated endpoint with guardrails (cite source, refuse out-of-scope, no admin actions).
**Acceptance criteria:**
- [ ] Residents query Ley 675/reglamento → cited, grounded answers; admin actions stay blocked.
- [ ] Out-of-scope/uncertain → safe refusal + "contact admin" handoff (no hallucinated legal advice).
- [ ] Per-conjunto reglamento ingested into the semantic index.
**Verification:** `cargo test` role-guard; prompt-set eval: 10 in-scope answered+cited, 5 out-of-scope refused.
**Dependencies:** existing `domains/ai` + semantic search. **Files:** `domains/ai/*`, reglamento ingest, resident AI entry on `/inicio` or `/directorio`. **Scope:** M

### ✅ Checkpoint — Complete
- [ ] All acceptance criteria met; clippy + `pnpm lint`/`build` clean; key flows demoed.
- [ ] Deploy per memory: **commit → push main → update VPS backend**; migrations via runner, **DB never hand-edited**.
- [ ] Ready for `/test` → `/review` → `/ship`.

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Nequi creds/onboarding delay blocks F3 | High | Ship rest with `MockGateway`; F3 self-contained; sandbox first. |
| Real-payment status bug (double/missed charge) | High | Idempotent status update keyed on provider ref; verify notification; poll+expiry reconcile; security review at checkpoint. |
| Nequi push never approved (stuck pending) | Med | Short-lived poll job + EXPIRADO state; user can retry. |
| SOS false alarms / spam | Med | 1-active-SOS-per-user rate limit; confirm dialog; audit trail. |
| Resident AI hallucinates legal advice | Med | RAG-grounded + mandatory citations + refuse-out-of-scope + handoff; eval gate before ship. |
| Anonymous survey de-anonymization | Med | No voter↔option link for anonymous; enforce at schema. |
| Cross-origin auth cookie (known blocker) | Med | New endpoints Bearer-friendly (RN-ready); resolve cookie separately, not in these tasks. |
| Scheduler duplicate reminders | Low | Idempotency key (row+lead-time+day); unit-tested in 1.2. |

## Resolved decisions (2026-06-22)

1. **Payments (F3):** ✅ **Nequi**. Direct Nequi API (push-to-app). Still need sandbox/merchant credentials before the Phase-3 checkpoint.
2. **Multas (F5):** ✅ **ADMINISTRADOR only** issues fines. Appeal flow exists but does not block payability.
3. **Resident AI (F9):** ✅ **Gemini is OK** (reuse existing copiloto model). Still need the per-conjunto reglamento doc to ingest.
4. **Offline voting (F8):** ✅ **Out of scope** — online voting only. F8 reduced to acta PDF export.
5. **Encuestas (F4):** ✅ **Standalone `/encuestas`** page.

## Remaining external dependency
- **Nequi sandbox/merchant credentials** — needed only for the Phase-3 go/no-go; every other phase proceeds without it.

## Parallelization

- After Phase 1: **F1, F2, F4, F6+F7, F9 are independent** → parallelizable across sessions/agents.
- **F3 sequential & isolated** (Nequi creds). **F5 after F3 contract** (cartera link; can start on MockGateway). **F8 after 1.3**.
- Define each feature's DTO contract first, then split backend/frontend work.

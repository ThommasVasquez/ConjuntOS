# TODO — EN-CONJUNTO market-leading features

Full plan: `tasks/plan.md`. Order is dependency-correct. Check off as `/build` completes each.
After Phase 1, features F1/F2/F4/F6+F7/F9 can run in parallel. F3 is isolated (needs Nequi creds).
Decisions: payments=**Nequi** · multas issuer=**administrador** only · AI=**Gemini** · voting=**online only** · surveys=**/encuestas** page.
(Prior 016 Citofonía/LiveKit todo is shipped — archived alongside `tasks/plan-016-citofonia-livekit.archive.md`.)

## Phase 1 — Foundations (build first)
- [x] 1.1 Realtime event taxonomy (`sos`/`encuesta`/`multa`/`recordatorio`) — `ws_hub.rs` constants + `WsEvent::broadcast`/`to_user` + 3 serialization tests; frontend dispatch already tolerates unknown domains · S
- [x] 1.2 Reusable expiry-reminder engine — `services/reminders.rs` (pure idempotent `select_unsent` + `DueReminder`/`ReminderKey`, 4 unit tests), DB `run_reminders`/`dispatch` (notif+WS recordatorio+push), `recordatorios_enviados` table (migration + UNIQUE backstop), `spawn_scheduler` wired in main (no-op until F6/F7 add sources via `gather_due`) · M
- [x] 1.3 PDF render service — `services/pdf.rs` pure-Rust printpdf (built-in Helvetica, OpenSSL-free), `render_pdf` paginates → valid %PDF (2 tests), `render_and_store` persists via existing StorageService → URL · M
- [x] 1.4 QR code service — `services/qr.rs` pure-Rust qrcode+image(PNG only), `make_qr_png` → scannable PNG, round-trip decode test (rqrr) + empty-token guard · S
- [x] ✅ Checkpoint: cargo build+clippy clean; 36 lib tests green (WS/scheduler/PDF/QR); OpenSSL-free verified. (Frontend untouched in Phase 1 → no pnpm build needed.) → ready for push+VPS + human review

## Phase 2 — Safety & daily-use
- [x] 2.1 SOS/panic button — backend: `domains/sos.rs` (POST /sos resident-gated, GET/atender/resolver security-gated), `sos_alertas` table + partial-unique-index rate limit (1 active/user), WS `sos` broadcast + web-push fan-out to vigilancia, pure `aplicar_transicion` state machine (2 tests) · M
- [x] 2.2 SOS — frontend: `components/sos/` (SosPanicButton self-gated to residents on /inicio; SosConsole live queue on /vigilancia, WS-driven atender/resolver). tsc clean; pnpm build OOMs in sandbox (CI has headroom). NOTE: resolved-alert audit history view still TODO (backend GET /sos returns active only) · M
- [x] 2.3 QR visitor pre-reg — backend: `vigilancia/preregistro.rs` — POST /visitas/preregistro (resident → opaque token + base64 QR via services::qr, 1..168h validity), POST /visitas/scan (gate-gated → validate not-expired/not-used → stamp ingreso_at → WS visita/ingreso). Additive token/token_expira/ingreso_at cols + unique token index. Pure `validar_scan` (3 tests) · M
- [x] 2.4 QR visitor — frontend: `/visitantes` upgraded to `/visitas/preregistro` (real scannable QR via qrPngBase64 + token in WhatsApp/copy share); `components/visitas/QrScanner.tsx` on `/control-visitas` (BarcodeDetector camera + manual fallback → /visitas/scan → green/red verdict). tsc + lint clean · M
- [x] ✅ Checkpoint: Phase 2 done (SOS backend+frontend, QR pre-reg backend+frontend). SOS WS<2s; QR generate→scan→admit wired. Backend deployed; frontend via Cloudflare on push.

## Phase 3 — Real payments via Nequi (GATE: Nequi sandbox creds)
- [x] 3.1 PaymentGateway enum (Mock default + Nequi push-to-app, env-gated) `services/payments.rs`; pure status-map tests
- [x] 3.2 GET /pagos/{id}/estado idempotent reconcile; pagar charges via gateway, persists outcome+ref
- [x] 3.3 /pagos: Nequi phone input + truthful server-state handling (PAGADO vs PENDIENTE). NOTE: PAYMENTS_ENABLED stays OFF + Nequi HTTP gated until sandbox creds
- [~] ✅ Checkpoint: code complete on MockGateway; real-Nequi sandbox validation + PAYMENTS_ENABLED flip pending creds

## Phase 4 — Governance & community
- [x] 4.1 Encuestas backend — domains/encuestas.rs (one-vote via participation row, anonymous, live tally; 2 tests)
- [x] 4.2 Encuestas frontend — /encuestas page (live CSS-bar results, admin creator) + inicio nav card
- [x] 4.3 Multas backend — domains/multas.rs (admin-issue → linked Pago + PDF notice + notify; appeal/anular; 2 tests)
- [x] 4.4 Multas frontend — MultasResidente (/pagos) + ImponerMulta (/comite-convivencia)
- [x] ✅ Checkpoint Phase 4 complete

## Phase 5 — Compliance reminders (reuse 1.2)
- [x] 5.1 Vehicle docs backend — soat/tecno cols + PUT /vehiculos/{id}/documentos + gather_due
- [x] 5.2 Pet vaccines backend — mascotas_vacunas table + CRUD + gather_due (scheduler now LIVE)
- [x] 5.3 Docs/vaccines frontend — components/docs/DocsVacunas on /perfil (expiry badges, editors)
- [x] ✅ Checkpoint Phase 5 complete

## Phase 6 — Module upgrades (offline voting dropped — online only)
- [x] 6.1 Acta PDF export — GET /asambleas/{id}/acta/pdf (backend live). NOTE: one-click download button is a small follow-up (no dedicated acta-view page surfaced)
- [x] 6.2 Resident AI — POST /ai/asistente (Gemini, Ley675 guardrails) + /asistente page + nav card. NOTE: per-conjunto reglamento RAG pending the document
- [x] ✅ Checkpoint Phase 6 complete — all phases built; deploying

## Remaining external dependency
- Nequi **sandbox/merchant credentials** — needed only for the Phase-3 go/no-go. Every other phase proceeds without it.
- Per-conjunto **reglamento document** to ingest for resident AI (6.2).

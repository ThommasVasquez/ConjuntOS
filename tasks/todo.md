# TODO — EN-CONJUNTO market-leading features

Full plan: `tasks/plan.md`. Order is dependency-correct. Check off as `/build` completes each.
After Phase 1, features F1/F2/F4/F6+F7/F9 can run in parallel. F3 is isolated (needs Nequi creds).
Decisions: payments=**Nequi** · multas issuer=**administrador** only · AI=**Gemini** · voting=**online only** · surveys=**/encuestas** page.
(Prior 016 Citofonía/LiveKit todo is shipped — archived alongside `tasks/plan-016-citofonia-livekit.archive.md`.)

## Phase 1 — Foundations (build first)
- [x] 1.1 Realtime event taxonomy (`sos`/`encuesta`/`multa`/`recordatorio`) — `ws_hub.rs` constants + `WsEvent::broadcast`/`to_user` + 3 serialization tests; frontend dispatch already tolerates unknown domains · S
- [ ] 1.2 Reusable expiry-reminder scheduler (`ReminderSource`, idempotent) — `services/scheduler*`, `notificaciones` · M
- [ ] 1.3 PDF render service (`services/pdf.rs` → MinIO) · M
- [ ] 1.4 QR code service (`services/qr.rs`, round-trip) · S
- [ ] ✅ Checkpoint: cargo build+clippy, pnpm build, WS/scheduler/PDF/QR tests green → human review

## Phase 2 — Safety & daily-use
- [ ] 2.1 SOS/panic button — backend (`domains/sos/`, push to vigilancia <2s, rate-limited) · M
- [ ] 2.2 SOS — frontend resident trigger + security live console · M
- [ ] 2.3 QR visitor pre-reg — backend (token+QR, `/visitas/scan`) · M
- [ ] 2.4 QR visitor — frontend (`/visitantes` QR share, `/control-visitas` scanner) · M
- [ ] ✅ Checkpoint: SOS <2s; QR pre-reg→scan→admit across 2 devices → human review

## Phase 3 — Real payments via Nequi (GATE: Nequi sandbox creds)
- [ ] 3.1 Gateway trait + NequiGateway (push-to-app) + MockGateway (`services/payments/`) · M
- [ ] 3.2 Nequi status notification/poll + idempotent reconciliation + EXPIRADO + receipt · M
- [ ] 3.3 Nequi checkout — frontend `/pagos` (enter phone → approve in app → live status) · M
- [ ] ✅ Checkpoint: sandbox push→approve→PAGADO→receipt→KPI; expiry clean; creds security review → go/no-go prod keys

## Phase 4 — Governance & community
- [ ] 4.1 Encuestas — backend (`domains/encuestas/`, one-vote, live results, anon) · M
- [ ] 4.2 Encuestas — frontend live charts (new standalone `/encuestas` page + nav) · M
- [ ] 4.3 Multas — backend (administrador-only: comité caso → multa monto, cartera link, PDF notice) · M
- [ ] 4.4 Multas — frontend (issue from caso; resident view + appeal) · M
- [ ] ✅ Checkpoint: live survey tally; fine issue→cartera→appeal → human review

## Phase 5 — Compliance reminders (reuse 1.2)
- [ ] 5.1 Vehicle docs — backend (SOAT/tecnomecánica cols + ReminderSource) · S–M
- [ ] 5.2 Pet vaccines — backend (`mascotas_vacunas` + ReminderSource) · S–M
- [ ] 5.3 Vehicle docs & vaccines — frontend (`/perfil`, `/admin-residentes`, expiry badges) · M
- [ ] ✅ Checkpoint: reminders fire once/lead-time; badges correct → human review

## Phase 6 — Module upgrades (offline voting dropped — online only)
- [ ] 6.1 Assembly acta PDF export (reuse 1.3) · S–M
- [ ] 6.2 Resident Otto AI (Ley 675/reglamento RAG, Gemini, guardrails, role-gated) · M
- [ ] ✅ Checkpoint complete: all criteria met; commit→push main→update VPS; migrations via runner (never hand-edit DB)

## Remaining external dependency
- Nequi **sandbox/merchant credentials** — needed only for the Phase-3 go/no-go. Every other phase proceeds without it.
- Per-conjunto **reglamento document** to ingest for resident AI (6.2).

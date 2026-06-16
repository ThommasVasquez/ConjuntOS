# Production Readiness — EN-CONJUNTO

_Generated 2026-06-16 from a 17-unit multi-agent audit (120 findings, 74 verified, 12 confirmed production blockers, 48 confirmed important). Each Critical/Important finding was independently re-checked by a skeptic agent; some cross-cutting verifications were cut short by a session limit and are marked `UNVERIFIED`._

## Build health (this session) — ✅ GREEN
- `next build`: **pass** · `tsc --noEmit`: **clean** (enforced, `ignoreBuildErrors:false`) · `next lint`: **0 errors / 0 warnings** (was ~292).
- All 33 lint-affected files fixed with **no behavior change** (`any`→real types, `<img>`→`next/image`, escaped entities, safe hook deps). Committed + pushed to `main` (`d8fca22`, `a0da64b`).

## Verdict: 🔴 NO-GO for a paid production launch
The codebase **compiles, types, and lints clean**, but the audit confirmed blockers that fall into two buckets: **(A) product/infra decisions only you can make** (payments not integrated, deploy-domain/auth config) and **(B) code bugs that are safe to fix now**. None are lint/build issues.

> Correction to stale notes: the **Rust backend is fully committed (171 files) and actively wired** — `specs/PROGRESS.md`'s "nothing committed yet" header and the "paused at M5" memory are out of date. Tenant isolation is enforced **server-side** (client never sends a tenant id) — good.

---

## A. Blockers that need YOUR decision (product / infra)

### 1. Payment flows are simulated end-to-end (5 confirmed blockers)
Every "payment" marks the charge/contract as PAID via a hardcoded spinner — **no gateway, no settlement, no transaction reference, no idempotency**:
- `pagos/page.tsx` — resident admin-fee payment ("Wompi", 3.5s timeout → PAID).
- `perfil/page.tsx` — debt payment ("secure PSE gateway").
- `reservas/page.tsx` — reservation deposit ("secure payment gateway").
- `inmobiliaria/page.tsx` — lease/purchase "contract signing" (random contract #, never persisted).
- `components/modals/ContentActionModal.tsx` — checkout with hardcoded card _(skeptic **rejected** as a blocker — likely a demo/marketplace surface; confirm whether real users can reach it)_.

**Decision needed:** these read as intentional placeholders pending real Wompi/PSE integration (keys, merchant contract, webhooks). I did **not** touch them. Options: (a) integrate a real gateway, (b) hide/disable these flows until ready, or (c) accept-risk for a pilot. → drives whether this is a launch blocker.

### 2. Auth + deploy domain/cookie model breaks in production (3–4 confirmed/unverified)
- `src/middleware.ts` — gates routes purely on the `ec_session` cookie's presence. In prod the cookie is set cross-origin by the API with `SameSite=None`; on `en-conjunto.pages.dev` it isn't visible → **307 redirect loop, app unusable**. The in-memory **Bearer fallback is invisible to middleware**, so cookie-blocked browsers are stranded at `/login`.
- `next.config.ts:11` / `wrangler.toml` / backend CORS — frontend deploy domain vs backend cookie `Domain` scope conflict _(UNVERIFIED — session limit)_.
- `src/lib/api/client.ts` — cross-site cookie + `credentials:'include'` with **no CSRF defense** on mutations _(UNVERIFIED — session limit)_.

**Decision needed:** confirm the production domain strategy (serve app from a `*.conjuntos.app` subdomain with a `Domain=.conjuntos.app` cookie, or move auth to same-origin). This is infra config + a small middleware change — I can implement once you confirm the target domain.

---

## B. Code bugs safe to fix now (no product decision required)
- **`parqueadero/page.tsx`** — register-vehicle sends the **wrong payload shape & vehicle-type values** to the backend (create fails). _(confirmed)_
- **`parqueadero/page.tsx`** — resident "Historial de Accesos" shows **hardcoded fake records** as if real. _(confirmed)_
- **`pagos/page.tsx`** — `EN_DISPUTA` charges **vanish** from both tabs and from total debt; backend **`recibos` (utility bills) are dropped** and RECIBO routing is dead code. _(confirmed)_
- **`citofonia/page.tsx`** — resident "Programar Visita" modal is a **silent no-op** (uncontrolled inputs, never POSTs); the real flow lives in `visitantes/page.tsx`. _(confirmed)_
- **`inicio` vs `perfil`** — outstanding debt is **computed differently**, so the same user sees two amounts owed. _(confirmed)_
- **`components/asamblea/LiveRoom.tsx`** — LiveKit runtime errors (`onError`/`onMediaDeviceFailure` not wired) are **invisible to the user**. _(confirmed)_
- **Resilience** — no `global-error.tsx` (an error in the root layout/Provider blanks the whole app); no central **401/session-expiry** handler (expired sessions strand users on empty screens). _(confirmed / uncertain)_
- **`perfil/page.tsx`** — password-change sends the **new plaintext password through an admin-visible trámites queue**. _(confirmed — security)_ Needs a real password-change endpoint.

## C. Important, non-blocking (sample of 48)
- **Accessibility** under-served across shell/forms (icon buttons without labels, modal focus traps, contrast). _(9 findings)_
- **Error UX** — backend validation/409/auth errors collapsed into generic "Error de conexión", hiding actionable info; reservation race loses silently.
- **Tests** — 13 e2e specs are a shallow "did it not redirect to /login" smoke layer; **no authorization/role tests**, and `mapa-parqueadero`, `bitacora-parqueadero`, `paqueteria`, `citofonia`, `asamblea`, `superadmin`, `landing` have no dedicated spec.
- **Perf/Config** — `next-pwa` is in deps but unused (custom SW instead); dual Cloudflare+Vercel deploy config with unclear build wiring.

---

## Recommended order
1. **Decide on payments** (A1) and **confirm prod domain** (A2) — these gate launch.
2. Fix the **B** code bugs (I can do these now — mostly contained, test-backed).
3. Add `global-error.tsx` + a central 401 handler (small, high-value resilience).
4. Harden the e2e suite with real assertions + authz tests before relying on it as a gate.
5. Accessibility + error-message pass.

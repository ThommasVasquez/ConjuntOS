# E2E Tests

Playwright end-to-end suite for ConjuntOS. Two targets:

- **Local** (`playwright.config.ts`, `baseURL=http://localhost:3000`) — drives the
  real UI against the local stack. Tests that fill/submit forms run here so they
  never touch production.
- **Prod** (`playwright.prod.config.ts`) — read-only smoke/load against the live
  service (`prod-*.spec.ts`).

## Running the local stack for E2E

The local backend ships with **production cookie settings** (`COOKIE_CROSS_SITE=true`,
`COOKIE_DOMAIN=.conjuntos.app`). Those cookies are `Secure; SameSite=None; Domain=conjuntos.app`
and are **rejected by browsers on `http://localhost`**, so UI tests can't authenticate.

`docker-compose.e2e.yml` overrides this for local testing: it issues a host-only
`SameSite=Lax` cookie and whitelists `admin@demo` as a tester (so the RoleSwitcher
can exercise all 13 roles from one account).

```bash
# 1. Start backend in e2e mode (host-only Lax cookie + demo admin as tester)
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --no-build backend

# 2. Start the frontend. Do NOT set NEXT_PUBLIC_API_URL: leaving it empty makes the
#    browser call same-origin /api/v1/* (proxied to :8080 by next.config rewrites),
#    avoiding CORS. Setting it to http://localhost:8080 forces cross-origin client
#    fetches that the backend only allows from the exact origin in ALLOWED_ORIGINS.
pnpm dev   # or, if pnpm's auto-install prompt blocks: CI=true node_modules/.bin/next dev

# If port 3000 is taken, run on another port and point Playwright at it:
#   CI=true node_modules/.bin/next dev -p 3100
#   PW_BASE_URL=http://localhost:3100 pnpm playwright test

# 3. Run the suite
pnpm playwright test                      # everything
pnpm playwright test 30-all-roles-journeys
SUBMIT=1   pnpm playwright test 30-all-roles-journeys   # also submit forms
PROVISION=1 pnpm playwright test 31-provision           # create conjunto + profiles
pnpm playwright test 32-thousand-local                  # 1000 concurrent reads

# Restore the production-like local cookie config when done
docker compose -f docker-compose.yml up -d --no-build backend
```

## Suite layout

| File | What it covers |
| --- | --- |
| `roles.ts` | Single source of truth — 13 roles, their nav tabs, and every route each can reach |
| `journey-helpers.ts` | login/switch-role, crash + console-error detection, form exercise, menu clicks |
| `30-all-roles-journeys.spec.ts` | All 13 roles: land on home, click every menu tab, visit every reachable view, open/fill forms, assert no crash and no uncaught client errors |
| `31-provision.spec.ts` | SUPER_ADMIN creates a conjunto; ADMINISTRADOR invites a profile for every role (opt-in: `PROVISION=1`) |
| `32-thousand-local.spec.ts` | 1000 concurrent reads across the role pool; asserts per-(role,endpoint) coverage + ≥99% 2xx |
| `realistic-journeys.spec.ts` | Per-page journeys for the 5 demo-account roles (legacy, still green) |
| `prod-*.spec.ts` | Production read-only smoke/load (run with `playwright.prod.config.ts`) |

### Role coverage strategy

One tester account (`admin@demo`, whitelisted in `TESTER_EMAILS`) logs in once and
calls `POST /auth/switch-role` to assume each of the 13 real roles in turn — the
same flow real tester accounts use via the in-app RoleSwitcher. Specs that mutate
the tester's role restore it to `ADMINISTRADOR` afterward so other specs that log
in as `admin@demo` see the expected role.

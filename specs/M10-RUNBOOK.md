# M10 — Go-live runbook

## Pre-launch checklist

- [ ] All backend tests pass (`cargo test --all` in CI)
- [ ] `cargo clippy --all-targets -- -D warnings` clean
- [ ] Dockerfile builds successfully
- [ ] Frontend builds (`pnpm build`)
- [ ] Environment variables configured in production (see below)

## Environment variables (production)

### Backend (enconjunto-api)
```
DATABASE_URL=postgresql://...@...pooler.supabase.com:5432/postgres
MIGRATIONS_DATABASE_URL=postgresql://...@db....supabase.co:5432/postgres
JWT_SECRET=<strong-random-256-bit>
ALLOWED_ORIGINS=https://app.conjuntos.app,https://en-conjunto.pages.dev
RUN_MIGRATIONS=true
PORT=8080
DB_POOL_SIZE=20
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
VAPID_PUBLIC_KEY=<vapid-public>
VAPID_PRIVATE_KEY=<vapid-private>
VAPID_SUBJECT=mailto:admin@conjuntos.app
GEMINI_API_KEY=<gemini-api-key>
COOKIE_CROSS_SITE=true
```

### Frontend (Next.js)
```
NEXT_PUBLIC_API_URL=https://api.conjuntos.app
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same-vapid-public>
```

### Migration binary (one-time)
```
LEGACY_DATABASE_URL=postgresql://...@legacy-db:5432/postgres
MIGRATIONS_DATABASE_URL=postgresql://...@new-db:5432/postgres
```

## Step-by-step launch

### 1. Deploy backend
```bash
# Build and push Docker image
docker build -t enconjunto-api:latest backend/
docker push <registry>/enconjunto-api:latest

# Deploy (RUN_MIGRATIONS=true runs Diesel migrations on startup)
# The backend should be accessible at api.conjuntos.app
```

### 2. Run data migration
```bash
# Dry run first
enconjunto-migrate --dry-run --report /tmp/migration-dryrun.csv

# Review the report for JSON repair issues
cat /tmp/migration-dryrun.csv

# Run for real
enconjunto-migrate --report /tmp/migration-report.csv

# Verify row counts
enconjunto-migrate --verify

# Seed demo data (optional)
enconjunto-migrate --seed-demo
```

### 3. Smoke test backend
```bash
# Health check
curl https://api.conjuntos.app/healthz

# Login
curl -X POST https://api.conjuntos.app/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.conjuntos.app","password":"Admin123!"}' \
  -c cookies.txt

# Profile
curl https://api.conjuntos.app/api/v1/auth/me -b cookies.txt

# Notifications
curl https://api.conjuntos.app/api/v1/notificaciones -b cookies.txt

# OpenAPI
curl https://api.conjuntos.app/api/v1/openapi.json | jq '.paths | keys | length'
```

### 4. Deploy frontend
```bash
# Set NEXT_PUBLIC_API_URL to production backend
# Build and deploy to Cloudflare Pages / Vercel
pnpm build
```

### 5. Soak period (24-48h)
- Monitor backend logs for errors
- Check error rates in hosting dashboard
- Verify all 22 pages load and function
- Test critical flows:
  - Login/logout
  - Create announcement → notification fan-out
  - Create tramite → approve → vehicle/pet created
  - Chat (resident ↔ admin)
  - Reservations (overlap → 409)
  - Payments
  - Assembly session (if active)

### 6. Post-soak cleanup
```bash
# Drop legacy tables (via direct SQL on the new database)
# Only after verifying all data migrated correctly
DROP TABLE IF EXISTS "ChatAdmin" CASCADE;
DROP TABLE IF EXISTS "AsambleaVoto" CASCADE;
-- ... etc (all PascalCase tables)

# Drop the migration ID map
DROP TABLE IF EXISTS _migration_id_map;
```

### 7. Security hardening
- [ ] Rotate Supabase service-role key (was exposed in legacy `src/lib/db.ts` git history)
- [ ] Rotate JWT_SECRET (different from legacy NEXTAUTH_SECRET)
- [ ] Verify CORS allows only production origins
- [ ] Verify cookies are Secure + HttpOnly + SameSite=None (for cross-site) or Strict (same-site)
- [ ] Remove any demo data from production (`DELETE FROM usuarios WHERE email LIKE '%@demo.conjuntos.app'`)

## Rollback plan

If critical issues are found:
1. Revert `NEXT_PUBLIC_API_URL` to empty (frontend falls back to relative URLs)
2. Restore the `src/app/api/` directory from git
3. Re-deploy frontend
4. The legacy Next.js API routes will resume handling requests

The Rust backend can remain running in parallel — it doesn't affect the frontend when not targeted.

# Deployment Environment Variables

Quick copy-paste reference. See `TEST_CREDENTIALS.md` for the demo accounts.

## Vercel (frontend) — only these 2

Vercel → Project → Settings → Environment Variables:

```env
NEXT_PUBLIC_API_URL=https://api.your-backend-domain.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BBlF7n0RF6TaCqZyByo9I5zZ7Y_RreTjmc2wtJ-i6ZQp-mnY4WgpAnn3u8eZewy1gk9TcjMwCiql1oyD-tySOMs
```

`NODE_ENV` is set by Vercel automatically. Everything else belongs to the
backend server — never put database/JWT/S3 secrets in Vercel.

## Backend server (VPS / Fly / Railway)

```env
# --- Required (app refuses to start without these) ---
DATABASE_URL=postgresql://user:password@host:5432/enconjunto
JWT_SECRET=generate-a-long-random-string-here

# --- Strongly recommended for production ---
ALLOWED_ORIGINS=https://your-app.vercel.app
COOKIE_CROSS_SITE=true
RUN_MIGRATIONS=true

# --- Storage (S3 / MinIO / R2) ---
S3_ENDPOINT=https://your-s3-endpoint
S3_REGION=us-east-1
S3_BUCKET=enconjunto
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_PUBLIC_URL=https://your-s3-endpoint/enconjunto

# --- Video calls (LiveKit) ---
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret
LIVEKIT_URL=wss://your-livekit-host

# --- Optional ---
GEMINI_API_KEY=
VAPID_PUBLIC_KEY=BBlF7n0RF6TaCqZyByo9I5zZ7Y_RreTjmc2wtJ-i6ZQp-mnY4WgpAnn3u8eZewy1gk9TcjMwCiql1oyD-tySOMs
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:soporte@conjuntos.app

# --- Defaults you usually don't need to touch ---
# PORT=8080
# DB_POOL_SIZE=10
# MIGRATIONS_DATABASE_URL=
```

Notes:

- `COOKIE_CROSS_SITE=true` is **required** when frontend and backend are on
  different domains, or login won't persist.
- `ALLOWED_ORIGINS` must contain the exact Vercel URL or CORS blocks the API.
- Generate `JWT_SECRET` with `openssl rand -base64 48`.
- Push notifications are logged-only until the VAPID keys are set.

## Seed the database

Local Docker stack:

```bash
docker exec -e ENCONJUNTO_ALLOW_SEED=1 enconjunto-backend enconjunto-migrate --seed-demo
```

Remote database:

```bash
docker run --rm -e ENCONJUNTO_ALLOW_SEED=1 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/enconjunto" \
  ghcr.io/thommasvasquez/enconjunto-backend:latest enconjunto-migrate --seed-demo
```

Creates one demo conjunto and 8 accounts (one per role) — full list with
passwords in `TEST_CREDENTIALS.md`. Idempotent: safe to re-run.

> ⚠️ Demo credentials are public. Never run `--seed-demo` against production
> (the `ENCONJUNTO_ALLOW_SEED=1` guard exists for that reason).

# Deployment Environment Variables

Quick copy-paste reference. See `TEST_CREDENTIALS.md` for the demo accounts.

## Vercel (frontend) — only these 2

Vercel → Project → Settings → Environment Variables:

```env
NEXT_PUBLIC_API_URL=https://api.your-backend-domain.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BOHL_-nlOioDh450Jafs2OwEHZcWv3aTTLzWi3GGuJgZWn51ykAs5iGTUiWa_4Uaus5X0bQdVsgWO_NjK0ZbL8c
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

# --- Citofonía / Asamblea (LiveKit self-hosted + TURN) ---
# Genera el par de keys: claves arbitrarias largas (la API key es el "iss" del JWT).
#   LIVEKIT_API_KEY=$(openssl rand -hex 16)
#   LIVEKIT_API_SECRET=$(openssl rand -base64 36)
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret
# URL pública wss del servidor LiveKit que abre el navegador (TLS).
LIVEKIT_URL=wss://livekit.conjuntos.app

# --- Web Push VAPID (despertador de la citofonía) ---
# Genera el par con:  pnpm dlx web-push generate-vapid-keys
# El "Public Key" va aquí Y en NEXT_PUBLIC_VAPID_PUBLIC_KEY (Vercel). El "Private Key" solo aquí.
VAPID_PUBLIC_KEY=BOHL_-nlOioDh450Jafs2OwEHZcWv3aTTLzWi3GGuJgZWn51ykAs5iGTUiWa_4Uaus5X0bQdVsgWO_NjK0ZbL8c
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:soporte@conjuntos.app

# --- Optional ---
GEMINI_API_KEY=

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
- Sin las VAPID keys, el envío de push **falla y NO se cuenta como enviado** (`sent`
  refleja entregas reales); la llamada todavía conecta si el destinatario tiene la app abierta.

## Citofonía: LiveKit self-hosted + TURN (producción)

La voz de la citofonía va por **LiveKit self-hosted** con **TURN embebido sobre TLS**
(para conectar tras NAT simétrico / redes restrictivas). El backend solo emite tokens y
manda el push; no transporta audio. Archivos: `livekit.yaml`, `docker-compose.prod.yml`.

### 1. DNS
- `livekit.conjuntos.app` → IP pública del host (señalización wss).
- `turn.conjuntos.app` → la misma IP (relay TURN/TLS).

### 2. Certificados TLS
- wss de señalización: termina TLS en un reverse proxy (Caddy/nginx/Traefik) en `:443`
  hacia `127.0.0.1:7880`, **o** sirve LiveKit directo tras el proxy.
- TURN/TLS necesita su propio cert para `turn.conjuntos.app`. Colócalo en
  `./certs/livekit/turn.crt` y `./certs/livekit/turn.key` (montados en el contenedor).
  Con Let's Encrypt: `certbot certonly --standalone -d turn.conjuntos.app` y copia
  `fullchain.pem`→`turn.crt`, `privkey.pem`→`turn.key`. Renueva y recarga LiveKit.

### 3. Firewall (abrir en el host)
| Puerto | Proto | Uso |
|---|---|---|
| 443 (o 7880) | TCP | Señalización wss |
| 7881 | TCP | RTC/TCP fallback |
| 7882 | UDP | RTC media (UDP mux) |
| 5349 | TCP+UDP | TURN sobre TLS |

### 4. Levantar
```bash
# .env junto al compose con LIVEKIT_* y VAPID_* (ver arriba)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
LiveKit arranca con `--config /etc/livekit/livekit.yaml` y las keys vienen de `LIVEKIT_KEYS`.

### 5. Verificar TURN
En una red restrictiva, coloca una llamada y abre `chrome://webrtc-internals`: el par
de candidatos seleccionado debe ser de tipo **`relay`** (TURN en uso). Sin TURN
correcto, ~10-15% de llamadas no conectan audio.

> iOS: el Web Push solo funciona con la PWA **instalada** (Agregar a inicio) en iOS 16.4+.

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

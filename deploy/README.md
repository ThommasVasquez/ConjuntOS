# Despliegue backend — host 82.25.115.208 (zona `conjuntos.app`)

El frontend va aparte en Vercel. Aquí solo vive el backend: API, Postgres, MinIO y
LiveKit. Este directorio contiene los overrides propios de *este* host; los archivos
originales (`docker-compose.prod.yml`, `livekit.yaml`) se dejaron intactos porque
describen el despliegue de `conjuntos.app`.

## Topología

| Hostname | Cómo entra | Destino |
|---|---|---|
| `api.conjuntos.app` | Cloudflare Tunnel (proxied) | `backend:8080` |
| `storage.conjuntos.app` | Cloudflare Tunnel (proxied) | `minio:9000` |
| `livekit.conjuntos.app` | A directo → Caddy `:443` | `livekit:7880` (wss) |
| `turn.conjuntos.app` | A directo `:5349` | TURN/TLS embebido de LiveKit |

`livekit.conjuntos.app` y `turn.conjuntos.app` **deben quedarse en DNS-only (nube gris)**:
Cloudflare no proxya el media UDP ni TURN/TLS, y Caddy necesita el reto HTTP-01
por el `:80` directo. Ponerlos en naranja rompe las llamadas.

Puertos: el host comparte caja con otros stacks (fyuz, twenty, booking-system) que ya
ocupan 8080, 9000/9001, 7880/7881 y 5432. `docker-compose.deploy.yml` remapea todo y
mueve el RTC/TCP de LiveKit de 7881 a **7883** (LiveKit anuncia ese puerto a los
clientes, así que se publica 1:1 — remapearlo rompería el fallback TCP).

## Operar

```bash
# arrancar / actualizar todo
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml up -d

# logs
docker logs -f enconjunto-backend

# rebuild tras cambios en backend/
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml up -d --build backend
```

Las migraciones corren solas al arrancar el backend (`RUN_MIGRATIONS=true`).

## Certificado del TURN

Caddy emite y renueva los certs de `livekit.conjuntos.app` y `turn.conjuntos.app`. LiveKit no
lee del almacén de Caddy, así que `scripts/sync-turn-cert.sh` copia el par a
`certs/livekit/` y recarga LiveKit solo si cambió. Está en cron (03:17 diario) y el log
va a `certs/renew.log`.

> `renew-turn-cert.sh` (certbot standalone) es del host viejo de `conjuntos.app` y **no
> aplica aquí**: Caddy ya ocupa el `:80` que certbot necesitaría.

## Secretos

`.env` (0600, git-ignored) tiene JWT, credenciales de Postgres/MinIO, keys de LiveKit y
el par VAPID, todos generados para este despliegue. Las credenciales del túnel se quedan
en `~/.cloudflared/` y se montan de ahí — nunca se copian al repo.

## Pendiente de configurar

- **`ALLOWED_ORIGINS`** en `.env` está en `http://localhost:3000`. Hay que añadir la URL
  exacta de Vercel o el navegador bloquea el login por CORS. Tras editarlo:
  `docker compose ... up -d backend`.
- **Pagos**: sin `NEQUI_*` el backend rechaza los cobros a propósito (`PAYMENTS_ALLOW_MOCK`
  está apagado, que es lo correcto en producción).
- **`GEMINI_API_KEY`** vacía: `/ai/*` (asistente Ley 675 y copiloto) responde error.

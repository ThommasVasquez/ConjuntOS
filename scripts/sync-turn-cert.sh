#!/usr/bin/env bash
# sync-turn-cert.sh — copia el certificado de turn-conjuntos.host-ia.online que
# emite/renueva Caddy al directorio que monta LiveKit, y recarga LiveKit solo si
# el certificado cambió.
#
# Reemplaza a renew-turn-cert.sh (certbot standalone) en este host: Caddy ya
# ocupa :80/:443 y renueva solo, así que aquí no hay que pedir nada a ACME —
# únicamente sincronizar el par de archivos.
#
# Uso:        ./scripts/sync-turn-cert.sh
# Cron (diario, 03:17):
#   17 3 * * * /home/user_28hyis16/ConjuntOS/scripts/sync-turn-cert.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN=turn-conjuntos.host-ia.online
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml)
# Ruta de Caddy dentro de su volumen de datos.
SRC="/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$DOMAIN"

mkdir -p certs/livekit
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Caddy corre como root dentro del contenedor y los certs son 0600, así que se
# extraen con `docker cp` en vez de leer el volumen desde el host.
docker cp "enconjunto-caddy:$SRC/$DOMAIN.crt" "$TMP/turn.crt"
docker cp "enconjunto-caddy:$SRC/$DOMAIN.key" "$TMP/turn.key"

if cmp -s "$TMP/turn.crt" certs/livekit/turn.crt; then
  echo "sin cambios: el cert de $DOMAIN ya está sincronizado"
  exit 0
fi

install -m 644 "$TMP/turn.crt" certs/livekit/turn.crt
install -m 644 "$TMP/turn.key" certs/livekit/turn.key
echo "cert actualizado -> recargando livekit"
"${COMPOSE[@]}" up -d --no-deps --force-recreate livekit
echo "✅ turn cert sincronizado ($(openssl x509 -in certs/livekit/turn.crt -noout -enddate))"

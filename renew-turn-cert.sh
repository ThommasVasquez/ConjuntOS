#!/usr/bin/env bash
# Renueva el cert Let's Encrypt de turn.conjuntos.app (TURN/TLS embebido de LiveKit)
# y recarga LiveKit SOLO si el cert cambió. Requiere TCP/80 inbound (firewall Vultr)
# para el reto HTTP-01.
set -u
cd /home/user_vkibfp0l/conjunto || exit 1
HOSTUID=$(id -u); HOSTGID=$(id -g)
{
  echo "=== $(date -u) renewal run ==="
  docker run --rm -p 80:80 -v "$PWD/certs/letsencrypt:/etc/letsencrypt" \
    certbot/certbot renew --standalone --non-interactive --quiet
  docker run --rm -e HOSTUID -e HOSTGID -v "$PWD/certs:/c" alpine sh -c '
    NEW=/c/letsencrypt/live/turn.conjuntos.app/fullchain.pem
    if [ -f "$NEW" ] && ! cmp -s "$NEW" /c/livekit/turn.crt; then
      cp -L "$NEW" /c/livekit/turn.crt &&
      cp -L /c/letsencrypt/live/turn.conjuntos.app/privkey.pem /c/livekit/turn.key &&
      chown "$HOSTUID:$HOSTGID" /c/livekit/turn.crt /c/livekit/turn.key &&
      chmod 644 /c/livekit/turn.crt /c/livekit/turn.key &&
      touch /c/livekit/.cert-updated
    fi'
  if [ -f certs/livekit/.cert-updated ]; then
    rm -f certs/livekit/.cert-updated
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps --force-recreate livekit
    echo "cert renewed -> livekit reloaded"
  else
    echo "no renewal needed (cert not within 30-day window)"
  fi
} >> /home/user_vkibfp0l/conjunto/certs/renew.log 2>&1

#!/usr/bin/env bash
# restore-dump.sh — carga el dump de conjuntos/unidades en la base de producción.
#
# El dump de `conjuntos/` trae estructura Y datos, pero el esquema real lo crean
# las migraciones del backend (RUN_MIGRATIONS=true, migración 2026-06-10-000001_core
# define conjuntos y unidades exactamente igual). Por eso aquí se carga SOLO
# `conjuntos/data.sql` (los COPY), nunca `structure.sql` ni `conjuntos_dump.sql`:
# aplicar la estructura duplicaría tablas ya migradas y rompería el orden de FKs.
#
# Prerrequisito: el backend ya arrancó al menos una vez (migraciones aplicadas).
# No es idempotente: reejecutar falla por PK duplicada, que es la señal correcta
# de "esto ya está cargado".
#
# Uso:  ./scripts/restore-dump.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP=conjuntos/data.sql
[ -f "$DUMP" ] || { echo "no existe $DUMP"; exit 1; }

# La contraseña vive en .env, no en el script.
set -a; . ./.env; set +a
PSQL=(docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" enconjunto-db psql -v ON_ERROR_STOP=1 -U enconjunto -d enconjunto)

echo "▶ verificando que las migraciones ya crearon las tablas"
"${PSQL[@]}" -tAc "select to_regclass('public.conjuntos'), to_regclass('public.unidades')" \
  | grep -q 'conjuntos|unidades' || { echo "✗ faltan tablas: arranca el backend primero (aplica migraciones)"; exit 1; }

BEFORE=$("${PSQL[@]}" -tAc 'select count(*) from conjuntos')
echo "▶ conjuntos antes: $BEFORE"

echo "▶ cargando $DUMP"
"${PSQL[@]}" < "$DUMP"

echo "▶ resultado:"
"${PSQL[@]}" -c 'select (select count(*) from conjuntos) as conjuntos, (select count(*) from unidades) as unidades'
echo "✅ restore hecho"

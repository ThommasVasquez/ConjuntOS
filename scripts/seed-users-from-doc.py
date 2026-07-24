#!/usr/bin/env python3
"""Genera el SQL para crear en `usuarios` los 235 usuarios documentados en USERS.md.

USERS.md es un snapshot (10-jul-2026) de la base vieja: trae nombre, email, rol,
activo, torre y apto — pero NO trae contraseñas ni a qué conjunto pertenece cada
usuario. Por eso este script:

  - hashea una contraseña común con Argon2id usando exactamente los parámetros del
    backend (backend/api/src/auth/password.rs: m=19456 KiB, t=2, p=1, Argon2id v19),
    con salt distinto por usuario;
  - asigna todos los usuarios al conjunto `demo` (ver nota abajo);
  - enlaza `unidad_id` solo cuando existe una unidad real con ese torre+numero,
    y si no, deja NULL y conserva torre/apto como texto (columnas que existen en
    `usuarios` precisamente para eso);
  - numera `numero_interno` (citofonía, 4 dígitos únicos por conjunto) de forma
    secuencial a partir del máximo que ya exista en el conjunto.

Nota sobre el conjunto: USERS.md no tiene columna de conjunto. Se infiere `demo`
porque las torres del documento (A, B, C, L, 4) son las del conjunto demo
(Salamanca Reservado Club House P.H.); los otros tres conjuntos del dump son
artefactos de E2E con una sola unidad. Los dominios de email (@prueba, @demo)
son solo convenciones de nombres, no conjuntos distintos.

Uso (el hashing corre en un contenedor, no en el Python del sistema):
    docker run --rm -v "$PWD:/w" -w /w python:3.12-slim sh -c \
      'pip install -q argon2-cffi && python scripts/seed-users-from-doc.py' > users.sql
    docker exec -i enconjunto-db psql -U enconjunto -d enconjunto < users.sql
"""
import os
import re
import sys

from argon2 import PasswordHasher
from argon2.low_level import Type

# Mismos parámetros que hasher() en backend/api/src/auth/password.rs. Si allá
# cambian, este seed genera hashes que el backend igual puede verificar (el PHC
# string lleva sus propios parámetros), pero conviene mantenerlos alineados.
PH = PasswordHasher(
    time_cost=2, memory_cost=19_456, parallelism=1, hash_len=32, salt_len=16, type=Type.ID
)

PASSWORD = os.environ.get("SEED_PASSWORD", "123456789")
SUBDOMINIO = os.environ.get("SEED_SUBDOMINIO", "demo")
DOC = os.environ.get("SEED_DOC", "USERS.md")

# Roles aceptados por usuarios_rol_check tras las migraciones de roles operativos.
ROLES = {
    "ARRENDATARIO", "PROPIETARIO", "ADMINISTRADOR", "CONCEJO", "VIGILANTE",
    "SUPERVISOR_VIGILANCIA", "ENCARGADO_PARQUEADERO", "SUPER_ADMIN",
    "HUESPED_TEMPORAL", "ADMINISTRADOR_PISCINA", "ADMINISTRADOR_GYM",
    "MANTENIMIENTO_LOCATIVO", "OPERARIO_LIMPIEZA",
}

ROW = re.compile(r"^\|\s*(\d+)\s*\|(.*)\|\s*$")


def q(v):
    """Literal SQL: NULL o cadena con comillas simples escapadas."""
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def parse(path):
    users, seen = [], set()
    for line in open(path, encoding="utf-8"):
        m = ROW.match(line.rstrip("\n"))
        if not m:
            continue
        cells = [c.strip() for c in m.group(2).split("|")]
        if len(cells) < 6:
            continue
        nombre, email, rol, activo, torre, apto = cells[:6]
        # La tabla-resumen del principio también empieza por "| N |": se descarta
        # por no traer un email plausible.
        if "@" not in email or rol not in ROLES:
            continue
        if email in seen:  # el índice UNIQUE(email) lo rechazaría de todos modos
            continue
        seen.add(email)
        users.append(
            {
                "nombre": nombre,
                "email": email,
                "rol": rol,
                "activo": activo == "✅",
                "torre": torre or None,
                "apto": apto or None,
            }
        )
    return users


def main():
    users = parse(DOC)
    if not users:
        sys.exit(f"no se parsearon usuarios de {DOC}")

    out = [
        "-- Generado por scripts/seed-users-from-doc.py — NO editar a mano.",
        f"-- {len(users)} usuarios de {DOC}, contraseña común, conjunto '{SUBDOMINIO}'.",
        "BEGIN;",
        # Falla ruidosamente si el conjunto destino no existe, en vez de insertar 0 filas.
        f"""DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM conjuntos WHERE subdominio = {q(SUBDOMINIO)}) THEN
    RAISE EXCEPTION 'no existe el conjunto con subdominio %', {q(SUBDOMINIO)};
  END IF;
END $$;""",
    ]

    for i, u in enumerate(users, start=1):
        h = PH.hash(PASSWORD)
        # numero_interno arranca después del máximo ya usado en el conjunto, así
        # que re-ejecutar tras insertar usuarios nuevos no choca con el índice
        # UNIQUE(conjunto_id, numero_interno).
        out.append(
            f"""INSERT INTO usuarios
  (conjunto_id, nombre, email, password_hash, rol, activo, torre, apto, unidad_id,
   numero_interno, must_change_password)
SELECT c.id, {q(u['nombre'])}, {q(u['email'])}, {q(h)}, {q(u['rol'])}, {str(u['activo']).lower()},
       {q(u['torre'])}, {q(u['apto'])},
       (SELECT un.id FROM unidades un
         WHERE un.conjunto_id = c.id
           AND un.torre IS NOT DISTINCT FROM {q(u['torre'])}
           AND un.numero = {q(u['apto'])}
         LIMIT 1),
       LPAD((COALESCE((SELECT MAX(numero_interno::int) FROM usuarios x
                        WHERE x.conjunto_id = c.id
                          AND x.numero_interno ~ '^[0-9]+$'), 0) + 1)::text, 4, '0'),
       false
  FROM conjuntos c
 WHERE c.subdominio = {q(SUBDOMINIO)}
ON CONFLICT (email) DO NOTHING;"""
        )
        if i % 25 == 0:
            print(f"  ... {i}/{len(users)} hasheados", file=sys.stderr)

    out.append("COMMIT;")
    print("\n".join(out))
    print(f"listo: {len(users)} usuarios", file=sys.stderr)


if __name__ == "__main__":
    main()

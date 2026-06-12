# Test Credentials (demo seed)

Demo accounts created by `enconjunto-migrate --seed-demo`. They belong to
**Conjunto Demo** (subdominio `demo`), a fully-populated tenant with Ley 675
metadata, real `unidades` rows, and at least one account per role.

> ⚠️ These are hardcoded, publicly documented credentials. They are for local
> development and staging only. **Never run `--seed-demo` against production**
> — the seeder requires `ENCONJUNTO_ALLOW_SEED=1` as a guard for this reason.

All accounts share the same password for easy testing:

```text
Password: 123456789
```

## Accounts

| Email | Rol | Unidad |
| --- | --- | --- |
| admin@demo.conjuntos.app | ADMINISTRADOR | — |
| residente@demo.conjuntos.app | PROPIETARIO | Torre A, Apto 101 (Apartamento) |
| arrendatario@demo.conjuntos.app | ARRENDATARIO | Torre B, Apto 202 (Apartamento) |
| concejo@demo.conjuntos.app | CONCEJO | Torre A, Apto 301 (Apartamento) |
| casa@demo.conjuntos.app | PROPIETARIO | Torre C, C-01 (Casa) |
| local@demo.conjuntos.app | ARRENDATARIO | Torre L, L-05 (Local) |
| vigilante@demo.conjuntos.app | VIGILANTE | — |
| supervisor@demo.conjuntos.app | SUPERVISOR_VIGILANCIA | — |
| parqueadero@demo.conjuntos.app | ENCARGADO_PARQUEADERO | — |
| superadmin@demo.conjuntos.app | SUPER_ADMIN | — |

Every account also has a demo phone number (`+57 300 000 00NN`) and `genero`
set, so user profiles render fully in the UI.

## How to seed

Local Docker stack:

```bash
docker exec -e ENCONJUNTO_ALLOW_SEED=1 enconjunto-backend enconjunto-migrate --seed-demo
```

Remote database:

```bash
docker run --rm -e ENCONJUNTO_ALLOW_SEED=1 \
  -e DATABASE_URL="postgresql://user:***@host:5432/enconjunto" \
  ghcr.io/thommasvasquez/enconjunto-backend:latest enconjunto-migrate --seed-demo
```

Re-running is idempotent: the conjunto is upserted on `subdominio`, unidades are
reused (keyed on conjunto + torre + numero), and demo passwords are **reset**
back to the documented value (upsert on email), so a re-seed always restores a
known state.

Login endpoint: `POST /api/v1/auth/login` with `{"email": "...", "password": "..."}`.

Source of truth: `backend/migrate/src/seed.rs` — update this file when changing
the seed accounts.

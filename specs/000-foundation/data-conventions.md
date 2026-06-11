# Data conventions (new schema)

Authoritative reference for every Diesel migration. See Constitution Law 6.

## Naming

- Tables: plural snake_case (`usuarios`, `registros_parqueadero`, `asamblea_votaciones`).
- Columns: snake_case. FKs: `<entity>_id`. Booleans: positive form (`activo`, `leida`).
- Legacy PascalCase Prisma tables remain untouched in the same `public` schema until M10.

## Types

| Concern | Type |
|---|---|
| PK | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| Timestamps | `created_at timestamptz NOT NULL DEFAULT now()`; `updated_at` set by Rust where needed |
| Money | `NUMERIC(14,2)` ↔ `BigDecimal` |
| Coefficient | `NUMERIC(9,6)` ↔ `BigDecimal` |
| Enums | `text` + `CHECK (col IN (...))`, UPPER_SNAKE Spanish variants |
| JSON | `jsonb`, validated by a serde type named in the domain spec |

## Indexes

- Every FK column.
- `(conjunto_id, created_at DESC)` on list-heavy tables: `notificaciones`, `visitas`,
  `paquetes`, `pagos`, `chat_admin`, `anuncios`, `registros_parqueadero`.
- Uniques: `usuarios.email` (global), `conjuntos.subdominio`, `vehiculos.placa`,
  `push_subscriptions.endpoint`, `asamblea_asistencias(asamblea_id, usuario_id)`,
  `asamblea_votos(votacion_id, unidad_id)`, `asamblea_pairings.codigo`,
  `asamblea_poderes(asamblea_id, otorgante_id)`.

## jsonb columns and their serde types

| Table.column | Serde type (in domain `dto.rs`/`models.rs`) |
|---|---|
| `asambleas.orden_dia` | `Vec<OrdenDiaItem>` |
| `asambleas.session_state` | `SessionState` (+ `version int` optimistic lock column) |
| `asamblea_votaciones.opciones` | `Vec<String>` |
| `pedidos.items` | `Vec<PedidoItem>` |
| `solicitudes_servicio.imagenes` | `Vec<String>` |
| `inmuebles.imagenes` / `inmuebles.caracteristicas` | `Vec<String>` / `Vec<String>` |
| `rondas_parqueadero.hallazgos` | `Vec<Hallazgo>` |
| `tramites.payload` / `tramites.documentos` | per-tipo structs / `Vec<DocumentoAdjunto>` |

## Integrity fixes vs legacy schema

- FKs added: `documentos.conjunto_id`, `locales.propietario_id` (nullable),
  `asamblea_turnos.usuario_id`, `asamblea_opiniones.usuario_id`,
  `asamblea_poderes.otorgante_id`/`apoderado_id` (+ `CHECK (otorgante_id <> apoderado_id)`).
- `usuarios.password_hash text NOT NULL` + `must_change_password boolean NOT NULL DEFAULT false`
  (replaces nullable plaintext `password`).
- `asamblea_pairings`: `pin_hash` + `expires_at` (plaintext `password` column dropped).
- `push_subscriptions` new table replaces `Usuario.notifPush` JSON string.

## ID migration

cuid → `Uuid::new_v5(PROJECT_NAMESPACE, cuid.as_bytes())`, deterministic and idempotent.
`PROJECT_NAMESPACE` is a fixed UUID constant defined once in `migrate/src/idmap.rs`.
Audit table `_migration_id_map(table_name, old_id, new_id, migrated_at)` dropped after M10
verification.

# 012 — Asamblea (state machine, votaciones, quorum, poderes)

Status: **implemented** (M6) — full assembly lifecycle (sessions, asistencias, poderes, turnos, votaciones, votos, pairing, LiveKit token). Security-hardened (IDOR/cross-tenant/double-count fixes). No dedicated integration tests yet.

> SKELETON — largest domain. Write state-machine.md (from src/app/api/asamblea/session/route.ts)
> and full request/response shapes before implementing M6.

## Purpose
Replaces 10 non-AI asamblea routes: session, pairing, votaciones, votos, asistencia, opiniones,
turnos, poderes, subtitulos (+ acta/copilot live in 013).

## Notes
- `POST /asambleas` (ADMINISTRADOR/SUPER_ADMIN) creates the assembly — legacy had no such
  route, so rows only ever arrived through the data migration. Created `activa = true`
  (it becomes the conjunto's current assembly) with `session_state = "PROGRAMADA"`; the
  admin starts the session separately. One active assembly per conjunto: 409 on a second
  create, enforced by the `asambleas_una_activa_por_conjunto` partial unique index.
- `asambleas.session_state` typed jsonb + `version` int optimistic lock (409 on stale write).
- Votos: SHA-256 hash_firma; coeficiente = own unidad + verified poderes; unique (votacion_id, unidad_id).
- Pairing: 6-digit PIN → pin_hash (Argon2), expires_at; exchanges PIN for a normal JWT.
- Quorum: sum coeficiente of asistencias / total. BigDecimal everywhere.
- Opiniones: legacy allowed unauthenticated POST (simulator) — now auth required; FIFO cap 100.

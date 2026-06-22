-- Idempotency ledger for the reusable expiry-reminder engine.
-- One row per (source, row, lead-time, day) actually emitted, so re-running the
-- scheduler within the same day never re-sends a reminder. The UNIQUE constraint
-- is the DB-level backstop behind the in-memory `select_unsent` check.
CREATE TABLE recordatorios_enviados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    source text NOT NULL,
    row_id uuid NOT NULL,
    lead_dias integer NOT NULL,
    fecha date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recordatorios_enviados_unico UNIQUE (source, row_id, lead_dias, fecha)
);

CREATE INDEX recordatorios_enviados_fecha_idx ON recordatorios_enviados (fecha);

-- Panic / SOS emergency alerts (F1). A resident raises one; on-shift security is
-- notified in real time and works it ABIERTA → ATENDIDA → RESUELTA.
CREATE TABLE sos_alertas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    tipo text NOT NULL
        CONSTRAINT sos_alertas_tipo_check CHECK (tipo IN ('SEGURIDAD', 'MEDICA', 'INCENDIO', 'OTRO')),
    estado text NOT NULL DEFAULT 'ABIERTA'
        CONSTRAINT sos_alertas_estado_check CHECK (estado IN ('ABIERTA', 'ATENDIDA', 'RESUELTA')),
    nota text,
    ubicacion text,
    atendida_por_id uuid REFERENCES usuarios(id),
    fecha_atendida timestamptz,
    resuelta_por_id uuid REFERENCES usuarios(id),
    fecha_resuelta timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sos_alertas_conjunto_estado_idx ON sos_alertas (conjunto_id, estado);

-- Rate-limit backstop: at most one active (ABIERTA/ATENDIDA) alert per user, so a
-- panicking resident can't spam the security queue. Resolving frees them to raise another.
CREATE UNIQUE INDEX sos_alertas_una_activa_por_usuario
    ON sos_alertas (usuario_id)
    WHERE estado IN ('ABIERTA', 'ATENDIDA');

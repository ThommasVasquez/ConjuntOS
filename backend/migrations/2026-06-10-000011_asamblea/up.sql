-- Assembly: session state machine, attendance/quorum, powers of attorney,
-- ballots, weighted votes, speaking turns, opinions, device pairing.
-- specs/012-asamblea/spec.md. All children FK their parents (legacy lacked user FKs).

CREATE TABLE asambleas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    titulo text NOT NULL,
    descripcion text,
    fecha timestamptz NOT NULL DEFAULT now(),
    activa boolean NOT NULL DEFAULT true,
    orden_dia jsonb NOT NULL DEFAULT '[]'::jsonb,        -- Vec<OrdenDiaItem>
    item_activo_index integer NOT NULL DEFAULT 0,
    session_state jsonb NOT NULL DEFAULT '{}'::jsonb,    -- typed SessionState
    version integer NOT NULL DEFAULT 0                   -- optimistic lock for session writes
);

CREATE INDEX asambleas_conjunto_id_idx ON asambleas (conjunto_id);

CREATE TABLE asamblea_turnos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asamblea_id uuid NOT NULL REFERENCES asambleas(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    nombre text NOT NULL,
    apto text,
    estado text NOT NULL DEFAULT 'PENDIENTE'
        CONSTRAINT asamblea_turnos_estado_check
        CHECK (estado IN ('PENDIENTE', 'HABLANDO', 'COMPLETADO')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX asamblea_turnos_asamblea_id_idx ON asamblea_turnos (asamblea_id);

CREATE TABLE asamblea_opiniones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asamblea_id uuid NOT NULL REFERENCES asambleas(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    nombre text NOT NULL,
    apto text,
    contenido text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX asamblea_opiniones_asamblea_created_idx
    ON asamblea_opiniones (asamblea_id, created_at);

-- Pairing: a 6-digit PIN shown on the venue screen lets a phone obtain a JWT.
-- The PIN is Argon2-hashed (Constitution Law 3); pending rows are scanned and
-- verified (the row count is tiny and rows expire). Legacy stored the user's
-- LOGIN PASSWORD in plaintext here — dropped entirely.
CREATE TABLE asamblea_pairings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid REFERENCES usuarios(id),
    pin_hash text NOT NULL,
    estado text NOT NULL DEFAULT 'PENDIENTE'
        CONSTRAINT asamblea_pairings_estado_check
        CHECK (estado IN ('PENDIENTE', 'VINCULADO', 'EXPIRADO')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX asamblea_pairings_pendientes_idx
    ON asamblea_pairings (conjunto_id, estado, expires_at);

CREATE TABLE asamblea_asistencias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asamblea_id uuid NOT NULL REFERENCES asambleas(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    tipo text NOT NULL DEFAULT 'VIRTUAL'
        CONSTRAINT asamblea_asistencias_tipo_check
        CHECK (tipo IN ('PRESENCIAL', 'VIRTUAL')),
    verificado boolean NOT NULL DEFAULT false,
    ip text,
    dispositivo text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT asamblea_asistencias_unica UNIQUE (asamblea_id, usuario_id)
);

CREATE TABLE asamblea_poderes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asamblea_id uuid NOT NULL REFERENCES asambleas(id) ON DELETE CASCADE,
    otorgante_id uuid NOT NULL REFERENCES usuarios(id),
    apoderado_id uuid NOT NULL REFERENCES usuarios(id),
    documento_url text NOT NULL,
    verificado boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT asamblea_poderes_distintos CHECK (otorgante_id <> apoderado_id),
    CONSTRAINT asamblea_poderes_unico_otorgante UNIQUE (asamblea_id, otorgante_id)
);

CREATE INDEX asamblea_poderes_apoderado_idx ON asamblea_poderes (apoderado_id);

CREATE TABLE asamblea_votaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asamblea_id uuid NOT NULL REFERENCES asambleas(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    descripcion text,
    opciones jsonb NOT NULL DEFAULT '["SI", "NO", "ABSTENCION"]'::jsonb,
    activa boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX asamblea_votaciones_asamblea_id_idx ON asamblea_votaciones (asamblea_id);

-- One vote per UNIT (an apoderado may cast for several units via poderes).
-- unidad_id is nullable only because legacy votes did not record the unit;
-- the migrator derives it from the voter's unidad where possible.
CREATE TABLE asamblea_votos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    votacion_id uuid NOT NULL REFERENCES asamblea_votaciones(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    unidad_id uuid REFERENCES unidades(id),
    respuesta text NOT NULL,
    coeficiente numeric(9,6) NOT NULL,
    es_virtual boolean NOT NULL DEFAULT true,
    hash_firma text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT asamblea_votos_unico_por_unidad UNIQUE (votacion_id, unidad_id)
);

CREATE INDEX asamblea_votos_votacion_id_idx ON asamblea_votos (votacion_id);
CREATE INDEX asamblea_votos_usuario_id_idx ON asamblea_votos (usuario_id);

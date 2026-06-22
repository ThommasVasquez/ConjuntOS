-- Resident surveys / polls (F4). Options live as JSONB on the survey; one-vote is
-- enforced via a participation row, while votes keep voter_id NULL for anonymous
-- surveys (so there is no voter↔option linkage).
CREATE TABLE encuestas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    creado_por uuid NOT NULL REFERENCES usuarios(id),
    titulo text NOT NULL,
    descripcion text,
    opciones jsonb NOT NULL,          -- [{ "id": "o1", "texto": "Sí" }, ...]
    multiple boolean NOT NULL DEFAULT false,
    anonima boolean NOT NULL DEFAULT false,
    cierra_at timestamptz,
    cerrada boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX encuestas_conjunto_idx ON encuestas (conjunto_id, created_at DESC);

-- One participation row per (survey, resident) → enforces one vote, even anonymous.
CREATE TABLE encuesta_participacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    encuesta_id uuid NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT encuesta_participacion_unica UNIQUE (encuesta_id, usuario_id)
);

CREATE TABLE encuesta_votos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    encuesta_id uuid NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
    opcion_id text NOT NULL,
    usuario_id uuid REFERENCES usuarios(id),  -- NULL when the survey is anonymous
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX encuesta_votos_idx ON encuesta_votos (encuesta_id, opcion_id);

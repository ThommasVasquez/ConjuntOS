-- Citador y Convocatorias de Reuniones de Concejo ConjuntOS®
CREATE TABLE reuniones_concejo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id) ON DELETE CASCADE,
    creado_por uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    descripcion text,
    modalidad text NOT NULL DEFAULT 'PRESENCIAL' CHECK (modalidad IN ('PRESENCIAL', 'VIRTUAL', 'HIBRIDA')),
    lugar text,
    link_videollamada text,
    fecha_reunion timestamptz NOT NULL,
    orden_dia jsonb NOT NULL DEFAULT '[]'::jsonb,
    estado text NOT NULL DEFAULT 'CONVOCADA' CHECK (estado IN ('CONVOCADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA')),
    asistencias jsonb NOT NULL DEFAULT '[]'::jsonb,
    acta_resumen text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reuniones_concejo_conjunto_idx ON reuniones_concejo (conjunto_id, fecha_reunion);
CREATE INDEX reuniones_concejo_creador_idx ON reuniones_concejo (creado_por);

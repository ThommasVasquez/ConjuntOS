-- Announcements, documents (FK added — legacy had none), assembly meeting records.
-- specs/008-comunicaciones/spec.md

CREATE TABLE anuncios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    titulo text NOT NULL,
    contenido text NOT NULL,
    tipo text NOT NULL
        CONSTRAINT anuncios_tipo_check
        CHECK (tipo IN ('GENERAL', 'URGENTE', 'MANTENIMIENTO', 'EVENTO')),
    imagen_url text,
    archivos_url jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Vec<String>; legacy stored a string
    fijado boolean NOT NULL DEFAULT false,
    publicado_en timestamptz NOT NULL DEFAULT now(),
    expires_en timestamptz,
    vistas integer NOT NULL DEFAULT 0
);

CREATE INDEX anuncios_conjunto_publicado_idx ON anuncios (conjunto_id, publicado_en DESC);

CREATE TABLE documentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    nombre text NOT NULL,
    categoria text NOT NULL
        CONSTRAINT documentos_categoria_check
        CHECK (categoria IN ('CONVIVENCIA', 'MASCOTAS', 'PARQUEADERO', 'REGLAMENTO', 'OTRO')),
    url text NOT NULL,
    version text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documentos_conjunto_id_idx ON documentos (conjunto_id);

CREATE TABLE juntas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    tipo text NOT NULL
        CONSTRAINT juntas_tipo_check CHECK (tipo IN ('ORDINARIA', 'EXTRAORDINARIA')),
    fecha timestamptz NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    transcripcion text,
    audio_url text,
    acta_url text,
    publicada boolean NOT NULL DEFAULT false
);

CREATE INDEX juntas_conjunto_id_idx ON juntas (conjunto_id);

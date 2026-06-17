-- Vigilancia: reporte de novedades/incidentes de seguridad.

CREATE TABLE novedades_seguridad (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    tipo text NOT NULL DEFAULT 'OTRO'
        CONSTRAINT novedades_tipo_check CHECK (tipo IN ('PERSONA_SOSPECHOSA', 'RUIDO', 'DAÑO', 'INCENDIO', 'OTRO')),
    ubicacion text,
    descripcion text NOT NULL,
    severidad text NOT NULL DEFAULT 'BAJA'
        CONSTRAINT novedades_severidad_check CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
    estado text NOT NULL DEFAULT 'PENDIENTE'
        CONSTRAINT novedades_estado_check CHECK (estado IN ('PENDIENTE', 'ATENDIDO', 'CERRADO')),
    resuelto_por uuid REFERENCES usuarios(id),
    resolucion text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resuelto_en timestamptz
);

CREATE INDEX novedades_conjunto_created_idx ON novedades_seguridad (conjunto_id, created_at DESC);
CREATE INDEX novedades_estado_idx ON novedades_seguridad (estado);

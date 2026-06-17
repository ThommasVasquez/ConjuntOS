-- Portería: cartas y correspondencia (cartas, documentos, revistas).
-- Similar a paquetes pero con tipo de correspondencia.

CREATE TABLE correspondencia (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    tipo text NOT NULL DEFAULT 'CARTA'
        CONSTRAINT correspondencia_tipo_check CHECK (tipo IN ('CARTA', 'DOCUMENTO', 'REVISTA', 'OTRO')),
    remitente text NOT NULL,
    descripcion text,
    estado text NOT NULL DEFAULT 'EN_PORTERIA'
        CONSTRAINT correspondencia_estado_check CHECK (estado IN ('EN_PORTERIA', 'ENTREGADO')),
    fecha_llegada timestamptz NOT NULL DEFAULT now(),
    entregado_en timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX correspondencia_conjunto_llegada_idx ON correspondencia (conjunto_id, fecha_llegada DESC);
CREATE INDEX correspondencia_usuario_estado_idx ON correspondencia (usuario_id, estado);

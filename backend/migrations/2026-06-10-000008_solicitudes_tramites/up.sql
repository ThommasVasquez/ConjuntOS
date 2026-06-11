-- PQRS service requests + administrative trámites. specs/009-solicitudes-tramites/spec.md
-- Trámite payload/documents split into typed jsonb (legacy: one JSON string column).

CREATE TABLE solicitudes_servicio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    categoria text NOT NULL
        CONSTRAINT solicitudes_categoria_check
        CHECK (categoria IN ('PLOMERIA', 'ELECTRICIDAD', 'CARPINTERIA', 'PINTURA', 'CERRAJERIA', 'OTRO')),
    tipo text NOT NULL DEFAULT 'MANTENIMIENTO'
        CONSTRAINT solicitudes_tipo_check
        CHECK (tipo IN ('PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA', 'MANTENIMIENTO')),
    descripcion text NOT NULL,
    urgente boolean NOT NULL DEFAULT false,
    imagenes jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Vec<String> of URLs
    estado text NOT NULL DEFAULT 'ABIERTA'
        CONSTRAINT solicitudes_estado_check
        CHECK (estado IN ('ABIERTA', 'ASIGNADA', 'EN_PROGRESO', 'COMPLETADA')),
    proveedor_id uuid,  -- soft reference as in legacy
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solicitudes_conjunto_created_idx ON solicitudes_servicio (conjunto_id, created_at DESC);
CREATE INDEX solicitudes_usuario_id_idx ON solicitudes_servicio (usuario_id);

CREATE TABLE tramites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    tipo text NOT NULL
        CONSTRAINT tramites_tipo_check
        CHECK (tipo IN ('MASCOTA', 'VEHICULO', 'ARRENDAMIENTO', 'MUDANZA', 'OTRO')),
    estado text NOT NULL DEFAULT 'PENDIENTE'
        CONSTRAINT tramites_estado_check
        CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,      -- typed per tipo (specs/009)
    documentos jsonb NOT NULL DEFAULT '[]'::jsonb,   -- Vec<DocumentoAdjunto>; base64 inline at migration
    observacion_admin text,
    aprobado_por_id uuid REFERENCES usuarios(id),
    fecha_respuesta timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tramites_conjunto_created_idx ON tramites (conjunto_id, created_at DESC);
CREATE INDEX tramites_usuario_id_idx ON tramites (usuario_id);
CREATE INDEX tramites_estado_idx ON tramites (conjunto_id, estado);

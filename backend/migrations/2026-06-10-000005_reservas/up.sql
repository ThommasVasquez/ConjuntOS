-- Common areas + amenity reservations. specs/006-reservas/spec.md

CREATE TABLE areas_comunes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    nombre text NOT NULL,
    descripcion text,
    capacidad_max integer NOT NULL,
    imagen_url text,
    requiere_deposito boolean NOT NULL DEFAULT false,
    deposito_monto numeric(14,2),
    hora_apertura text NOT NULL,   -- "HH:MM", carried over from legacy
    hora_cierre text NOT NULL,
    dias_disponibles text NOT NULL,
    duracion_slot integer NOT NULL,  -- minutes
    activa boolean NOT NULL DEFAULT true
);

CREATE INDEX areas_comunes_conjunto_id_idx ON areas_comunes (conjunto_id);

CREATE TABLE reservas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    area_id uuid NOT NULL REFERENCES areas_comunes(id),
    fecha_inicio timestamptz NOT NULL,
    fecha_fin timestamptz NOT NULL,
    estado text NOT NULL
        CONSTRAINT reservas_estado_check
        CHECK (estado IN ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA')),
    notas text,
    pago_id uuid,  -- soft reference, kept nullable as in legacy
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservas_rango_check CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX reservas_conjunto_id_idx ON reservas (conjunto_id);
CREATE INDEX reservas_usuario_id_idx ON reservas (usuario_id);
-- Collision lookups: occupied slots per area and day.
CREATE INDEX reservas_area_inicio_idx ON reservas (area_id, fecha_inicio);

-- Parking + resident assets: vehiculos, mascotas, parqueaderos, audit log, rondas.
-- specs/005-parqueadero/spec.md. hallazgos becomes typed jsonb.

CREATE TABLE vehiculos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    placa text NOT NULL UNIQUE,
    marca text,
    modelo text,
    color text,
    tipo text NOT NULL
        CONSTRAINT vehiculos_tipo_check CHECK (tipo IN ('CARRO', 'MOTO')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehiculos_conjunto_id_idx ON vehiculos (conjunto_id);
CREATE INDEX vehiculos_usuario_id_idx ON vehiculos (usuario_id);

CREATE TABLE mascotas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    nombre text NOT NULL,
    tipo text NOT NULL
        CONSTRAINT mascotas_tipo_check CHECK (tipo IN ('PERRO', 'GATO', 'AVE', 'OTRO')),
    raza text,
    foto_url text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mascotas_conjunto_id_idx ON mascotas (conjunto_id);
CREATE INDEX mascotas_usuario_id_idx ON mascotas (usuario_id);

CREATE TABLE parqueaderos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    numero text NOT NULL,
    torre text,
    tipo text NOT NULL
        CONSTRAINT parqueaderos_tipo_check
        CHECK (tipo IN ('RESIDENTE', 'VISITANTE', 'DISCAPACITADO')),
    estado text NOT NULL DEFAULT 'DISPONIBLE'
        CONSTRAINT parqueaderos_estado_check
        CHECK (estado IN ('DISPONIBLE', 'OCUPADO', 'RESERVADO')),
    usuario_id uuid REFERENCES usuarios(id),  -- permanent assignment (optional)
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parqueaderos_conjunto_id_idx ON parqueaderos (conjunto_id);
CREATE INDEX parqueaderos_usuario_id_idx ON parqueaderos (usuario_id);

CREATE TABLE registros_parqueadero (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    parqueadero_id uuid NOT NULL REFERENCES parqueaderos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),  -- staff member who logged it
    tipo text NOT NULL
        CONSTRAINT registros_parqueadero_tipo_check
        CHECK (tipo IN ('INGRESO', 'SALIDA', 'VERIFICACION')),
    placa text,
    observacion text,
    fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX registros_parqueadero_conjunto_fecha_idx
    ON registros_parqueadero (conjunto_id, fecha DESC);
CREATE INDEX registros_parqueadero_parqueadero_id_idx
    ON registros_parqueadero (parqueadero_id);
CREATE INDEX registros_parqueadero_usuario_id_idx
    ON registros_parqueadero (usuario_id);

CREATE TABLE rondas_parqueadero (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),  -- staff member on the round
    fecha timestamptz NOT NULL DEFAULT now(),
    hallazgos jsonb,  -- Vec<Hallazgo>; legacy stored a JSON string
    completada boolean NOT NULL DEFAULT false
);

CREATE INDEX rondas_parqueadero_conjunto_fecha_idx
    ON rondas_parqueadero (conjunto_id, fecha DESC);
CREATE INDEX rondas_parqueadero_usuario_id_idx ON rondas_parqueadero (usuario_id);

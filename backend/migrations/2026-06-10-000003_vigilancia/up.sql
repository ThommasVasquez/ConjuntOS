-- Gate operations: visitor check-ins and packages. specs/004-vigilancia/spec.md
-- conjunto_id added (legacy scoped only through usuario).

CREATE TABLE visitas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    nombre text NOT NULL,
    tipo text NOT NULL
        CONSTRAINT visitas_tipo_check CHECK (tipo IN ('PEATONAL', 'VEHICULAR')),
    vehiculo_tipo text
        CONSTRAINT visitas_vehiculo_tipo_check
        CHECK (vehiculo_tipo IS NULL OR vehiculo_tipo IN ('CARRO', 'MOTO', 'NINGUNO')),
    placa text,
    fecha timestamptz NOT NULL,
    tiene_parqueadero boolean NOT NULL DEFAULT false,
    observacion text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX visitas_conjunto_fecha_idx ON visitas (conjunto_id, fecha DESC);
CREATE INDEX visitas_usuario_id_idx ON visitas (usuario_id);

CREATE TABLE paquetes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    descripcion text NOT NULL,
    remitente text NOT NULL,
    estado text NOT NULL
        CONSTRAINT paquetes_estado_check CHECK (estado IN ('EN_PORTERIA', 'ENTREGADO')),
    fecha_llegada timestamptz NOT NULL DEFAULT now(),
    entregado_en timestamptz
);

CREATE INDEX paquetes_conjunto_llegada_idx ON paquetes (conjunto_id, fecha_llegada DESC);
CREATE INDEX paquetes_usuario_estado_idx ON paquetes (usuario_id, estado);

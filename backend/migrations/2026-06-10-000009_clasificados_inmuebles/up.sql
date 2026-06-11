-- Commerce/content: locales (also backs resident classifieds), productos, pedidos,
-- inmuebles (real estate), ad_spaces. specs/010-clasificados-inmuebles/spec.md
-- locales.propietario_id gains a real (nullable) FK; legacy refs may dangle.

CREATE TABLE locales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    nombre text NOT NULL,
    categoria text NOT NULL
        CONSTRAINT locales_categoria_check
        CHECK (categoria IN ('RESTAURANTE', 'TIENDA', 'LAVANDERIA', 'FARMACIA', 'OTRO')),
    descripcion text,
    precio numeric(14,2),          -- legacy classifieds stuffed price inside descripcion JSON
    imagen_url text,
    activo boolean NOT NULL DEFAULT true,
    telefono text,
    whatsapp text,
    propietario_id uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX locales_conjunto_id_idx ON locales (conjunto_id);
CREATE INDEX locales_propietario_id_idx ON locales (propietario_id);

CREATE TABLE productos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id uuid NOT NULL REFERENCES locales(id),
    nombre text NOT NULL,
    descripcion text,
    precio numeric(14,2) NOT NULL,
    imagen_url text
);

CREATE INDEX productos_local_id_idx ON productos (local_id);

CREATE TABLE pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    local_id uuid NOT NULL REFERENCES locales(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    items jsonb NOT NULL,  -- Vec<PedidoItem>
    total numeric(14,2) NOT NULL,
    estado text NOT NULL
        CONSTRAINT pedidos_estado_check
        CHECK (estado IN ('RECIBIDO', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO')),
    notas text,
    unidad_entrega text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pedidos_conjunto_id_idx ON pedidos (conjunto_id);
CREATE INDEX pedidos_local_id_idx ON pedidos (local_id);
CREATE INDEX pedidos_usuario_id_idx ON pedidos (usuario_id);

CREATE TABLE inmuebles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    titulo text NOT NULL,
    descripcion text NOT NULL,
    precio numeric(14,2) NOT NULL,
    tipo_negocio text NOT NULL
        CONSTRAINT inmuebles_tipo_negocio_check CHECK (tipo_negocio IN ('VENTA', 'ALQUILER')),
    tipo_unidad text NOT NULL
        CONSTRAINT inmuebles_tipo_unidad_check
        CHECK (tipo_unidad IN ('APARTAMENTO', 'CASA', 'LOCAL', 'PARQUEADERO')),
    habitaciones integer NOT NULL DEFAULT 0,
    banos integer NOT NULL DEFAULT 0,
    area numeric(10,2),
    imagenes jsonb NOT NULL DEFAULT '[]'::jsonb,
    caracteristicas jsonb NOT NULL DEFAULT '[]'::jsonb,
    estado text NOT NULL DEFAULT 'DISPONIBLE'
        CONSTRAINT inmuebles_estado_check
        CHECK (estado IN ('DISPONIBLE', 'VENDIDO', 'ALQUILADO', 'OCULTO')),
    destacado boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inmuebles_conjunto_created_idx ON inmuebles (conjunto_id, created_at DESC);
CREATE INDEX inmuebles_usuario_id_idx ON inmuebles (usuario_id);

CREATE TABLE ad_spaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    nombre text NOT NULL,
    posicion text NOT NULL,
    imagen_url text,
    link_url text,
    activo boolean NOT NULL DEFAULT true,
    empresa text,
    inicio_en timestamptz NOT NULL,
    fin_en timestamptz NOT NULL,
    impresiones integer NOT NULL DEFAULT 0,
    clics integer NOT NULL DEFAULT 0
);

CREATE INDEX ad_spaces_conjunto_id_idx ON ad_spaces (conjunto_id);

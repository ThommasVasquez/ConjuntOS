-- Core tenant entities: conjuntos (tenant root), unidades, usuarios.
-- Conventions: specs/000-foundation/data-conventions.md

CREATE TABLE conjuntos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    nit text,
    subdominio text NOT NULL UNIQUE,
    direccion text NOT NULL,
    ciudad text NOT NULL,
    logo_url text,
    color_primario text NOT NULL DEFAULT '#1E3A5F',
    plan text NOT NULL DEFAULT 'BASICO'
        CONSTRAINT conjuntos_plan_check CHECK (plan IN ('BASICO', 'PRO', 'PREMIUM')),
    activo boolean NOT NULL DEFAULT true,
    -- Ley 675 de 2001 (Colombia)
    representante_legal text,
    notaria_escritura text,
    numero_escritura text,
    fecha_escritura timestamptz,
    matricula_inmobiliaria text,
    total_unidades integer DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE unidades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    numero text NOT NULL,
    torre text,
    piso integer,
    tipo text NOT NULL
        CONSTRAINT unidades_tipo_check
        CHECK (tipo IN ('APARTAMENTO', 'CASA', 'LOCAL', 'PARQUEADERO')),
    coeficiente numeric(9,6) NOT NULL
);

CREATE INDEX unidades_conjunto_id_idx ON unidades (conjunto_id);

CREATE TABLE usuarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    nombre text NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    must_change_password boolean NOT NULL DEFAULT false,
    telefono text,
    rol text NOT NULL
        CONSTRAINT usuarios_rol_check
        CHECK (rol IN (
            'ARRENDATARIO', 'PROPIETARIO', 'ADMINISTRADOR', 'CONCEJO',
            'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO', 'SUPER_ADMIN'
        )),
    unidad_id uuid REFERENCES unidades(id),
    avatar text,
    torre text,
    apto text,
    genero text DEFAULT 'neutro',
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usuarios_conjunto_id_idx ON usuarios (conjunto_id);
CREATE INDEX usuarios_unidad_id_idx ON usuarios (unidad_id);

CREATE TABLE pases_temporales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id),
    propietario_id UUID NOT NULL REFERENCES usuarios(id),
    unidad_id UUID NOT NULL REFERENCES unidades(id),
    nombre_anfitrion TEXT NOT NULL,
    nombre_huesped TEXT NOT NULL,
    email_huesped TEXT,
    telefono_huesped TEXT,
    codigo_acceso TEXT NOT NULL UNIQUE,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    permiso_gimnasio BOOLEAN NOT NULL DEFAULT false,
    permiso_piscina BOOLEAN NOT NULL DEFAULT false,
    permiso_entrada_salida BOOLEAN NOT NULL DEFAULT true,
    permiso_vehiculo BOOLEAN NOT NULL DEFAULT false,
    permiso_asamblea BOOLEAN NOT NULL DEFAULT false,
    estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'EXPIRADO', 'REVOCADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehiculos_temporales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pase_id UUID NOT NULL REFERENCES pases_temporales(id) ON DELETE CASCADE,
    placa TEXT NOT NULL,
    marca TEXT,
    modelo TEXT,
    color TEXT
);

CREATE INDEX idx_pases_temporales_conjunto ON pases_temporales(conjunto_id);
CREATE INDEX idx_pases_temporales_propietario ON pases_temporales(propietario_id);
CREATE INDEX idx_pases_temporales_codigo ON pases_temporales(codigo_acceso);
CREATE INDEX idx_pases_temporales_estado ON pases_temporales(estado);

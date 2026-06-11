-- Finances: administration fees, expenses, utility bills. specs/007-pagos/spec.md

CREATE TABLE pagos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    unidad_id uuid NOT NULL REFERENCES unidades(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    concepto text NOT NULL,
    monto numeric(14,2) NOT NULL,
    estado text NOT NULL
        CONSTRAINT pagos_estado_check
        CHECK (estado IN ('PENDIENTE', 'PAGADO', 'VENCIDO', 'EN_DISPUTA')),
    metodo text
        CONSTRAINT pagos_metodo_check
        CHECK (metodo IS NULL OR metodo IN ('PSE', 'TARJETA', 'NEQUI', 'DAVIPLATA', 'EFECTIVO')),
    wompi_ref text,
    fecha_vencimiento timestamptz NOT NULL,
    fecha_pago timestamptz,
    comprobante text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pagos_conjunto_created_idx ON pagos (conjunto_id, created_at DESC);
CREATE INDEX pagos_unidad_id_idx ON pagos (unidad_id);
CREATE INDEX pagos_usuario_id_idx ON pagos (usuario_id);

CREATE TABLE gastos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    categoria text NOT NULL
        CONSTRAINT gastos_categoria_check
        CHECK (categoria IN ('MANTENIMIENTO', 'NOMINA', 'SERVICIOS', 'ADMINISTRACION', 'OBRA', 'OTRO')),
    descripcion text NOT NULL,
    monto numeric(14,2) NOT NULL,
    proveedor text,
    soporte_url text,
    fecha timestamptz NOT NULL,
    aprobado_por text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gastos_conjunto_id_idx ON gastos (conjunto_id);

CREATE TABLE recibos_publicos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    unidad_id uuid NOT NULL REFERENCES unidades(id),
    servicio text NOT NULL,
    empresa text NOT NULL,
    periodo text NOT NULL,
    monto numeric(14,2) NOT NULL,
    vencimiento timestamptz NOT NULL,
    url_recibo text,
    pagado boolean NOT NULL DEFAULT false,
    fecha_pago timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recibos_publicos_conjunto_id_idx ON recibos_publicos (conjunto_id);
CREATE INDEX recibos_publicos_unidad_id_idx ON recibos_publicos (unidad_id);

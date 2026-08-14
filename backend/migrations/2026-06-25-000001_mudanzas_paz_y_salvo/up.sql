-- Mudanzas & Certificado de Paz y Salvo ConjuntOS®
CREATE TABLE mudanzas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    torre text,
    apto text,
    tipo text NOT NULL CHECK (tipo IN ('ENTRANTE', 'SALIENTE')),
    fecha_mudanza date NOT NULL,
    hora_inicio text NOT NULL DEFAULT '08:00',
    hora_fin text NOT NULL DEFAULT '14:00',
    tiene_vehiculo boolean NOT NULL DEFAULT false,
    vehiculo_placa text,
    vehiculo_tipo text,
    conductor_nombre text,
    conductor_documento text,
    observaciones text,
    estado text NOT NULL DEFAULT 'PENDIENTE_PAZ_Y_SALVO'
        CHECK (estado IN ('PENDIENTE_PAZ_Y_SALVO', 'APROBADO', 'RECHAZADO', 'EN_PROCESO', 'FINALIZADO')),
    paz_y_salvo_codigo text,
    motivo_rechazo text,
    saldo_pendiente_monto numeric,
    aprobado_por_usuario_id uuid REFERENCES usuarios(id),
    aprobado_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mudanzas_conjunto_idx ON mudanzas (conjunto_id, fecha_mudanza);
CREATE INDEX mudanzas_usuario_idx ON mudanzas (usuario_id);

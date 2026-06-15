-- Parqueadero v4: sesiones de cobro para celdas de VISITANTE.
-- Al aprobar el inquilino una celda de visitante, arranca una sesión con 2h
-- gratis. Pasadas las 2h se cobra COP $3.000/hora prorrateado por minuto. El
-- cobro se congela cuando el vehículo llega a portería (al liberar la celda).
-- Liquidación: el visitante paga en sitio, o se carga al apartamento (pago).

CREATE TABLE sesiones_parqueadero (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    parqueadero_id uuid REFERENCES parqueaderos(id),
    celda_numero text NOT NULL,
    solicitud_id uuid REFERENCES solicitudes_parqueadero(id),
    -- Residente/inquilino responsable (quien aprobó la visita).
    residente_id uuid NOT NULL REFERENCES usuarios(id),
    residente_nombre text NOT NULL,
    unidad_id uuid REFERENCES unidades(id),
    placa text,
    -- Tiempo estimado en minutos declarado al asignar. NULL = tiempo libre.
    estimado_minutos integer,
    -- Ventana gratuita.
    inicio timestamptz NOT NULL DEFAULT now(),
    minutos_gratis integer NOT NULL DEFAULT 120,
    fin_gratis timestamptz NOT NULL,
    tarifa_hora numeric(14,2) NOT NULL DEFAULT 3000,
    -- Avisos automáticos (idempotencia del scheduler).
    aviso_20_enviado boolean NOT NULL DEFAULT false,
    aviso_cobro_enviado boolean NOT NULL DEFAULT false,
    estado text NOT NULL DEFAULT 'ACTIVA'
        CONSTRAINT sesiones_parqueadero_estado_check
        CHECK (estado IN ('ACTIVA', 'CERRADA')),
    -- Cierre (cuando el vehículo llega a portería).
    cerrado_en timestamptz,
    minutos_cobrados integer,
    monto numeric(14,2),
    liquidacion text
        CONSTRAINT sesiones_parqueadero_liquidacion_check
        CHECK (liquidacion IS NULL OR liquidacion IN ('VISITANTE_PAGO', 'CARGADO_APTO', 'SIN_COBRO')),
    pago_id uuid REFERENCES pagos(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- El scheduler busca sesiones activas que necesitan aviso/cobro.
CREATE INDEX sesiones_parqueadero_activas_idx
    ON sesiones_parqueadero (conjunto_id, estado)
    WHERE estado = 'ACTIVA';

-- Una celda solo puede tener una sesión activa a la vez.
CREATE UNIQUE INDEX sesiones_parqueadero_celda_activa_uidx
    ON sesiones_parqueadero (parqueadero_id)
    WHERE estado = 'ACTIVA';

CREATE INDEX sesiones_parqueadero_residente_idx
    ON sesiones_parqueadero (conjunto_id, residente_id);

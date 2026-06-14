-- Parqueadero v2: categoría física de celda (carro/moto/bici), vehículo BICI,
-- y log inmutable de solicitudes/aprobaciones de movimientos de celdas.

-- 1) Categoría física de la celda: una bahía de carro NO sirve para moto/bici.
ALTER TABLE parqueaderos
    ADD COLUMN categoria text NOT NULL DEFAULT 'CARRO'
        CONSTRAINT parqueaderos_categoria_check
        CHECK (categoria IN ('CARRO', 'MOTO', 'BICI'));

CREATE INDEX parqueaderos_categoria_idx ON parqueaderos (conjunto_id, categoria);

-- 2) Los vehículos de residente ahora también pueden ser BICI.
ALTER TABLE vehiculos DROP CONSTRAINT vehiculos_tipo_check;
ALTER TABLE vehiculos
    ADD CONSTRAINT vehiculos_tipo_check CHECK (tipo IN ('CARRO', 'MOTO', 'BICI'));

-- 3) Log inmutable de TODOS los movimientos de celdas + flujo de aprobación.
--    Los movimientos sobre celdas RESIDENTE (asignadas permanentemente) hechos
--    por quien no sea administrador quedan en estado PENDIENTE hasta que el
--    admin apruebe. El resto se ejecuta y se registra como EJECUTADA.
--    Solo el ADMINISTRADOR puede VER este log; solo el SUPER_ADMIN editar/borrar.
--    Se snapshotea nombre del solicitante / celda para que el log sobreviva
--    aunque se borre el usuario o la celda (auditoría real).
CREATE TABLE solicitudes_parqueadero (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    parqueadero_id uuid REFERENCES parqueaderos(id),
    celda_numero text NOT NULL,
    accion text NOT NULL
        CONSTRAINT solicitudes_parqueadero_accion_check
        CHECK (accion IN ('ASIGNAR', 'LIBERAR', 'CAMBIAR_ESTADO', 'CREAR')),
    estado text NOT NULL DEFAULT 'PENDIENTE'
        CONSTRAINT solicitudes_parqueadero_estado_check
        CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EJECUTADA')),
    requiere_aprobacion boolean NOT NULL DEFAULT false,
    detalle text NOT NULL,
    payload jsonb,
    solicitante_id uuid NOT NULL REFERENCES usuarios(id),
    solicitante_nombre text NOT NULL,
    solicitante_rol text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    aprobador_id uuid REFERENCES usuarios(id),
    aprobador_nombre text,
    resuelto_en timestamptz
);

CREATE INDEX solicitudes_parqueadero_conjunto_creado_idx
    ON solicitudes_parqueadero (conjunto_id, creado_en DESC);
CREATE INDEX solicitudes_parqueadero_estado_idx
    ON solicitudes_parqueadero (conjunto_id, estado);
CREATE INDEX solicitudes_parqueadero_parqueadero_idx
    ON solicitudes_parqueadero (parqueadero_id);

-- Revertir aprobación de cargo por residente.
-- Normaliza cualquier estado intermedio a un valor permitido por el CHECK viejo.
UPDATE sesiones_parqueadero
    SET liquidacion = 'CARGADO_APTO'
    WHERE liquidacion = 'CARGADO_APTO_PENDIENTE';
UPDATE sesiones_parqueadero
    SET liquidacion = 'VISITANTE_PAGO'
    WHERE liquidacion = 'CARGADO_APTO_RECHAZADO';

ALTER TABLE sesiones_parqueadero
    DROP CONSTRAINT sesiones_parqueadero_liquidacion_check;

ALTER TABLE sesiones_parqueadero
    ADD CONSTRAINT sesiones_parqueadero_liquidacion_check
    CHECK (liquidacion IS NULL OR liquidacion IN ('VISITANTE_PAGO', 'CARGADO_APTO', 'SIN_COBRO'));

ALTER TABLE sesiones_parqueadero
    DROP COLUMN cargo_resuelto_en;

-- Revertir: cerrar cualquier sesión RETENIDA y volver al CHECK anterior.
UPDATE sesiones_parqueadero SET estado = 'CERRADA' WHERE estado = 'RETENIDA';

DROP INDEX IF EXISTS sesiones_parqueadero_celda_viva_uidx;
CREATE UNIQUE INDEX sesiones_parqueadero_celda_activa_uidx
    ON sesiones_parqueadero (parqueadero_id)
    WHERE estado = 'ACTIVA';

ALTER TABLE sesiones_parqueadero
    DROP CONSTRAINT sesiones_parqueadero_estado_check;
ALTER TABLE sesiones_parqueadero
    ADD CONSTRAINT sesiones_parqueadero_estado_check
    CHECK (estado IN ('ACTIVA', 'CERRADA'));

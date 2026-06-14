DROP INDEX IF EXISTS solicitudes_parqueadero_destinatario_idx;
ALTER TABLE solicitudes_parqueadero
    DROP COLUMN destinatario_id,
    DROP COLUMN destinatario_nombre;

ALTER TABLE solicitudes_parqueadero
    DROP CONSTRAINT solicitudes_parqueadero_estado_check;
ALTER TABLE solicitudes_parqueadero
    ADD CONSTRAINT solicitudes_parqueadero_estado_check
    CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EJECUTADA'));

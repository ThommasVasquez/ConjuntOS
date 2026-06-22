ALTER TABLE solicitudes_servicio DROP CONSTRAINT solicitudes_estado_check;
ALTER TABLE solicitudes_servicio ADD CONSTRAINT solicitudes_estado_check
    CHECK (estado IN ('ABIERTA', 'ASIGNADA', 'EN_PROGRESO', 'COMPLETADA'));

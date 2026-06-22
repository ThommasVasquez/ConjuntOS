-- Fix solicitudes_servicio estado CHECK to include RESUELTA and CERRADA
ALTER TABLE solicitudes_servicio DROP CONSTRAINT IF EXISTS solicitudes_estado_check;
ALTER TABLE solicitudes_servicio ADD CONSTRAINT solicitudes_estado_check
    CHECK (estado IN ('ABIERTA', 'ASIGNADA', 'EN_PROGRESO', 'RESUELTA', 'CERRADA'));

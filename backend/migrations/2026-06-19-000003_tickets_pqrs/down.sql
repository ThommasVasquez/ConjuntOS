ALTER TABLE solicitudes_servicio
    DROP COLUMN IF EXISTS sla_vencimiento,
    DROP COLUMN IF EXISTS sla_horas,
    DROP COLUMN IF EXISTS prioridad,
    DROP COLUMN IF EXISTS asignado_a_id,
    DROP COLUMN IF EXISTS fecha_asignacion,
    DROP COLUMN IF EXISTS fecha_resolucion,
    DROP COLUMN IF EXISTS fecha_cierre;

DROP TABLE IF EXISTS ticket_transiciones;
DROP TABLE IF EXISTS ticket_comentarios;

ALTER TABLE solicitudes_servicio DROP CONSTRAINT IF EXISTS solicitudes_servicio_estado_check;
ALTER TABLE solicitudes_servicio ADD CONSTRAINT solicitudes_servicio_estado_check
    CHECK (estado IN ('ABIERTA', 'ASIGNADA', 'EN_PROGRESO', 'COMPLETADA'));

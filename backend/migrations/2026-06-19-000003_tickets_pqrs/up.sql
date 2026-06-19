-- ============================================================================
-- Sistema de Tickets PQRS — Migración
-- Pipeline: ABIERTA → ASIGNADA → EN_PROGRESO → RESUELTA → CERRADA
-- Prioridades: BAJA, MEDIA, ALTA, URGENTE
-- SLA tracking con alertas de vencimiento
-- ============================================================================

-- Nuevas columnas en solicitudes_servicio
ALTER TABLE solicitudes_servicio
    ADD COLUMN IF NOT EXISTS prioridad TEXT NOT NULL DEFAULT 'MEDIA'
        CHECK (prioridad IN ('BAJA', 'MEDIA', 'ALTA', 'URGENTE')),
    ADD COLUMN IF NOT EXISTS sla_horas INT NOT NULL DEFAULT 48,
    ADD COLUMN IF NOT EXISTS sla_vencimiento TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS asignado_a_id UUID REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fecha_resolucion TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ;

-- Tabla de comentarios (conversación admin ↔ residente)
CREATE TABLE IF NOT EXISTS ticket_comentarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    contenido TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comentarios_ticket ON ticket_comentarios(ticket_id);

-- Tabla de transiciones de estado (auditoría)
CREATE TABLE IF NOT EXISTS ticket_transiciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
    estado_anterior TEXT NOT NULL,
    estado_nuevo TEXT NOT NULL,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_transiciones_ticket ON ticket_transiciones(ticket_id);

-- Actualizar estados existentes para incluir los nuevos
ALTER TABLE solicitudes_servicio DROP CONSTRAINT IF EXISTS solicitudes_servicio_estado_check;
ALTER TABLE solicitudes_servicio ADD CONSTRAINT solicitudes_servicio_estado_check
    CHECK (estado IN ('ABIERTA', 'ASIGNADA', 'EN_PROGRESO', 'RESUELTA', 'CERRADA'));

-- Calcular SLA para tickets existentes (48h desde creación)
UPDATE solicitudes_servicio SET sla_vencimiento = created_at + INTERVAL '48 hours' WHERE sla_vencimiento IS NULL;

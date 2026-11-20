DROP TABLE IF EXISTS ad_events;
DROP INDEX IF EXISTS idx_ad_spaces_campana;
ALTER TABLE ad_spaces
    DROP COLUMN IF EXISTS max_por_usuario_dia,
    DROP COLUMN IF EXISTS max_impresiones,
    DROP COLUMN IF EXISTS prioridad,
    DROP COLUMN IF EXISTS cta_texto,
    DROP COLUMN IF EXISTS dias_semana,
    DROP COLUMN IF EXISTS hora_fin,
    DROP COLUMN IF EXISTS hora_inicio,
    DROP COLUMN IF EXISTS campana_id;

ALTER TABLE ad_spaces
    ADD COLUMN IF NOT EXISTS campana_id UUID,
    ADD COLUMN IF NOT EXISTS hora_inicio INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hora_fin INTEGER NOT NULL DEFAULT 23,
    ADD COLUMN IF NOT EXISTS dias_semana TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
    ADD COLUMN IF NOT EXISTS cta_texto TEXT,
    ADD COLUMN IF NOT EXISTS prioridad INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS max_impresiones INTEGER,
    ADD COLUMN IF NOT EXISTS max_por_usuario_dia INTEGER;

UPDATE ad_spaces SET campana_id = id WHERE campana_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ad_spaces_campana ON ad_spaces (campana_id);

CREATE TABLE IF NOT EXISTS ad_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_space_id UUID NOT NULL REFERENCES ad_spaces(id) ON DELETE CASCADE,
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id) ON DELETE CASCADE,
    usuario_id UUID,
    tipo TEXT NOT NULL CHECK (tipo IN ('IMPRESSION', 'CLICK')),
    hora_local INTEGER NOT NULL CHECK (hora_local >= 0 AND hora_local <= 23),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_events_space_tipo_hora
    ON ad_events (ad_space_id, tipo, hora_local);
CREATE INDEX IF NOT EXISTS idx_ad_events_space_user_created
    ON ad_events (ad_space_id, usuario_id, created_at);

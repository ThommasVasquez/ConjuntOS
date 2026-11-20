CREATE TABLE IF NOT EXISTS anuncio_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anuncio_id UUID NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id) ON DELETE CASCADE,
    usuario_id UUID,
    tipo TEXT NOT NULL CHECK (tipo IN ('VIEW', 'CTA_CLICK')),
    hora_local INTEGER NOT NULL CHECK (hora_local >= 0 AND hora_local <= 23),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anuncio_events_anuncio_tipo_hora
    ON anuncio_events (anuncio_id, tipo, hora_local);

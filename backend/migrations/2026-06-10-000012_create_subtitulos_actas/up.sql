CREATE TABLE asamblea_subtitulos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asamblea_id UUID NOT NULL REFERENCES asambleas(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subtitulos_asamblea ON asamblea_subtitulos(asamblea_id);

CREATE TABLE asamblea_actas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asamblea_id UUID NOT NULL REFERENCES asambleas(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL,
    generado_por TEXT NOT NULL DEFAULT 'MANUAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_actas_generado CHECK (generado_por IN ('MANUAL', 'AI'))
);

CREATE UNIQUE INDEX idx_actas_asamblea ON asamblea_actas(asamblea_id);

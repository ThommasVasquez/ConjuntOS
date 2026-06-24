ALTER TABLE visitas ADD COLUMN IF NOT EXISTS documento TEXT;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'PENDIENTE';

-- Drop existing constraint if it exists (from earlier partial migration attempts), then add proper CHECK
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitas_estado_check' AND conrelid = 'visitas'::regclass) THEN
        ALTER TABLE visitas DROP CONSTRAINT visitas_estado_check;
    END IF;
END $$;

ALTER TABLE visitas ADD CONSTRAINT visitas_estado_check
    CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA'));

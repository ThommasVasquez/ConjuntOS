ALTER TABLE reuniones_concejo 
ADD COLUMN IF NOT EXISTS votaciones jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS transcripcion_detallada text,
ADD COLUMN IF NOT EXISTS resumen_ia text;
